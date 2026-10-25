#version 300 es
// Cloud shadows — soft shadows of passing clouds slide over an outdoor map.
// Use: a PixiJS v8 Filter on the map container (global). Cost: 1 texture fetch + 4 noise samples —
// Graphics B.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uStrength 0..1 shadow depth · uSpeed × ·
// uScale cloud features per square · uWind direction (squares per second at speed 1).
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uTime;
uniform float uSquarePx;
uniform vec2 uMapOrigin;
uniform float uStrength;
uniform float uSpeed;
uniform float uScale;
uniform vec2 uWind;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.07 + 31.7; a *= 0.5; }
  return s;
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  vec2 p = (sq - uWind * mod(uTime, 4000.0) * 0.6 * uSpeed) * uScale;
  float shadow = smoothstep(0.48, 0.72, fbm(p)) * uStrength;
  finalColor = vec4(base.rgb * (1.0 - shadow) + vec3(0.0, 0.01, 0.03) * shadow * base.a, base.a);
}
