function ChunkGraphics(world) {
  this.world = world;
  this.chunks = world.chunks;

  this.shaders = {};
}

ChunkGraphics.prototype.initShaders = function(shaderName, vertSrc, fragSrc) {
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
  this.initShaders('default', blockVertSrc, blockFragSrc);
  this.initShaders('alpha', alphaBlockVertSrc, alphaBlockFragSrc);

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

  // regular block shader
  let s, shader;
  for (s in this.shaders) {
    shader = this.shaders[s];

    if (s === 'alpha') {
      gl.enable(gl.BLEND);
    } else {
      gl.disable(gl.BLEND);
    }

    gl.useProgram(shader.program);
    gl.uniformMatrix4fv(shader.uniforms.camera, false, cameraMatrix.data);

    // SORT CHUNKMESHES BY https://www.reddit.com/r/VoxelGameDev/comments/a0l8zc/correct_depthordering_for_translucent_discrete/
    // REVERSE ORDER WHEN DRAWING ALPHA
    for (let c in shader.chunkMeshes) {
      let chunkMesh = shader.chunkMeshes[c];

      if (chunkMesh.update) {
        chunkMesh.updateBuffers();
        chunkMesh.update = false;
      }
      if (chunkMesh.indices.length === 0) continue;
      
      //if (s === 'alpha') chunkMesh.sort(camera);
      
      gl.uniform3f(shader.uniforms.chunkPosition, chunkMesh.x * 512, chunkMesh.y * 512, chunkMesh.z * 512);
      gl.bindVertexArray(chunkMesh.vao);
      gl.drawElements(gl.TRIANGLES, chunkMesh.indices.length, gl.UNSIGNED_INT, 0);
    }
  }
};

ChunkGraphics.prototype.setBlock = function(x, y, z, block, prevBlockData) {
  if (block === prevBlockData.type) return -1; // UNLESS BLOCKDATA IS DIFFERENT (EG DIFFERENT ROTATION) ...OR JUST REMOVE...
  let prevBlockInfo = this.world.getBlockInfo(prevBlockData.type),
      blockInfo = this.world.getBlockInfo(block),
      chunkMesh = this.shaders[blockInfo.isInvisible ? prevBlockInfo.shader : blockInfo.shader].chunkMeshes[prevBlockData.chunkPos];    
  if (!prevBlockInfo.isInvisible || blockInfo.isInvisible) {
    chunkMesh.removeBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z, prevBlockData);
  }
  if (!blockInfo.isInvisible) {
    chunkMesh.addBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z, block);
  }
};

// loads a chunk's mesh
ChunkGraphics.prototype.loadChunk = function(x, y, z) {
  const c = x + ',' + y + ',' + z;    
  if (this.shaders.default.chunkMeshes[c]) return;

  const chunk = this.chunks[c],
        chunkMesh = this.shaders.default.chunkMeshes[c] = new ChunkMesh(chunk, this.gl, this.shaders, 'default', this.world, this.textures),
        chunkMeshAlpha = this.shaders.alpha.chunkMeshes[c] = new ChunkMeshAlpha(chunk, this.gl, this.shaders, 'alpha', this.world, this.textures);

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
              this.shaders[blockInfo.shader].chunkMeshes[c].addCubeFace(fx, fy, fz, p * 2, this.textures.textureKeys[blockInfo.texture[p * 2]]);
            }
            if (!otherBlockInfo.isInvisible && ChunkMesh.faceInteraction(otherBlockData, blockData, true, p * 2, otherBlockInfo, blockInfo)[0]) {
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
              this.shaders[blockInfo.shader].chunkMeshes[c].addCubeFace(fx, fy, fz, p * 2 + (pos === 0), this.textures.textureKeys[blockInfo.texture[p * 2 + (pos === 0)]]);
            }
            if (!otherBlockInfo.isInvisible && ChunkMesh.faceInteraction(otherBlockData, blockData, true, p * 2, otherBlockInfo, blockInfo)[0]) {
              this.shaders[blockInfo.shader].chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, p * 2 + (pos === 31), this.textures.textureKeys[otherBlockInfo.texture[p * 2 + (pos === 31)]]);
            }
          }
        }
      }
    }
  }

  chunkMesh.load();
  chunkMeshAlpha.load();
}