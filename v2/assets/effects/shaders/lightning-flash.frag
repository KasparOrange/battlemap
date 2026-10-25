#version 300 es
// Lightning flashes — every few seconds (randomly placed in time) the whole table lights up
// in a double flash, as from a storm overhead.
// Use: a PixiJS v8 Filter on the map container (global); combine with rain-storm. Cost: 1 texture
// fetch, a few hashes — Graphics A. Render on demand is fine: animate only while a flash runs.
// Uniforms (battlemap): uTime · uEvery mean seconds between flashes · uStrength 0..1 · uColor.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uEvery;
uniform float uStrength;
uniform vec3 uColor;

float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// Flash brightness at time t: one flash per uEvery-long slot, at a random moment in it.
float flash(float t) {
  float k = floor(t / uEvery);
  float start = (k + 0.1 + 0.6 * hash1(k)) * uEvery;
  float dt = t - start;
  if (dt < 0.0) return 0.0;
  float f = exp(-dt * 14.0) + 0.7 * step(0.16, dt) * exp(-(dt - 0.16) * 9.0);
  return f * step(0.35, hash1(k + 7.0));      // some slots stay dark
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  float f = clamp(flash(mod(uTime, 10000.0)), 0.0, 1.0) * uStrength;
  vec3 col = base.rgb + (uColor * base.a - base.rgb * 0.3) * f * 0.8;
  finalColor = vec4(col, base.a);
}
