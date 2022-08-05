const Generator = (function() {
  
  function make3DArray(x0, y0, x1, y1) {
    let out = [];
    for (let x = x0; x < x1; x ++) {
      out[x] = [];
      for (let y = y0; y < y1; y ++) {
        out[x][y] = [];
      }
    }
    return out;
  }

  function Generator(seed, blockIDS) {
    this.seed = seed;
    this.noise = new SimplexNoise(new Alea(seed));

    this.blockIDs = blockIDS;
  };

  Generator.prototype.generateCube = function(blocks, block, x, y, z, w, h, l, replace = false) {
    block = this.blockIDs[block];
    if (replace) replace = this.blockIDs[replace];

    let px, py, pz;
    for (px = x; px < x + w; px ++) {
      if (px < 0) continue;
      if (px > 31) break;
      for (py = y; py < y + h; py ++) {
        if (py < 0) continue;
        if (py > 31) break;
        for (pz = z; pz < z + l; pz ++) {
          if (pz < 0) continue;
          if (pz > 31) break;
          if (replace === false || blocks[px][py][pz] === replace) blocks[px][py][pz] = block;
        }
      }
    }
  };

  Generator.prototype.generateTree = function(blocks, x, y, z, rx, ry, rz) {
    this.generateCube(blocks, 'log', x, y, z, 1, 3, 1);
  };

  Generator.prototype.generateChunk = function(x, y, z) {
    const blockIDs = this.blockIDs,
          blocks = [],
          heightMap = [],
          structureMap = [],
          output = new Uint16Array(32 * 32 * 32);

    // height map
    for (let px = -2; px < 34; px ++) {
      heightMap[px] = [];
      for (let pz = -2; pz < 34; pz ++) {
        let height = 0;

        height = this.noise.noise2D((px + x * 32) / 300, (pz + z * 32) / 300) * 50 + 10;
        height += this.noise.noise2D((px + x * 32) / 20, (pz + z * 32) / 20) * 10;
        if (height < 0) height = 0;

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
          blocks[px][py][pz] = ((y + px) % 3 === 0 || (py + Math.floor(heightMap[0][0] * 2)) % 4 === 0 || (y + pz) % 3 === 0) && this.noise.noise3D(px + x * 32, py + y * 32, pz + z * 32) > -0.4 && (structureMap[px][pz] && (py + y * 32) < heightMap[Math.floor((px + 2) / 7)][Math.floor((pz + 2) / 7)] + 20) ? (py + y * 32 < heightMap[px][pz] + 5 ? (py + y * 32 < heightMap[px][pz] - 5 ? blockIDs.jungle_marble : blockIDs.tainted_marble) : blockIDs.marble) : blockIDs.air;
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
          if (blocks[px][py][pz] === blockIDs.air) blocks[px][py][pz] = this.noise.noise3D(rx / 20, ry / 20, rz / 20) * 8 + this.noise.noise3D(rx / 50, ry / 50, rz / 50) * 15 + ry <= heightMap[px][pz] ? blockIDs.stone : blockIDs.air;
          if (blocks[px][py][pz] === blockIDs.air && ry <= 0) blocks[px][py][pz] = blockIDs.water;
        }
      }
    }

    // grassing and sanding
    for (let px = 0; px < 32; px ++) {
      for (let pz = 0; pz < 32; pz ++) {
        if (heightMap[px][pz] >= 30) continue;
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
            let chance = this.noise.noise3D(rx * 7, ry * 7, rz * 7);
            if (chance > 0.86) this.generateTree(blocks, px, py, pz, rx, ry, rz);
          }
          if (blocks[px][py][pz] === blockIDs.marble) {
            let chance = this.noise.noise3D(rx * 7, ry * 7, rz * 7);
            if (chance > 0.86) this.generateCube(blocks, 'leaves', px - 1, py, pz - 1, 3, 2, 3, 'air');
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