#version 300 es
// Heat haze — the picture beneath wobbles in rising waves (lava, forge, desert noon).
// Use: a PixiJS v8 Filter on the map container, ideally with a mask/region (filterArea) so only the
// hot area pays. Cost: 2 noise samples + 1 offset texture fetch — Graphics B on a region.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uStrength 0..1 (≈ 3 px at 1) ·
// uSpeed × · uScale wave size ×.  Pixi: uInputClamp keeps samples inside the input.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uSquarePx;
uniform vec2 uMapOrigin;
uniform float uStrength;
uniform float uSpeed;
uniform float uScale;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main(void) {
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float t = mod(uTime, 1000.0) * uSpeed;
  vec2 p = sq * 1.6 / uScale + vec2(0.0, t * 1.2);          // waves rise (screen up)
  vec2 off = vec2(noise(p) - 0.5, noise(p * 1.3 + 9.7) - 0.5);
  off *= uStrength * 6.0 * uInputSize.zw;                    // ≈ ±3 px at strength 1
  vec2 uv = clamp(vTextureCoord + off, uInputClamp.xy, uInputClamp.zw);
  finalColor = texture(uTexture, uv);
}
