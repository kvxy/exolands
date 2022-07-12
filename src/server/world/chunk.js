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