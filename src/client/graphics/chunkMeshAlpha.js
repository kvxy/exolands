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