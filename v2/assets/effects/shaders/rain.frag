#version 300 es
// Rain — falling streaks in three depth layers over the map, which darkens a little.
// Use: a PixiJS v8 Filter on the map container (global). Cost: 1 texture fetch + ~12 hashes per
// pixel, no loops — Graphics B on the TV box at 1080p.
// Uniforms (battlemap): uTime s · uSquarePx screen px per square · uMapOrigin screen px of square
// (0,0) · uDensity 0..1 share of streak cells lit · uSpeed ×(≈ 22 squares/s) · uAngle slant
// (x per y) · uDarken 0..1 · uColor streak colour.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uTime;
uniform float uSquarePx;
uniform vec2 uMapOrigin;
uniform float uDensity;
uniform float uSpeed;
uniform float uAngle;
uniform float uDarken;
uniform vec3 uColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// One layer: the plane cut into columns (0.25 / scale squares wide) and rows (2 / scale tall);
// a lit cell holds one streak at a random x and height.
float layer(vec2 sq, float scale, float speed) {
  vec2 p = sq * scale;
  p.x += p.y * uAngle;
  p.y -= mod(uTime, 1000.0) * speed * uSpeed;
  vec2 g = vec2(p.x * 4.0, p.y * 0.5);
  vec2 cell = floor(g);
  vec2 f = fract(g);
  if (hash(cell) > uDensity) return 0.0;
  float x = abs(f.x - (0.2 + 0.6 * hash(cell + 7.1)));
  float y0 = hash(cell + 3.3) * 0.55;
  float len = 0.22 + 0.2 * hash(cell + 1.7);
  float along = (f.y - y0) / len;
  float inside = step(0.0, along) * step(along, 1.0);
  return inside * (1.0 - smoothstep(0.0, 0.07, x)) * mix(0.25, 1.0, along);
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float r = layer(sq, 1.0, 11.0) * 0.55 + layer(sq, 1.7, 8.0) * 0.35 + layer(sq, 2.6, 6.0) * 0.22;
  vec3 col = base.rgb * (1.0 - uDarken) + uColor * r * base.a;
  finalColor = vec4(col, base.a);
}
