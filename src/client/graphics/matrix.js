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