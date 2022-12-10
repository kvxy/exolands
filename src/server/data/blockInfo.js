
/*
  shape:
  ↳ cube: basic cube
  
  isInvisible: No mesh or texture
  
  isTransparent: Has alpha values of zero
  ↳ Make sure the MIPMAPS look good because all transparency is discarded in mipmaps, use isTranslucent if mipmaps require alpha
  
  isTranslucent: Has alpha values between 0-255
  
  texture: textures of block (shape dependent)
*/

const Blocks = (function() {

  const Blocks = {
    air: {
      isInvisible: true
    },
    stone: {
      shape: 'cube',
      texture: ['stone', 'stone', 'stone', 'stone', 'stone', 'stone']
    },
    dirt: {
      shape: 'cube',
      texture: ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt']
    },
    grass: {
      shape: 'cube',
      texture: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side']
    },
    leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: ['leaves', 'leaves', 'leaves', 'leaves', 'leaves', 'leaves']
    },
    glass: {
      shape: 'cube',
      isTransparent: true,
      texture: ['glass', 'glass', 'glass', 'glass', 'glass', 'glass']
    },
    white_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['white_glass', 'white_glass', 'white_glass', 'white_glass', 'white_glass', 'white_glass']
    },
    red_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['red_glass', 'red_glass', 'red_glass', 'red_glass', 'red_glass', 'red_glass']
    },
    blue_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass']
    },
    green_glass: {
      shape: 'cube',
      isTranslucent: true,
      texture: ['green_glass', 'green_glass', 'green_glass', 'green_glass', 'green_glass', 'green_glass']
    },
    water: {
      shape: 'water',
      isTranslucent: true,
      texture: ['blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass', 'blue_glass'],
    },
    sand: {
      shape: 'cube',
      texture: [ 'sand', 'sand', 'sand', 'sand', 'sand', 'sand' ]
    },
    log: {
      shape: 'cube',
      texture: [ 'log_side', 'log_side', 'log_core', 'log_core', 'log_side', 'log_side' ]
    },
    marble: {
      shape: 'cube',
      texture: [ 'marble', 'marble', 'marble', 'marble', 'marble', 'marble' ]
    },
    tainted_marble: {
      shape: 'cube',
      texture: [ 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble', 'tainted_marble' ]
    },
    jungle_marble: {
      shape: 'cube',
      texture: [ 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble', 'jungle_marble' ]
    },
    andesite: {
      shape: 'cube',
      texture: [ 'andesite', 'andesite', 'andesite', 'andesite', 'andesite', 'andesite' ]
    },
    jungle_leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: [ 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves' ]
    },
    sakura_log: {
      shape: 'cube',
      texture: [ 'sakura_log_side', 'sakura_log_side', 'sakura_log_core', 'sakura_log_core', 'sakura_log_side', 'sakura_log_side' ]
    },
    sakura_leaves: {
      shape: 'cube',
      isTransparent: true,
      texture: [ 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves', 'sakura_leaves' ]
    },
  };

  for (let b in Blocks) {
    let block = Blocks[b];
    if (block.isTranslucent && !block.shader) {
      block.shader = 'alpha';
    } else {
      block.shader = 'default';
    }
  }
  
  return Blocks;
  
})();