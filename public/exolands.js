
/** ./src/client/clientsim.js **/


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


/** ./src/client/graphics/chunkGraphics.js **/

const ChunkGraphics = (function() {
  
  const vertSrc = 
  ` #version 300 es

    uniform mat4 projection;
    uniform mat4 camera;
    
    uniform vec3 chunkPosition;

    in uint vertex0;
    in uint vertex1;
    
    out vec3 textureData;
    out float shadeData;
    
    void main() {
      float x = float(vertex0 & 1023u);
      float y = float((vertex0 & 1047552u) >> 10u);
      float z = float((vertex0) >> 20u);
      
      gl_Position = projection * camera * vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);
      
      float textureLayer = float(vertex1 & 1023u);
      float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
      float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;
      
      textureData = vec3(texcoordX, texcoordY, textureLayer);
      shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
    }
  `; // float z = float((vertex0 & 1072693248u) >> 20u);
  const fragSrc = 
  ` #version 300 es
    
    precision highp float;
    precision highp int;
    precision highp sampler2DArray;
    
    uniform sampler2DArray diffuse;

    in vec3 textureData;
    in float shadeData;

    out vec4 outColor;

    void main() {
      outColor = texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f); 
    }
  `;
  
  function ChunkGraphics(world) {
    this.world = world;
    this.chunks = world.chunks;
    
    // camera position (make a camera object later rooted in sim)
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotX = 0;
    this.rotY = 0;

    this.chunkMeshes = {}; 
  }

  ChunkGraphics.prototype.init = function() {
    const canvas = document.getElementById('glcanvas');
    const gl = this.gl = canvas.getContext('webgl2');
    if (!gl) console.log('no gl :(');
    
    const renderer = this.renderer = new Renderer(gl, vertSrc, fragSrc);
    const program = renderer.program;
    gl.useProgram(program);
    
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // graphics
    const textures = this.textures = new Textures();
    textures.loadAll();
    textures.createTextureArray(gl);
    
    // uniforms
    const projectionLoc = gl.getUniformLocation(program, 'projection');
    const cameraLoc = gl.getUniformLocation(program, 'camera');
    
    const chunkPositionLoc = gl.getUniformLocation(program, 'chunkPosition');
    
    // projection
    const projectionMatrix = new mat4();
    function onResize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      projectionMatrix.perspective(1, gl.canvas.width / gl.canvas.height, 0.1, 2000);
      gl.uniformMatrix4fv(projectionLoc, false, projectionMatrix.data);
    }
    onResize();
    window.onresize = onResize;
    
    // TEMP CONTROLS
    const controls = new Controls();
    controls.mousemove = e => {
      this.rotY -= e.movementX / 500;
      this.rotX += e.movementY / 500;
      if (this.rotX > Math.PI / 2) this.rotX = Math.PI / 2;
      if (this.rotX < -Math.PI / 2) this.rotX = -Math.PI / 2;
    };
    
    // draw loop
    this.draw = function() {
      
      // TEMP CONTROLS
      const input = controls.input,
        speed = 0.2;
      let vx = (input.right - input.left) * speed;
      this.z += Math.cos(this.rotY + Math.PI / 2) * vx;
      this.x += Math.sin(this.rotY + Math.PI / 2) * vx;
      let vy = (input.up - input.down) * speed;
      this.y += vy;
      let vz = (input.back - input.forward) * speed;
      this.z += Math.cos(this.rotY) * vz;
      this.x += Math.sin(this.rotY) * vz;
      document.getElementById('xyz').textContent = `${Math.round(this.x * 1000) / 1000}\n${Math.round(this.y * 1000) / 1000}\n${Math.round(this.z * 1000) / 1000}`;
            
      gl.clearColor(0, 0.5, 0.8, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      // link camera to player entity later
      const cameraMatrix = new mat4();
      cameraMatrix.rotateX(this.rotX);
      cameraMatrix.rotateY(this.rotY);
      cameraMatrix.translate(-this.x, -this.y, -this.z);
      cameraMatrix.scale(0.0625, 0.0625, 0.0625);
      gl.uniformMatrix4fv(cameraLoc, false, cameraMatrix.data);
      
      for (let i in this.chunkMeshes) {
        const chunkMesh = this.chunkMeshes[i];
        if (chunkMesh.indices.length === 0) continue;
        if (chunkMesh.update) {
          chunkMesh.updateBuffers();
          chunkMesh.update = false;
        } 
        
        gl.uniform3f(chunkPositionLoc, chunkMesh.x * 512, chunkMesh.y * 512, chunkMesh.z * 512);
        gl.bindVertexArray(chunkMesh.vao);
        
        gl.drawElements(gl.TRIANGLES, chunkMesh.indices.length, gl.UNSIGNED_INT, 0);
      }
    };
  };
  
  ChunkGraphics.prototype.setBlock = function(x, y, z, block, prevBlockData) {
    if (block === prevBlockData.type) return -1; // UNLESS BLOCKDATA IS DIFFERENT (EG DIFFERENT ROTATION) ...OR JUST REMOVE...
    let prevBlockInfo = this.world.blockInfo(prevBlockData.type),
        blockInfo = this.world.blockInfo(block),
        chunkMesh = this.chunkMeshes[prevBlockData.chunkPos];    
    if (!prevBlockInfo.isInvisible || blockInfo.isInvisible) {
      chunkMesh.removeBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z);
    }
    if (!blockInfo.isInvisible) {
      chunkMesh.addBlock(prevBlockData.x, prevBlockData.y, prevBlockData.z, block);
    }
  };
  
  // loads a chunk's mesh
  ChunkGraphics.prototype.loadChunk = function(x, y, z) {    
    const c = [x, y, z];
    if (this.chunkMeshes[c]) return;
    const chunkMesh = this.chunkMeshes[c] = new ChunkMesh(this.chunks[c], this.gl, this.renderer, this.world, this.chunkMeshes, this.textures);
    //this.chunks[c].mesh = chunkMesh;
    chunkMesh.load();
    chunkMesh.update = false;
  };

  return ChunkGraphics;
  
})();


/** ./src/client/graphics/chunkMesh.js **/

const ChunkMesh = (function() {
  
  function ChunkMesh(...args) {
    [ this.chunk, this.gl, this.renderer, this.world, this.chunkMeshes, this.textures ] = args;
    [ this.x, this.y, this.z ] = [ this.chunk.x, this.chunk.y, this.chunk.z ];
    
    this.vertex0 = [];
    this.vertex1 = [];
    this.indices = [];
    
    this.update = false;
  }
  
  // compresses vertex data into uInt32 format and pushes it to vertex lists
  ChunkMesh.prototype.addVertex = function(x, y, z, textureLayer = 2, texcoordX = 0, texcoordY = 0, shade = 3) {
    // [ 10 bitx X, 10 bits Y, 10 bits Z, 2 bits empty ]
    this.vertex0.push( x | (y << 10) | (z << 20)); // use this to sort
    // [ 10 bits texture layer, 5 bits texcoord x, 5 bits texcoord y, 2 bits shading, 10 bits empty ]
    this.vertex1.push( textureLayer | (texcoordX << 10) | (texcoordY << 15) | (shade << 20) );
    this.update = true;
    return this.vertex0.length - 1;
  };
  
  // creates vao and mesh
  ChunkMesh.prototype.load = function() {
    const gl = this.gl,
          renderer = this.renderer,
          blocks = this.chunk.blocks,
          world = this.world;
    let x, y, z, p, pos, blockInfo, otherBlockInfo, tx, ty, tz, blockData;
    for (z = 0; z < 32; z ++) {
      for (y = 0; y < 32; y ++) {
        for (x = 0; x < 32; x ++) {
          blockInfo = world.blockInfo(blocks[Chunk.posToIndex(x, y, z)]);
          for (p = 0; p < 3; p ++) {
            pos = p === 0 ? x : p === 1 ? y : z;
            // INNER MESH
            otherBlockInfo = world.blockInfo(blocks[Chunk.posToIndex(x + (p === 0), y + (p === 1), z + (p === 2))]);
            if (blockInfo.isInvisible || blockInfo.isTranslucent) {
              if (pos < 31 && !otherBlockInfo.isInvisible) { // AND DIFFERENT FROM BLOCKINFO BLOCK
                this.addCubeFace(x + (p === 0), y + (p === 1), z + (p === 2), p * 2 + 1, this.textures.textureKeys[otherBlockInfo.texture[p * 2 + 1]]);
              }
            }
            if (!blockInfo.isInvisible) {
              if (pos < 31 && (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent)) { // AND DIFFERENT BLOCK
                this.addCubeFace(x, y, z, p * 2, this.textures.textureKeys[blockInfo.texture[p * 2]]);
              }
            }
            // OUTER MESH
            if (pos === 0 || pos === 31) {
              blockData = this.chunk.getBlockData(
                p === 0 ? x + (x === 31) - (x === 0) : x,
                p === 1 ? y + (y === 31) - (y === 0) : y,
                p === 2 ? z + (z === 31) - (z === 0) : z
              );
              if (blockData !== undefined) {
                otherBlockInfo = world.blockInfo(blockData.type);
                if (!blockInfo.isInvisible && (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent)) {
                  this.addCubeFace(x, y, z, p * 2 + (pos === 0), this.textures.textureKeys[blockInfo.texture[p * 2]]);
                }
                if (!otherBlockInfo.isInvisible && (blockInfo.isInvisible || blockInfo.isTranslucent)) {
                  this.chunkMeshes[blockData.chunkPos].addCubeFace(blockData.x, blockData.y, blockData.z, p * 2 + (pos === 31), this.textures.textureKeys[otherBlockInfo.texture[p * 2 + (pos === 31)]]);
                }
              }
            }
          }
        }
      }
    }
    
    // load vao
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    
    const vertex0Buffer = this.vertex0Buffer = gl.createBuffer();
    renderer.assignAttribI('vertex0', vertex0Buffer, 1, gl.UNSIGNED_INT, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex0Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);
    
    const vertex1Buffer = this.vertex1Buffer = gl.createBuffer();
    renderer.assignAttribI('vertex1', vertex1Buffer, 1, gl.UNSIGNED_INT, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex1Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex1), gl.DYNAMIC_DRAW);
    
    const indexBuffer = this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.DYNAMIC_DRAW);
  };
  
  // updates buffers (called automatically in chunkGraphics when this.update === true)
  ChunkMesh.prototype.updateBuffers = function() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex0Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex0), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex1Buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(this.vertex1), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), gl.DYNAMIC_DRAW);
  };
  
  // generates the vertex0 for cube-type blocks (x, y, z)
  ChunkMesh.prototype.cubeFacePosition = function(x, y, z, dir) {
    const n = 16;
    x *= n;
    y *= n;
    z *= n;
    switch(dir) {
      case 0: return [ x + n, y, z, x + n, y + n, z, x + n, y + n, z + n, x + n, y, z + n ]; // positive x [ 1,0,0, 1,0,1, 1,1,1, 1,1,1, 1,1,0, 1,0,0 ]
      case 1: return [ x, y, z, x, y, z + n, x, y + n, z + n, x, y + n, z ];                 // negative x [ 0,0,0, 0,0,1, 0,1,1, 0,1,1, 0,1,0, 0,0,0 ]
      case 2: return [ x, y + n, z, x, y + n, z + n, x + n, y + n, z + n, x + n, y + n, z ]; // positive y [ 0,1,0, 0,1,1, 1,1,1, 1,1,1, 1,1,0, 0,1,0 ]
      case 3: return [ x + n, y, z + n, x, y, z + n, x, y, z, x + n, y, z ];                 // negative y [ 1,0,1, 0,0,1, 0,0,0, 0,0,0, 1,0,0, 1,0,1 ]
      case 4: return [ x, y, z + n, x + n, y, z + n, x + n, y + n, z + n, x, y + n, z + n ]; // positive z [ 0,0,1, 1,0,1, 1,1,1, 1,1,1, 0,1,1, 0,0,1 ]
      case 5: return [ x, y, z, x, y + n, z, x + n, y + n, z, x + n, y, z ];                 // negative z [ 0,0,0, 0,1,0, 1,1,0, 1,1,0, 1,0,0, 0,0,0 ]
    }
  };
  
  // generates texcoords for cube-type blocks (texcoordX, texcoordY)
  ChunkMesh.prototype.cubeFaceTexcoord = function(orientation = 0) {
    switch(orientation) {
      case 0: return [ 0, 0, 0, 16, 16, 16, 16, 0 ];
      case 1: return [ 16, 0, 0, 0, 0, 16, 16, 16 ];
      case 2: return [ 16, 16, 16, 0, 0, 0, 0, 16 ];
      case 3: return [ 0, 16, 16, 16, 16, 0, 0, 0 ];
    }
  };
  
  // adds one of the six square faces on cubes
  ChunkMesh.prototype.addCubeFace = function(x, y, z, dir, texture) {
    const pos = this.cubeFacePosition(x, y, z, dir),
          texcoord = this.cubeFaceTexcoord([2, 3, 0, 0, 3, 2][dir]),
          shading = [1, 1, 3, 0, 2, 2][dir],
          a = this.addVertex(pos[0], pos[1], pos[2], texture, texcoord[0], texcoord[1], shading),
          b = this.addVertex(pos[3], pos[4], pos[5], texture, texcoord[2], texcoord[3], shading),
          c = this.addVertex(pos[6], pos[7], pos[8], texture, texcoord[4], texcoord[5], shading),
          d = this.addVertex(pos[9], pos[10], pos[11], texture, texcoord[6], texcoord[7], shading);
    this.indices.push(
      a, b, c,
      c, d, a
    );
  };
  
  // removes a rectangular face
  ChunkMesh.prototype.removeFace = function(facePosition) {
    let index = this.findFace(facePosition);
    if (index === -1) return;
    this.vertex0[index] = this.vertex0[index + 1] = this.vertex0[index + 2] = this.vertex0[index + 3] = NaN;
    this.vertex1[index] = this.vertex1[index + 1] = this.vertex1[index + 2] = this.vertex1[index + 3] = NaN;
    this.indices.splice(this.indexBinarySearch(index), 6);
      
    this.update = true;
  };
  
  // returns starting index of a face (4 vertices per face)
  ChunkMesh.prototype.findFace = function(facePosition) {
    for (let i = 0; i < this.vertex0.length; i += 4) {
      if (this.vertex0[i] === NaN) continue;
      if (
        (facePosition[0] | (facePosition[1] << 10) | (facePosition[2] << 20)) === this.vertex0[i] && 
        (facePosition[3] | (facePosition[4] << 10) | (facePosition[5] << 20)) === this.vertex0[i + 1] && 
        (facePosition[6] | (facePosition[7] << 10) | (facePosition[8] << 20)) === this.vertex0[i + 2] && 
        (facePosition[9] | (facePosition[10] << 10) | (facePosition[11] << 20)) === this.vertex0[i + 3]
      ) {
        return i;
      }
    }
    return -1;
  };
  
  // finds index of a 'this.indices' given the index of a starting vertex0 (always a multiple of 4)
  ChunkMesh.prototype.indexBinarySearch = function(index) {
    let mid, min = 0, max = this.indices.length;
    while (min <= max) {
      mid = Math.floor((min + max) / 12) * 6;
      if (index > this.indices[mid]) {
        min = mid + 6;
      } else if (index < this.indices[mid]) {
        max = mid - 6;
      } else {
        return mid;
      } 
    }
    return -1;
  };
  
  // adds/removes block's mesh and updates neighbors
  ChunkMesh.prototype.updateBlock = function(x, y, z, add, block) {
    let blockInfo;
    if (add) {
      blockInfo = this.world.blockInfo(block);
      if (blockInfo.isInvisible) return;
    }
    
    let tx, ty, tz, i, otherBlockInfo, otherBlockData;
    for (i = 0; i < 6; i ++) {
      tx = (i === 0) - (i === 1);
      ty = (i === 2) - (i === 3);
      tz = (i === 4) - (i === 5);
      otherBlockData = this.chunk.getBlockData(x + tx, y + ty, z + tz);
      if (otherBlockData === undefined) continue;
      otherBlockInfo = this.world.blockInfo(otherBlockData.type);
      if (otherBlockInfo.isInvisible || otherBlockInfo.isTranslucent) {
        if (add) {
          this.addCubeFace(x, y, z, i, this.textures.textureKeys[blockInfo.texture[i]]);
        } else {
          this.removeFace(this.cubeFacePosition(x, y, z, i));
        }
      }
      if (!otherBlockInfo.isInvisible) { // ASSUMES CUBE POSITION
        if (add) {
          this.chunkMeshes[otherBlockData.chunkPos].removeFace(this.cubeFacePosition(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1)));
        } else {
          this.chunkMeshes[otherBlockData.chunkPos].addCubeFace(otherBlockData.x, otherBlockData.y, otherBlockData.z, i + (i % 2 === 0 ? 1 : -1), this.textures.textureKeys[otherBlockInfo.texture[i + (i % 2 === 0 ? 1 : -1)]]);
        }
      }
    }
  };
  
  // adds a block's mesh (current block at x y z must be air) and updates neighbors
  ChunkMesh.prototype.addBlock = function(x, y, z, block) {
    this.updateBlock(x, y, z, true, block);
  };
  
  // removes a block's mesh and updates neighbors
  ChunkMesh.prototype.removeBlock = function(x, y, z) {
    this.updateBlock(x, y, z, false);
  };
  
  return ChunkMesh;
  
})();


/** ./src/client/graphics/matrix.js **/

function mat4() {
  this.data = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

mat4.prototype.perspective = function(fov, aspect, near, far) {
  let fy = 1 / Math.tan(fov / 2),
      fx = fy / aspect,
      nf = 1 / (near - far),
      a  = (near + far) * nf,
      b  = 2 * near * far * nf;
  this.data = [
    fx, 0,  0,  0,
    0,  fy, 0,  0,
    0,  0,  a, -1,
    0,  0,  b,  0
  ];
};

mat4.prototype.translate = function(x, y, z) {
  let d = this.data;
  d[12] += x * d[0] + y * d[4] + z * d[8];
  d[13] += x * d[1] + y * d[5] + z * d[9];
  d[14] += x * d[2] + y * d[6] + z * d[10];
  d[15] += x * d[3] + y * d[7] + z * d[11];
};

mat4.prototype.scale = function(x, y, z) {
  let d = this.data;
  d[0] *= x;
  d[1] *= x;
  d[2] *= x;
  d[3] *= x;
  d[4] *= y;
  d[5] *= y;
  d[6] *= y;
  d[7] *= y;
  d[8] *= z;
  d[9] *= z;
  d[10] *= z;
  d[11] *= z;
};

mat4.prototype.rotateX = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      d4 = d[4], d5 = d[5], d6 = d[6],   d7 = d[7],
      d8 = d[8], d9 = d[9], d10 = d[10], d11 = d[11];
  d[4]  =  c * d4 + s * d8;
  d[5]  =  c * d5 + s * d9;
  d[6]  =  c * d6 + s * d10;
  d[7]  =  c * d7 + s * d11;
  d[8]  = -s * d4 + c * d8;
  d[9]  = -s * d5 + c * d9;
  d[10] = -s * d6 + c * d10;
  d[11] = -s * d7 + c * d11;
};

mat4.prototype.rotateY = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      d0 = d[0], d1 = d[1], d2 = d[2],   d3 = d[3],
		  d8 = d[8], d9 = d[9], d10 = d[10], d11 = d[11];
  d[0]  =  c * d0 + s * d8;
  d[1]  =  c * d1 + s * d9;
  d[2]  =  c * d2 + s * d10;
  d[3]  =  c * d3 + s * d11;
  d[8]  = -s * d0 + c * d8;
  d[9]  = -s * d1 + c * d9;
  d[10] = -s * d2 + c * d10;
  d[11] = -s * d3 + c * d11;
};

mat4.prototype.rotateZ = function(theta) {
  let d = this.data,
      s = Math.sin(theta),
      c = Math.cos(theta),
      a0 = d[0], a1 = d[1], a2 = d[2],   a3 = d[3],
      d4 = d[4], d5 = d[5], d6 = d[6],   d7 = d[7];
  d[0] =  c * a0 + s * d4;
  d[1] =  c * a1 + s * d5;
  d[2] =  c * a2 + s * d6;
  d[3] =  c * a3 + s * d7;
  d[4] = -s * a0 + c * d4;
  d[5] = -s * a1 + c * d5;
  d[6] = -s * a2 + c * d6;
  d[7] = -s * a3 + c * d7;
};

mat4.multiply = function(m0, m1) {
  const mOut = new mat4().data;
  m0 = m0.data ?? m0;
  m1 = m1.data ?? m1;
  for (let i = 0; i < 4; i ++) {
		for (let j = 0; j < 4; j ++) {
			mOut[i * 4 + j] = 0;
			for (let k = 0; k < 4; k ++) {
				mOut[i * 4 + j] += m0[i * 4 + k] * m1[k * 4 + j];
			}
		}
	}
  return mOut;
};

mat4.transformVec4 = function(m, v) {
  const vOut = [0, 0, 0, 0];
  m = m.data ?? m;
  for (let i = 0; i < 4; i ++) {
    for (let j = 0; j < 4; j ++) {
      vOut[i] += m[j * 4 + i] * v[j];
    }
  }
  return vOut;
};


/** ./src/client/graphics/renderer.js **/

function Renderer(gl, vertSrc, fragSrc) {
  this.gl = gl;
  // vertex shader
  const vertShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertShader, vertSrc);
  gl.compileShader(vertShader);

  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) 
    return console.log(gl.getShaderInfoLog(vertShader));

  // fragment shader
  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragShader, fragSrc);
  gl.compileShader(fragShader);

  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))
    return console.log(gl.getShaderInfoLog(fragShader));
  
  // program
  const program = this.program =  gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    return console.log(gl.getProgramInfoLog(program));
};

Renderer.prototype.assignAttrib = function(name, buffer, size, type, stride, offset = 0) {
  const gl = this.gl,
        loc = gl.getAttribLocation(this.program, name);
  gl.enableVertexAttribArray(loc);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(loc, size, type, false, stride, offset);
};

Renderer.prototype.assignAttribI = function(name, buffer, size, type, stride, offset = 0) {
  const gl = this.gl,
        loc = gl.getAttribLocation(this.program, name);
  gl.enableVertexAttribArray(loc);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribIPointer(loc, size, type, false, stride, offset);
};

Renderer.prototype.createTexture = function(url) {
  const gl = this.gl,
        texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));

  let image = new Image(); 
  image.src = url;
  image.addEventListener('load', function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  });
};

Renderer.prototype.createTextureArray = async function(urls, width, height) {
  const gl = this.gl,
        texture = gl.createTexture(),
        pixels = [];
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
  for (let url of urls) {
    let image = new Image();
    image.src = url;
    await new Promise((resolve, reject) => {
      image.addEventListener('load', function() {
        // use canvas to create texture array
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        pixels.push(...new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer));
        resolve();
      });
    });
  }
  
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, width, height, urls.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixels));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  return texture;
};


/** ./src/client/graphics/textures.js **/


function Textures() {  
  this.height = 16;
  this.width = 16;
  this.data = {
    grass_top: [[0,1,1,2,1,1,3,1,2,1,2,1,1,2,1,2,1,2,0,1,3,0,2,1,0,1,1,0,0,1,3,1,1,1,1,2,1,2,1,1,3,2,1,2,2,1,1,0,0,2,0,1,1,1,0,0,1,1,0,2,1,3,3,1,1,1,1,3,3,1,0,2,1,2,2,1,0,1,3,3,2,1,1,0,1,0,3,1,2,1,2,1,2,1,1,1,1,0,2,1,1,2,3,1,0,3,0,1,3,1,3,1,0,2,3,0,2,1,1,2,1,2,1,2,1,2,1,0,1,3,1,1,1,3,1,0,2,1,1,0,1,3,0,1,1,3,1,2,1,1,2,1,1,3,0,1,2,0,1,0,1,0,3,1,2,0,1,3,2,1,2,2,1,1,1,1,2,1,1,1,2,3,2,0,1,0,2,1,0,2,3,2,1,1,2,0,1,2,1,0,2,1,2,3,2,1,2,1,1,3,1,3,1,0,1,2,1,2,1,1,3,0,2,1,0,2,1,1,2,2,1,0,2,1,3,1,1,2,1,1,1,1,2,0,1,1,2,1,2,0,3,1,0,1,1,3],[[54,86,41,255],[63,103,46,255],[72,118,53,255],[83,135,62,255]]],
    grass_side: [[0,1,1,2,1,1,0,3,1,1,0,1,0,1,1,2,0,3,1,1,0,3,1,2,1,2,0,0,1,2,0,1,0,2,0,2,0,2,4,1,0,3,0,2,1,3,0,2,1,2,0,3,4,2,4,2,0,4,1,2,1,2,1,2,1,4,0,2,4,4,4,2,0,4,1,3,4,4,1,4,4,5,4,4,4,5,4,4,1,4,4,4,4,5,4,4,6,6,5,5,5,7,6,4,4,5,6,6,8,5,5,8,8,6,6,5,6,6,6,5,5,8,8,8,5,5,4,4,5,5,4,4,6,6,6,7,5,5,4,4,5,6,7,4,5,6,7,4,5,8,6,6,6,6,4,5,6,6,7,5,8,6,6,6,5,8,8,6,6,8,5,8,8,6,6,5,8,8,6,6,4,5,8,8,5,5,4,4,8,8,5,5,5,6,6,8,4,4,5,5,5,8,8,4,4,4,5,6,5,6,6,4,4,4,5,7,4,4,8,4,4,5,5,4,5,5,4,4,6,4,8,6,7,4,5,5,6,6,7,4,5,8,6,4,5,5,6,6,6,5,5,8,6,6,6,5],[[54,86,41,255],[63,103,46,255],[72,118,53,255],[83,135,62,255],[74,55,43,255],[81,61,47,255],[117,87,68,255],[138,102,79,255],[106,79,61,255]]],
    dirt: [[0,1,2,3,3,4,0,0,0,3,4,0,0,0,0,3,3,2,2,4,3,3,4,0,0,3,2,4,4,2,2,3,3,4,0,0,1,3,4,4,3,2,2,2,2,2,1,3,3,4,0,0,0,3,3,3,3,4,1,2,2,4,0,0,3,4,0,0,4,3,4,3,4,0,0,0,3,4,0,0,3,3,4,4,2,2,3,3,4,0,0,1,0,3,4,0,0,3,2,2,2,1,0,3,4,0,0,0,4,3,3,4,4,2,2,2,0,0,0,2,2,4,4,4,3,3,2,2,3,3,2,3,0,0,0,1,2,2,3,3,3,0,1,2,3,0,1,3,3,4,0,0,0,0,3,3,0,0,1,3,4,0,0,0,3,4,4,0,0,4,3,4,4,0,0,3,4,4,0,0,2,3,4,4,3,3,2,2,4,4,3,3,3,0,0,4,2,2,3,3,3,4,4,2,2,2,3,0,3,0,0,2,2,2,3,1,2,2,4,2,2,3,3,2,3,3,2,2,0,2,4,0,1,2,3,3,0,0,1,2,3,4,0,2,3,3,0,0,0,3,3,4,0,0,0,3],[[117,87,68,255],[138,102,79,255],[74,55,43,255],[81,61,47,255],[106,79,61,255]]],
    stone: [[0,0,1,2,3,0,0,0,1,1,1,0,1,3,0,0,2,0,2,2,2,2,0,1,2,2,2,3,1,0,0,3,4,0,1,4,2,1,1,4,4,4,2,1,0,0,2,2,0,0,1,1,1,1,1,1,1,4,1,1,3,0,1,4,1,1,3,3,1,2,2,3,1,1,1,2,2,3,1,1,1,2,2,2,0,4,2,2,2,3,1,4,4,2,2,1,0,4,4,2,0,0,4,4,4,1,0,4,4,4,1,1,0,0,4,1,0,0,1,1,1,1,0,0,0,0,1,3,2,0,1,1,3,3,1,0,0,2,3,0,0,2,2,2,4,1,1,2,2,2,2,0,4,2,2,3,1,4,2,2,1,1,4,4,4,4,2,0,4,4,4,1,1,4,4,0,1,1,0,0,4,0,1,1,4,1,1,0,0,0,1,1,1,2,3,0,1,1,3,1,1,1,4,0,2,0,0,1,4,4,2,1,1,2,2,2,3,1,0,0,2,3,1,1,5,4,1,1,0,0,4,2,2,2,1,4,4,2,2,0,5,5,2,2,3,0,0,4,4,1,1,1,4,4,4,0],[[56,56,56,255],[62,62,62,255],[105,97,90,255],[120,110,102,255],[90,90,90,255],[57,57,57,255]]]
  };
  this.textureIDs = [];
  this.textureKeys = {};
  this.textureKeyCount = 0;
  
  this.pixels = [];
};

Textures.prototype.load = function(texture) {
  let d = this.data[texture],
      pixels = d[0],
      colors = d[1];
  if (!d) return;
  this.textureIDs.push(texture);
  this.textureKeys[texture] = this.textureKeyCount ++;
  for (let i = 0; i < pixels.length; i ++) {
    this.pixels.push(...colors[pixels[i]]);
  }
};

Textures.prototype.loadAll = function() {
  for (let d in this.data) {
    this.load(d);
  }
};

Textures.prototype.createTextureArray = function(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, this.width, this.height, this.pixels.length / 256 / 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.pixels));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  return texture;
};


/** ./src/client/main.js **/


(function() {
  
  let then = 0;
  let tick = 0;
  
  const fpsElem = document.getElementById('fps');
  function fps(now) {
    now *= 0.001;
    const deltaTime = now - then;
    then = now;
    const fps = 1 / deltaTime * 60;
    fpsElem.textContent = fps.toFixed(1);
  }

  window.onload = function() {
    const sim = window.sim = new Sim();
    sim.client = true;
    sim.server = true;
    sim.init();
    
    for (let x = -4; x < 4; x ++) {
      for (let y = -1; y < 3; y ++) {
        for (let z = -4; z < 4; z ++) {
          sim.generateChunk(x, y, z);
        }
      }
    }

    draw();
    function draw(now) {
      if (tick % 60 === 0) fps(now);
      sim.draw();
      tick ++;
      requestAnimationFrame(draw);
    }
  };
  
})();


/** ./src/client/tempcontrols.js **/

function Controls(keymap) {
  this.keymap = keymap || {
    87: 'forward', // w
    83: 'back',    // s
    65: 'left',    // a
    68: 'right',   // d
    32: 'up',      // space
    16: 'down',    // shift
    17: 'lock'     // ctrl
  };
  this.input = Object.fromEntries(Object.entries(this.keymap).map(a => [a[1], false]));

  this.mousemove = e => {};
  this.mousedown = e => {};

  // event listeners
  window.addEventListener('mousemove', e => this.mousemove(e));
  window.addEventListener('mousedown', e => this.mousedown(e));

  window.addEventListener('keydown', () => {
    this.input[this.keymap[event.keyCode]] = true;
    if (this.input.lock) document.getElementById('glcanvas').requestPointerLock();
  });
  window.addEventListener('keyup', () => {
    this.input[this.keymap[event.keyCode]] = false;
  });
}


/** ./src/server/data/blockInfo.js **/


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
    texture: ['grass_side', 'grass_side', 'grass_top', 'grass_top', 'grass_side', 'grass_side']
  },
};


/** ./src/server/serversim.js **/


const ServerSim = {};

ServerSim.init = function() {
  
};


/** ./src/server/world/chunk.js **/

function Chunk(...args) {
  [ this.x, this.y, this.z, this.blocks, this.blockIDs, this.chunks ] = args;
}

Chunk.posToIndex = function(x, y, z) {
  return x + y * 32 + z * 1024;
};

Chunk.indexToPos = function(n) {
  return [ n % 32, (n >>> 5) % 32, (n >>> 10) % 32 ];
};

// allows for getting blocks outside of the chunk bordering said chunk
Chunk.prototype.getBlockType = function(x, y, z) {
  const tx = (x === 32) - (x === -1),
        ty = (y === 32) - (y === -1),
        tz = (z === 32) - (z === -1);
  if (tx + ty + tz !== 0) {
    const chunk = this.chunks[[ this.x + tx, this.y + ty, this.z + tz ]];
    return this.blockIDs[chunk === undefined ? undefined : chunk.blocks[Chunk.posToIndex(tx === 0 ? x : tx === 1 ? 0 : 31, ty === 0 ? y : ty === 1 ? 0 : 31, tz === 0 ? z : tz === 1 ? 0 : 31)]];
  }
  return this.blockIDs[this.blocks[Chunk.posToIndex(x, y, z)]];
};

// getBlockType but gets more data { type, chunk object, x, y, z, index }
Chunk.prototype.getBlockData = function(x, y, z) {
  const tx = (x === 32) - (x === -1),
        ty = (y === 32) - (y === -1),
        tz = (z === 32) - (z === -1),
        chunkPos = [ this.x + tx, this.y + ty, this.z + tz ];
  if (tx + ty + tz !== 0) {
    let chunk = this.chunks[chunkPos];
    if (chunk === undefined) return undefined;
    let pos = [ tx === 0 ? x : tx === 1 ? 0 : 31, ty === 0 ? y : ty === 1 ? 0 : 31, tz === 0 ? z : tz === 1 ? 0 : 31 ],
        index = Chunk.posToIndex(...pos);
    return { type: this.blockIDs[chunk.blocks[index]], id: chunk.blocks[index], chunk: chunk, chunkPos: chunkPos, x: pos[0], y: pos[1], z: pos[2], index: index };
  }
  let index = Chunk.posToIndex(x, y, z);
  return { type: this.blockIDs[this.blocks[index]], chunk: this, chunkPos: chunkPos, x: x, y: y, z: z, index: index };
};

Chunk.prototype.setBlock = function(x, y, z, block, data) {
  this.blocks[Chunk.posToIndex(x, y, z)] = block;
};


/** ./src/server/world/generator.js **/

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
    
    blocks[i] = (bheight < height - 2) ? 1 : (bheight < height - 1) ? (Math.random() < 0.3 ? 1 : 2) : (bheight < height) ? 2 : (bheight === height) ? 3 : 0;
  }
  /*
  for (let i = 0; i < 32 * 32 * 32; i ++) {
    let p = Chunk.indexToPos(i);
    blocks.push(p[1] + y * 32 < (10 + ((x + z) * 7) % 10) ? 1 : 0);
  }*/
  
  return blocks;
};



/** ./src/server/world/world.js **/

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


/** ./src/sim.js **/


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

