function Generator(seed) {
  this.seed = seed;
  this.noise = new SimplexNoise(new Alea(seed));
};

Generator.prototype.height = function(x, z) {
  let a = (this.noise.noise2D(x / 100, z / 100) + 1) * 0.5 * 10;
  let b = (this.noise.noise2D(x / 40, (z + 10000) / 40) + 1) * 0.5 * 10;
  
  let c = a * 10;
  if (c > 70) {
    c -= 75;
    c += (this.noise.noise2D(x / 10, z / 10) + 1) * 0.5 * 8;
    c *= 1.5;
    if (c < 0) c = 0;
  }
  else c = 0;
  
  return Math.floor(a + b + c);
};

Generator.prototype.generateChunk = function(x, y, z) {
  const blocks = new Uint16Array(32 * 32 * 32),
        noiseMap = [];
  // generate noise map for chunk
  let nx, nz;
  for (nx = 0; nx < 32; nx ++) {
    noiseMap.push([]);
    for (nz = 0; nz < 32; nz ++) {
      noiseMap[nx].push(this.height(nx + x * 32, nz + z * 32));
    }
  }
  // fill blocks
  for (let i = 0; i < 32 * 32 * 32; i ++) {
    let p = Chunk.indexToPos(i);
    let height = noiseMap[p[0]][p[2]];
    let bheight = p[1] + y * 32;
    //blocks[i] = p[0] >= 8 && p[0] < 24 && p[1] === 1 && p[2] >= 8 && p[2] < 24 ? ((p[0] + p[1] + p[2]) % 2 === 0 ? 7 : 9) : 0;
    //blocks[i] = p[0] >= 8 && p[0] < 24 && p[1] >= 8 && p[1] < 24 && p[2] >= 8 && p[2] < 24 ? ((p[0] + p[1] + p[2]) % 2 === 0 ? 7 : 9) : 0;
    blocks[i] = (bheight < height - 2) ? 1 : (bheight < height - 1) ? (Math.random() < 0.3 ? 1 : 2) : (bheight < height) ? 2 : (bheight === height) ? 3 : 0;
  }
  /*
  for (let i = 0; i < 32 * 32 * 32; i ++) {
    let p = Chunk.indexToPos(i);
    blocks.push(p[1] + y * 32 < (10 + ((x + z) * 7) % 10) ? 1 : 0);
  }*/
  
  return blocks;
};
