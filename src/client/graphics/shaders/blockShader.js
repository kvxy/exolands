// for most blocks
const blockVertSrc = 
` #version 300 es

  uniform mat4 projection;
  uniform mat4 camera;

  uniform vec3 chunkPosition;

  in uint vertex0;
  in uint vertex1;

  out vec3 textureData;
  out float shadeData;
  out float distance;

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
    distance = length((camera * position).xyz);
  }
`;

const blockFragSrc = 
` #version 300 es

  precision highp float;
  precision highp int;
  precision highp sampler2DArray;
  
  uniform sampler2DArray diffuse;
  
  uniform vec4 fogColor;
  uniform float fogFar;

  in vec3 textureData;
  in float shadeData;
  in float distance;

  out vec4 outColor;

  void main() {
    float fogAmount = smoothstep(fogFar - 64.0f, fogFar, distance);
    vec4 color = texture(diffuse, textureData) * vec4(shadeData, shadeData, shadeData, 1.0f);
    
    outColor = mix(color, fogColor, fogAmount);
  
    if (color[3] < 0.4f) discard;
    outColor[3] = 1.0f;
  }
`;