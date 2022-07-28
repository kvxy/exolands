
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


/** ./src/client/graphics/chunkMesh.js **/

function ChunkMesh(...args) {
  [ this.chunk, this.gl, this.shaders, this.shaderName, this.world, this.textures ] = args;
  [ this.x, this.y, this.z ] = [ this.chunk.x, this.chunk.y, this.chunk.z ];
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
  
  // stores indices in each block coordinate
  // eg data at (x: 5, y: 6, z: 7) is stored in as blocksX[5][6][7] and blocksY[6][7][5] and blocksZ[7][5][6]
  this.blocksX = [];
  this.blocksY = [];
  this.blocksZ = [];
  this.indicesLength = 0;
  
  // checks relevant changes in camera
  this.changes = { x: NaN, y: NaN, z: NaN, greatestDir: '' };
}

ChunkMeshAlpha.prototype.makeIndicesIterator = function*(x, y, z, vx, vy, vz) {
  const avx = Math.abs(vx),
        avy = Math.abs(vy),
        avz = Math.abs(vz),
        greatestDir = (avx > avy ? (avx > avz ? 'X' : 'Z') : (avy > avz ? 'Y' : 'Z')),
        greatestMag = greatestDir === 'X' ? vx : greatestDir === 'Y' ? vy : vz,
        blocksPos = this['blocks' + greatestDir],
        otherPos = greatestDir === 'X' ? [ y, z ] : greatestDir === 'Y' ? [ z, x ] : [ x, y ];
  x = Math.floor(x);
  y = Math.floor(y);
  z = Math.floor(z);
  
  // ONLY UPDATE WHEN: camera's block position changes OR camera rotatation that results in a change in greatest direction
  const changes = this.changes;
  if ((x - changes.x) === 0 && (y - changes.y) === 0 && (z - changes.z) !== 0 && changes.greatestDir === greatestDir) return -1;
  changes.x = x;
  changes.y = y;
  changes.z = z;
  changes.greatestDir = greatestDir;
  
  let i, j, k, l, indices, r0, r1;
  // loop from back to front in greatest 'v' direction's magnitude
  if ((!blocksPos.reversed && greatestMag < 0) || (blocksPos.reversed && greatestMag >= 0)) {
    blocksPos.reverse();
    blocksPos.reversed = !blocksPos.reversed;
  }
  for (i in blocksPos) {
    // loop based on rectilinear distance
    r0 = 0;
    while (r0++ < 2) {
      for (j in blocksPos[i]) {
        if (blocksPos[i].reversed ? (+j <= otherPos[1]) : (+j > otherPos[1])) break;
        r1 = 0;
        while (r1++ < 2) {
          for (k in blocksPos[i][j]) {
            if (blocksPos[i][j].reversed ? (+k <= otherPos[1]) : (+k > otherPos[1])) break;
            for (l in blocksPos[i][j][k]) {
              yield blocksPos[i][j][k][l];
            }
          }
          blocksPos[i][j].reverse();
          blocksPos[i][j].reversed = !blocksPos[i][j].reversed;
        }
      }
      blocksPos[i].reverse();
      blocksPos[i].reversed = !blocksPos[i][j].reversed;
    }
  }
  
};

ChunkMeshAlpha.prototype.updateIndices = function(camera) {
  const rx = camera.rotation[0],
        ry = camera.rotation[1],
        vx = Math.sin(ry) * Math.cos(rx),
        vy = Math.sin(rx),
        vz = Math.cos(ry) * Math.cos(rx);
  
  const indicesIterator = this.makeIndicesIterator(camera.x, camera.y, camera.z, vx, vy, vz);
  if (indicesIterator === -1) return;
  
  this.indices = this.indicesIterator();
  this.indices.length = this.indicesLength;
  
  // update indices buffer
  const gl = this.gl;
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.DYNAMIC_DRAW);
};

ChunkMeshAlpha.prototype.updateBlocksPos = function(x, y, z, add, indices) {
  let p, 
      bp0, bp1, bp2, // x/y/z, y/z/x, z/x/y
      blocksPos;     // X,     Y,     Z
  for (p = 0; p < 3; p ++) {
    bp0 = p === 0 ? x : p === 1 ? y : z;
    bp1 = p === 0 ? y : p === 1 ? z : x;
    bp2 = p === 0 ? z : p === 1 ? x : y;
    blocksPos = this['blocks' + 'XYZ'[p]];
    if (add) {
      if (!blocksPos[bp0]) blocksPos[bp0] = [];
      if (!blocksPos[bp0][bp1]) blocksPos[bp0][bp1] = [];
      blocksPos[bp0][bp1][bp2] = indices;
    } else {
      delete blocksPos[bp0][bp1][bp2];
      if (blocksPos[bp0][bp1].reduce(x => x + 1, 0) === 0) delete blocksPos[bp0][bp1];
      if (blocksPos[bp0].reduce(x => x + 1, 0) === 0) delete blocksPos[bp0];
    }
  }
};

ChunkMeshAlpha.prototype.updateBlocks = function(x, y, z, a, b, c, d, add) {
  if (add) {
    let indices = this.blocksX?.[x]?.[y]?.[z];
    if (indices === undefined) {
      indices = []; // list of indices
      this.updateBlocksPos(x, y, z, true, indices);
    }
    indices.push(
      a, b, c,
      c, d, a
    );
    this.indicesLength += 6;
  } else {
    let indices = this.blocksX[x][y][z], i, data;
    for (i = 0; i < indices.length; i += 6) {
      if (a === indices[i] && b === indices[i + 1] && c === indices[i + 2] && d === indices[i + 4]) {
        indices.splice(i, 6);
        this.indicesLength -= 6;
        break;
      }
    }
    if (indices.length === 0) {
      this.updateBlocksPos(x, y, z, false);
    }
  }
};

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

ChunkMeshAlpha.prototype.removeFace = function(facePosition, x, y, z) {
  const vertexIndex = this.findFace(facePosition);
  if (vertexIndex === -1) return;
  this.vertex0[vertexIndex] = this.vertex0[vertexIndex + 1] = this.vertex0[vertexIndex + 2] = this.vertex0[vertexIndex + 3] = NaN;
  this.vertex1[vertexIndex] = this.vertex1[vertexIndex + 1] = this.vertex1[vertexIndex + 2] = this.vertex1[vertexIndex + 3] = NaN;
  this.updateBlocks(x, y, z, vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex + 3, false);
  
  this.vertexSlots.push(vertexIndex);
  this.update = true;
};


/** ./src/client/graphics/chunkMeshAlpha2.js **/

extend(ChunkMeshAlpha2, ChunkMesh);
function ChunkMeshAlpha2(...args) {
  this.__super__.constructor.call(this, ...args);
  
  // sorted indices
  this.indicesData = new Map();
  this.indicesLength = 0;
  //this.indices = this.makeIndicesIterator();
}

ChunkMeshAlpha2.prototype.load = function() {
  this.indices = this.makeIndicesIterator();
  this.__super__.load.call(this);
};

ChunkMeshAlpha2.prototype.updateBuffers = function() {
  this.indices = this.makeIndicesIterator();
  this.__super__.updateBuffers.call(this);
};

ChunkMeshAlpha2.prototype.updateIndexBuffer = function() {
  const gl = this.gl;
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.makeIndicesIterator()), gl.DYNAMIC_DRAW);
};

ChunkMeshAlpha2.prototype.makeIndicesIterator = function*() {
  for (let [k, indexData] of this.indicesData) {
    for (let d in indexData.data) {
      yield indexData.data[d][0];
      yield indexData.data[d][1];
      yield indexData.data[d][2];
      yield indexData.data[d][3];
      yield indexData.data[d][4];
      yield indexData.data[d][5];
    }
  }
  this.indices.length = this.indicesLength;
};

ChunkMeshAlpha2.prototype.updateIndices = function(x, y, z, a, b, c, d, add) {
  const pos = x + ',' + y + ',' + z;
  if (this.indicesData.get(pos) === undefined) this.indicesData.set(pos, { pos: [x, y, z], data: [] });
  const indexData = this.indicesData.get(pos);

  if (add) {
    indexData.data.push([
      a, b, c, 
      c, d, a
    ]);
    this.indicesLength += 6;
  } else {
    for (let i in indexData.data) {
      let data = indexData.data[i];
      if (a === data[0] && b === data[1] && c === data[2] && d === data[4]) {
        indexData.data.splice(i, 1);
        this.indicesLength -= 6;
        break;
      }
    }
    if (indexData.data.length === 0) this.indicesData.delete(pos); 
  }
};

function temp(x, y, z, a, b, c, d, add) {
  const pos = x + ',' + y + ',' + z,
        indicesData = this.indicesData;
  if (this.blocksX?.[x]?.[y]?.[z] === undefined) {
    indicesData.set(pos, { pos: [x, y, z], data: [] });
    this.updateBlocksPos(x, y, z, true);
  }
  const indexData = indicesData.get(pos);

  if (add) {
    indexData.data.push([
      a, b, c, 
      c, d, a
    ]);
    this.indicesLength += 6;
  } else {
    for (let i in indexData.data) {
      let data = indexData.data[i];
      if (a === data[0] && b === data[1] && c === data[2] && d === data[4]) {
        indexData.data.splice(i, 1);
        this.indicesLength -= 6;
        break;
      }
    }
    if (indexData.data.length === 0) {
      indicesData.delete(pos);
      this.updateBlocksPos(x, y, z, false);
    }
  }
}

ChunkMeshAlpha2.prototype.addCubeFace = function(x, y, z, dir, texture) {
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
  this.updateIndices(x, y, z, a, b, c, d, true);
};

ChunkMeshAlpha2.prototype.removeFace = function(facePosition, x, y, z) {
  const vertexIndex = this.findFace(facePosition);
  if (vertexIndex === -1) return;
  this.vertex0[vertexIndex] = this.vertex0[vertexIndex + 1] = this.vertex0[vertexIndex + 2] = this.vertex0[vertexIndex + 3] = NaN;
  this.vertex1[vertexIndex] = this.vertex1[vertexIndex + 1] = this.vertex1[vertexIndex + 2] = this.vertex1[vertexIndex + 3] = NaN;
  this.updateIndices(x, y, z, vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex + 3, false);
  
  this.vertexSlots.push(vertexIndex);
  this.update = true;
};

ChunkMeshAlpha2.prototype.sort = function(camera) {
  const x = camera.x, y = camera.y, z = camera.z,
        rx = camera.rotation[0],
        ry = camera.rotation[1],
        vx = Math.sin(ry) * Math.cos(rx),
        vy = Math.sin(rx),
        vz = Math.cos(ry) * Math.cos(rx);
  
  //console.log([Math.round(vx * 100) / 100, Math.round(vy * 100) / 100, Math.round(vz * 100) / 100])

  // insertion sort
  this.indicesData.forEach(t => {
    t.dotp = (t.pos[0] + 0.5 - x) * vx + (t.pos[1] + 0.5 - y) * vy + (t.pos[2] + 0.5 - z) * vz;
    //let px = Math.abs(t.pos[0] - x + 0.5), py = Math.abs(t.pos[1] - y + 0.5), pz = Math.abs(t.pos[2] - z + 0.5);
    //t.dotp = -(px * px + py * py + pz * pz);
  });
  this.indicesData = new Map([...this.indicesData].sort((a, b) => a[1].dotp - b[1].dotp));
  
  this.updateIndexBuffer();
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

  void main() {
    float x = float(vertex0 & 1023u);
    float y = float((vertex0 & 1047552u) >> 10u);
    float z = float((vertex0) >> 20u);

    gl_Position = projection * camera * vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);

    float textureLayer = float(vertex1 & 1023u);
    float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
    float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;

    textureData = vec3(texcoordX, texcoordY, textureLayer);
    shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
  }
`;

const alphaBlockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  uniform sampler2DArray diffuse;

  in vec3 textureData;
  in float shadeData;

  out vec4 outColor;

  void main() {
    outColor = texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f);
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

  void main() {
    float x = float(vertex0 & 1023u);
    float y = float((vertex0 & 1047552u) >> 10u);
    float z = float((vertex0) >> 20u);

    gl_Position = projection * camera * vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);

    float textureLayer = float(vertex1 & 1023u);
    float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
    float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;

    textureData = vec3(texcoordX, texcoordY, textureLayer);
    shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
  }
`;

const blockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  uniform sampler2DArray diffuse;

  in vec3 textureData;
  in float shadeData;

  out vec4 outColor;

  void main() {
    outColor = texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f);
    if (outColor[3] < 0.4f) discard;
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
  
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, this.width, this.height, this.pixels.length / 256 / 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.pixels));

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
    
    for (let x = -4; x < 4; x ++) {
      for (let y = -1; y < 3; y ++) {
        for (let z = -4; z < 4; z ++) {
          //sim.generateChunk(x, y, z);
        }
      }
    }
    sim.generateChunk(0, 0, 0);
    //sim.generateChunk(0, -1, 0);
    
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
      sim.world.player.placeBlock();
    } else if (event.button === 0) {
      sim.world.player.breakBlock();
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
  };

  for (let b in Blocks) {
    let block = Blocks[b];
    if (block.isTranslucent) {
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
  this.holding = 'red_glass';
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
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 20);
  if (blocks[1] === undefined) return;
  sim.setBlock(blocks[1].x, blocks[1].y, blocks[1].z, block);
};

// removes the first block from raycast
Player.prototype.breakBlock = function() {
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 20);
  if (blocks[0] === undefined) return;
  sim.setBlock(blocks[0].x, blocks[0].y, blocks[0].z, 'air');
};


/** ./src/server/serversim.js **/

const ServerSim = {};

ServerSim.init = function() {
  
};


/** ./src/server/world/chunk.js **/

function Chunk(...args) {
  [ this.x, this.y, this.z, this.blocks, this.blockIDs, this.chunks ] = args;
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
    return this.blockIDs[chunk === undefined ? undefined : chunk.blocks[Chunk.posToIndex(tx === 0 ? x : tx === 1 ? 0 : 31, ty === 0 ? y : ty === 1 ? 0 : 31, tz === 0 ? z : tz === 1 ? 0 : 31)]];
  }
  return this.blockIDs[this.blocks[Chunk.posToIndex(x, y, z)]];
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
    return { type: this.blockIDs[chunk.blocks[index]], id: chunk.blocks[index], chunk: chunk, chunkPos: chunkPos, x: pos[0], y: pos[1], z: pos[2], index: index };
  }
  let index = Chunk.posToIndex(x, y, z);
  return { type: this.blockIDs[this.blocks[index]], chunk: this, chunkPos: chunkPos, x: x, y: y, z: z, index: index };
};

Chunk.prototype.setBlock = function(x, y, z, block, data) {
  this.blocks[Chunk.posToIndex(x, y, z)] = block;
};


/** ./src/server/world/generator.js **/

function Generator(seed) {
  this.seed = seed;
  this.noise = new SimplexNoise(new Alea(seed));
};

Generator.prototype.height = function(x, z) {
  let a = (this.noise.noise2D(x / 100, z / 100) + 1) * 0.5 * 10;
  let b = (this.noise.noise2D(x / 40, (z + 10000) / 40) + 1) * 0.5 * 10;
  
  let c = a * 10;
  if (c > 70) {
    c -= 75;
    c += (this.noise.noise2D(x / 10, z / 10) + 1) * 0.5 * 8;
    c *= 1.5;
    if (c < 0) c = 0;
  }
  else c = 0;
  
  return Math.floor(a + b + c);
};

Generator.prototype.generateChunk = function(x, y, z) {
  const blocks = new Uint16Array(32 * 32 * 32),
        noiseMap = [];
  // generate noise map for chunk
  let nx, nz;
  for (nx = 0; nx < 32; nx ++) {
    noiseMap.push([]);
    for (nz = 0; nz < 32; nz ++) {
      noiseMap[nx].push(this.height(nx + x * 32, nz + z * 32));
    }
  }
  // fill blocks
  for (let i = 0; i < 32 * 32 * 32; i ++) {
    let p = Chunk.indexToPos(i);
    let height = noiseMap[p[0]][p[2]];
    let bheight = p[1] + y * 32;
    //blocks[i] = p[0] >= 8 && p[0] < 24 && p[1] === 1 && p[2] >= 8 && p[2] < 24 ? ((p[0] + p[1] + p[2]) % 2 === 0 ? 7 : 9) : 0;
    //blocks[i] = p[0] >= 8 && p[0] < 24 && p[1] >= 8 && p[1] < 24 && p[2] >= 8 && p[2] < 24 ? ((p[0] + p[1] + p[2]) % 2 === 0 ? 7 : 9) : 0;
    blocks[i] = (bheight < height - 2) ? 1 : (bheight < height - 1) ? (Math.random() < 0.3 ? 1 : 2) : (bheight < height) ? 2 : (bheight === height) ? 3 : 0;
  }
  /*
  for (let i = 0; i < 32 * 32 * 32; i ++) {
    let p = Chunk.indexToPos(i);
    blocks.push(p[1] + y * 32 < (10 + ((x + z) * 7) % 10) ? 1 : 0);
  }*/
  
  return blocks;
};



/** ./src/server/world/world.js **/

// handles one world
// one server may have multiple worlds running in parallel
function World() {
  this.seed = Date.now();
  this.generator = new Generator(this.seed);
  
  this.chunks = {};
  this.entities = {};
  
  this.player = undefined;
  this.playerID = undefined;
  
  this.blockIDs = Object.keys(Blocks);
  this.blockKeys = Object.fromEntries(this.blockIDs.map((x, i) => [x, i]));;
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
  this.chunks[c] = new Chunk(x, y, z, this.generator.generateChunk(x, y, z), this.blockIDs, this.chunks);
};

// load saved chunk
World.prototype.loadChunk = function(x, y, z) {
  // grab data from save file
};

World.prototype.setBlock = function(x, y, z, block, blockData = this.getBlockData(x, y, z)) {
  if (this.blockKeys[block] === undefined) return -1;
  blockData.chunk.blocks[blockData.index] = this.blockKeys[block];
};

// returns block type given the index (ID)
World.prototype.blockType = function(index) {
  return this.blockIDs[index];
};

// returns block ID given type
World.prototype.blockID = function(type) {
  return this.blockKeys[type];
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
  
  this.actions = ['draw', 'generateChunk', 'setBlock', 'spawnPlayer']
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
};

