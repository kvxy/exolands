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