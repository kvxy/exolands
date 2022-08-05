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