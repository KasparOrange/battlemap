#version 300 es
// Water — a tiling water picture that flows (flow-map crossfade, no stretching) with soft caustic
// glints, painted INTO a shape: the filtered object's alpha is kept, its colour becomes water.
// Use: draw the pool/river as a filled Graphics (any colour) and give it this PixiJS v8 Filter
// (manifest apply = "mask"). Cost: 1 mask fetch + 2 water fetches + 2 noise — Graphics B.
// Uniforms (battlemap): uTime · uSquarePx · uMapOrigin · uFlowTex (water-tile, repeat) ·
// uTileSquares squares per tile · uFlow direction squares/s · uStrength 0..1 · uCaustics 0..1.
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
uniform float uStrength;
uniform float uCaustics;

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
  vec2 wob = vec2(noise(uv * 3.0 + t * 0.15), noise(uv * 3.0 + 17.0 - t * 0.15)) - 0.5;
  float ph0 = fract(t * 0.2), ph1 = fract(t * 0.2 + 0.5);
  vec2 flow = uFlow / uTileSquares * 5.0;              // one phase = 5 s
  vec3 c0 = texture(uFlowTex, uv - flow * ph0 + wob * 0.04).rgb;
  vec3 c1 = texture(uFlowTex, uv - flow * ph1 + wob * 0.04 + 0.37).rgb;
  vec3 col = mix(c0, c1, abs(1.0 - 2.0 * ph0));
  float glint = pow(max(0.0, noise(uv * 9.0 + wob * 2.0 + t * 0.3) - 0.55) * 2.2, 3.0);
  col = col * (0.85 + 0.15 * uStrength) + glint * uCaustics * vec3(0.8, 0.95, 1.0);
  finalColor = vec4(col * mask, mask);                    // premultiplied, shape's alpha kept
}
