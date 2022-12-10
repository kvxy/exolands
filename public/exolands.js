
/** ./src/client/clientsim.js **/

const ClientSim = {};

ClientSim.init = function() {
  this.chunkGraphics = new ChunkGraphics(this.world);
  this.chunkGraphics.init();
};

ClientSim.draw = function() {
  this.chunkGraphics.draw();
};

ClientSim.generateChunk = function(x, y, z) {
  this.chunkGraphics.loadChunk(x, y, z);
};

ClientSim.setBlock = function(x, y, z, block) {
  this.chunkGraphics.setBlock(x, y, z, block, prevBlockData); // prevBlockData FROM Sim
};

ClientSim.spawnPlayer = function(data) {
  this.chunkGraphics.player = player;
};


/** ./src/client/graphics/chunkGraphics.js **/

function ChunkGraphics(world) {
  this.world = world;
  this.chunks = world.chunks;
  this.chunkDistances = {};

  this.shaders = {};
  
  this.prevCamera = {};
  
  // settings
  this.backgroundColor = [ 85 / 255, 122 / 255, 181 / 255, 1 ];
}

ChunkGraphics.prototype.initShader = function(shaderName, vertSrc, fragSrc) {
  const gl = this.gl,
        renderer = new Renderer(gl, vertSrc, fragSrc),
        program = renderer.program;
  // program
  gl.useProgram(program);

  // matrix uniforms
  const projectionLoc = gl.getUniformLocation(program, 'projection'),
        cameraLoc = gl.getUniformLocation(program, 'camera'),
        chunkPositionLoc = gl.getUniformLocation(program, 'chunkPosition');
  // other uniforms
  const fogColorLocation = gl.getUniformLocation(program, 'fogColor'),
        fogFarLocation = gl.getUniformLocation(program, 'fogFar');
  
  this.shaders[shaderName] = {
    renderer: renderer,
    program: program,
    uniforms: {
      projection: projectionLoc,
      camera: cameraLoc,
      chunkPosition: chunkPositionLoc,
      
      fogColor: fogColorLocation,
      fogFar: fogFarLocation
    },
    chunkMeshes: {}
  };
}

// updates an uniform in all shaders
ChunkGraphics.prototype.updateUniforms = function(glFunc, uniformName, ...args) {
  const gl = this.gl;
  for (let s in this.shaders) {
    gl.useProgram(this.shaders[s].program);
    gl[glFunc](this.shaders[s].uniforms[uniformName], ...args);
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
    this.updateUniforms('uniformMatrix4fv', 'projection', false, this.projectionMatrix.data);
  }
  onResize();
  window.onresize = onResize;
  
  // fog uniform
  this.updateUniforms('uniform4fv', 'fogColor', this.backgroundColor);
  this.updateUniforms('uniform1f', 'fogFar', 32 * 8)
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
    alpha: new ChunkMeshAlpha(...data)
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
  gl.clearColor(...this.backgroundColor);
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


/** ./src/client/graphics/chunkMesh.js **/

function ChunkMesh(...args) {
  [ this.chunk, this.shaderName, this.chunkGraphics ] = args;
  [ this.gl, this.shaders, this.world, this.textures ] = [ this.chunkGraphics.gl, this.chunkGraphics.shaders, this.chunkGraphics.world, this.chunkGraphics.textures ];
  [ this.x, this.y, this.z ] = [ this.chunk.x, this.chunk.y, this.chunk.z ];
  
  this.pos = this.x + ',' + this.y + ',' + this.z;
  this.vertex0 = [];
  this.vertex1 = [];
  this.vertexSlots = [];
  this.indices = [];
  this.update = false;
}

// compresses vertex data into uInt32 format and pushes it to vertex lists
ChunkMesh.prototype.addVertex = function(x, y, z, textureLayer = 2, texcoordX = 0, texcoordY = 0, dLight = 3, index = -1) { 
  // vertex0: [ 10 bitx X, 10 bits Y, 10 bits Z, 2 bits empty ] <- use this to find faces
  // vertex1: [ 10 bits texture layer, 5 bits texcoord x, 5 bits texcoord y, 2 bits shading, 10 bits empty ]
  if (index >= 0) {
    this.vertex0[index] = x | (y << 10) | (z << 20);
    this.vertex1[index] = textureLayer | (texcoordX << 10) | (texcoordY << 15) | (dLight << 20);
  } else {
    this.vertex0.push( x | (y << 10) | (z << 20) );
    this.vertex1.push( textureLayer | (texcoordX << 10) | (texcoordY << 15) | (dLight << 20) );
  }

  this.update = true;
  return index >= 0 ? index : this.vertex0.length - 1;
};

// creates vao and mesh
ChunkMesh.prototype.load = function() {
  const gl = this.gl,
        blocks = this.chunk.blocks,
        world = this.world;

  // load vao and buffers
  this.vao = gl.createVertexArray();
  gl.bindVertexArray(this.vao);

  const vertex0Buffer = this.vertex0Buffer = gl.createBuffer();
  this.shaders[this.shaderName].renderer.assignAttribI('vertex0', vertex0Buffer, 1, gl.UNSIGNED_INT, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertex0Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);

  const vertex1Buffer = this.vertex1Buffer = gl.createBuffer();
  this.shaders[this.shaderName].renderer.assignAttribI('vertex1', vertex1Buffer, 1, gl.UNSIGNED_INT, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertex1Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex1), gl.DYNAMIC_DRAW);

  const indexBuffer = this.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.DYNAMIC_DRAW);
};

// updates buffers (called automatically in chunkGraphics when this.update === true)
ChunkMesh.prototype.updateBuffers = function() {
  const gl = this.gl;
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex0Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex1Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex1), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.DYNAMIC_DRAW);  
};

// generates the vertex0 for cube-type blocks (x, y, z)
ChunkMesh.prototype.cubeFacePosition = function(x, y, z, dir) {
  const n = 16;
  x *= n;
  y *= n;
  z *= n;
  switch(dir) {
    case 0: return [ x + n, y, z, x + n, y + n, z, x + n, y + n, z + n, x + n, y, z + n ]; // positive x [ 1,0,0, 1,0,1, 1,1,1, 1,1,1, 1,1,0, 1,0,0 ]
    case 1: return [ x, y, z, x, y, z + n, x, y + n, z + n, x, y + n, z ];                 // negative x [ 0,0,0, 0,0,1, 0,1,1, 0,1,1, 0,1,0, 0,0,0 ]
    case 2: return [ x, y + n, z, x, y + n, z + n, x + n, y + n, z + n, x + n, y + n, z ]; // positive y [ 0,1,0, 0,1,1, 1,1,1, 1,1,1, 1,1,0, 0,1,0 ]
    case 3: return [ x + n, y, z + n, x, y, z + n, x, y, z, x + n, y, z ];                 // negative y [ 1,0,1, 0,0,1, 0,0,0, 0,0,0, 1,0,0, 1,0,1 ]
    case 4: return [ x, y, z + n, x + n, y, z + n, x + n, y + n, z + n, x, y + n, z + n ]; // positive z [ 0,0,1, 1,0,1, 1,1,1, 1,1,1, 0,1,1, 0,0,1 ]
    case 5: return [ x, y, z, x, y + n, z, x + n, y + n, z, x + n, y, z ];                 // negative z [ 0,0,0, 0,1,0, 1,1,0, 1,1,0, 1,0,0, 0,0,0 ]
  }
};

// generates texcoords for cube-type blocks (texcoordX, texcoordY)
ChunkMesh.prototype.cubeFaceTexcoord = function(orientation = 0) {
  switch(orientation) {
    case 0: return [ 0, 0, 0, 16, 16, 16, 16, 0 ];
    case 1: return [ 16, 0, 0, 0, 0, 16, 16, 16 ];
    case 2: return [ 16, 16, 16, 0, 0, 0, 0, 16 ];
    case 3: return [ 0, 16, 16, 16, 16, 0, 0, 0 ];
  }
};

// adds one of the six square faces on cubes
ChunkMesh.prototype.addCubeFace = function(x, y, z, dir, texture) {
  const pos = this.cubeFacePosition(x, y, z, dir),
        texcoord = this.cubeFaceTexcoord([2, 3, 0, 0, 3, 2][dir]),
        dLight = [1, 1, 3, 0, 2, 2][dir]; // directional lighting

  let vertexIndex = -4;
  if (this.vertexSlots.length > 0) {
    vertexIndex = this.vertexSlots[this.vertexSlots.length - 1];
    this.vertexSlots.pop();
  }

  const a = this.addVertex(pos[0], pos[1], pos[2], texture, texcoord[0], texcoord[1], dLight, vertexIndex),
        b = this.addVertex(pos[3], pos[4], pos[5], texture, texcoord[2], texcoord[3], dLight, vertexIndex + 1),
        c = this.addVertex(pos[6], pos[7], pos[8], texture, texcoord[4], texcoord[5], dLight, vertexIndex + 2),
        d = this.addVertex(pos[9], pos[10], pos[11], texture, texcoord[6], texcoord[7], dLight, vertexIndex + 3);
  this.indices.push(
    a, b, c,
    c, d, a
  );
};

// removes a rectangular face
ChunkMesh.prototype.removeFace = function(facePosition) {
  const vertexIndex = this.findFace(facePosition);
  if (vertexIndex === -1) return;
  this.vertex0[vertexIndex] = this.vertex0[vertexIndex + 1] = this.vertex0[vertexIndex + 2] = this.vertex0[vertexIndex + 3] = NaN;
  this.vertex1[vertexIndex] = this.vertex1[vertexIndex + 1] = this.vertex1[vertexIndex + 2] = this.vertex1[vertexIndex + 3] = NaN;
  this.indices.splice(this.findIndex(vertexIndex), 6);
  
  this.vertexSlots.push(vertexIndex);
  this.update = true;
};

// returns starting index of a face (4 vertices per face)
ChunkMesh.prototype.findFace = function(facePosition) {
  let vertex0 = this.vertex0;
  for (let i = 0; i < vertex0.length; i += 4) {
    if (isNaN(vertex0[i])) continue;
    if (
      (facePosition[0] | (facePosition[1] << 10) | (facePosition[2] << 20)) === vertex0[i] && 
      (facePosition[3] | (facePosition[4] << 10) | (facePosition[5] << 20)) === vertex0[i + 1] && 
      (facePosition[6] | (facePosition[7] << 10) | (facePosition[8] << 20)) === vertex0[i + 2] && 
      (facePosition[9] | (facePosition[10] << 10) | (facePosition[11] << 20)) === vertex0[i + 3]
    ) {
      return i;
    }
  }
  return -1;
};

// use findIndex instead as indices are no longer sorted anymore
ChunkMesh.prototype.indexBinarySearch = function(index) {
  let indices = this.indices,
      mid, min = 0, max = indices.length;
  while (min <= max) {
    mid = Math.floor((min + max) / 12) * 6;
    if (index > indices[mid]) {
      min = mid + 6;
    } else if (index < indices[mid]) {
      max = mid - 6;
    } else {
      return mid;
    } 
  }
  return -1;
};

// finds index of a 'this.indices' given the index of a starting vertex0 (always a multiple of 4)
ChunkMesh.prototype.findIndex = function(index) {  
  let indices = this.indices, i;
  for (i = 0; i < indices.length; i += 6) {
    if (indices[i] === index) return i;
  }
  return -1;
};

// checks two faces' interactions to see if a face needs to be added/removed
// dir is for blockData0, assumes block in direction 'dir' is blockData1
ChunkMesh.faceInteraction = function(blockData0, blockData1, add, dir, blockInfo0, blockInfo1) {
  let addFace, removeFace; // add == true: addFace0, removeFace1. add == false: removeFace0, addFace1

  if (add) { // ADDING FACE
    if (blockInfo0.isInvisible) return [ false, false ];
    if ((blockInfo1.isInvisible || blockInfo1.isTranslucent || blockInfo1.isTransparent) && blockData0.type !== blockData1.type) addFace = true;
    if (!blockInfo1.isInvisible && !blockInfo0.isTranslucent && !blockInfo0.isTransparent || (blockData0.type === blockData1.type)) removeFace = true;
  } else { // REMOVING FACE
    if ((blockInfo1.isInvisible || blockInfo1.isTranslucent || blockInfo1.isTransparent) && blockData0.type !== blockData1.type) removeFace = true;
    if (!blockInfo1.isInvisible && !blockInfo0.isTranslucent && !blockInfo0.isTransparent || (blockData0.type === blockData1.type)) addFace = true;
  }

  return [ !!addFace, !!removeFace ];
};

// adds/removes block's mesh and updates neighbors
// add: block = block type, !add: block = prevBlockData
ChunkMesh.prototype.updateBlock = function(x, y, z, add, block) {    
  let tx, ty, tz, i, index, otherBlockData, otherBlockInfo, faceInteraction,
      thisBlockData = add ? { type: block } : block,
      blockInfo = this.world.getBlockInfo(thisBlockData.type);
  if (add && blockInfo.isInvisible) return;

  for (i = 0; i < 6; i ++) {
    tx = (i === 0) - (i === 1);
    ty = (i === 2) - (i === 3);
    tz = (i === 4) - (i === 5);
    otherBlockData = this.chunk.getBlockData(x + tx, y + ty, z + tz);
    if (otherBlockData === undefined) continue;
    otherBlockInfo = this.world.getBlockInfo(otherBlockData.type);
    faceInteraction = ChunkMesh.faceInteraction(thisBlockData, otherBlockData, add, i, blockInfo, otherBlockInfo);

    if (faceInteraction[0]) {
      if (add) {
        this.addCubeFace(x, y, z, i, this.textures.textureKeys[blockInfo.texture[i]]);
      } else {
        if (!this.shaders[otherBlockInfo.shader].chunkMeshes[otherBlockData.chunkPos]) this.chunkGraphics.loadChunkMesh(otherBlockInfo.shader, otherBlockData.chunkPos, true);
        this.shaders[otherBlockInfo.shader].chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1), this.textures.textureKeys[otherBlockInfo.texture[i + (i % 2 === 0 ? 1 : -1)]]);
      }
    }
    if (faceInteraction[1]) {
      if (add) {
        this.shaders[otherBlockInfo.shader].chunkMeshes[otherBlockData.chunkPos].removeFace(this.cubeFacePosition(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1)), otherBlockData.x, otherBlockData.y, otherBlockData.z);
      } else {
        // passes in x y z for transparent blocks sorting
        this.removeFace(this.cubeFacePosition(x, y, z, i), x, y, z);
      }
    }
  }
};

// adds a block's mesh (current block at x y z must be air) and updates neighbors
ChunkMesh.prototype.addBlock = function(x, y, z, block) {
  this.updateBlock(x, y, z, true, block);
};

// removes a block's mesh and updates neighbors
ChunkMesh.prototype.removeBlock = function(x, y, z, prevBlockData) {
  this.updateBlock(x, y, z, false, prevBlockData);
};


/** ./src/client/graphics/chunkMeshAlpha.js **/

extend(ChunkMeshAlpha, ChunkMesh);
function ChunkMeshAlpha(...args) {
  this.__super__.constructor.call(this, ...args);
  
  // stores indices in each block coordinate for easy iteration
  this.blocksX = [];
  this.blocksY = [];
  this.blocksZ = [];
  this.blocksData = {};
  
  this.indices = [];
  this.indicesLength = 0;
}

ChunkMeshAlpha.prototype.updateBuffers = function() {
  const gl = this.gl;
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex0Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex1Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex1), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.DYNAMIC_DRAW);  
  delete this.indices;
};

ChunkMeshAlpha.changes = { x: NaN, y: NaN, z: NaN, greatestDir: '' };
ChunkMeshAlpha.processCameraData = function(camera) {
  const x = Math.floor(camera.x),
        y = Math.floor(camera.y),
        z = Math.floor(camera.z),
        rx = camera.rotation[0],
        ry = camera.rotation[1],
        vx = Math.sin(ry) * Math.cos(rx),
        vy = Math.sin(rx),
        vz = Math.cos(ry) * Math.cos(rx),
        avx = Math.abs(vx),
        avy = Math.abs(vy),
        avz = Math.abs(vz),
        greatestDir = (avx > avy ? (avx > avz ? 'X' : 'Z') : (avy > avz ? 'Y' : 'Z')),
        greatestMag = greatestDir === 'X' ? vx : greatestDir === 'Y' ? vy : vz;
  
  // ONLY UPDATE WHEN: camera's block position changes OR camera rotatation that results in a change in greatest direction
  const changes = this.changes;
  let changed = true;
  if (x === changes.x && y === changes.y && z === changes.z && changes.greatestDir === greatestDir) changed = false;
  changes.x = x;
  changes.y = y;
  changes.z = z;
  changes.greatestDir = greatestDir;
  
  return [ x, y, z, greatestDir, greatestMag, changed ];
};

ChunkMeshAlpha.prototype.updateIndices = function(x, y, z, greatestDir, greatestMag, changed) {
  if (!changed && !this.update) return;
  
  const blocksPos = this['blocks' + greatestDir],
        otherPos = greatestDir === 'X' ? [ y - this.y * 32, z - this.z * 32 ] : greatestDir === 'Y' ? [ z - this.z * 32, x - this.x * 32 ] : [ x - this.x * 32, y - this.y * 32 ];  
  
  this.indices = new Uint32Array(this.indicesLength);
  let i, j, k, l, index = 0;
  // loop from back to front in greatest 'v' direction's magnitude
  let reversed = false;
  if (greatestMag < 0) {
    blocksPos.reverse();
    reversed = true;
  }
  for (i = 0; i < blocksPos.length; i ++) {
    // loop based on rectilinear distance
    for (j = 1; j < blocksPos[i].length; j ++) {
      if (blocksPos[i][j][0] >= otherPos[0]) break;
      for (k = 1; k < blocksPos[i][j].length; k ++) {
        if (blocksPos[i][j][k][0] >= otherPos[1]) break;
        for (l = 0; l < blocksPos[i][j][k][1].length; l ++) {
          this.indices[index ++] = blocksPos[i][j][k][1][l];
        }
      }
      for (k = blocksPos[i][j].length - 1; k >= 1; k --) {
        if (blocksPos[i][j][k][0] < otherPos[1]) break;
        for (l = 0; l < blocksPos[i][j][k][1].length; l ++) {
          this.indices[index ++] = blocksPos[i][j][k][1][l];
        }
      }
    }
    for (j = blocksPos[i].length - 1; j >= 1; j --) {
      if (blocksPos[i][j][0] < otherPos[0]) break;
      for (k = 1; k < blocksPos[i][j].length; k ++) {
        if (blocksPos[i][j][k][0] >= otherPos[1]) break;
        for (l = 0; l < blocksPos[i][j][k][1].length; l ++) {
          this.indices[index ++] = blocksPos[i][j][k][1][l];
        }
      }
      for (k = blocksPos[i][j].length - 1; k >= 1; k --) {
        if (blocksPos[i][j][k][0] < otherPos[1]) break;
        for (l = 0; l < blocksPos[i][j][k][1].length; l ++) {
          this.indices[index ++] = blocksPos[i][j][k][1][l];
        }
      }
    }
  }
  if (reversed) blocksPos.reverse();
  
  if (this.update) return;
  const gl = this.gl;
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.DYNAMIC_DRAW);
  delete this.indices;
};

// updates blocksPos
ChunkMeshAlpha.prototype.updateBlocksPos = function(x, y, z, add, indices) {
  let p, i, j, k,
      bp0, bp1, bp2, // x/y/z, y/z/x, z/x/y
      blocksPos;     // X,     Y,     Z
  for (p = 0; p < 3; p ++) {
    bp0 = p === 0 ? x : p === 1 ? y : z;
    bp1 = p === 0 ? y : p === 1 ? z : x;
    bp2 = p === 0 ? z : p === 1 ? x : y;
    blocksPos = this['blocks' + 'XYZ'[p]];
    
    for (i = 0; i < blocksPos.length; i ++) {
      if (bp0 <= blocksPos[i][0]) break;
    }
    if (add && bp0 !== blocksPos[i]?.[0]) blocksPos.splice(i, 0, [bp0]);
    
    for (j = 1; j < blocksPos[i].length; j ++) {
      if (bp1 <= blocksPos[i][j][0]) break;
    }
    if (add && bp1 !== blocksPos[i][j]?.[0]) blocksPos[i].splice(j, 0, [bp1]);
    
    for (k = 1; k < blocksPos[i][j].length; k ++) {
      if (bp2 <= blocksPos[i][j][k]?.[0]) break;
    }
        
    if (add) {
      blocksPos[i][j].splice(k, 0, [bp2, indices]);
    } else {
      blocksPos[i][j].splice(k, 1);
      if (blocksPos[i][j].length === 1) blocksPos[i].splice(j, 1);
      if (blocksPos[i].length === 1) blocksPos.splice(i, 1);
    }
  }
};

// update all neighbors
ChunkMeshAlpha.prototype.updateBlocks = function(x, y, z, a, b, c, d, add) {
  const pos = x + ',' + y + ',' + z;
  if (add) {
    let indices = this.blocksData[pos];
    if (indices === undefined) {
      indices = this.blocksData[pos] = []; // list of indices
      this.updateBlocksPos(x, y, z, true, indices);
    }
    indices.push(
      a, b, c,
      c, d, a
    );
    this.indicesLength += 6;
  } else {
    let indices = this.blocksData[pos], i, data;
    for (i = 0; i < indices.length; i += 6) {
      if (a === indices[i] && b === indices[i + 1] && c === indices[i + 2] && d === indices[i + 4]) {
        indices.splice(i, 6);
        this.indicesLength -= 6;
        break;
      }
    }
    if (indices.length === 0) {
      this.updateBlocksPos(x, y, z, false);
      delete this.blocksData[pos];
    }
  }
};

// adds one of the six square faces on cubes
ChunkMeshAlpha.prototype.addCubeFace = function(x, y, z, dir, texture) {
  const pos = this.cubeFacePosition(x, y, z, dir),
        texcoord = this.cubeFaceTexcoord([2, 3, 0, 0, 3, 2][dir]),
        dLight = [1, 1, 3, 0, 2, 2][dir]; // directional lighting

  let vertexIndex = -4;
  if (this.vertexSlots.length > 0) {
    vertexIndex = this.vertexSlots[this.vertexSlots.length - 1];
    this.vertexSlots.pop();
  }

  const a = this.addVertex(pos[0], pos[1], pos[2], texture, texcoord[0], texcoord[1], dLight, vertexIndex),
        b = this.addVertex(pos[3], pos[4], pos[5], texture, texcoord[2], texcoord[3], dLight, vertexIndex + 1),
        c = this.addVertex(pos[6], pos[7], pos[8], texture, texcoord[4], texcoord[5], dLight, vertexIndex + 2),
        d = this.addVertex(pos[9], pos[10], pos[11], texture, texcoord[6], texcoord[7], dLight, vertexIndex + 3);
  this.updateBlocks(x, y, z, a, b, c, d, true);
};

// removes a face
ChunkMeshAlpha.prototype.removeFace = function(facePosition, x, y, z) {
  const vertexIndex = this.findFace(facePosition);
  if (vertexIndex === -1) return;
  this.vertex0[vertexIndex] = this.vertex0[vertexIndex + 1] = this.vertex0[vertexIndex + 2] = this.vertex0[vertexIndex + 3] = NaN;
  this.vertex1[vertexIndex] = this.vertex1[vertexIndex + 1] = this.vertex1[vertexIndex + 2] = this.vertex1[vertexIndex + 3] = NaN;
  this.updateBlocks(x, y, z, vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex + 3, false);
  
  this.vertexSlots.push(vertexIndex);
  this.update = true;
};


/** ./src/client/graphics/matrix.js **/

function mat4() {
  this.data = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

mat4.prototype.perspective = function(fov, aspect, near, far) {
  let fy = 1 / Math.tan(fov / 2),
      fx = fy / aspect,
      nf = 1 / (near - far),
      a  = (near + far) * nf,
      b  = 2 * near * far * nf;
  this.data = [
    fx, 0,  0,  0,
    0,  fy, 0,  0,
    0,  0,  a, -1,
    0,  0,  b,  0
  ];
};

mat4.prototype.translate = function(x, y, z) {
  let d = this.data;
  d[12] += x * d[0] + y * d[4] + z * d[8];
  d[13] += x * d[1] + y * d[5] + z * d[9];
  d[14] += x * d[2] + y * d[6] + z * d[10];
  d[15] += x * d[3] + y * d[7] + z * d[11];
};

mat4.prototype.scale = function(x, y, z) {
  let d = this.data;
  d[0] *= x;
  d[1] *= x;
  d[2] *= x;
  d[3] *= x;
  d[4] *= y;
  d[5] *= y;
  d[6] *= y;
  d[7] *= y;
  d[8] *= z;
  d[9] *= z;
  d[10] *= z;
  d[11] *= z;
};

mat4.prototype.rotateX = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      d4 = d[4], d5 = d[5], d6 = d[6],   d7 = d[7],
      d8 = d[8], d9 = d[9], d10 = d[10], d11 = d[11];
  d[4]  =  c * d4 + s * d8;
  d[5]  =  c * d5 + s * d9;
  d[6]  =  c * d6 + s * d10;
  d[7]  =  c * d7 + s * d11;
  d[8]  = -s * d4 + c * d8;
  d[9]  = -s * d5 + c * d9;
  d[10] = -s * d6 + c * d10;
  d[11] = -s * d7 + c * d11;
};

mat4.prototype.rotateY = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      d0 = d[0], d1 = d[1], d2 = d[2],   d3 = d[3],
		  d8 = d[8], d9 = d[9], d10 = d[10], d11 = d[11];
  d[0]  =  c * d0 + s * d8;
  d[1]  =  c * d1 + s * d9;
  d[2]  =  c * d2 + s * d10;
  d[3]  =  c * d3 + s * d11;
  d[8]  = -s * d0 + c * d8;
  d[9]  = -s * d1 + c * d9;
  d[10] = -s * d2 + c * d10;
  d[11] = -s * d3 + c * d11;
};

mat4.prototype.rotateZ = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      a0 = d[0], a1 = d[1], a2 = d[2],   a3 = d[3],
      d4 = d[4], d5 = d[5], d6 = d[6],   d7 = d[7];
  d[0] =  c * a0 + s * d4;
  d[1] =  c * a1 + s * d5;
  d[2] =  c * a2 + s * d6;
  d[3] =  c * a3 + s * d7;
  d[4] = -s * a0 + c * d4;
  d[5] = -s * a1 + c * d5;
  d[6] = -s * a2 + c * d6;
  d[7] = -s * a3 + c * d7;
};

mat4.multiply = function(m0, m1) {
  const mOut = new mat4().data;
  m0 = m0.data ?? m0;
  m1 = m1.data ?? m1;
  for (let i = 0; i < 4; i ++) {
		for (let j = 0; j < 4; j ++) {
			mOut[i * 4 + j] = 0;
			for (let k = 0; k < 4; k ++) {
				mOut[i * 4 + j] += m0[i * 4 + k] * m1[k * 4 + j];
			}
		}
	}
  return mOut;
};

mat4.transformVec4 = function(m, v) {
  const vOut = [0, 0, 0, 0];
  m = m.data ?? m;
  for (let i = 0; i < 4; i ++) {
    for (let j = 0; j < 4; j ++) {
      vOut[i] += m[j * 4 + i] * v[j];
    }
  }
  return vOut;
};


/** ./src/client/graphics/renderer.js **/

function Renderer(gl, vertSrc, fragSrc) {
  this.gl = gl;
  // vertex shader
  const vertShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertShader, vertSrc);
  gl.compileShader(vertShader);

  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) 
    return console.log(gl.getShaderInfoLog(vertShader));

  // fragment shader
  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragShader, fragSrc);
  gl.compileShader(fragShader);

  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))
    return console.log(gl.getShaderInfoLog(fragShader));
  
  // program
  const program = this.program =  gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    return console.log(gl.getProgramInfoLog(program));
};

Renderer.prototype.assignAttrib = function(name, buffer, size, type, stride, offset = 0) {
  const gl = this.gl,
        loc = gl.getAttribLocation(this.program, name);
  gl.enableVertexAttribArray(loc);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(loc, size, type, false, stride, offset);
};

Renderer.prototype.assignAttribI = function(name, buffer, size, type, stride, offset = 0) {
  const gl = this.gl,
        loc = gl.getAttribLocation(this.program, name);
  gl.enableVertexAttribArray(loc);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribIPointer(loc, size, type, false, stride, offset);
};

Renderer.prototype.createFrameBuffer = function() {
  
};

/*
Renderer.prototype.createTexture = function(url) {
  const gl = this.gl,
        texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));

  let image = new Image(); 
  image.src = url;
  image.addEventListener('load', function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  });
};

Renderer.prototype.createTextureArray = async function(urls, width, height) {
  const gl = this.gl,
        texture = gl.createTexture(),
        pixels = [];
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
  for (let url of urls) {
    let image = new Image();
    image.src = url;
    await new Promise((resolve, reject) => {
      image.addEventListener('load', function() {
        // use canvas to create texture array
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        pixels.push(...new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer));
        resolve();
      });
    });
  }
  
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, width, height, urls.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixels));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  return texture;
};*/


/** ./src/client/graphics/shaders/alphaBlockShader.js **/

// for tranlucent blocks
const alphaBlockVertSrc = 
` #version 300 es

  uniform mat4 projection;
  uniform mat4 camera;

  uniform vec3 chunkPosition;

  in uint vertex0;
  in uint vertex1;

  out vec3 textureData;
  out float shadeData;
  out vec3 viewPosition;

  void main() {
    float x = float(vertex0 & 1023u);
    float y = float((vertex0 & 1047552u) >> 10u);
    float z = float((vertex0) >> 20u);
    vec4 position = vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);

    gl_Position = projection * camera * position;

    float textureLayer = float(vertex1 & 1023u);
    float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
    float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;

    textureData = vec3(texcoordX, texcoordY, textureLayer);
    shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
    viewPosition = (camera * position).xyz;
  }
`;

const alphaBlockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  uniform sampler2DArray diffuse;

  uniform vec4 fogColor;
  uniform float fogFar;
  
  in vec3 textureData;
  in float shadeData;
  in vec3 viewPosition;

  out vec4 outColor;

  void main() {
    outColor = mix(texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f), fogColor, smoothstep(0.0f, fogFar, length(viewPosition)));
  }
`;


/** ./src/client/graphics/shaders/blockShader.js **/

// for most blocks
const blockVertSrc = 
` #version 300 es

  uniform mat4 projection;
  uniform mat4 camera;

  uniform vec3 chunkPosition;

  in uint vertex0;
  in uint vertex1;

  out vec3 textureData;
  out float shadeData;
  out float distance;

  void main() {
    float x = float(vertex0 & 1023u);
    float y = float((vertex0 & 1047552u) >> 10u);
    float z = float((vertex0) >> 20u);
    vec4 position = vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);

    gl_Position = projection * camera * position;

    float textureLayer = float(vertex1 & 1023u);
    float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
    float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;

    textureData = vec3(texcoordX, texcoordY, textureLayer);
    shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
    distance = length((camera * position).xyz);
  }
`;

const blockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;
  
  uniform sampler2DArray diffuse;
  
  uniform vec4 fogColor;
  uniform float fogFar;

  in vec3 textureData;
  in float shadeData;
  in float distance;

  out vec4 outColor;

  void main() {
    float fogAmount = smoothstep(fogFar - 64.0f, fogFar, distance);
    vec4 color = texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f);
    
    outColor = mix(color, fogColor, fogAmount);
  
    if (color[3] < 0.4f) discard;
    outColor[3] = 1.0f;
  }
`;


/** ./src/client/graphics/textures.js **/

function Textures() {  
  this.height = 16;
  this.width = 16;
  this.data = {
    grass_top: [[0,1,1,2,1,1,3,1,2,1,2,1,1,2,1,2,1,2,0,1,3,0,2,1,0,1,1,0,0,1,3,1,1,1,1,2,1,2,1,1,3,2,1,2,2,1,1,0,0,2,0,1,1,1,0,0,1,1,0,2,1,3,3,1,1,1,1,3,3,1,0,2,1,2,2,1,0,1,3,3,2,1,1,0,1,0,3,1,2,1,2,1,2,1,1,1,1,0,2,1,1,2,3,1,0,3,0,1,3,1,3,1,0,2,3,0,2,1,1,2,1,2,1,2,1,2,1,0,1,3,1,1,1,3,1,0,2,1,1,0,1,3,0,1,1,3,1,2,1,1,2,1,1,3,0,1,2,0,1,0,1,0,3,1,2,0,1,3,2,1,2,2,1,1,1,1,2,1,1,1,2,3,2,0,1,0,2,1,0,2,3,2,1,1,2,0,1,2,1,0,2,1,2,3,2,1,2,1,1,3,1,3,1,0,1,2,1,2,1,1,3,0,2,1,0,2,1,1,2,2,1,0,2,1,3,1,1,2,1,1,1,1,2,0,1,1,2,1,2,0,3,1,0,1,1,3],[[54,86,41,255],[63,103,46,255],[72,118,53,255],[83,135,62,255]]],
    grass_side: [[0,1,1,2,1,1,0,3,1,1,0,1,0,1,1,2,0,3,1,1,0,3,1,2,1,2,0,0,1,2,0,1,0,2,0,2,0,2,4,1,0,3,0,2,1,3,0,2,1,2,0,3,4,2,4,2,0,4,1,2,1,2,1,2,1,4,0,2,4,4,4,2,0,4,1,3,4,4,1,4,4,5,4,4,4,5,4,4,1,4,4,4,4,5,4,4,6,6,5,5,5,7,6,4,4,5,6,6,8,5,5,8,8,6,6,5,6,6,6,5,5,8,8,8,5,5,4,4,5,5,4,4,6,6,6,7,5,5,4,4,5,6,7,4,5,6,7,4,5,8,6,6,6,6,4,5,6,6,7,5,8,6,6,6,5,8,8,6,6,8,5,8,8,6,6,5,8,8,6,6,4,5,8,8,5,5,4,4,8,8,5,5,5,6,6,8,4,4,5,5,5,8,8,4,4,4,5,6,5,6,6,4,4,4,5,7,4,4,8,4,4,5,5,4,5,5,4,4,6,4,8,6,7,4,5,5,6,6,7,4,5,8,6,4,5,5,6,6,6,5,5,8,6,6,6,5],[[54,86,41,255],[63,103,46,255],[72,118,53,255],[83,135,62,255],[74,55,43,255],[81,61,47,255],[117,87,68,255],[138,102,79,255],[106,79,61,255]]],
    dirt: [[0,1,2,3,3,4,0,0,0,3,4,0,0,0,0,3,3,2,2,4,3,3,4,0,0,3,2,4,4,2,2,3,3,4,0,0,1,3,4,4,3,2,2,2,2,2,1,3,3,4,0,0,0,3,3,3,3,4,1,2,2,4,0,0,3,4,0,0,4,3,4,3,4,0,0,0,3,4,0,0,3,3,4,4,2,2,3,3,4,0,0,1,0,3,4,0,0,3,2,2,2,1,0,3,4,0,0,0,4,3,3,4,4,2,2,2,0,0,0,2,2,4,4,4,3,3,2,2,3,3,2,3,0,0,0,1,2,2,3,3,3,0,1,2,3,0,1,3,3,4,0,0,0,0,3,3,0,0,1,3,4,0,0,0,3,4,4,0,0,4,3,4,4,0,0,3,4,4,0,0,2,3,4,4,3,3,2,2,4,4,3,3,3,0,0,4,2,2,3,3,3,4,4,2,2,2,3,0,3,0,0,2,2,2,3,1,2,2,4,2,2,3,3,2,3,3,2,2,0,2,4,0,1,2,3,3,0,0,1,2,3,4,0,2,3,3,0,0,0,3,3,4,0,0,0,3],[[117,87,68,255],[138,102,79,255],[74,55,43,255],[81,61,47,255],[106,79,61,255]]],
    stone: [[0,0,1,2,3,0,0,0,1,1,1,0,1,3,0,0,2,0,2,2,2,2,0,1,2,2,2,3,1,0,0,3,4,0,1,4,2,1,1,4,4,4,2,1,0,0,2,2,0,0,1,1,1,1,1,1,1,4,1,1,3,0,1,4,1,1,3,3,1,2,2,3,1,1,1,2,2,3,1,1,1,2,2,2,0,4,2,2,2,3,1,4,4,2,2,1,0,4,4,2,0,0,4,4,4,1,0,4,4,4,1,1,0,0,4,1,0,0,1,1,1,1,0,0,0,0,1,3,2,0,1,1,3,3,1,0,0,2,3,0,0,2,2,2,4,1,1,2,2,2,2,0,4,2,2,3,1,4,2,2,1,1,4,4,4,4,2,0,4,4,4,1,1,4,4,0,1,1,0,0,4,0,1,1,4,1,1,0,0,0,1,1,1,2,3,0,1,1,3,1,1,1,4,0,2,0,0,1,4,4,2,1,1,2,2,2,3,1,0,0,2,3,1,1,5,4,1,1,0,0,4,2,2,2,1,4,4,2,2,0,5,5,2,2,3,0,0,4,4,1,1,1,4,4,4,0],[[56,56,56,255],[62,62,62,255],[105,97,90,255],[120,110,102,255],[90,90,90,255],[57,57,57,255]]],
    leaves: [[0,1,2,2,1,3,4,2,3,5,5,0,2,5,3,4,3,2,5,5,2,3,2,2,3,3,0,0,2,2,0,3,2,5,5,5,2,3,3,3,2,2,1,1,3,0,0,3,1,1,2,2,3,2,2,3,2,4,4,2,2,3,2,2,3,3,3,3,3,2,4,3,2,4,4,4,2,3,2,5,5,3,3,3,3,2,4,3,1,4,4,4,4,2,3,3,4,0,1,1,2,3,0,0,3,2,4,4,5,2,3,0,0,0,1,4,4,3,0,4,5,3,2,4,5,4,1,0,3,3,2,4,5,2,3,4,4,3,1,4,4,4,2,3,3,2,4,4,5,4,2,3,3,3,1,1,2,2,2,3,3,2,4,5,5,4,2,3,2,3,0,0,3,0,0,3,3,2,4,5,5,4,1,0,0,3,3,3,3,0,2,2,3,2,4,4,4,4,1,0,0,2,1,1,3,3,4,5,0,0,2,2,2,1,3,3,3,2,4,4,2,2,3,3,0,0,3,3,0,0,2,2,3,2,4,4,4,4,1,3,3,5,4,3,3,3,5,2,3,1,4,5,5,4,1,3],[[40,91,34,255],[58,121,51,255],[58,129,50,255],[57,135,49,0],[60,137,52,255],[65,148,56,255]]],
    glass: [[0,0,1,1,1,1,1,1,1,0,0,0,1,1,2,2,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,0,3,3,3,2,3,3,3,3,3,3,3,3,3,3,2,0,3,3,2,3,3,3,3,3,3,3,3,3,3,3,1,4,3,2,3,3,3,3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,0,1,1,1,1,2,2,2,2,2,1,1,1,1,1,0,0],[[214,255,246,255],[162,234,219,255],[131,232,211,255],[214,255,246,50],[229,255,249,255]]],
    white_glass: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[[221,221,221,204],[222,222,222,77]]],
    red_glass: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[[255,56,56,204],[255,56,56,77]]],
    green_glass: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[[31,200,82,204],[30,199,83,77]]],
    blue_glass: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[[57,42,255,204],[56,43,255,77]]],
    sand: [[0,0,0,1,0,0,0,2,0,0,0,0,0,0,2,3,0,0,3,0,0,4,2,0,5,1,1,0,2,2,3,3,0,5,1,0,4,4,2,3,5,1,0,4,2,3,5,1,0,1,2,4,2,0,3,3,1,0,4,4,0,5,1,2,0,0,4,2,0,3,5,1,0,0,4,2,5,1,2,4,0,2,0,5,5,1,1,1,0,4,2,1,0,2,4,4,4,0,5,5,1,1,2,0,0,0,0,0,0,2,4,2,0,0,1,1,1,2,2,0,3,1,1,0,0,4,2,0,0,1,0,0,2,0,3,3,5,1,0,0,2,5,0,2,0,0,4,0,0,3,5,1,1,0,2,0,5,1,2,4,2,4,2,0,5,1,1,1,0,2,0,5,3,1,2,0,4,4,0,5,5,1,1,0,4,0,5,3,1,1,0,0,2,0,0,5,1,0,2,4,4,0,1,1,1,0,0,5,0,0,1,1,0,0,4,2,5,1,0,0,2,2,5,1,0,2,4,2,0,2,2,5,1,0,0,4,2,1,1,0,3,2,2,0,0,0,1,1,0,0,4,2,0,0,0,2],[[217,190,119,255],[217,184,103,255],[220,195,127,255],[201,170,91,255],[228,202,133,255],[211,178,95,255]]],
    log_side: [[0,1,2,3,3,0,2,0,4,1,0,3,3,0,5,3,0,3,6,0,3,0,6,1,3,1,2,0,3,2,0,3,0,3,6,0,3,0,2,1,3,1,2,1,3,2,0,1,1,3,2,0,0,5,6,3,3,0,6,1,3,6,3,1,1,0,0,2,1,0,1,3,3,0,2,1,1,6,3,1,2,0,0,2,1,3,0,3,3,2,0,0,1,2,3,0,6,3,0,6,0,3,2,3,0,2,0,2,0,0,2,0,0,3,1,2,0,3,6,3,0,6,1,5,2,0,2,0,0,3,1,0,3,3,2,3,1,6,1,0,6,5,2,0,0,6,1,5,3,1,2,0,1,6,1,3,2,0,2,3,3,2,3,0,3,1,6,5,3,2,0,3,0,3,6,3,3,2,3,0,2,1,6,0,3,3,0,3,0,3,6,0,0,6,3,5,6,0,2,2,0,6,3,0,1,3,2,1,0,2,3,0,2,0,3,2,0,6,3,2,1,0,3,1,1,0,3,3,2,0,3,0,4,2,0,6,1,1,2,1,3,3,0,3,4,0,2,1,3,3,3,2,0,1,0,0],[[133,109,66,255],[124,103,64,255],[82,67,40,255],[115,94,58,255],[153,125,76,255],[143,117,71,255],[92,75,42,255]]],
    log_core: [[0,0,1,1,0,1,1,2,2,1,0,1,1,0,1,1,2,1,0,1,3,3,4,5,3,3,3,3,1,1,2,1,2,1,3,3,3,6,6,6,7,7,6,3,5,5,2,0,1,1,3,6,7,5,5,3,3,3,3,6,6,5,1,2,2,3,3,6,3,3,3,3,3,5,5,3,7,3,3,2,1,3,6,3,3,3,7,7,6,6,5,3,5,6,3,1,2,3,7,3,5,6,3,3,3,3,6,3,3,6,5,1,1,3,7,3,3,6,3,7,6,3,7,3,3,6,5,1,2,8,6,3,3,7,3,6,7,3,7,3,5,7,5,0,0,8,6,5,3,7,3,3,3,5,6,3,5,7,3,2,1,3,7,5,3,3,6,7,6,6,3,3,3,6,3,1,1,3,3,7,3,5,3,3,3,5,3,3,6,3,3,1,2,1,3,6,6,3,5,5,3,3,3,7,6,3,1,2,0,1,3,3,3,6,6,7,7,6,6,5,3,3,1,2,1,0,2,1,3,5,4,3,3,3,5,5,2,1,2,1,0,1,0,0,1,0,1,2,2,1,1,0,0,1,1,0],[[133,109,66,255],[115,94,58,255],[124,103,64,255],[167,140,88,255],[177,154,108,255],[172,147,98,255],[154,128,78,255],[145,119,70,255],[178,154,108,255]]],
    marble: [[0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,1,1,0,0,0,1,1,1,0,0,0,0,0,1,1,2,2,2,0,0,2,2,2,2,1,1,1,0,0,0,0,0,0,0,0,2,2,2,3,3,2,2,2,2,2,2,1,1,1,0,0,0,0,1,1,1,1,3,3,3,3,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,2,2,2,2,2,1,0,0,0,1,2,2,2,2,1,0,0,1,2,3,3,2,2,1,2,2,3,3,3,2,2,1,1,0,0,1,2,2,1,0,1,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,2,2,3,2,2,1,0,0,1,1,1,1,0,0,0,0,0,2,2,0,0,0,0,0,0,0],[[191,191,175,255],[185,185,170,255],[179,180,164,255],[174,174,155,255]]],
    tainted_marble: [[0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,1,1,0,0,0,1,1,1,0,0,0,0,0,1,1,2,2,2,0,0,2,2,2,2,1,1,1,0,0,0,0,0,0,0,0,2,2,2,3,3,2,2,2,2,2,2,1,1,1,0,0,0,0,1,1,1,1,3,3,3,3,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,2,2,2,2,2,1,0,0,0,1,2,2,2,2,1,0,0,1,2,3,3,2,2,1,2,2,3,3,3,2,2,1,1,0,0,1,2,2,1,0,1,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,2,2,3,2,2,1,0,0,1,1,1,1,0,0,0,0,0,2,2,0,0,0,0,0,0,0],[[189,189,114,255],[185,185,110,255],[181,181,108,255],[176,176,103,255]]],
    jungle_marble: [[0,0,0,1,1,2,2,2,2,2,2,1,2,2,0,0,0,3,3,4,2,4,4,4,2,2,4,2,4,3,3,0,0,3,1,1,1,1,2,2,2,2,2,1,1,1,4,1,0,4,1,3,4,2,2,2,4,4,4,3,3,1,4,1,0,2,1,3,1,2,2,2,2,2,1,1,4,1,2,2,0,2,1,4,2,2,2,2,2,2,2,1,4,1,4,2,1,2,1,2,2,2,2,1,1,2,2,2,2,1,4,2,1,4,2,4,2,2,1,1,1,1,2,2,2,2,4,1,1,4,2,2,2,2,1,1,1,1,2,2,4,2,2,1,2,4,2,4,2,2,2,1,1,2,2,2,2,2,2,0,2,2,1,4,1,2,2,2,2,2,2,2,4,1,4,0,2,2,1,4,1,2,2,2,2,2,1,1,3,1,2,0,2,4,1,3,4,2,4,4,4,2,4,4,3,1,4,2,2,2,1,1,2,1,1,1,2,2,1,1,1,1,3,2,1,3,3,4,2,2,4,4,2,2,4,4,4,3,3,0,0,0,0,0,1,1,1,2,2,2,2,1,1,0,0,0],[[131,195,107,255],[125,187,102,255],[128,181,108,255],[115,168,95,255],[120,174,100,255]]],
    andesite: [[0,1,2,2,0,1,0,3,4,4,3,0,0,0,3,3,1,2,2,0,0,0,3,3,0,1,2,2,1,4,2,0,3,3,3,0,0,0,1,2,2,2,2,0,0,0,0,0,3,0,0,0,1,1,4,3,3,3,0,3,3,0,1,1,0,0,3,3,3,4,0,0,1,1,0,0,0,3,3,0,0,1,2,2,1,0,0,0,0,0,0,1,2,2,1,1,1,2,2,0,4,4,3,3,1,1,2,2,2,0,0,0,0,0,3,4,4,3,1,1,0,0,0,3,3,4,4,3,0,2,2,0,0,0,0,0,0,0,3,3,4,4,2,2,0,3,3,0,0,0,1,2,2,1,1,0,0,0,0,0,0,0,0,1,1,2,2,2,0,0,0,0,0,2,2,1,1,1,0,0,0,4,4,4,3,3,0,1,2,2,0,0,3,3,0,3,3,4,0,0,0,0,0,3,3,3,0,0,0,0,2,2,2,2,1,1,1,0,0,0,0,2,2,1,1,2,2,2,0,0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,4,3,3,0,0,1,2,2,0,0,4,3],[[102,103,105,255],[97,98,99,255],[88,88,90,255],[114,114,114,255],[127,127,127,255]]],
    jungle_leaves: [[0,1,2,2,1,0,3,3,1,1,1,1,0,3,1,3,4,4,2,3,0,0,3,3,1,4,1,2,1,3,0,3,2,4,2,3,2,4,3,1,4,4,3,2,1,1,4,3,2,0,2,3,2,4,1,1,4,0,3,2,2,4,4,3,3,1,2,3,2,4,1,2,0,1,2,3,2,0,2,3,3,1,1,3,2,1,3,2,0,1,1,3,2,1,2,3,1,1,1,2,2,0,3,2,1,1,0,3,2,1,2,2,2,2,1,2,1,4,3,2,1,2,0,3,0,1,1,1,2,3,1,1,0,4,3,2,1,2,0,4,4,2,2,1,2,3,2,1,0,2,2,2,1,3,3,4,1,3,2,4,2,3,2,1,1,2,3,1,1,3,2,1,2,3,2,4,0,2,2,0,1,2,3,0,2,3,2,1,2,3,4,4,0,4,1,0,4,2,2,4,2,3,2,0,2,3,0,4,3,0,2,2,4,1,1,0,1,3,2,0,0,1,0,2,1,1,2,3,0,1,3,2,1,2,2,0,0,1,2,2,1,2,3,3,1,1,3,2,1,1,1,0,3,1,2,3],[[79,124,54,255],[79,124,54,0],[66,97,47,255],[68,103,47,255],[84,131,58,255]]],
    sakura_log_side: [[0,0,1,2,1,0,3,0,3,1,0,1,1,3,1,0,0,1,1,3,1,1,1,1,3,1,1,4,1,2,2,4,0,3,1,2,0,1,3,0,3,0,1,4,1,2,0,4,1,3,1,2,0,1,3,4,1,3,1,0,1,2,0,1,1,3,2,2,0,3,0,4,0,3,1,3,1,2,1,3,1,1,2,1,1,3,3,1,0,3,1,3,0,3,1,3,0,1,3,0,1,1,1,1,1,3,1,3,0,1,1,2,0,1,1,0,1,3,4,1,3,1,1,1,1,1,1,1,0,0,3,0,1,2,4,0,3,0,1,3,0,1,1,2,3,4,3,1,1,2,3,0,3,1,3,2,0,1,3,2,2,4,2,3,1,2,2,4,3,1,2,2,4,1,1,3,2,1,2,2,4,1,2,4,3,1,2,0,4,1,3,4,1,4,1,2,0,1,2,1,1,4,2,1,4,1,2,4,1,0,0,2,0,1,3,1,3,4,3,0,1,1,2,0,1,1,0,2,1,1,1,1,3,0,3,0,3,0,2,1,1,3,0,3,0,1,3,1,3,0,1,1,3,0,2,1],[[142,126,121,255],[132,117,112,255],[112,100,95,255],[121,108,103,255],[153,136,131,255]]],
    sakura_log_core: [[0,0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0,2,2,2,2,3,3,4,4,4,4,2,2,2,2,0,1,2,3,3,4,4,5,6,3,3,6,6,4,4,2,0,2,2,3,6,6,5,5,4,4,3,3,4,4,6,2,1,2,2,4,6,4,3,3,4,4,6,6,5,3,3,2,1,2,4,4,3,4,4,5,5,6,4,4,4,6,3,4,2,2,4,6,3,4,5,5,4,4,3,3,3,6,3,3,2,2,4,6,3,4,5,4,3,5,5,5,3,4,6,3,2,2,4,5,4,3,6,4,3,3,3,5,3,4,6,3,2,2,4,5,5,3,3,6,4,4,5,5,4,6,3,4,2,2,4,4,5,4,3,6,6,6,6,4,4,5,3,4,2,2,2,4,6,4,4,4,3,3,3,3,5,5,3,2,2,2,2,4,6,6,6,4,4,4,4,6,5,4,4,2,1,1,2,4,4,3,3,6,6,6,4,4,4,4,4,2,0,0,2,2,2,2,3,3,3,4,4,4,2,2,2,2,0,0,0,1,1,2,2,2,2,2,2,2,2,2,1,1,0],[[112,100,95,255],[121,108,103,255],[132,117,112,255],[174,149,139,255],[164,143,135,255],[140,123,117,255],[151,132,126,255]]],
    sakura_leaves: [[0,1,1,1,2,2,3,3,0,0,4,4,3,3,2,2,2,2,3,1,3,3,3,3,1,1,1,1,1,0,4,4,1,1,1,1,1,1,1,1,4,4,4,2,3,3,3,1,1,2,2,3,1,1,3,3,2,2,0,2,2,2,3,1,1,3,3,3,0,4,3,3,3,3,1,1,4,4,0,1,4,4,4,0,0,1,1,1,1,0,0,4,4,1,2,2,2,2,1,1,1,1,0,0,1,3,3,3,3,0,2,2,2,2,1,3,3,3,3,4,4,2,2,3,3,1,1,1,0,0,0,3,3,2,2,1,1,1,1,0,0,0,0,1,1,1,1,1,1,4,0,0,0,1,1,1,3,3,3,3,4,2,2,2,1,1,1,3,3,3,0,4,3,3,3,2,1,1,0,0,4,4,4,2,2,3,1,1,1,1,0,4,0,1,1,2,3,2,1,1,1,0,0,0,1,1,1,2,2,2,1,3,3,3,0,0,0,2,3,3,3,1,1,1,1,1,1,0,4,4,4,2,1,3,3,3,3,0,3,3,2,2,3,3,1,1,1,1,1,1,1,0,4,4,3,2],[[189,123,203,255],[189,123,203,0],[173,113,185,255],[165,109,177,255],[204,135,218,255]]]
  };
  this.textureIDs = [];
  this.textureKeys = {};
  this.textureKeyCount = 0;
  
  this.pixels = [];
};

Textures.prototype.load = function(texture) {
  let d = this.data[texture],
      pixels = d[0],
      colors = d[1];
  if (!d) return;
  this.textureIDs.push(texture);
  this.textureKeys[texture] = this.textureKeyCount ++;
  
  for (let p = 0; p < pixels.length; p ++) {
    this.pixels.push(...colors[pixels[p]]);
  }  
};

Textures.prototype.loadAll = function() {
  for (let d in this.data) {
    this.load(d);
  }
};

Textures.prototype.createTextureArray = function(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, this.width, this.height, this.pixels.length / 256 / 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8ClampedArray(this.pixels));

  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);  
  return texture;
};


/** ./src/client/main.js **/

(function() {
  
  let then = 0;
  let tick = 0;
  
  const fpsElem = document.getElementById('fps');
  function fps(now) {
    now *= 0.001;
    const deltaTime = now - then;
    then = now;
    const fps = 1 / deltaTime * 60;
    fpsElem.textContent = fps.toFixed(1);
  }

  window.onload = function() {
    const sim = window.sim = new Sim();
    sim.client = true;
    sim.server = true;
    sim.init();
    
    for (let x = -6; x < 6; x ++) {
      for (let y = -1; y < 3; y ++) {
        for (let z = -6; z < 6; z ++) {
          sim.generateChunk(x, y, z);
        }
      }
    }
    //sim.generateChunk(0, 0, 0);
    
    sim.spawnPlayer();
    initControls(); // TEMP
    
    // MAKE ALL ENTITY MOVEMENT "SMOOTH" WHEN RENDERED
    setInterval(() => {
      //sim.tick(); 
    }, 1000 / 16); // tps
    
    draw();
    function draw(now) {
      if (tick % 60 === 0) fps(now);
      sim.tick();
      sim.draw();
      tick ++;
      requestAnimationFrame(draw);
    }
  };
  
})();


/** ./src/client/tempcontrols.js **/

function initControls() {
  
  let keymap = {
    87: 'forward', // w
    83: 'back',    // s
    65: 'left',    // a
    68: 'right',   // d
    32: 'up',      // space
    16: 'down',    // shift
    17: 'lock'     // ctrl
  };
  let input = Object.fromEntries(Object.entries(keymap).map(a => [a[1], false]));
  let leftMouse = false;
  let rightMouse = false;
  
  sim.world.player.tick = function() {    
    const speed = 0.05;
    let vx = vy = vz = 0;
    if (input.forward) vz -= speed;
    if (input.back) vz += speed;
    if (input.up) vy += speed;
    if (input.down) vy -= speed;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
        
    this.moveX(vx);
    this.moveY(vy);
    this.moveZ(vz);
    
    if (sim.ticks % 5 !== 0) return;
    if (leftMouse) sim.world.player.breakBlock();
    if (rightMouse) sim.world.player.placeBlock();
  };
  
  // event listeners
  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== null) {
      let rot = sim.world.player.rotation;
      rot[1] -= e.movementX / 500;
      rot[0] += e.movementY / 500;
      if (rot[0] > Math.PI / 2) rot[0] = Math.PI / 2;
      if (rot[0] < -Math.PI / 2) rot[0] = -Math.PI / 2;
    }
  });
  
  window.addEventListener('mousedown', e => {
    if (event.button === 2) {
      rightMouse = true;
    } else if (event.button === 0) {
      leftMouse = true;
    }
  });
  
  window.addEventListener('mouseup', e => {
    if (event.button === 2) {
      rightMouse = false;
    } else if (event.button === 0) {
      leftMouse = false;
    }
  });

  window.addEventListener('keydown', () => {
    input[keymap[event.keyCode]] = true;
    if (input.lock) document.getElementById('glcanvas').requestPointerLock();
  });
  
  window.addEventListener('keyup', () => {
    input[keymap[event.keyCode]] = false;
  });
 
};


/** ./src/libs/simplex.js **/

/*
 * A fast javascript implementation of simplex noise by Jonas Wagner

Based on a speed-improved simplex noise algorithm for 2D, 3D and 4D in Java.
Which is based on example code by Stefan Gustavson (stegu@itn.liu.se).
With Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
Better rank ordering method by Stefan Gustavson in 2012.

 Copyright (c) 2018 Jonas Wagner

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
let [SimplexNoise, Alea] = (function() {
  'use strict';

  var F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  var G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  var F3 = 1.0 / 3.0;
  var G3 = 1.0 / 6.0;
  var F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
  var G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

  function SimplexNoise(randomOrSeed) {
    var random;
    if (typeof randomOrSeed == 'function') {
      random = randomOrSeed;
    }
    else if (randomOrSeed) {
      random = alea(randomOrSeed);
    } else {
      random = Math.random;
    }
    this.p = buildPermutationTable(random);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (var i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }

  }
  SimplexNoise.prototype = {
    grad3: new Float32Array([1, 1, 0,
      -1, 1, 0,
      1, -1, 0,

      -1, -1, 0,
      1, 0, 1,
      -1, 0, 1,

      1, 0, -1,
      -1, 0, -1,
      0, 1, 1,

      0, -1, 1,
      0, 1, -1,
      0, -1, -1]),
    grad4: new Float32Array([0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
      0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
      1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
      -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
      1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
      -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
      1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
      -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0]),
    noise2D: function(xin, yin) {
      var permMod12 = this.permMod12;
      var perm = this.perm;
      var grad3 = this.grad3;
      var n0 = 0; // Noise contributions from the three corners
      var n1 = 0;
      var n2 = 0;
      // Skew the input space to determine which simplex cell we're in
      var s = (xin + yin) * F2; // Hairy factor for 2D
      var i = Math.floor(xin + s);
      var j = Math.floor(yin + s);
      var t = (i + j) * G2;
      var X0 = i - t; // Unskew the cell origin back to (x,y) space
      var Y0 = j - t;
      var x0 = xin - X0; // The x,y distances from the cell origin
      var y0 = yin - Y0;
      // For the 2D case, the simplex shape is an equilateral triangle.
      // Determine which simplex we are in.
      var i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
      if (x0 > y0) {
        i1 = 1;
        j1 = 0;
      } // lower triangle, XY order: (0,0)->(1,0)->(1,1)
      else {
        i1 = 0;
        j1 = 1;
      } // upper triangle, YX order: (0,0)->(0,1)->(1,1)
      // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
      // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
      // c = (3-sqrt(3))/6
      var x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
      var y1 = y0 - j1 + G2;
      var x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
      var y2 = y0 - 1.0 + 2.0 * G2;
      // Work out the hashed gradient indices of the three simplex corners
      var ii = i & 255;
      var jj = j & 255;
      // Calculate the contribution from the three corners
      var t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        var gi0 = permMod12[ii + perm[jj]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0); // (x,y) of grad3 used for 2D gradient
      }
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        var gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
      }
      var t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        var gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to return values in the interval [-1,1].
      return 70.0 * (n0 + n1 + n2);
    },
    // 3D simplex noise
    noise3D: function(xin, yin, zin) {
      var permMod12 = this.permMod12;
      var perm = this.perm;
      var grad3 = this.grad3;
      var n0, n1, n2, n3; // Noise contributions from the four corners
      // Skew the input space to determine which simplex cell we're in
      var s = (xin + yin + zin) * F3; // Very nice and simple skew factor for 3D
      var i = Math.floor(xin + s);
      var j = Math.floor(yin + s);
      var k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var X0 = i - t; // Unskew the cell origin back to (x,y,z) space
      var Y0 = j - t;
      var Z0 = k - t;
      var x0 = xin - X0; // The x,y,z distances from the cell origin
      var y0 = yin - Y0;
      var z0 = zin - Z0;
      // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
      // Determine which simplex we are in.
      var i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
      var i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
      if (x0 >= y0) {
        if (y0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // X Y Z order
        else if (x0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // X Z Y order
        else {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // Z X Y order
      }
      else { // x0<y0
        if (y0 < z0) {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Z Y X order
        else if (x0 < z0) {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Y Z X order
        else {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // Y X Z order
      }
      // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
      // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
      // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
      // c = 1/6.
      var x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
      var y1 = y0 - j1 + G3;
      var z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
      var y2 = y0 - j2 + 2.0 * G3;
      var z2 = z0 - k2 + 2.0 * G3;
      var x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
      var y3 = y0 - 1.0 + 3.0 * G3;
      var z3 = z0 - 1.0 + 3.0 * G3;
      // Work out the hashed gradient indices of the four simplex corners
      var ii = i & 255;
      var jj = j & 255;
      var kk = k & 255;
      // Calculate the contribution from the four corners
      var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0.0;
      else {
        var gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
      }
      var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0.0;
      else {
        var gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
      }
      var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0.0;
      else {
        var gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
      }
      var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0.0;
      else {
        var gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
        t3 *= t3;
        n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to stay just inside [-1,1]
      return 32.0 * (n0 + n1 + n2 + n3);
    },
    // 4D simplex noise, better simplex rank ordering method 2012-03-09
    noise4D: function(x, y, z, w) {
      var perm = this.perm;
      var grad4 = this.grad4;

      var n0, n1, n2, n3, n4; // Noise contributions from the five corners
      // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
      var s = (x + y + z + w) * F4; // Factor for 4D skewing
      var i = Math.floor(x + s);
      var j = Math.floor(y + s);
      var k = Math.floor(z + s);
      var l = Math.floor(w + s);
      var t = (i + j + k + l) * G4; // Factor for 4D unskewing
      var X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
      var Y0 = j - t;
      var Z0 = k - t;
      var W0 = l - t;
      var x0 = x - X0; // The x,y,z,w distances from the cell origin
      var y0 = y - Y0;
      var z0 = z - Z0;
      var w0 = w - W0;
      // For the 4D case, the simplex is a 4D shape I won't even try to describe.
      // To find out which of the 24 possible simplices we're in, we need to
      // determine the magnitude ordering of x0, y0, z0 and w0.
      // Six pair-wise comparisons are performed between each possible pair
      // of the four coordinates, and the results are used to rank the numbers.
      var rankx = 0;
      var ranky = 0;
      var rankz = 0;
      var rankw = 0;
      if (x0 > y0) rankx++;
      else ranky++;
      if (x0 > z0) rankx++;
      else rankz++;
      if (x0 > w0) rankx++;
      else rankw++;
      if (y0 > z0) ranky++;
      else rankz++;
      if (y0 > w0) ranky++;
      else rankw++;
      if (z0 > w0) rankz++;
      else rankw++;
      var i1, j1, k1, l1; // The integer offsets for the second simplex corner
      var i2, j2, k2, l2; // The integer offsets for the third simplex corner
      var i3, j3, k3, l3; // The integer offsets for the fourth simplex corner
      // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
      // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
      // impossible. Only the 24 indices which have non-zero entries make any sense.
      // We use a thresholding to set the coordinates in turn from the largest magnitude.
      // Rank 3 denotes the largest coordinate.
      i1 = rankx >= 3 ? 1 : 0;
      j1 = ranky >= 3 ? 1 : 0;
      k1 = rankz >= 3 ? 1 : 0;
      l1 = rankw >= 3 ? 1 : 0;
      // Rank 2 denotes the second largest coordinate.
      i2 = rankx >= 2 ? 1 : 0;
      j2 = ranky >= 2 ? 1 : 0;
      k2 = rankz >= 2 ? 1 : 0;
      l2 = rankw >= 2 ? 1 : 0;
      // Rank 1 denotes the second smallest coordinate.
      i3 = rankx >= 1 ? 1 : 0;
      j3 = ranky >= 1 ? 1 : 0;
      k3 = rankz >= 1 ? 1 : 0;
      l3 = rankw >= 1 ? 1 : 0;
      // The fifth corner has all coordinate offsets = 1, so no need to compute that.
      var x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords
      var y1 = y0 - j1 + G4;
      var z1 = z0 - k1 + G4;
      var w1 = w0 - l1 + G4;
      var x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords
      var y2 = y0 - j2 + 2.0 * G4;
      var z2 = z0 - k2 + 2.0 * G4;
      var w2 = w0 - l2 + 2.0 * G4;
      var x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords
      var y3 = y0 - j3 + 3.0 * G4;
      var z3 = z0 - k3 + 3.0 * G4;
      var w3 = w0 - l3 + 3.0 * G4;
      var x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords
      var y4 = y0 - 1.0 + 4.0 * G4;
      var z4 = z0 - 1.0 + 4.0 * G4;
      var w4 = w0 - 1.0 + 4.0 * G4;
      // Work out the hashed gradient indices of the five simplex corners
      var ii = i & 255;
      var jj = j & 255;
      var kk = k & 255;
      var ll = l & 255;
      // Calculate the contribution from the five corners
      var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
      if (t0 < 0) n0 = 0.0;
      else {
        var gi0 = (perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32) * 4;
        t0 *= t0;
        n0 = t0 * t0 * (grad4[gi0] * x0 + grad4[gi0 + 1] * y0 + grad4[gi0 + 2] * z0 + grad4[gi0 + 3] * w0);
      }
      var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
      if (t1 < 0) n1 = 0.0;
      else {
        var gi1 = (perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32) * 4;
        t1 *= t1;
        n1 = t1 * t1 * (grad4[gi1] * x1 + grad4[gi1 + 1] * y1 + grad4[gi1 + 2] * z1 + grad4[gi1 + 3] * w1);
      }
      var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
      if (t2 < 0) n2 = 0.0;
      else {
        var gi2 = (perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32) * 4;
        t2 *= t2;
        n2 = t2 * t2 * (grad4[gi2] * x2 + grad4[gi2 + 1] * y2 + grad4[gi2 + 2] * z2 + grad4[gi2 + 3] * w2);
      }
      var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
      if (t3 < 0) n3 = 0.0;
      else {
        var gi3 = (perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32) * 4;
        t3 *= t3;
        n3 = t3 * t3 * (grad4[gi3] * x3 + grad4[gi3 + 1] * y3 + grad4[gi3 + 2] * z3 + grad4[gi3 + 3] * w3);
      }
      var t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
      if (t4 < 0) n4 = 0.0;
      else {
        var gi4 = (perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32) * 4;
        t4 *= t4;
        n4 = t4 * t4 * (grad4[gi4] * x4 + grad4[gi4 + 1] * y4 + grad4[gi4 + 2] * z4 + grad4[gi4 + 3] * w4);
      }
      // Sum up and scale the result to cover the range [-1,1]
      return 27.0 * (n0 + n1 + n2 + n3 + n4);
    }
  };

  function buildPermutationTable(random) {
    var i;
    var p = new Uint8Array(256);
    for (i = 0; i < 256; i++) {
      p[i] = i;
    }
    for (i = 0; i < 255; i++) {
      var r = i + ~~(random() * (256 - i));
      var aux = p[i];
      p[i] = p[r];
      p[r] = aux;
    }
    return p;
  }
  SimplexNoise._buildPermutationTable = buildPermutationTable;

  /*
  The ALEA PRNG and masher code used by simplex-noise.js
  is based on code by Johannes Baagøe, modified by Jonas Wagner.
  See alea.md for the full license.
  */
  function alea() {
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var c = 1;

    var mash = masher();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (var i = 0; i < arguments.length; i++) {
      s0 -= mash(arguments[i]);
      if (s0 < 0) {
        s0 += 1;
      }
      s1 -= mash(arguments[i]);
      if (s1 < 0) {
        s1 += 1;
      }
      s2 -= mash(arguments[i]);
      if (s2 < 0) {
        s2 += 1;
      }
    }
    mash = null;
    return function() {
      var t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
      s0 = s1;
      s1 = s2;
      return s2 = t - (c = t | 0);
    };
  }
  function masher() {
    var n = 0xefc8249d;
    return function(data) {
      data = data.toString();
      for (var i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        var h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 0x100000000; // 2^32
      }
      return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
    };
  }

  return [SimplexNoise, alea];

})();



/** ./src/server/data/blockInfo.js **/


/*
  shape:
  ↳ cube: basic cube
  
  isInvisible: No mesh or texture
  
  isTransparent: Has alpha values of zero
  ↳ Make sure the MIPMAPS look good because all transparency is discarded in mipmaps, use isTranslucent if mipmaps require alpha
  
  isTranslucent: Has alpha values between 0-255
  
  texture: textures of block (shape dependent)
*/

const Blocks = (function() {

  const Blocks = {
    air: {
      isInvisible: true
    },
    stone: {
      shape: 'cube',
      texture: ['stone', 'stone', 'stone', 'stone', 'stone', 'stone']
    },
    dirt: {
      shape: 'cube',
      texture: ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt']
    },
    grass: {
      shape: 'cube',
      texture: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side']
    },
    leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: ['leaves', 'leaves', 'leaves', 'leaves', 'leaves', 'leaves']
    },
    glass: {
      shape: 'cube',
      isTransparent: true,
      texture: ['glass', 'glass', 'glass', 'glass', 'glass', 'glass']
    },
    white_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['white_glass', 'white_glass', 'white_glass', 'white_glass', 'white_glass', 'white_glass']
    },
    red_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['red_glass', 'red_glass', 'red_glass', 'red_glass', 'red_glass', 'red_glass']
    },
    blue_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass']
    },
    green_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['green_glass', 'green_glass', 'green_glass', 'green_glass', 'green_glass', 'green_glass']
    },
    water: {
      shape: 'water',
      isTranslucent: true,
      texture: ['blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass'],
    },
    sand: {
      shape: 'cube',
      texture: [ 'sand', 'sand', 'sand', 'sand', 'sand', 'sand' ]
    },
    log: {
      shape: 'cube',
      texture: [ 'log_side', 'log_side', 'log_core', 'log_core', 'log_side', 'log_side' ]
    },
    marble: {
      shape: 'cube',
      texture: [ 'marble', 'marble', 'marble', 'marble', 'marble', 'marble' ]
    },
    tainted_marble: {
      shape: 'cube',
      texture: [ 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble' ]
    },
    jungle_marble: {
      shape: 'cube',
      texture: [ 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble' ]
    },
    andesite: {
      shape: 'cube',
      texture: [ 'andesite', 'andesite', 'andesite', 'andesite', 'andesite', 'andesite' ]
    },
    jungle_leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: [ 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves' ]
    },
    sakura_log: {
      shape: 'cube',
      texture: [ 'sakura_log_side', 'sakura_log_side', 'sakura_log_core', 'sakura_log_core', 'sakura_log_side', 'sakura_log_side' ]
    },
    sakura_leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: [ 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves' ]
    },
  };

  for (let b in Blocks) {
    let block = Blocks[b];
    if (block.isTranslucent && !block.shader) {
      block.shader = 'alpha';
    } else {
      block.shader = 'default';
    }
  }
  
  return Blocks;
  
})();


/** ./src/server/entities/entity.js **/

// inheritance
function extend(child, parent) {
  child = child.prototype;
  parent = parent.prototype;
  child.__super__ = parent;
  for (let k in parent) {
    if (parent.hasOwnProperty(k))
      child[k] = parent[k];
  }
}

function Entity(data, world) {
  this.world = world;
  this.x = this.y = this.z = 0;
  this.generateID();
  for (let i in data) {
    this[i] = data;
  }
}

Entity.prototype.generateID = function() {
  this.ID = (Date.now() + Math.random() * Math.pow(10, 14)).toString(16).substr(0, 12);
};

// movement functions depends on entity orientation
Entity.prototype.moveX = function(mag) {
  if (mag === 0) return;
  this.velocity[2] += Math.cos(this.rotation[1] + Math.PI / 2) * mag;
  this.velocity[0] += Math.sin(this.rotation[1] + Math.PI / 2) * mag;
};

Entity.prototype.moveY = function(mag) {
  if (mag === 0) return;
  this.velocity[1] += mag;
};

Entity.prototype.moveZ = function(mag) {
  if (mag === 0) return;
  this.velocity[2] += Math.cos(this.rotation[1]) * mag;
  this.velocity[0] += Math.sin(this.rotation[1]) * mag;
};


/** ./src/server/entities/player.js **/

extend(Player, Entity);
function Player(...args) { // (data, world)
  this.__super__.constructor.call(this, ...args);
  this.holding = 'stone';
  this.velocity = [0, 0, 0];
  this.rotation = [0, 0, 0];
}

// called in world.tick()
Player.prototype.move = function() {
  this.x += this.velocity[0];
  this.y += this.velocity[1];
  this.z += this.velocity[2];
  
  document.getElementById('xyz').textContent = `${Math.round(this.x * 1000) / 1000}\n${Math.round(this.y * 1000) / 1000}\n${Math.round(this.z * 1000) / 1000}`;
  
  this.velocity[0] *= 0.8;
  this.velocity[1] *= 0.8;
  this.velocity[2] *= 0.8;
};

// adds block at end of raycast
Player.prototype.placeBlock = function(block = this.holding) {
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 50);
  if (blocks[1] === undefined) return;
  sim.setBlock(blocks[1].x, blocks[1].y, blocks[1].z, block);
};

// removes the first block from raycast
Player.prototype.breakBlock = function() {
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 50);
  if (blocks[0] === undefined) return;
  sim.setBlock(blocks[0].x, blocks[0].y, blocks[0].z, 'air');
};


/** ./src/server/serversim.js **/

const ServerSim = {};

ServerSim.init = function() {
  
};


/** ./src/server/world/chunk.js **/

function Chunk(...args) {
  [ this.x, this.y, this.z, this.blocks, this.blockKeys, this.chunks ] = args;
}

Chunk.posToIndex = function(x, y, z) {
  return x + y * 32 + z * 1024;
};

Chunk.indexToPos = function(n) {
  return [ n % 32, (n >>> 5) % 32, (n >>> 10) % 32 ];
};

// allows for getting blocks outside of the chunk bordering said chunk
Chunk.prototype.getBlockType = function(x, y, z) {
  const tx = (x === 32) - (x === -1),
        ty = (y === 32) - (y === -1),
        tz = (z === 32) - (z === -1);
  if (tx + ty + tz !== 0) {
    const chunk = this.chunks[[ this.x + tx, this.y + ty, this.z + tz ]];
    return this.blockKeys[chunk === undefined ? undefined : chunk.blocks[Chunk.posToIndex(tx === 0 ? x : tx === 1 ? 0 : 31, ty === 0 ? y : ty === 1 ? 0 : 31, tz === 0 ? z : tz === 1 ? 0 : 31)]];
  }
  return this.blockKeys[this.blocks[Chunk.posToIndex(x, y, z)]];
};

// getBlockType but gets more data { type, chunk object, x, y, z, index }
Chunk.prototype.getBlockData = function(x, y, z) {
  const tx = (x === 32) - (x === -1),
        ty = (y === 32) - (y === -1),
        tz = (z === 32) - (z === -1),
        chunkPos = [ this.x + tx, this.y + ty, this.z + tz ];
  if (tx + ty + tz !== 0) {
    let chunk = this.chunks[chunkPos];
    if (chunk === undefined) return undefined;
    let pos = [ tx === 0 ? x : tx === 1 ? 0 : 31, ty === 0 ? y : ty === 1 ? 0 : 31, tz === 0 ? z : tz === 1 ? 0 : 31 ],
        index = Chunk.posToIndex(...pos);
    return { type: this.blockKeys[chunk.blocks[index]], id: chunk.blocks[index], chunk: chunk, chunkPos: chunkPos, x: pos[0], y: pos[1], z: pos[2], index: index };
  }
  let index = Chunk.posToIndex(x, y, z);
  return { type: this.blockKeys[this.blocks[index]], chunk: this, chunkPos: chunkPos, x: x, y: y, z: z, index: index };
};

Chunk.prototype.setBlock = function(x, y, z, block, data) {
  this.blocks[Chunk.posToIndex(x, y, z)] = block;
};


/** ./src/server/world/generator.js **/

const Generator = (function() {

  function Generator(seed, blockIDS) {
    this.seed = seed;
    this.noise = new SimplexNoise(new Alea(seed));
    
    this.chunks = {};

    this.blockIDs = blockIDS;
  };
  
  Generator.prototype.testBounds = function(testBounds, x, y, z) {
    x = (x > 31) - (x < 0);
    if (x !== 0) testBounds[0] = x;
    y = (y > 31) - (y < 0);
    if (y !== 0) testBounds[1] = y;
    z = (z > 31) - (z < 0);
    if (z !== 0) testBounds[2] = z;
  };
  
  Generator.prototype.applyBounds = function(testBounds, func, args) {
    
  };

  Generator.prototype.generateCube = function(blocks, block, x, y, z, w, h, l, data = {}) {
    let replace = data.replace ?? false,
        loadNeighbors = data.loadNeighbors ?? false;
    
    block = this.blockIDs[block];
    if (replace) replace = this.blockIDs[replace];
    
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (z < 0) z = 0;
    if (x + w > 31) w = 31 - x;
    if (y + h > 31) h = 31 - y;
    if (z + l > 31) l = 31 - z;
    
    let testBounds = [ 0, 0, 0 ];
    let px, py, pz;
    for (px = x; px < x + w; px ++) {
      for (py = y; py < y + h; py ++) {
        for (pz = z; pz < z + l; pz ++) {
          if (replace === false || blocks[px][py][pz] === replace) {
            blocks[px][py][pz] = block;
            this.testBounds(testBounds, px, py, pz);
          }
        }
      }
    }
    this.applyBounds(testBounds, 'generateCube', arguments);
  };
  
  Generator.prototype.generateSphere = function(blocks, block, x, y, z, radius, data = {}) {
    let xScale = data.xScale ?? 1,
        yScale = data.yScale ?? 1,
        zScale = data.zScale ?? 1,
        replace = data.replace ?? false;
    
    block = this.blockIDs[block];
    if (replace) replace = this.blockIDs[replace];
    
    let testBounds = [ 0, 0, 0 ];
    let px, py, pz;
    for (px = x - Math.ceil(radius * xScale); px <= x + Math.ceil(radius * xScale); px ++) {
      if (px < 0) continue;
      if (px > 31) break;
      for (py = y - Math.ceil(radius * yScale); py <= y + Math.ceil(radius * yScale); py ++) {
        if (py < 0 || (data.yMin && py < data.yMin)) continue;
        if (py > 31) break;
        for (pz = z - Math.ceil(radius * zScale); pz <= z + Math.ceil(radius * zScale); pz ++) {
          let ox = (x - px) / xScale;
          let oy = (y - py) / yScale;
          let oz = (z - pz) / zScale;
          if (pz < 0 || (ox * ox + oy * oy + oz * oz) > radius * radius) continue;
          if (pz > 31) break;
          if ((replace === false || blocks[px][py][pz] === replace) && (!data.chance || data.alea() < data.chance)) {
            blocks[px][py][pz] = block;
            this.testBounds(testBounds, px, py, pz);
          }
        }
      }
    }
    this.applyBounds(testBounds, 'generateCube', arguments);
  };
  
  Generator.prototype.generateBush = function(blocks, x, y, z) {
    this.generateCube(blocks, 'leaves', x - 1, y, z - 1, 3, 1, 3, { replace: 'air' });
    this.generateCube(blocks, 'leaves', x - 1, y + 1, z, 3, 1, 1, { replace: 'air' });
    this.generateCube(blocks, 'leaves', x, y + 1, z - 1, 1, 1, 3, { replace: 'air' });
  };

  Generator.prototype.generateTree = function(blocks, x, y, z, alea) {
    const treeType = alea() < 0.9,
          leafType = treeType ? 'jungle_leaves' : 'sakura_leaves',
          logType = treeType ? 'log' : 'sakura_log';
    
    const stemHeight = Math.floor(alea() * 5) + 5;
    this.generateCube(blocks, logType, x, y, z, 1, stemHeight, 1, { replace: 'air' });
    if (stemHeight >= 8) {
      let dir0x = Math.floor(alea() * 3) - 1, dir0z = Math.floor(alea() * 3) - 1,
          stemHeight0 = Math.floor(alea() * 5) + 3,
          dir1x = Math.floor(alea() * 3) - 1, dir1z = Math.floor(alea() * 3) - 1,
          stemHeight1 = Math.floor(alea() * 5) + 3;
      if (dir0x === 0 && dir0z === 0) dir0x = alea() > 0.5 ? 1 : -1;
      if (dir1x === 0 && dir1z === 0) dir1z = alea() > 0.5 ? 1 : -1;      
      if (dir0x !== 0) dir1x = -dir0x;
      else if (dir0z !== 0) dir1z = -dir0z;
      
      this.generateCube(blocks, logType, x + dir0x, y + stemHeight - 1, z + dir0z, 1, stemHeight0, 1, { replace: 'air' });
      this.generateCube(blocks, logType, x + dir1x, y + stemHeight - 2, z + dir1z, 1, stemHeight1, 1, { replace: 'air' });
      
      this.generateSphere(blocks, leafType, x + dir0x, y + stemHeight + stemHeight0 - 3, z + dir0z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
      this.generateSphere(blocks, leafType, x + dir1x, y + stemHeight + stemHeight1 - 3, z + dir1z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
    } else {
      if (alea() > 0.5) {
        let dir0x = Math.floor(alea() * 3) - 1, dir0z = Math.floor(alea() * 3) - 1,
            stemHeight0 = Math.floor(alea() * 3) + 5;
        this.generateCube(blocks, logType, x + dir0x, y + stemHeight - 1, z + dir0z, 1, stemHeight0, 1, { replace: 'air' });
        this.generateSphere(blocks, leafType, x + dir0x, y + stemHeight + stemHeight0 - 3, z + dir0z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
      } else {
        let leafSize = alea();
        this.generateSphere(blocks, leafType, x, y + stemHeight - 2, z, leafSize < 0.5 ? 2.3 : 1.5, { replace: 'air', yScale: leafSize * 2 + 1, yMin: y + leafSize * 2 });
      }
    }    
  };

  Generator.prototype.generateChunk = function(x, y, z) {
    const blockIDs = this.blockIDs,
          blocks = [],
          heightMap = [],
          structureMap = [],
          output = new Uint16Array(32 * 32 * 32);
    // randomness
    const alea = Alea(this.seed + x + y + z);
    
    // height map
    for (let px = -2; px < 34; px ++) {
      heightMap[px] = [];
      for (let pz = -2; pz < 34; pz ++) {
        let height = 10;
        height += this.noise.noise2D((px + x * 32) / 300, (pz + z * 32) / 300) * 50;
        height += this.noise.noise2D((px + x * 32) / 20, (pz + z * 32) / 20) * 10;
        if (height < 0) height /= 20;
        heightMap[px][pz] = height;
      }
    }
    
    // structure map
    for (let px = -2; px < 34; px ++) {
      structureMap[px] = [];
      for (let pz = -2; pz < 34; pz ++) {
        let offset = this.noise.noise2D(Math.floor((px + x * 32 + 1000) / 10) * 10, Math.floor((pz + z * 32) / 10)) * 8;
        structureMap[px][pz] = this.noise.noise2D(Math.floor((px + x * 32 + offset) / 10) * 10, Math.floor((pz + z * 32 + offset) / 10) * 10) > 0.8;
      }
    }
    
    // jungle structure generation
    for (let px = -2; px < 34; px ++) {
      blocks[px] = [];
      for (let py = -2; py < 35; py ++) {
        blocks[px][py] = [];
        for (let pz = -2; pz < 34; pz ++) {
          blocks[px][py][pz] = ((y + px) % 3 === 0 || (py + Math.floor(heightMap[0][0] * 2)) % 4 === 0 || (y + pz) % 3 === 0) && alea() > 0.2 && (structureMap[px][pz] && (py + y * 32) < heightMap[Math.floor((px + 2) / 7)][Math.floor((pz + 2) / 7)] + 20) ? (py + y * 32 < heightMap[px][pz] + 5 ? (py + y * 32 < heightMap[px][pz] - 5 ? blockIDs.jungle_marble : blockIDs.tainted_marble) : blockIDs.marble) : blockIDs.air;
        }
      }
    }
    
    // stone and water
    for (let px = -2; px < 34; px ++) {
      //blocks[px] = [];
      for (let py = -2; py < 35; py ++) {
        //blocks[px][py] = [];
        for (let pz = -2; pz < 34; pz ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          let n0 = this.noise.noise3D(rx / 30, ry / 30, rz / 30);
          if (blocks[px][py][pz] === blockIDs.air) blocks[px][py][pz] = this.noise.noise3D(rx / 20, ry / 20, rz / 20) * 8 + this.noise.noise3D(rx / 50, ry / 50, rz / 50) * 15 + ry <= heightMap[px][pz] ? (heightMap[px][py] >= 30 && n0 > -0.2 && n0 < 0.2 ? blockIDs.andesite : blockIDs.stone) : blockIDs.air;
          if (blocks[px][py][pz] === blockIDs.air && ry <= 0) blocks[px][py][pz] = blockIDs.water;
        }
      }
    }

    // grassing and sanding
    for (let px = 0; px < 32; px ++) {
      for (let pz = 0; pz < 32; pz ++) {
        if (heightMap[px][pz] >= 30 && heightMap[px][pz] < 40) continue;
        for (let py = 0; py < 32; py ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          if (blocks[px][py][pz] !== blockIDs.stone) continue;
          
          if (blocks[px + 1][py][pz] === blockIDs.water || blocks[px - 1][py][pz] === blockIDs.water || blocks[px][py + 1][pz] === blockIDs.water || blocks[px][py][pz + 1] === blockIDs.water || blocks[px][py][pz - 1] === blockIDs.water) {
            blocks[px][py][pz] = blockIDs.sand;
          } else if (blocks[px][py + 1][pz] === blockIDs.air) {
            blocks[px][py][pz] = blockIDs.grass;
          } else if (blocks[px][py + 2][pz] === blockIDs.air || blocks[px][py + 3][pz] === blockIDs.air) {
            blocks[px][py][pz] = blockIDs.dirt;
          }

          // sanding grass/dirt
          if (blocks[px][py][pz] === blockIDs.grass || blocks[px][py][pz] === blockIDs.dirt) {
            let sand = false;
            for (let sx = -2; sx < 2; sx ++) {
              for (let sy = -2; sy < 2; sy ++) {
                for (let sz = -2; sz < 2; sz ++) {
                  if (blocks[px + sx][py + sy][pz + sz] === blockIDs.water) {
                    blocks[px][py][pz] = blockIDs.sand;
                    sx = sy = sz = 2;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // dirt downwards spreading into sand
    for (let px = 0; px < 32; px ++) {
      for (let pz = 0; pz < 32; pz ++) {
        for (let py = 0; py < 32; py ++) {
          if (blocks[px][py][pz] === blockIDs.sand && (blocks[px][py + 1][pz] === blockIDs.dirt || blocks[px][py + 1][pz] === blockIDs.grass || blocks[px][py + 2][pz] === blockIDs.dirt || blocks[px][py + 2][pz] === blockIDs.grass)) {
            blocks[px][py][pz] = blockIDs.dirt;
          }
        }
      }
    }

    // structures
    for (let px = 0; px < 32; px ++) {
      for (let py = 0; py < 32; py ++) {
        for (let pz = 0; pz < 32; pz ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          if (blocks[px][py - 1][pz] === blockIDs.grass) {
            let chance = alea();
            if (chance > 0.99) this.generateTree(blocks, px, py, pz, alea);
            else if (chance > 0.96) this.generateBush(blocks, px, py, pz);
          }
          if (blocks[px][py][pz] === blockIDs.marble) {
            let chance = alea();
            if (chance > 0.95) this.generateBush(blocks, px, py, pz);
          }
        }
      }
    }
    
    for (let i = 0; i < 32 * 32 * 32; i ++) {
      let pos = Chunk.indexToPos(i);
      output[i] = blocks[pos[0]][pos[1]][pos[2]];
    }
    return output;
  };
  
  return Generator;

})();


/** ./src/server/world/world.js **/

// handles one world
// one server may have multiple worlds running in parallel
function World() {
  this.blockKeys = Object.keys(Blocks);
  this.blockIDs = Object.fromEntries(this.blockKeys.map((x, i) => [x, i]));
  
  this.seed = Date.now();
  //this.seed = 1659752838227; // set seed
  this.generator = new Generator(this.seed, this.blockIDs);
  
  this.chunks = {};
  this.entities = {};
  
  this.player = undefined;
  this.playerID = undefined;
}

// tick
World.prototype.tick = function() {
  let e, entity;
  
  for (e in this.entities) {
    entity = this.entities[e];
    if (typeof entity.tick === 'function') {
      entity.tick();
    }
  }
  
  for (e in this.entities) {
    entity = this.entities[e];
    if (typeof entity.move === 'function') {
      entity.move();
    }
  }
};

// generate new chunk
World.prototype.generateChunk = function(x, y, z) {
  const c = x + ',' + y + ',' + z;
  if (this.chunks[c]) return;
  this.chunks[c] = new Chunk(x, y, z, this.generator.generateChunk(x, y, z), this.blockKeys, this.chunks);
};

// load saved chunk
World.prototype.loadChunk = function(x, y, z) {
  // grab data from save file
};

World.prototype.setBlock = function(x, y, z, block, blockData = this.getBlockData(x, y, z)) {
  if (this.blockIDs[block] === undefined) return -1;
  blockData.chunk.blocks[blockData.index] = this.blockIDs[block];
};

// returns block type given the index (ID)
World.prototype.blockType = function(index) {
  return this.blockKeys[index];
};

// returns block ID given type
World.prototype.blockID = function(type) {
  return this.blockIDs[type];
};

// returns info of block from blockData given an index
World.prototype.getBlockInfo = function(input) {
  return typeof input === 'number' ? Blocks[this.blockIDs[input]] : Blocks[input];
};

// grabs block data given position
World.prototype.getBlockData = function(x, y, z) {
  let chunkPos = [ Math.floor(x / 32), Math.floor(y / 32), Math.floor(z / 32) ],
      chunk = this.chunks[chunkPos];
  if (chunk === undefined) return undefined;
  let pos = [ x % 32, y % 32, z % 32 ];
  if (pos[0] < 0) pos[0] += 32;
  if (pos[1] < 0) pos[1] += 32;
  if (pos[2] < 0) pos[2] += 32;
  let index = Chunk.posToIndex(...pos);
  return { type: this.blockType(chunk.blocks[index]), chunk: chunk, chunkPos: chunkPos, x: pos[0], y: pos[1], z: pos[2], index: index };
};

// spawns player
World.prototype.spawnPlayer = function(data) {
  let player = new Player(data, this);
  this.entities[player.ID] = player;
  this.playerID = player.ID;
  this.player = player;
};

// takes in 2 vectors and returns first block hit along with previous block
// func = function to run every step, function recieves block data as an argument
World.prototype.traverse = function(x0, y0, z0, x1, y1, z1, func) {
      // floored
  let x = Math.floor(x0),
      y = Math.floor(y0),
      z = Math.floor(z0),
      // difference
      mx = x1 - x0,
      my = y1 - y0,
      mz = z1 - z0,
      // sign
      sx = mx < 0 ? -1 : mx > 0 ? 1 : 0,
      sy = my < 0 ? -1 : my > 0 ? 1 : 0,
      sz = mz < 0 ? -1 : mz > 0 ? 1 : 0,
      // sign but no negative 1
      sny = my < 0 ? 0 : 1,
      snz = mz < 0 ? 0 : 1,
      // inverse of y=mx+b -> x=(y-b)/m
      nxy = (y + sny - y0) / my * mx + x0,
      nxz = (z + snz - z0) / mz * mx + x0;
  
  let prevBlock, block, ty, tz, tyz;
  for (let i = 0; i < 128; i ++) {
    prevBlock = block;
    block = this.getBlockData(x, y, z);
    if (block === undefined || (Math.floor(x1) === x && Math.floor(y1) === y && Math.floor(z1) === z)) return [ undefined, undefined ];
    block.x = x;
    block.y = y;
    block.z = z;
    if (typeof func === 'function') {
      if (func(block) === -1) return;
      continue;
    }
    if (block.type !== 'air') return [ block, prevBlock ];
    // see if y/x needs to be added/sub
    ty = !((sx === 1 && x < nxy - 1) || (sx === -1 && x > nxy) || my === 0);
    tz = !((sx === 1 && x < nxz - 1) || (sx === -1 && x > nxz) || mz === 0);
    if (ty && tz) {
      // difference between nxy and x and nxz and x to find if y or z gets priority (biggest difference)
      tyz = Math.abs(x - (sx === 1 ? nxy - 1 : nxy)) > Math.abs(x - (sx === 1 ? nxz - 1 : nxz)); // true = y, false = z
    }
    // stepping y/z/x if conditions are met
    if ((ty && !tz) || (ty && tyz)) {
      y += sy;
      nxy = (y + sny - y0) / my * mx + x0;
      continue;
    }
    if (tz) {
      z += sz;
      nxz = (z + snz - z0) / mz * mx + x0;
      continue;
    }
    x += sx;
  }
  return [ undefined, undefined ];
};

// casts a ray given position and rotation, returns same as traverse
World.prototype.raycast = function(x, y, z, rx, ry, distance) {
  let vx = x - Math.sin(ry) * Math.cos(rx) * distance,
      vy = y - Math.sin(rx) * distance,
      vz = z - Math.cos(ry) * Math.cos(rx) * distance;
  return this.traverse(x, y, z, vx, vy, vz);
};


/** ./src/sim.js **/

// Handles all in-game events
function Sim() {
  this.server = true; // simulate everything
  this.client = true; // display and inputs
  
  this.actions = ['draw', 'generateChunk', 'setBlock', 'spawnPlayer'];
  
  this.ticks = 0;
}

Sim.prototype.init = function() {
  // create world
  this.world = new World();
  this.world.sim = this;
  
  // init sims
  if (this.client) {
    this.clientSimInit = ClientSim.init;
    this.clientSimInit();
  }
  if (this.server) {
    this.serverSimInit = ServerSim.init;
    this.serverSimInit();
  }
  
  // combine sim, serverSim and clientSim actions
  for (let action of this.actions) {
    let simFunc, serverFunc, clientFunc, baseFunc;
    
    if (typeof this[action] === 'function')
      simFunc = this[action].toString();
    if (this.server && typeof ServerSim[action] === 'function')
      serverFunc = ServerSim[action].toString();
    if (this.client && typeof ClientSim[action] === 'function')
      clientFunc = ClientSim[action].toString();
    
    baseFunc = simFunc ?? serverFunc ?? clientFunc;
    if (!baseFunc) continue;
    baseFunc = baseFunc.slice(0, baseFunc.indexOf(')') + 5);
    
    // RUN ORDER: Sim, ServerSim, ClientSim
    baseFunc += 
      (simFunc ? simFunc.slice(simFunc.indexOf('{') + 2, -1) : '') +
      (serverFunc ? serverFunc.slice(serverFunc.indexOf('{') + 2, -1) : '') +
      (clientFunc ? clientFunc.slice(clientFunc.indexOf('{') + 2, -1) : '');
    
    this[action] = Function(`return ${baseFunc}}`)();
  }
};

Sim.prototype.generateChunk = function(x, y, z) {
  this.world.generateChunk(x, y, z);
};

Sim.prototype.setBlock = function(x, y, z, block) {
  let prevBlockData = this.world.getBlockData(x, y, z);
  if (!prevBlockData) return;
  if (this.world.setBlock(x, y, z, block, prevBlockData) === -1) return;
};

Sim.prototype.spawnPlayer = function(data) {
  let player = this.world.spawnPlayer(data);
};

Sim.prototype.tick = function() {
  this.world.tick();
  this.ticks ++;
};

