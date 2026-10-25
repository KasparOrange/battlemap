#version 300 es
// Underwater — light caustics dancing over the map, a blue-green tint and a slow wobble.
// Use: a PixiJS v8 Filter on the map container (global) or a flooded region.
// Cost: 1 offset texture fetch + a 5-step iterated wave pattern — Graphics C full screen.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uStrength 0..1 · uSpeed × ·
// uScale caustic cells per square · uTint water colour multiplied in. Pixi: uInputClamp.
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
uniform vec3 uTint;

// The classic iterated "water turbulence" pattern (after Dave Hoskins' tileable water caustic):
// bright thin lines where the folded waves meet.
float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main(void) {
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float t = mod(uTime, 600.0) * 0.5 * uSpeed + 23.0;
  vec2 wob = vec2(sin(sq.y * 1.3 + t * 1.7), cos(sq.x * 1.1 + t * 1.3)) * 1.5 * uStrength * uInputSize.zw;
  vec4 base = texture(uTexture, clamp(vTextureCoord + wob, uInputClamp.xy, uInputClamp.zw));
  float c = caustic(mod(sq * uScale * 6.2831, 6.2831) - 250.0, t);
  vec3 col = base.rgb * mix(vec3(1.0), uTint, uStrength * 0.8);
  col += vec3(0.75, 0.95, 1.0) * clamp(c, 0.0, 1.0) * 0.35 * uStrength * base.a;
  finalColor = vec4(col, base.a);
}
