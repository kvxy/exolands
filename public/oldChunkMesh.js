const ChunkMesh = (function() {
  
  function ChunkMesh(...args) {
    [ this.chunk, this.gl, this.chunkGraphicShaders, this.world, this.chunkMeshes, this.textures ] = args;
    [ this.x, this.y, this.z ] = [ this.chunk.x, this.chunk.y, this.chunk.z ];
    
    this.shaders = {};
    
    // default for opaque / transparent blocks (blockShader)
    this.addShader('default');
    
    // translucent blocks (alphaBlockShader)
    this.addShader('alpha');
    this.translucentBlocks = new Map(); // stores vertex indexes of translucent blocks with faces
  }
  
  // use per program/shader
  ChunkMesh.prototype.addShader = function(shaderName) {
    this.shaders[shaderName] = {
      vertex0: [],
      vertex1: [],
      vertexSlots: [], // positions of NaN vertices
      indices: [],
      update: false
    };
  };
  
  // compresses vertex data into uInt32 format and pushes it to vertex lists
  ChunkMesh.prototype.addVertex = function(x, y, z, shaderName, textureLayer = 2, texcoordX = 0, texcoordY = 0, dLight = 3, index = -1) {
    const shader = this.shaders[shaderName];
    
    // vertex0: [ 10 bitx X, 10 bits Y, 10 bits Z, 2 bits empty ] <- use this to find faces
    // vertex1: [ 10 bits texture layer, 5 bits texcoord x, 5 bits texcoord y, 2 bits shading, 10 bits empty ]
    
    if (index >= 0) {
      shader.vertex0[index] = x | (y << 10) | (z << 20);
      shader.vertex1[index] = textureLayer | (texcoordX << 10) | (texcoordY << 15) | (dLight << 20);
    } else {
      shader.vertex0.push( x | (y << 10) | (z << 20) );
      shader.vertex1.push( textureLayer | (texcoordX << 10) | (texcoordY << 15) | (dLight << 20) );
    }
        
    shader.update = true;
    return index >= 0 ? index : shader.vertex0.length - 1;
  };
  
  // creates vao and mesh
  ChunkMesh.prototype.load = function() {
    const gl = this.gl,
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
                this.addCubeFace(x + (p === 0), y + (p === 1), z + (p === 2), p * 2 + 1, this.textures.textureKeys[otherBlockInfo.texture[p * 2 + 1]], otherBlockInfo.shader);
              }
            }
            if (!blockInfo.isInvisible) {
              if (pos < 31 && (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent)) { // AND DIFFERENT BLOCK
                this.addCubeFace(x, y, z, p * 2, this.textures.textureKeys[blockInfo.texture[p * 2]], blockInfo.shader);
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
                  this.addCubeFace(x, y, z, p * 2 + (pos === 0), this.textures.textureKeys[blockInfo.texture[p * 2]], blockInfo.shader);
                }
                if (!otherBlockInfo.isInvisible && (blockInfo.isInvisible || blockInfo.isTranslucent)) {
                  this.chunkMeshes[blockData.chunkPos].addCubeFace(blockData.x, blockData.y, blockData.z, p * 2 + (pos === 31), this.textures.textureKeys[otherBlockInfo.texture[p * 2 + (pos === 31)]], otherBlockInfo.shader);
                }
              }
            }
          }
        }
      }
    }
    
    // load vao and buffers for each added shader
    let s, shader, vertex0Buffer, vertex1Buffer, indexBuffer, renderer;
    for (s in this.shaders) {
      renderer = this.chunkGraphicShaders[s].renderer;
      shader = this.shaders[s];
      
      shader.vao = gl.createVertexArray();
      gl.bindVertexArray(shader.vao);
      
      vertex0Buffer = shader.vertex0Buffer = gl.createBuffer();
      renderer.assignAttribI('vertex0', vertex0Buffer, 1, gl.UNSIGNED_INT, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertex0Buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(shader.vertex0), gl.DYNAMIC_DRAW);

      vertex1Buffer = shader.vertex1Buffer = gl.createBuffer();
      renderer.assignAttribI('vertex1', vertex1Buffer, 1, gl.UNSIGNED_INT, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertex1Buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(shader.vertex1), gl.DYNAMIC_DRAW);

      indexBuffer = shader.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shader.indices), gl.DYNAMIC_DRAW);
    }
  };
  
  // updates buffers (called automatically in chunkGraphics when this.shaders[shaderName].update === true)
  ChunkMesh.prototype.updateBuffers = function(shaderName) {
    const gl = this.gl,
          shader = this.shaders[shaderName];
    gl.bindVertexArray(shader.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, shader.vertex0Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(shader.vertex0), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, shader.vertex1Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(shader.vertex1), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shader.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shader.indices), gl.DYNAMIC_DRAW);
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
  ChunkMesh.prototype.addCubeFace = function(x, y, z, dir, texture, shaderName) {
    const shader = this.shaders[shaderName],
          pos = this.cubeFacePosition(x, y, z, dir),
          texcoord = this.cubeFaceTexcoord([2, 3, 0, 0, 3, 2][dir]),
          dLight = [1, 1, 3, 0, 2, 2][dir]; // directional lighting
    
    let vertexIndex = -4;
    if (shader.vertexSlots.length > 0) {
      vertexIndex = shader.vertexSlots[shader.vertexSlots.length - 1];
      shader.vertexSlots.pop();
    }
    
    const a = this.addVertex(pos[0], pos[1], pos[2], shaderName, texture, texcoord[0], texcoord[1], dLight, vertexIndex),
          b = this.addVertex(pos[3], pos[4], pos[5], shaderName, texture, texcoord[2], texcoord[3], dLight, vertexIndex + 1),
          c = this.addVertex(pos[6], pos[7], pos[8], shaderName, texture, texcoord[4], texcoord[5], dLight, vertexIndex + 2),
          d = this.addVertex(pos[9], pos[10], pos[11], shaderName, texture, texcoord[6], texcoord[7], dLight, vertexIndex + 3);
    shader.indices.push(
      a, b, c,
      c, d, a
    );
    
    return a;
  };
  
  // removes a rectangular face
  ChunkMesh.prototype.removeFace = function(facePosition, shaderName) {
    const shader = this.shaders[shaderName],
          vertexIndex = this.findFace(facePosition, shaderName);
    if (vertexIndex === -1) return;
    shader.vertex0[vertexIndex] = shader.vertex0[vertexIndex + 1] = shader.vertex0[vertexIndex + 2] = shader.vertex0[vertexIndex + 3] = NaN;
    shader.vertex1[vertexIndex] = shader.vertex1[vertexIndex + 1] = shader.vertex1[vertexIndex + 2] = shader.vertex1[vertexIndex + 3] = NaN;
    shader.indices.splice(this.findIndex(vertexIndex, shaderName), 6);
    
    shader.vertexSlots.push(vertexIndex);
    shader.update = true;
    
    return vertexIndex;
  };
  
  // returns starting index of a face (4 vertices per face)
  ChunkMesh.prototype.findFace = function(facePosition, shaderName) {
    let vertex0 = this.shaders[shaderName].vertex0;
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
  ChunkMesh.prototype.indexBinarySearch = function(index, shaderName) {
    let indices = this.shaders[shaderName].indices,
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
  ChunkMesh.prototype.findIndex = function(index, shaderName) {
    let indices = this.shaders[shaderName].indices, i;
    for (i = 0; i < indices.length; i += 6) {
      if (indices[i] === index) return i;
    }
    return -1;
  };
  
  // checks two faces' interactions to see if a face needs to be added/removed
  // dir is for blockData0, assumes block in direction 'dir' is blockData1
  ChunkMesh.prototype.faceInteraction = function(blockData0, blockData1, add, dir, blockInfo0 = this.world.blockInfo(blockData0.type), blockInfo1 = this.world.blockInfo(blockData1.type)) {
    let addFace, removeFace; // add == true: addFace0, removeFace1. add == false: removeFace0, addFace1
    
    if (add) { // ADDING FACE
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
        blockInfo = this.world.blockInfo(thisBlockData.type);
    if (add && blockInfo.isInvisible) return;
    
    for (i = 0; i < 6; i ++) {
      tx = (i === 0) - (i === 1);
      ty = (i === 2) - (i === 3);
      tz = (i === 4) - (i === 5);
      otherBlockData = this.chunk.getBlockData(x + tx, y + ty, z + tz);
      if (otherBlockData === undefined) continue;
      otherBlockInfo = this.world.blockInfo(otherBlockData.type);
      faceInteraction = this.faceInteraction(thisBlockData, otherBlockData, add, i, blockInfo, otherBlockInfo);
      
      if (faceInteraction[0]) {
        if (add) {
          index = this.addCubeFace(x, y, z, i, this.textures.textureKeys[blockInfo.texture[i]], blockInfo.shader);
          if (blockInfo.shader === 'alpha') this.updateTranslucentBlocks(x, y, z, true, index);
        } else {
          index = this.chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1), this.textures.textureKeys[otherBlockInfo.texture[i + (i % 2 === 0 ? 1 : -1)]], otherBlockInfo.shader);
          if (otherBlockInfo.shader === 'alpha') this.updateTranslucentBlocks(otherBlockData.x, otherBlockData.y, otherBlockData.z, true, index);
        }
      }
      if (faceInteraction[1]) {
        if (add) {
          index = this.chunkMeshes[otherBlockData.chunkPos].removeFace(this.cubeFacePosition(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1)), otherBlockInfo.shader);
          if (otherBlockInfo.shader === 'alpha') this.updateTranslucentBlocks(otherBlockData.x, otherBlockData.y, otherBlockData.z, false, index);
        } else {
          index = this.removeFace(this.cubeFacePosition(x, y, z, i), blockInfo.shader);
          if (blockInfo.shader === 'alpha') this.updateTranslucentBlocks(x, y, z, false, index);
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
  
  ChunkMesh.prototype.swapFaces = function(shaderName, i0, i1) {
    let shader = this.shaders[shaderName], i, j, temp, vertex;
    for (i = 0; i < 4; i ++) {
      for (j = 0; j < 2; j ++) { // vertex0 and vertex1
        vertex = 'vertex' + j;        
        temp = shader[vertex][i0 + i];
        shader[vertex][i0 + i] = shader[vertex][i1 + i];
        shader[vertex][i1 + i] = temp;
      }
    }
    
    shader.update = true;
  };
  
  // updates translucent block list
  ChunkMesh.prototype.updateTranslucentBlocks = function(x, y, z, add, index) {
    const pos = x + ',' + y + ',' + z;
    if (this.translucentBlocks.get(pos) === undefined) this.translucentBlocks.set(pos, { pos: [x, y, z], data: [] });
    const translucentBlock = this.translucentBlocks.get(pos);
    
    if (add) {
      translucentBlock.data.push(index);
    } else {
      translucentBlock.data.splice(translucentBlock.data.indexOf(index), 1);
      if (translucentBlock.data.length === 0) this.translucentBlocks.delete(pos); 
    }
  };
  
  ChunkMesh.prototype.sortTranslucentBlocks = function(camera) {
    const shader = this.shaders.alpha,
          x = camera.x, y = camera.y, z = camera.z,
          rx = camera.rotation[0],
          ry = camera.rotation[1],
          vx = Math.sin(ry) * Math.cos(rx),
          vy = Math.sin(rx),
          vz = Math.cos(ry) * Math.cos(rx);
    
    // insertion sort
    this.translucentBlocks.forEach(t => {
      t.dotp = (t.pos[0] - x) * vx + (t.pos[1] - y) * vy + (t.pos[2] - z) * vz;
    });
    this.translucentBlocks = new Map([...this.translucentBlocks].sort((a, b) => a[1].dotp - b[1].dotp));
    
    // update vertices
    let vertexIndex = 0;
    this.translucentBlocks.forEach(t => {
      for (let i in t.data) {
        while(shader.vertexSlots.indexOf(vertexIndex) !== -1) {
          vertexIndex += 4;
        }
        if (t.data[i] === vertexIndex) continue;
        // swap
        this.swapFaces('alpha', t.data[i], vertexIndex);
        let temp = t.data[i];
        t.data[i] = vertexIndex;
        
        vertexIndex += 4;
      }
    });
  };
  
  // used for sorting translucent faces
  // input 2 corners of a square face as v0 and v1
  ChunkMesh.prototype.getFaceDistance = function(v0, v1, camera) {
    const vec = [ 
      ((v0 & 1023) + (v1 & 1023)) * 0.5 / 16 - camera.x,
      (((v0 & 1047552) >>> 10) + ((v1 & 1047552) >>> 10)) * 0.5 / 16 - camera.y,
      ((v0 >>> 20) + (v1 >>> 20)) * 0.5 / 16 - camera.z
    ];
        
    return Math.abs(vec[0] * vec[0]) + Math.abs(vec[1] * vec[1]) + Math.abs(vec[2] * vec[2]);
  };
  
  // sorts translucent faces (sorting only required on camera translational movement)
  ChunkMesh.prototype.sortFaces = function(shaderName, camera) {
    const shader = this.shaders[shaderName],
          distances = [];
        
    let i, j, dist;
    // get all distances of translucent faces
    for (i = 0; i < shader.vertex0.length; i += 4) {
      if (isNaN(shader.vertex0[i])) continue;
      distances.push([ i, this.getFaceDistance(shader.vertex0[i], shader.vertex0[i + 2], camera) ]);
    }
    window.distances = distances;
    // insertion sort
    // CHANGE TO SORTING INDICES INSTEAD OF VERTEX0 WHEN NAN OPEN SLOTS IS ADDED
    for (i = 1; i < distances.length; i ++) {
      dist = distances[i];
      j = i - 1;
      while (j >= 0 && distances[j][1] < dist[1]) {
        distances[j + 1][1] = distances[j][1];
        this.swapFaces(shaderName, distances[j + 1][0], distances[j][0]);
        j --;
      }
      distances[j + 1][1] = dist[1];
    }
  };
  
  return ChunkMesh;
  
})();