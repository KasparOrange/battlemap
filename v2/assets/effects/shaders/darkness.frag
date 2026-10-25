#version 300 es
// Night / darkness — the map dimmed and tinted blue, with up to 8 light pools (torches, a lantern,
// Light spells) cut out, each flickering slightly.
// Use: a PixiJS v8 Filter on the map container (global). Cost: 1 texture fetch + up to 8 distance
// checks — Graphics B.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uDarkness 0..1 · uTint night colour ·
// uLightCount 0..8 · uLights[8] = (x, y, radius, strength) in squares / 0..1.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uTime;
uniform float uSquarePx;
uniform vec2 uMapOrigin;
uniform float uDarkness;
uniform vec3 uTint;
uniform float uLightCount;
uniform vec4 uLights[8];

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  float light = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uLightCount) break;
    vec4 L = uLights[i];
    float flicker = 0.93 + 0.07 * sin(uTime * 9.0 + float(i) * 2.1) * sin(uTime * 5.3 + float(i));
    float d = length(sq - L.xy) / max(L.z * flicker, 0.01);
    light = max(light, (1.0 - smoothstep(0.35, 1.0, d)) * L.w);
  }
  vec3 lum = vec3(dot(base.rgb, vec3(0.299, 0.587, 0.114)));
  vec3 night = mix(base.rgb, lum, 0.6) * uTint * (1.0 - 0.6 * uDarkness);  // colour fades at night
  vec3 col = mix(base.rgb, night, uDarkness * (1.0 - light));
  col += base.rgb * vec3(1.0, 0.6, 0.25) * light * 0.25;  // warm spill of the lights
  finalColor = vec4(col, base.a);
}
