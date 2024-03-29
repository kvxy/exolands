// for tranlucent blocks
const alphaBlockVertSrc = 
` #version 300 es

  uniform mat4 projection;
  uniform mat4 camera;

  uniform vec3 chunkPosition;

  in uint vertex0;
  in uint vertex1;

  out vec3 textureData;
  out float shadeData;
  out vec3 viewPosition;

  void main() {
    float x = float(vertex0 & 1023u);
    float y = float((vertex0 & 1047552u) >> 10u);
    float z = float((vertex0) >> 20u);
    vec4 position = vec4(x + chunkPosition.x, y + chunkPosition.y, z + chunkPosition.z, 1.0f);

    gl_Position = projection * camera * position;

    float textureLayer = float(vertex1 & 1023u);
    float texcoordX = float((vertex1 & 31744u) >> 10u) * 0.0625f;
    float texcoordY = float((vertex1 & 1015808u) >> 15u) * 0.0625f;

    textureData = vec3(texcoordX, texcoordY, textureLayer);
    shadeData = float(vertex1 >> 20u) * 0.2f + 0.4f;
    viewPosition = (camera * position).xyz;
  }
`;

const alphaBlockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  uniform sampler2DArray diffuse;

  uniform vec4 fogColor;
  uniform float fogFar;
  
  in vec3 textureData;
  in float shadeData;
  in vec3 viewPosition;

  out vec4 outColor;

  void main() {
    outColor = mix(texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f), fogColor, smoothstep(0.0f, fogFar, length(viewPosition)));
  }
`;