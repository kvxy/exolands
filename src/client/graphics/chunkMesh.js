const ChunkMesh = (function() {
  
  function ChunkMesh(...args) {
    [ this.chunk, this.gl, this.renderer, this.world, this.chunkMeshes, this.textures ] = args;
    [ this.x, this.y, this.z ] = [ this.chunk.x, this.chunk.y, this.chunk.z ];
    
    this.vertex0 = [];
    this.vertex1 = [];
    this.indices = [];
    
    this.update = false;
  }
  
  // compresses vertex data into uInt32 format and pushes it to vertex lists
  ChunkMesh.prototype.addVertex = function(x, y, z, textureLayer = 2, texcoordX = 0, texcoordY = 0, shade = 3) {
    // [ 10 bitx X, 10 bits Y, 10 bits Z, 2 bits empty ]
    this.vertex0.push( x | (y << 10) | (z << 20)); // use this to sort
    // [ 10 bits texture layer, 5 bits texcoord x, 5 bits texcoord y, 2 bits shading, 10 bits empty ]
    this.vertex1.push( textureLayer | (texcoordX << 10) | (texcoordY << 15) | (shade << 20) );
    this.update = true;
    return this.vertex0.length - 1;
  };
  
  // creates vao and mesh
  ChunkMesh.prototype.load = function() {
    const gl = this.gl,
          renderer = this.renderer,
          blocks = this.chunk.blocks,
          world = this.world;
    let x, y, z, p, pos, blockInfo, otherBlockInfo, tx, ty, tz, blockData;
    for (z = 0; z < 32; z ++) {
      for (y = 0; y < 32; y ++) {
        for (x = 0; x < 32; x ++) {
          blockInfo = world.blockInfo(blocks[Chunk.posToIndex(x, y, z)]);
          for (p = 0; p < 3; p ++) {
            pos = p === 0 ? x : p === 1 ? y : z;
            // INNER MESH
            otherBlockInfo = world.blockInfo(blocks[Chunk.posToIndex(x + (p === 0), y + (p === 1), z + (p === 2))]);
            if (blockInfo.isInvisible || blockInfo.isTranslucent) {
              if (pos < 31 && !otherBlockInfo.isInvisible) { // AND DIFFERENT FROM BLOCKINFO BLOCK
                this.addCubeFace(x + (p === 0), y + (p === 1), z + (p === 2), p * 2 + 1, this.textures.textureKeys[otherBlockInfo.texture[p * 2 + 1]]);
              }
            }
            if (!blockInfo.isInvisible) {
              if (pos < 31 && (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent)) { // AND DIFFERENT BLOCK
                this.addCubeFace(x, y, z, p * 2, this.textures.textureKeys[blockInfo.texture[p * 2]]);
              }
            }
            // OUTER MESH
            if (pos === 0 || pos === 31) {
              blockData = this.chunk.getBlockData(
                p === 0 ? x + (x === 31) - (x === 0) : x,
                p === 1 ? y + (y === 31) - (y === 0) : y,
                p === 2 ? z + (z === 31) - (z === 0) : z
              );
              if (blockData !== undefined) {
                otherBlockInfo = world.blockInfo(blockData.type);
                if (!blockInfo.isInvisible && (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent)) {
                  this.addCubeFace(x, y, z, p * 2 + (pos === 0), this.textures.textureKeys[blockInfo.texture[p * 2]]);
                }
                if (!otherBlockInfo.isInvisible && (blockInfo.isInvisible || blockInfo.isTranslucent)) {
                  this.chunkMeshes[blockData.chunkPos].addCubeFace(blockData.x, blockData.y, blockData.z, p * 2 + (pos === 31), this.textures.textureKeys[otherBlockInfo.texture[p * 2 + (pos === 31)]]);
                }
              }
            }
          }
        }
      }
    }
    
    // load vao
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    
    const vertex0Buffer = this.vertex0Buffer = gl.createBuffer();
    renderer.assignAttribI('vertex0', vertex0Buffer, 1, gl.UNSIGNED_INT, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex0Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);
    
    const vertex1Buffer = this.vertex1Buffer = gl.createBuffer();
    renderer.assignAttribI('vertex1', vertex1Buffer, 1, gl.UNSIGNED_INT, 0, 0);
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
          shading = [1, 1, 3, 0, 2, 2][dir],
          a = this.addVertex(pos[0], pos[1], pos[2], texture, texcoord[0], texcoord[1], shading),
          b = this.addVertex(pos[3], pos[4], pos[5], texture, texcoord[2], texcoord[3], shading),
          c = this.addVertex(pos[6], pos[7], pos[8], texture, texcoord[4], texcoord[5], shading),
          d = this.addVertex(pos[9], pos[10], pos[11], texture, texcoord[6], texcoord[7], shading);
    this.indices.push(
      a, b, c,
      c, d, a
    );
  };
  
  // removes a rectangular face
  ChunkMesh.prototype.removeFace = function(facePosition) {
    let index = this.findFace(facePosition);
    if (index === -1) return;
    this.vertex0[index] = this.vertex0[index + 1] = this.vertex0[index + 2] = this.vertex0[index + 3] = NaN;
    this.vertex1[index] = this.vertex1[index + 1] = this.vertex1[index + 2] = this.vertex1[index + 3] = NaN;
    this.indices.splice(this.indexBinarySearch(index), 6);
      
    this.update = true;
  };
  
  // returns starting index of a face (4 vertices per face)
  ChunkMesh.prototype.findFace = function(facePosition) {
    for (let i = 0; i < this.vertex0.length; i += 4) {
      if (this.vertex0[i] === NaN) continue;
      if (
        (facePosition[0] | (facePosition[1] << 10) | (facePosition[2] << 20)) === this.vertex0[i] && 
        (facePosition[3] | (facePosition[4] << 10) | (facePosition[5] << 20)) === this.vertex0[i + 1] && 
        (facePosition[6] | (facePosition[7] << 10) | (facePosition[8] << 20)) === this.vertex0[i + 2] && 
        (facePosition[9] | (facePosition[10] << 10) | (facePosition[11] << 20)) === this.vertex0[i + 3]
      ) {
        return i;
      }
    }
    return -1;
  };
  
  // finds index of a 'this.indices' given the index of a starting vertex0 (always a multiple of 4)
  ChunkMesh.prototype.indexBinarySearch = function(index) {
    let mid, min = 0, max = this.indices.length;
    while (min <= max) {
      mid = Math.floor((min + max) / 12) * 6;
      if (index > this.indices[mid]) {
        min = mid + 6;
      } else if (index < this.indices[mid]) {
        max = mid - 6;
      } else {
        return mid;
      } 
    }
    return -1;
  };
  
  // adds/removes block's mesh and updates neighbors
  ChunkMesh.prototype.updateBlock = function(x, y, z, add, block) {
    let blockInfo;
    if (add) {
      blockInfo = this.world.blockInfo(block);
      if (blockInfo.isInvisible) return;
    }
    
    let tx, ty, tz, i, otherBlockInfo, otherBlockData;
    for (i = 0; i < 6; i ++) {
      tx = (i === 0) - (i === 1);
      ty = (i === 2) - (i === 3);
      tz = (i === 4) - (i === 5);
      otherBlockData = this.chunk.getBlockData(x + tx, y + ty, z + tz);
      if (otherBlockData === undefined) continue;
      otherBlockInfo = this.world.blockInfo(otherBlockData.type);
      if (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent) {
        if (add) {
          this.addCubeFace(x, y, z, i, this.textures.textureKeys[blockInfo.texture[i]]);
        } else {
          this.removeFace(this.cubeFacePosition(x, y, z, i));
        }
      }
      if (!otherBlockInfo.isInvisible) { // ASSUMES CUBE POSITION
        if (add) {
          this.chunkMeshes[otherBlockData.chunkPos].removeFace(this.cubeFacePosition(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1)));
        } else {
          this.chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1), this.textures.textureKeys[otherBlockInfo.texture[i + (i % 2 === 0 ? 1 : -1)]]);
        }
      }
    }
  };
  
  // adds a block's mesh (current block at x y z must be air) and updates neighbors
  ChunkMesh.prototype.addBlock = function(x, y, z, block) {
    this.updateBlock(x, y, z, true, block);
  };
  
  // removes a block's mesh and updates neighbors
  ChunkMesh.prototype.removeBlock = function(x, y, z) {
    this.updateBlock(x, y, z, false);
  };
  
  return ChunkMesh;
  
})();