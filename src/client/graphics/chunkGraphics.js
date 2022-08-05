function ChunkGraphics(world) {
  this.world = world;
  this.chunks = world.chunks;
  this.chunkDistances = {};

  this.shaders = {};
  
  this.prevCamera = {};
}

ChunkGraphics.prototype.initShader = function(shaderName, vertSrc, fragSrc) {
  const gl = this.gl,
        renderer = new Renderer(gl, vertSrc, fragSrc),
        program = renderer.program;
  // program
  gl.useProgram(program);

  // uniforms
  const projectionLoc = gl.getUniformLocation(program, 'projection'),
        cameraLoc = gl.getUniformLocation(program, 'camera'),
        chunkPositionLoc = gl.getUniformLocation(program, 'chunkPosition');

  this.shaders[shaderName] = {
    renderer: renderer,
    program: program,
    uniforms: {
      projection: projectionLoc,
      camera: cameraLoc,
      chunkPosition: chunkPositionLoc
    },

    chunkMeshes: {}
  };
}

// updates an uniform in all shaders
ChunkGraphics.prototype.updateUniforms = function(uniformName, data) {
  const gl = this.gl;
  for (let s in this.shaders) {
    gl.useProgram(this.shaders[s].program);
    gl.uniformMatrix4fv(this.shaders[s].uniforms[uniformName], false, data);
  }
};

ChunkGraphics.prototype.init = function() {
  const canvas = document.getElementById('glcanvas');
  const gl = this.gl = canvas.getContext('webgl2');
  if (!gl) console.log('no gl :(');

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // load all textures
  const textures = this.textures = new Textures();
  textures.loadAll();
  textures.createTextureArray(gl);

  // load shaders and programs
  this.initShader('default', blockVertSrc, blockFragSrc);
  this.initShader('alpha', alphaBlockVertSrc, alphaBlockFragSrc);

  // projection matrix
  this.projectionMatrix = new mat4();
  const onResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    this.projectionMatrix.perspective(1, gl.canvas.width / gl.canvas.height, 0.1, 2000);
    this.updateUniforms('projection', this.projectionMatrix.data);
  }
  onResize();
  window.onresize = onResize;
};

ChunkGraphics.prototype.setBlock = function(x, y, z, block, prevBlockData) {
  if (block === prevBlockData.type) return -1; // UNLESS BLOCKDATA IS DIFFERENT (EG DIFFERENT ROTATION) ...OR JUST REMOVE...
  let prevBlockInfo = this.world.getBlockInfo(prevBlockData.type),
      blockInfo = this.world.getBlockInfo(block);
  if (!prevBlockInfo.isInvisible || blockInfo.isInvisible) {
    if (!this.shaders[prevBlockInfo.shader].chunkMeshes[prevBlockData.chunkPos]) this.loadChunkMesh(prevBlockInfo.shader, prevBlockData.chunkPos, true);
    this.shaders[prevBlockInfo.shader].chunkMeshes[prevBlockData.chunkPos].removeBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z, prevBlockData);
  }
  if (!blockInfo.isInvisible) {
    if (!this.shaders[blockInfo.shader].chunkMeshes[prevBlockData.chunkPos]) this.loadChunkMesh(blockInfo.shader, prevBlockData.chunkPos, true);
    this.shaders[blockInfo.shader].chunkMeshes[prevBlockData.chunkPos].addBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z, block);
    
  }
};

ChunkGraphics.prototype.loadChunkMesh = function(shader, pos, load = false) {
  const data = [ this.chunks[pos], shader, this ];
  const chunkMesh = this.shaders[shader].chunkMeshes[pos] = { 
    default: new ChunkMesh(...data),
    alpha: new ChunkMeshAlpha(...data),
    water: new ChunkMeshWater(...data)
  }[shader];
  if (load) chunkMesh.load();
  return chunkMesh;
};

// loads a chunk's mesh
ChunkGraphics.prototype.loadChunk = function(x, y, z) {
  const c = x + ',' + y + ',' + z;    
  if (this.shaders.default.chunkMeshes[c]) return;

  const chunk = this.chunks[c];
  let chunkMeshes = [], i;

  let fz, fy, fx, p, pos, blockData, otherBlockData, blockInfo, otherBlockInfo, faceInteraction;
  for (fz = 0; fz < 32; fz ++) {
    for (fy = 0; fy < 32; fy ++) {
      for (fx = 0; fx < 32; fx ++) {
        blockData = chunk.getBlockData(fx, fy, fz);
        blockInfo = this.world.getBlockInfo(blockData.type);

        for (p = 0; p < 3; p ++) {
          pos = p === 0 ? fx : p === 1 ? fy : fz;

          if (pos < 31) {
            otherBlockData = chunk.getBlockData(fx + (p === 0), fy + (p === 1), fz + (p === 2));
            otherBlockInfo = this.world.getBlockInfo(otherBlockData?.type);

            // INNER MESH
            if (!blockInfo.isInvisible && ChunkMesh.faceInteraction(blockData, otherBlockData, true, p * 2, blockInfo, otherBlockInfo)[0]) {
              if (!this.shaders[blockInfo.shader].chunkMeshes[c]) chunkMeshes.push(this.loadChunkMesh(blockInfo.shader, c));
              this.shaders[blockInfo.shader].chunkMeshes[c].addCubeFace(fx, fy, fz, p * 2, this.textures.textureKeys[blockInfo.texture[p * 2]]);
            }
            if (!otherBlockInfo.isInvisible && ChunkMesh.faceInteraction(otherBlockData, blockData, true, p * 2, otherBlockInfo, blockInfo)[0]) {
              if (!this.shaders[otherBlockInfo.shader].chunkMeshes[c]) chunkMeshes.push(this.loadChunkMesh(otherBlockInfo.shader, c));
              this.shaders[otherBlockInfo.shader].chunkMeshes[c].addCubeFace(fx + (p === 0), fy + (p === 1), fz + (p === 2), p * 2 + 1, this.textures.textureKeys[otherBlockInfo.texture[p * 2 + 1]]);
            }
          }

          // OUTER MESH
          if (pos === 0 || pos === 31) {
            otherBlockData = chunk.getBlockData(
              p === 0 ? fx + (fx === 31) - (fx === 0) : fx,
              p === 1 ? fy + (fy === 31) - (fy === 0) : fy,
              p === 2 ? fz + (fz === 31) - (fz === 0) : fz
            );
            if (otherBlockData === undefined) continue;
            otherBlockInfo = this.world.getBlockInfo(otherBlockData.type);
            if (!blockInfo.isInvisible && ChunkMesh.faceInteraction(blockData, otherBlockData, true, p * 2, blockInfo, otherBlockInfo)[0]) {
              if (!this.shaders[blockInfo.shader].chunkMeshes[c]) chunkMeshes.push(this.loadChunkMesh(blockInfo.shader, c));
              this.shaders[blockInfo.shader].chunkMeshes[c].addCubeFace(fx, fy, fz, p * 2 + (pos === 0), this.textures.textureKeys[blockInfo.texture[p * 2 + (pos === 0)]]);
            }
            if (!otherBlockInfo.isInvisible && ChunkMesh.faceInteraction(otherBlockData, blockData, true, p * 2, otherBlockInfo, blockInfo)[0]) {
              if (!this.shaders[otherBlockInfo.shader].chunkMeshes[otherBlockData.chunkPos]) chunkMeshes.push(this.loadChunkMesh(otherBlockInfo.shader, otherBlockData.chunkPos));
              this.shaders[otherBlockInfo.shader].chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, p * 2 + (pos === 31), this.textures.textureKeys[otherBlockInfo.texture[p * 2 + (pos === 31)]]);
            }
          }
        }
      }
    }
  }
  
  for (i in chunkMeshes) {
    chunkMeshes[i].load();
  }
};

// draws current scene
ChunkGraphics.prototype.draw = function() {
  const gl = this.gl;
  gl.clearColor(0, 0.5, 0.8, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // camera matrix (only needs to be calculated on camera movement)
  const camera = this.world.player;
  const cameraMatrix = new mat4();
  cameraMatrix.rotateX(camera.rotation[0]);
  cameraMatrix.rotateY(camera.rotation[1]);
  cameraMatrix.translate(-camera.x, -camera.y, -camera.z);
  cameraMatrix.scale(0.0625, 0.0625, 0.0625);
  
  // see if player moved between chunks
  let sortChunkMeshes = false;
  if (Math.floor(camera.x / 32) !== this.prevCamera.x || Math.floor(camera.y / 32) !== this.prevCamera.y || Math.floor(camera.z / 32) !== this.prevCamera.z) {
    // get chunk distances
    let c, chunk;
    for (c in this.chunks) {
      chunk = this.chunks[c];
      this.chunkDistances[c] = Math.abs(chunk.x * 32 - camera.x + 16) + Math.abs(chunk.y * 32 - camera.y + 16) + Math.abs(chunk.z * 32 - camera.z + 16);
    }    
    // update prev camera
    this.prevCamera.x = Math.floor(camera.x / 32); 
    this.prevCamera.y = Math.floor(camera.y / 32);
    this.prevCamera.z = Math.floor(camera.z / 32);
    sortChunkMeshes = true;
    
    this.shaders.default.chunkMeshes = Object.fromEntries(Object.entries(this.shaders.default.chunkMeshes).sort((a, b) => (this.chunkDistances[a[1].pos] - this.chunkDistances[b[1].pos])));
    this.shaders.alpha.chunkMeshes = Object.fromEntries(Object.entries(this.shaders.alpha.chunkMeshes).sort((a, b) => (this.chunkDistances[b[1].pos] - this.chunkDistances[a[1].pos])));
  }
  
  // regular block shader
  let s, c, shader, data, chunkMesh;
  for (s in this.shaders) {
    shader = this.shaders[s];

    if (s === 'alpha') {
      gl.enable(gl.BLEND);
      data = ChunkMeshAlpha.processCameraData(camera);
    } else {
      gl.disable(gl.BLEND);
    }

    gl.useProgram(shader.program);
    gl.uniformMatrix4fv(shader.uniforms.camera, false, cameraMatrix.data);
    
    for (c in shader.chunkMeshes) {
      chunkMesh = shader.chunkMeshes[c];
      if ((chunkMesh.indicesLength ?? chunkMesh.indices.length) === 0) continue;
      
      if (s === 'alpha') chunkMesh.updateIndices(...data);
      if (chunkMesh.update) {
        chunkMesh.updateBuffers();
        chunkMesh.update = false;
      }
      
      gl.uniform3f(shader.uniforms.chunkPosition, chunkMesh.x * 512, chunkMesh.y * 512, chunkMesh.z * 512);
      gl.bindVertexArray(chunkMesh.vao);
      gl.drawElements(gl.TRIANGLES, chunkMesh.indicesLength ?? chunkMesh.indices.length, gl.UNSIGNED_INT, 0);
    }
  }
};