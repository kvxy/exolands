
const ClientSim = {};

ClientSim.init = function() {
  this.chunkGraphics = new ChunkGraphics(this.world);
  this.chunkGraphics.init();
};

ClientSim.draw = function() {
  this.chunkGraphics.draw();
};

ClientSim.generateChunk = function(x, y, z) {
  this.chunkGraphics.loadChunk(x, y, z);
};

ClientSim.setBlock = function(x, y, z, block) {
  this.chunkGraphics.setBlock(x, y, z, block, prevBlockData); // prevBlockData FROM Sim
};