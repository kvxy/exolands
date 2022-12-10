const Generator = (function() {

  function Generator(seed, blockIDS) {
    this.seed = seed;
    this.noise = new SimplexNoise(new Alea(seed));
    
    this.chunks = {};

    this.blockIDs = blockIDS;
  };
  
  Generator.prototype.testBounds = function(testBounds, x, y, z) {
    x = (x > 31) - (x < 0);
    if (x !== 0) testBounds[0] = x;
    y = (y > 31) - (y < 0);
    if (y !== 0) testBounds[1] = y;
    z = (z > 31) - (z < 0);
    if (z !== 0) testBounds[2] = z;
  };
  
  Generator.prototype.applyBounds = function(testBounds, func, args) {
    
  };

  Generator.prototype.generateCube = function(blocks, block, x, y, z, w, h, l, data = {}) {
    let replace = data.replace ?? false,
        loadNeighbors = data.loadNeighbors ?? false;
    
    block = this.blockIDs[block];
    if (replace) replace = this.blockIDs[replace];
    
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (z < 0) z = 0;
    if (x + w > 31) w = 31 - x;
    if (y + h > 31) h = 31 - y;
    if (z + l > 31) l = 31 - z;
    
    let testBounds = [ 0, 0, 0 ];
    let px, py, pz;
    for (px = x; px < x + w; px ++) {
      for (py = y; py < y + h; py ++) {
        for (pz = z; pz < z + l; pz ++) {
          if (replace === false || blocks[px][py][pz] === replace) {
            blocks[px][py][pz] = block;
            this.testBounds(testBounds, px, py, pz);
          }
        }
      }
    }
    this.applyBounds(testBounds, 'generateCube', arguments);
  };
  
  Generator.prototype.generateSphere = function(blocks, block, x, y, z, radius, data = {}) {
    let xScale = data.xScale ?? 1,
        yScale = data.yScale ?? 1,
        zScale = data.zScale ?? 1,
        replace = data.replace ?? false;
    
    block = this.blockIDs[block];
    if (replace) replace = this.blockIDs[replace];
    
    let testBounds = [ 0, 0, 0 ];
    let px, py, pz;
    for (px = x - Math.ceil(radius * xScale); px <= x + Math.ceil(radius * xScale); px ++) {
      if (px < 0) continue;
      if (px > 31) break;
      for (py = y - Math.ceil(radius * yScale); py <= y + Math.ceil(radius * yScale); py ++) {
        if (py < 0 || (data.yMin && py < data.yMin)) continue;
        if (py > 31) break;
        for (pz = z - Math.ceil(radius * zScale); pz <= z + Math.ceil(radius * zScale); pz ++) {
          let ox = (x - px) / xScale;
          let oy = (y - py) / yScale;
          let oz = (z - pz) / zScale;
          if (pz < 0 || (ox * ox + oy * oy + oz * oz) > radius * radius) continue;
          if (pz > 31) break;
          if ((replace === false || blocks[px][py][pz] === replace) && (!data.chance || data.alea() < data.chance)) {
            blocks[px][py][pz] = block;
            this.testBounds(testBounds, px, py, pz);
          }
        }
      }
    }
    this.applyBounds(testBounds, 'generateCube', arguments);
  };
  
  Generator.prototype.generateBush = function(blocks, x, y, z) {
    this.generateCube(blocks, 'leaves', x - 1, y, z - 1, 3, 1, 3, { replace: 'air' });
    this.generateCube(blocks, 'leaves', x - 1, y + 1, z, 3, 1, 1, { replace: 'air' });
    this.generateCube(blocks, 'leaves', x, y + 1, z - 1, 1, 1, 3, { replace: 'air' });
  };

  Generator.prototype.generateTree = function(blocks, x, y, z, alea) {
    const treeType = alea() < 0.9,
          leafType = treeType ? 'jungle_leaves' : 'sakura_leaves',
          logType = treeType ? 'log' : 'sakura_log';
    
    const stemHeight = Math.floor(alea() * 5) + 5;
    this.generateCube(blocks, logType, x, y, z, 1, stemHeight, 1, { replace: 'air' });
    if (stemHeight >= 8) {
      let dir0x = Math.floor(alea() * 3) - 1, dir0z = Math.floor(alea() * 3) - 1,
          stemHeight0 = Math.floor(alea() * 5) + 3,
          dir1x = Math.floor(alea() * 3) - 1, dir1z = Math.floor(alea() * 3) - 1,
          stemHeight1 = Math.floor(alea() * 5) + 3;
      if (dir0x === 0 && dir0z === 0) dir0x = alea() > 0.5 ? 1 : -1;
      if (dir1x === 0 && dir1z === 0) dir1z = alea() > 0.5 ? 1 : -1;      
      if (dir0x !== 0) dir1x = -dir0x;
      else if (dir0z !== 0) dir1z = -dir0z;
      
      this.generateCube(blocks, logType, x + dir0x, y + stemHeight - 1, z + dir0z, 1, stemHeight0, 1, { replace: 'air' });
      this.generateCube(blocks, logType, x + dir1x, y + stemHeight - 2, z + dir1z, 1, stemHeight1, 1, { replace: 'air' });
      
      this.generateSphere(blocks, leafType, x + dir0x, y + stemHeight + stemHeight0 - 3, z + dir0z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
      this.generateSphere(blocks, leafType, x + dir1x, y + stemHeight + stemHeight1 - 3, z + dir1z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
    } else {
      if (alea() > 0.5) {
        let dir0x = Math.floor(alea() * 3) - 1, dir0z = Math.floor(alea() * 3) - 1,
            stemHeight0 = Math.floor(alea() * 3) + 5;
        this.generateCube(blocks, logType, x + dir0x, y + stemHeight - 1, z + dir0z, 1, stemHeight0, 1, { replace: 'air' });
        this.generateSphere(blocks, leafType, x + dir0x, y + stemHeight + stemHeight0 - 3, z + dir0z, alea() * 2 + 2, { replace: 'air', yScale: alea() * 0.4 + 0.8, alea: alea, chance: 0.8 });
      } else {
        let leafSize = alea();
        this.generateSphere(blocks, leafType, x, y + stemHeight - 2, z, leafSize < 0.5 ? 2.3 : 1.5, { replace: 'air', yScale: leafSize * 2 + 1, yMin: y + leafSize * 2 });
      }
    }    
  };

  Generator.prototype.generateChunk = function(x, y, z) {
    const blockIDs = this.blockIDs,
          blocks = [],
          heightMap = [],
          structureMap = [],
          output = new Uint16Array(32 * 32 * 32);
    // randomness
    const alea = Alea(this.seed + x + y + z);
    
    // height map
    for (let px = -2; px < 34; px ++) {
      heightMap[px] = [];
      for (let pz = -2; pz < 34; pz ++) {
        let height = 10;
        height += this.noise.noise2D((px + x * 32) / 300, (pz + z * 32) / 300) * 50;
        height += this.noise.noise2D((px + x * 32) / 20, (pz + z * 32) / 20) * 10;
        if (height < 0) height /= 20;
        heightMap[px][pz] = height;
      }
    }
    
    // structure map
    for (let px = -2; px < 34; px ++) {
      structureMap[px] = [];
      for (let pz = -2; pz < 34; pz ++) {
        let offset = this.noise.noise2D(Math.floor((px + x * 32 + 1000) / 10) * 10, Math.floor((pz + z * 32) / 10)) * 8;
        structureMap[px][pz] = this.noise.noise2D(Math.floor((px + x * 32 + offset) / 10) * 10, Math.floor((pz + z * 32 + offset) / 10) * 10) > 0.8;
      }
    }
    
    // jungle structure generation
    for (let px = -2; px < 34; px ++) {
      blocks[px] = [];
      for (let py = -2; py < 35; py ++) {
        blocks[px][py] = [];
        for (let pz = -2; pz < 34; pz ++) {
          blocks[px][py][pz] = ((y + px) % 3 === 0 || (py + Math.floor(heightMap[0][0] * 2)) % 4 === 0 || (y + pz) % 3 === 0) && alea() > 0.2 && (structureMap[px][pz] && (py + y * 32) < heightMap[Math.floor((px + 2) / 7)][Math.floor((pz + 2) / 7)] + 20) ? (py + y * 32 < heightMap[px][pz] + 5 ? (py + y * 32 < heightMap[px][pz] - 5 ? blockIDs.jungle_marble : blockIDs.tainted_marble) : blockIDs.marble) : blockIDs.air;
        }
      }
    }
    
    // stone and water
    for (let px = -2; px < 34; px ++) {
      //blocks[px] = [];
      for (let py = -2; py < 35; py ++) {
        //blocks[px][py] = [];
        for (let pz = -2; pz < 34; pz ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          let n0 = this.noise.noise3D(rx / 30, ry / 30, rz / 30);
          if (blocks[px][py][pz] === blockIDs.air) blocks[px][py][pz] = this.noise.noise3D(rx / 20, ry / 20, rz / 20) * 8 + this.noise.noise3D(rx / 50, ry / 50, rz / 50) * 15 + ry <= heightMap[px][pz] ? (heightMap[px][py] >= 30 && n0 > -0.2 && n0 < 0.2 ? blockIDs.andesite : blockIDs.stone) : blockIDs.air;
          if (blocks[px][py][pz] === blockIDs.air && ry <= 0) blocks[px][py][pz] = blockIDs.water;
        }
      }
    }

    // grassing and sanding
    for (let px = 0; px < 32; px ++) {
      for (let pz = 0; pz < 32; pz ++) {
        if (heightMap[px][pz] >= 30 && heightMap[px][pz] < 40) continue;
        for (let py = 0; py < 32; py ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          if (blocks[px][py][pz] !== blockIDs.stone) continue;
          
          if (blocks[px + 1][py][pz] === blockIDs.water || blocks[px - 1][py][pz] === blockIDs.water || blocks[px][py + 1][pz] === blockIDs.water || blocks[px][py][pz + 1] === blockIDs.water || blocks[px][py][pz - 1] === blockIDs.water) {
            blocks[px][py][pz] = blockIDs.sand;
          } else if (blocks[px][py + 1][pz] === blockIDs.air) {
            blocks[px][py][pz] = blockIDs.grass;
          } else if (blocks[px][py + 2][pz] === blockIDs.air || blocks[px][py + 3][pz] === blockIDs.air) {
            blocks[px][py][pz] = blockIDs.dirt;
          }

          // sanding grass/dirt
          if (blocks[px][py][pz] === blockIDs.grass || blocks[px][py][pz] === blockIDs.dirt) {
            let sand = false;
            for (let sx = -2; sx < 2; sx ++) {
              for (let sy = -2; sy < 2; sy ++) {
                for (let sz = -2; sz < 2; sz ++) {
                  if (blocks[px + sx][py + sy][pz + sz] === blockIDs.water) {
                    blocks[px][py][pz] = blockIDs.sand;
                    sx = sy = sz = 2;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // dirt downwards spreading into sand
    for (let px = 0; px < 32; px ++) {
      for (let pz = 0; pz < 32; pz ++) {
        for (let py = 0; py < 32; py ++) {
          if (blocks[px][py][pz] === blockIDs.sand && (blocks[px][py + 1][pz] === blockIDs.dirt || blocks[px][py + 1][pz] === blockIDs.grass || blocks[px][py + 2][pz] === blockIDs.dirt || blocks[px][py + 2][pz] === blockIDs.grass)) {
            blocks[px][py][pz] = blockIDs.dirt;
          }
        }
      }
    }

    // structures
    for (let px = 0; px < 32; px ++) {
      for (let py = 0; py < 32; py ++) {
        for (let pz = 0; pz < 32; pz ++) {
          let rx = px + x * 32;
          let ry = py + y * 32;
          let rz = pz + z * 32;
          if (blocks[px][py - 1][pz] === blockIDs.grass) {
            let chance = alea();
            if (chance > 0.99) this.generateTree(blocks, px, py, pz, alea);
            else if (chance > 0.96) this.generateBush(blocks, px, py, pz);
          }
          if (blocks[px][py][pz] === blockIDs.marble) {
            let chance = alea();
            if (chance > 0.95) this.generateBush(blocks, px, py, pz);
          }
        }
      }
    }
    
    for (let i = 0; i < 32 * 32 * 32; i ++) {
      let pos = Chunk.indexToPos(i);
      output[i] = blocks[pos[0]][pos[1]][pos[2]];
    }
    return output;
  };
  
  return Generator;

})();