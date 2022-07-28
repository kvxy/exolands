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