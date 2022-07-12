// handles one world
// one server may have multiple worlds running in parallel
function World() {
  this.seed = Date.now();
  this.generator = new Generator(this.seed);
  
  this.chunks = {};
  this.entities = {};
  this.blockIDs = ['air', 'stone', 'dirt', 'grass'];
  this.blockKeys = Object.fromEntries(this.blockIDs.map((x, i) => [x, i]));;
}

// generate new chunk
World.prototype.generateChunk = function(x, y, z) {
  const c = [x, y, z];
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
World.prototype.blockInfo = function(input) {
  return typeof input === 'number' ? Blocks[this.blockIDs[input]] : Blocks[input];
};

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

World.prototype.raycast = function(x0, y0, z0, x1, y1, z1) {
  let x = Math.floor(x0),
      y = Math.floor(y0),
      z = Math.floor(z0),
      mx = x1 - x0,
      my = y1 - y0,
      mz = z1 - z0,
      sx = mx < 0 ? -1 : mx > 0 ? 1 : 0,
      sy = my < 0 ? -1 : my > 0 ? 1 : 0,
      sz = mz < 0 ? -1 : mz > 0 ? 1 : 0,
      sny = my < 0 ? 0 : 1,
      snz = mz < 0 ? 0 : 1,
      nxy = (y + sny - y0) / my * mx + x0,
      nxz = (z + snz - z0) / mz * mx + x0;
  
  for (let i = 0; i < 20; i ++) {
    let block = this.getBlockData(x, y, z);
    if (block.type !== 'air') return block;
    
    if (!((mx === 1 && x < nxy - 1) || (mx === -1 && x > nxy) || my === 0)) {
      y += sy;
      nxy =  (y + sny - y0) / my * mx + x0;
      continue;
    }
    if (!((mx === 1 && x < nxz - 1) || (mx === -1 && x > nxz) || mz === 0)) {
      z += sz;
      nxy =  (y + snz - y0) / mz * mx + x0;
      continue;
    }
    x += sx;
  }
};