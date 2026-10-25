#version 300 es
// battlemap effects — the standard PixiJS v8 filter vertex shader (GLSL ES 3.0), shared by every
// fragment in this folder. Pixi fills uInputSize / uOutputFrame / uOutputTexture itself.
// vTextureCoord runs over the filter's input texture (0 .. frame size / input size, not 0..1).
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;     // xy: input texture size px, zw: 1 / size
uniform vec4 uOutputFrame;   // xy: frame origin on screen px, zw: frame size px
uniform vec4 uOutputTexture; // xy: output size px, z: y-flip sign

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
