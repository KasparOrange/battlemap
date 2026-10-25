#version 300 es
// Lava — a tiling lava picture creeping slowly (flow-map crossfade) with a glow that breathes in
// the bright channels; painted INTO a shape like water-flow.frag.
// Use: a filled Graphics (the lava's shape) with this PixiJS v8 Filter (apply = "mask"). Cost: 1 mask
// fetch + 2 lava fetches + 1 noise — Graphics B.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uFlowTex (lava-tile, repeat) ·
// uTileSquares · uFlow squares/s · uGlow 0..1 pulse of the hot parts.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFlowTex;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uTime;
uniform float uSquarePx;
uniform vec2 uMapOrigin;
uniform float uTileSquares;
uniform vec2 uFlow;
uniform float uGlow;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main(void) {
  float mask = texture(uTexture, vTextureCoord).a;
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 sq = (px - uMapOrigin) / uSquarePx;
  vec2 uv = sq / uTileSquares;
  float t = mod(uTime, 1000.0);
  float ph0 = fract(t * 0.08), ph1 = fract(t * 0.08 + 0.5);
  vec2 flow = uFlow / uTileSquares * 12.5;             // one phase = 12.5 s
  vec3 c0 = texture(uFlowTex, uv - flow * ph0).rgb;
  vec3 c1 = texture(uFlowTex, uv - flow * ph1 + 0.43).rgb;
  vec3 col = mix(c0, c1, abs(1.0 - 2.0 * ph0));
  float heat = smoothstep(0.45, 0.9, max(col.r, col.g));
  float pulse = 0.5 + 0.5 * sin(t * 1.7 + noise(uv * 4.0 + t * 0.2) * 6.2831);
  col += col * heat * pulse * uGlow * 0.6;
  finalColor = vec4(col * mask, mask);
}
