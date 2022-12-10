extend(Player, Entity);
function Player(...args) { // (data, world)
  this.__super__.constructor.call(this, ...args);
  this.holding = 'stone';
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
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 50);
  if (blocks[1] === undefined) return;
  sim.setBlock(blocks[1].x, blocks[1].y, blocks[1].z, block);
};

// removes the first block from raycast
Player.prototype.breakBlock = function() {
  let blocks = this.world.raycast(this.x, this.y, this.z, this.rotation[0], this.rotation[1], 50);
  if (blocks[0] === undefined) return;
  sim.setBlock(blocks[0].x, blocks[0].y, blocks[0].z, 'air');
};