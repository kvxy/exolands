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