// inheritance
function extend(child, parent) {
  child = child.prototype;
  parent = parent.prototype;
  child.__super__ = parent;
  for (let k in parent) {
    if (parent.hasOwnProperty(k))
      child[k] = parent[k];
  }
}

function Entity(data, world) {
  this.world = world;
  this.x = this.y = this.z = 0;
  this.generateID();
  for (let i in data) {
    this[i] = data;
  }
}

Entity.prototype.generateID = function() {
  this.ID = (Date.now() + Math.random() * Math.pow(10, 14)).toString(16).substr(0, 12);
};

// movement functions depends on entity orientation
Entity.prototype.moveX = function(mag) {
  if (mag === 0) return;
  this.velocity[2] += Math.cos(this.rotation[1] + Math.PI / 2) * mag;
  this.velocity[0] += Math.sin(this.rotation[1] + Math.PI / 2) * mag;
};

Entity.prototype.moveY = function(mag) {
  if (mag === 0) return;
  this.velocity[1] += mag;
};

Entity.prototype.moveZ = function(mag) {
  if (mag === 0) return;
  this.velocity[2] += Math.cos(this.rotation[1]) * mag;
  this.velocity[0] += Math.sin(this.rotation[1]) * mag;
};