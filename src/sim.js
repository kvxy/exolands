
// Handles all in-game events
function Sim() {
  this.server = true; // simulate everything
  this.client = true; // display and inputs
  
  this.actions = ['draw', 'generateChunk', 'setBlock']
}

Sim.prototype.init = function() {
  // create world
  this.world = new World();
  this.world.sim = this;
  
  // init sims
  if (this.client) {
    this.clientSimInit = ClientSim.init;
    this.clientSimInit();
  }
  if (this.server) {
    this.serverSimInit = ServerSim.init;
    this.serverSimInit();
  }
  
  // combine sim, serverSim and clientSim actions
  for (let action of this.actions) {
    let simFunc, serverFunc, clientFunc, baseFunc;
    
    if (typeof this[action] === 'function')
      simFunc = this[action].toString();
    if (this.server && typeof ServerSim[action] === 'function')
      serverFunc = ServerSim[action].toString();
    if (this.client && typeof ClientSim[action] === 'function')
      clientFunc = ClientSim[action].toString();
    
    baseFunc = simFunc ?? serverFunc ?? clientFunc;
    if (!baseFunc) continue;
    baseFunc = baseFunc.slice(0, baseFunc.indexOf(')') + 5);
    
    // RUN ORDER: Sim, ServerSim, ClientSim
    baseFunc += 
      (simFunc ? simFunc.slice(simFunc.indexOf('{') + 2, -1) : '') +
      (serverFunc ? serverFunc.slice(serverFunc.indexOf('{') + 2, -1) : '') +
      (clientFunc ? clientFunc.slice(clientFunc.indexOf('{') + 2, -1) : '');
    
    this[action] = Function(`return ${baseFunc}}`)();
  }
};

Sim.prototype.generateChunk = function(x, y, z) {
  this.world.generateChunk(x, y, z);
};

Sim.prototype.setBlock = function(x, y, z, block) {
  let prevBlockData = this.world.getBlockData(x, y, z);
  if (!prevBlockData) return;
  if (this.world.setBlock(x, y, z, block, prevBlockData) === -1) return;
};