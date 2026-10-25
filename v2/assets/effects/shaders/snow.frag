#version 300 es
// Snow — round soft flakes in three depth layers, swaying, blown by wind.
// Use: a PixiJS v8 Filter on the map container (global). Cost: 1 texture fetch + ~15 hashes,
// no loops — Graphics B.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin (see rain.frag) · uDensity 0..1 ·
// uSpeed ×(≈ 1.5 squares/s) · uWind sideways drift (squares per square fallen) · uSize flake size ×.
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
uniform float uWind;
uniform float uSize;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// One layer: one candidate flake per cell (1 / scale squares), lit with probability uDensity.
float layer(vec2 sq, float scale, float speed, float seed) {
  float t = mod(uTime, 1000.0) * speed * uSpeed;
  vec2 p = sq * scale + vec2(-t * uWind, -t);
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash(cell + seed);
  if (h > uDensity) return 0.0;
  vec2 c = 0.25 + 0.5 * vec2(hash(cell + seed + 1.3), hash(cell + seed + 2.7));
  c.x += 0.12 * sin(uTime * 1.3 + h * 6.2831);
  float r = (0.05 + 0.05 * hash(cell + seed + 4.1)) * uSize * scale;
  return 1.0 - smoothstep(r * 0.35, r, length(f - c));
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float s = layer(sq, 0.9, 1.6, 0.0) + layer(sq, 1.5, 1.2, 11.0) * 0.75 + layer(sq, 2.4, 0.8, 23.0) * 0.5;
  vec3 col = mix(base.rgb, vec3(base.a), clamp(s, 0.0, 1.0) * 0.9);
  col = mix(col, col * 0.9 + 0.08 * base.a, uDensity * 0.4);   // a little winter haze
  finalColor = vec4(col, base.a);
}
