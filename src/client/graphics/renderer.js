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