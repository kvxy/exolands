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