#version 300 es
// Fog / mist / sandstorm — two layers of 4-octave value noise drifting in map space, mixed over
// the map toward uColor. Presets: mist, fog-thick, sandstorm.
// Use: a PixiJS v8 Filter on the map container (global) or on a masked region. Cost: 1 texture
// fetch + 8 noise samples (loop of 4) — Graphics C full screen, B on a region.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uDensity 0..1 · uSpeed drift × ·
// uScale noise features per square (0.1 = blobs 10 squares across) · uColor fog colour.
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
uniform float uScale;
uniform vec3 uColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float t = mod(uTime, 2000.0) * uSpeed;
  vec2 p = sq * uScale;
  float a = fbm(p + vec2(t * 0.05, t * 0.012));
  float b = fbm(p * 1.7 + vec2(-t * 0.03, t * 0.02) + 5.2);
  float fog = smoothstep(0.25, 0.85, a * 0.6 + b * 0.5) * uDensity;
  fog = min(fog, 0.9);
  finalColor = vec4(mix(base.rgb, uColor * base.a, fog), base.a);
}
