// The light lab: the riverbend slice drawn UNLIT, with the light added by the table. Albedo pictures
// (no light painted in) plus a height for every pixel; the GPU then lights it for any sun
// direction and time of day, casts the shadows, darkens the crevices where crowns meet.
//
// Four passes a frame (design: battlemap docs/ai-art.md "Light lab"):
//   1. base      ground + water (full res)           — the painted ground, or the unlit albedo
//   2. canopy    a height field of everything: the ground's height, then every crown clump and the
//                roof writing albedo + height with a depth test (the highest surface wins)
//   3. light     sun visibility (a short march through the height field toward the sun) and
//                ambient occlusion (crevices), at half resolution by default — soft, so cheap
//   4. compose   normals from the height field, sun + sky + lamps, shadows, optional outline
// Assets: prepare_lit.py → scene.json. Wind and water: the same code as ../outdoor.js (copied: a
// board embed serves only this folder).

const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 u_view;      // squares → clip: x*sx + ox, y*sy + oy
uniform vec2 u_map;       // cols, rows
uniform vec2 u_res;       // the canvas in pixels
uniform float u_t;
uniform vec2 u_dir;       // wind direction
uniform float u_wind, u_gusts, u_cloud;
uniform vec2 u_cloudOff;
uniform sampler2D u_noise;
float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), u); }
float windAt(vec2 sq) {
  float along = dot(sq, u_dir) / 7.0;
  return u_wind * (u_gusts > 0.5 ? 0.45 + 1.1 * noise1((u_t - along) * 0.45) : 0.8);
}
float cloud(vec2 sq) {
  vec2 p = sq / 30.0 - u_cloudOff;
  float n = texture(u_noise, p).r * 0.65 + texture(u_noise, p * 2.7 + 0.31).r * 0.35;
  return 1.0 - u_cloud * smoothstep(0.50, 0.70, n);
}
// heights live in squares, -1 … 16, stored as 16 bits in two 8-bit channels
const float HLO = -1.0, HSPAN = 17.0;
vec2 packH(float h) { float e = clamp((h - HLO) / HSPAN, 0.0, 1.0) * 65535.0; return vec2(floor(e / 256.0), mod(e, 256.0)) / 255.0; }
float unpackH(vec2 c) { return (c.x * 255.0 * 256.0 + c.y * 255.0) / 65535.0 * HSPAN + HLO; }
vec2 toPix(vec2 sq) { return ((sq * u_view.xy + u_view.zw) * 0.5 + 0.5) * u_res; }
vec2 toSq(vec2 pix) { return ((pix / u_res) * 2.0 - 1.0 - u_view.zw) / u_view.xy; }
`;

const QUAD_VS = HEAD + `
in vec2 a_p; out vec2 v_sq;
void main() { v_sq = a_p * u_map; gl_Position = vec4(v_sq.x * u_view.x + u_view.z, v_sq.y * u_view.y + u_view.w, 0, 1); }`;

// ------------------------------------------------ 1. base: ground + water
const GROUND_FS = HEAD + `
uniform sampler2D u_ground; in vec2 v_sq; out vec4 o;
void main() { o = vec4(texture(u_ground, v_sq / u_map).rgb, 1.0); }`;

const WATER_FS = HEAD + `
uniform sampler2D u_ground, u_flow, u_flow2, u_light; uniform vec2 u_sunXY;
uniform float u_lit, u_flat, u_sunZ; uniform vec3 u_sunCol, u_amb;
in vec2 v_sq; out vec4 o;
vec4 tap(vec2 q, vec2 dir, vec2 stretch, float s) {
  vec2 perp = vec2(-dir.y, dir.x);
  return texture(u_noise, vec2(dot(q, dir), dot(q, perp)) * stretch / s);
}
void main() {
  vec2 uv = v_sq / u_map;
  vec4 f = texture(u_flow, uv); float mask = f.a;
  if (mask < 0.004) discard;
  vec2 dir = normalize(f.rg * 2.0 - 1.0 + 1e-4); float speed = f.b;
  vec4 f2 = texture(u_flow2, uv); float shallow = f2.r, bank = f2.g, rockfoam = f2.b;
  float t = u_t;
  float vel = mix(0.30, 3.0, speed), cyc = mix(2.2, 1.3, speed);
  float ph0 = fract(t / cyc), ph1 = fract(t / cyc + 0.5), w1 = abs(ph0 * 2.0 - 1.0);
  vec2 q0 = v_sq - dir * vel * ph0 * cyc, q1 = v_sq - dir * vel * ph1 * cyc + 0.37;
  vec4 r = mix(tap(q0, dir, vec2(0.7, 1.4), 2.6), tap(q1, dir, vec2(0.7, 1.4), 2.6), w1);
  float still = smoothstep(0.0, 0.35, bank);
  vec4 chop = mix(tap(q0, dir, vec2(0.8, 1.4), 5.0), tap(q1, dir, vec2(0.8, 1.4), 5.0), w1);
  vec2 disp = ((r.gb - 0.5) * (0.05 + 0.06 * speed) + (chop.rg - 0.5) * 0.16 * speed) * still * (1.0 - 0.5 * shallow);
  vec3 bed = texture(u_ground, (v_sq + disp) / u_map).rgb;
  float streak = mix(tap(q0, dir, vec2(0.22, 1.9), 6.0).b, tap(q1, dir, vec2(0.22, 1.9), 6.0).b, w1);
  float fast = smoothstep(0.3, 0.9, speed);
  float foam = fast * max(smoothstep(0.60, 0.80, chop.b) * 0.9, smoothstep(0.62, 0.82, streak) * smoothstep(0.5, 0.8, chop.g) * 0.7);
  foam = max(foam, smoothstep(0.35, 0.75, chop.a * 0.6 + chop.b * 0.4) * smoothstep(0.05, 0.6, rockfoam) * 0.95);
  float cn = mix(tap(q0, dir, vec2(1.0), 1.4).a, tap(q1, dir, vec2(1.0), 1.4).a, w1);
  float caus = pow(1.0 - abs(cn * 2.0 - 1.0), 10.0) * shallow * (1.0 - speed);
  // glints face the sun: crests whose slope points toward it
  float crest = smoothstep(0.68, 0.86, dot(r.gb - 0.5, -normalize(u_sunXY + 1e-4) * 0.99) + 0.5 + r.r * 0.25);
  float lap = smoothstep(0.10, 0.0, abs(bank - 0.06 - 0.03 * sin(t * 1.3 + dot(v_sq, vec2(1.7, 2.3))))) * (1.0 - speed);
  vec3 col = bed * (1.0 + 0.28 * caus);
  col += vec3(0.9, 0.95, 1.0) * crest * 0.09 * (1.0 - 0.6 * speed);
  col *= 1.0 - 0.12 * fast * (chop.r - 0.5);
  col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam * 0.85 + lap * 0.22, 0.0, 1.0));
  if (u_lit > 0.5) {                                    // the fast path lights the water here
    vec4 L = texture(u_light, gl_FragCoord.xy / u_res);
    float vis = L.r * mix(1.0, cloud(v_sq), 0.75);
    col *= u_lit > 1.5 ? u_amb * L.g + u_sunCol * min(u_sunZ / u_flat, 1.45) * vis
                       : mix(vec3(0.42, 0.47, 0.6), vec3(1.0), vis);
  }
  o = vec4(col * mask, mask);
}`;

// ------------------------------------------------ 2. the height field
// The ground's height first (no albedo: coverage 0), then the crowns and the roof on top.
const GROUNDH_FS = HEAD + `
uniform sampler2D u_gh; uniform float u_relief, u_layout, u_unlit;
in vec2 v_sq; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
float groundH(vec2 sq) { vec4 g = texture(u_gh, sq / u_map); return (g.r * 4.0 - 1.0) * u_layout + ((u_unlit > 0.5 ? g.b : g.g) * 4.0 - 1.0) * u_relief; }
void main() {
  float h = groundH(v_sq);
  o0 = vec4(0.0); o1 = vec4(packH(h), 0.0, 1.0);
  gl_FragDepth = 1.0 - (h - HLO) / HSPAN;
}`;

// crown pieces: a = the still crown under its clumps (kind 5, a bit lower) or one clump (kind 0)
const CROWN_VS = HEAD + `
in vec2 a_pos, a_uv, a_pivot, a_centre; in vec4 a_p; in vec4 a_c; in vec4 a_r;
out vec2 v_uv, v_sq; flat out vec4 v_c; flat out float v_kind; flat out vec4 v_r; out float v_cloud;
void main() {
  float amp = a_p.x, seed = a_p.y, kind = a_p.z, R = max(a_p.w, 1e-3);
  vec2 dir = u_dir, perp = vec2(-dir.y, dir.x);
  vec2 p = a_pos;
  if (kind < 0.5) {                       // a clump hangs off its branch end and sways
    float w = windAt(a_centre);
    vec2 rr = (a_pivot - a_centre) / R; float r = min(1.0, length(rr));
    float k = 0.35 + 0.65 * r, ph = 2.4 * dot(rr, dir) + seed * 1.4;
    float wave = sin(u_t * 2.6 - ph) + 0.35 * sin(u_t * 5.9 - ph * 1.7 + seed * 6.0);
    float along = amp * w * k * (0.55 + 0.45 * wave), across = amp * 0.35 * w * k * sin(u_t * 3.3 + seed * 9.0);
    float rot = 0.022 * w * k * wave;
    vec2 d = a_pos - a_pivot; float c = cos(rot), s = sin(rot);
    p = a_pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y) + dir * along + perp * across;
  }
  v_sq = p; v_uv = a_uv; v_c = a_c; v_kind = kind; v_r = a_r;
  v_cloud = cloud(p);                                   // clouds are big and soft: per corner is enough
  gl_Position = vec4(p.x * u_view.x + u_view.z, p.y * u_view.y + u_view.w, 0, 1);
}`;

const CROWN_FS = HEAD + `
uniform sampler2D u_atlas, u_hatlas; uniform int u_hsrc; uniform float u_hscale;
uniform vec2 u_party[8]; uniform int u_nparty; uniform float u_lift;
in vec2 v_uv, v_sq; flat in vec4 v_c; flat in float v_kind;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
void main() {
  vec4 c = texture(u_atlas, v_uv);
  if (c.a < 0.5) discard;
  vec4 hh = texture(u_hatlas, v_uv);
  if (v_kind < 0.5) {                                   // a clump draws only its own pixels
    ivec2 tx = ivec2(v_uv * vec2(textureSize(u_hatlas, 0)));
    if (abs(texelFetch(u_hatlas, tx, 0).b * 255.0 - v_c.w) > 0.5) discard;
  }
  float hs = u_hsrc == 0 ? hh.r : u_hsrc == 1 ? hh.g : hh.a;
  float top = v_c.x * u_hscale, thick = v_c.y;
  float h = top - thick * (1.0 - hs) - (v_kind > 4.5 ? 0.35 : 0.0);
  float a = 1.0;
  if (u_lift > 0.5) {                                   // the canopy opens around the party (a ghost stays)
    float d = 99.0;
    for (int i = 0; i < 8; i++) { if (i >= u_nparty) break; d = min(d, length(v_sq - u_party[i])); }
    a = mix(0.22, 1.0, smoothstep(1.4, 2.8, d));
  }
  o0 = vec4(c.rgb / max(c.a, 1e-3) * v_c.z, a);
  o1 = vec4(packH(h), 1.0, 1.0);                        // B = 1: a crown or a roof stands here
  gl_FragDepth = 1.0 - (h - HLO) / HSPAN;
}`;

const ROOF_VS = HEAD + `
in vec2 a_p; uniform vec4 u_box; out vec2 v_uv, v_sq;
void main() { v_uv = a_p; v_sq = u_box.xy + a_p * u_box.zw; gl_Position = vec4(v_sq.x * u_view.x + u_view.z, v_sq.y * u_view.y + u_view.w, 0, 1); }`;
const ROOF_FS = HEAD + `
uniform sampler2D u_roof; uniform vec4 u_foot; uniform vec2 u_gable; uniform float u_hscale;
in vec2 v_uv, v_sq; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
void main() {
  vec4 c = texture(u_roof, v_uv);
  if (c.a < 0.5) discard;
  // a gable along the footprint's long side: eave at the walls, ridge in the middle
  vec2 rel = (v_sq - u_foot.xy) / u_foot.zw;
  float across = u_foot.z > u_foot.w ? rel.y : rel.x;
  float h = mix(u_gable.x, u_gable.y, 1.0 - clamp(abs(across - 0.5) * 2.0, 0.0, 1.0)) * u_hscale;
  o0 = vec4(c.rgb / max(c.a, 1e-3), 1.0); o1 = vec4(packH(h), 1.0, 1.0);
  gl_FragDepth = 1.0 - (h - HLO) / HSPAN;
}`;

// ------------------------------------------------ 3. light: sun visibility + crevices
// Runs at u_scale of the canvas; reads the full-res height field by texelFetch.
const LIGHT_FS = HEAD + `
uniform sampler2D u_h; uniform vec3 u_sun; uniform float u_scale, u_pxsq; uniform int u_steps; uniform float u_shadows, u_aoOn;
out vec4 o;
float hAt(vec2 sq) { ivec2 p = clamp(ivec2(toPix(sq)), ivec2(0), ivec2(u_res) - 1); return unpackH(texelFetch(u_h, p, 0).rg); }
void main() {
  vec2 pix = gl_FragCoord.xy / u_scale;
  vec2 sq = toSq(pix);
  vec4 here = texelFetch(u_h, ivec2(pix), 0);
  float h0 = unpackH(here.rg);
  // sun: march toward it; each step the ray climbs by the sun's slope; anything above it shades
  float vis = 1.0;
  if (u_shadows > 0.5 && u_sun.z > 0.02) {
    vec2 d = normalize(u_sun.xy + 1e-5);
    float rise = u_sun.z / max(length(u_sun.xy), 1e-3);       // squares up per square along
    float reach = min(16.0, 9.0 / max(rise, 0.05));           // the tallest crowns' shadow length
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    for (int i = 1; i <= 32; i++) {
      if (i > u_steps) break;
      float f = (float(i) - jitter * 0.9) / float(u_steps);
      float t = f * f * reach + 0.08;                           // fine near, coarse far
      float above = hAt(sq + d * t) - (h0 + rise * t);
      vis = min(vis, clamp(1.0 - above / (0.35 + 0.22 * t), 0.0, 1.0));   // soft: penumbra grows with distance
    }
  }
  // crevices: how much of the near surroundings stands above this point (two rings)
  float ao = 1.0;
  if (u_aoOn > 0.5) {
    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785 + (i > 3 ? 0.39 : 0.0);
      float r = i > 3 ? 1.6 : 0.6;
      float dh = hAt(sq + vec2(cos(a), sin(a)) * r) - h0;
      occ += clamp(dh / (r * 1.6), 0.0, 1.0) * (i > 3 ? 0.6 : 1.0);
    }
    ao = 1.0 - clamp(occ / 4.2, 0.0, 0.85);
  }
  o = vec4(vis, ao, here.b, 1.0);
}`;

// ------------------------------------------------ 4. compose
const COMPOSE_FS = HEAD + `
uniform sampler2D u_base, u_cano, u_h, u_light, u_gh, u_flow; uniform float u_unlit;
uniform vec3 u_sun, u_sunCol, u_amb; uniform float u_flat; uniform int u_look, u_debug; uniform float u_outline, u_relief, u_layout;
uniform vec4 u_lamps[4]; uniform vec3 u_lampCol[4]; uniform int u_nlamps; uniform float u_lampOn;
in vec2 v_sq; out vec4 o;
float H(ivec2 p) { return unpackH(texelFetch(u_h, clamp(p, ivec2(0), ivec2(u_res) - 1), 0).rg); }
float groundH(vec2 sq) { vec4 g = texture(u_gh, sq / u_map); return (g.r * 4.0 - 1.0) * u_layout + ((u_unlit > 0.5 ? g.b : g.g) * 4.0 - 1.0) * u_relief; }
vec3 lamps(vec2 sq, vec3 n, float lift) {
  vec3 add = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_nlamps) break;
    vec3 l = vec3(u_lamps[i].xy - sq, 1.2 - lift);
    float d = length(l.xy), att = pow(clamp(1.0 - d / u_lamps[i].z, 0.0, 1.0), 2.0);
    float flick = 0.92 + 0.08 * sin(u_t * 9.0 + float(i) * 3.0) * sin(u_t * 5.3);
    add += u_lampCol[i] * att * flick * (0.35 + 0.65 * max(0.0, dot(n, normalize(l))));
  }
  return add * u_lampOn;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 fuv = gl_FragCoord.xy / u_res;
  vec3 base = texelFetch(u_base, p, 0).rgb;
  vec4 cano = texelFetch(u_cano, p, 0);
  vec4 L = texture(u_light, fuv);
  float vis = L.r * mix(1.0, cloud(v_sq), 0.75), ao = L.g, under = L.b;
  // normals from the height field, one pixel either side (squares per pixel from the view)
  float pxsq = u_view.x * u_res.x * 0.5;
  vec3 nc = normalize(vec3((H(p - ivec2(1, 0)) - H(p + ivec2(1, 0))) * pxsq * 0.5, -(H(p - ivec2(0, 1)) - H(p + ivec2(0, 1))) * pxsq * 0.5, 1.0));
  float e = 1.0 / 32.0;                                  // the ground's own normal (32 px a square)
  vec3 ng = normalize(vec3((groundH(v_sq - vec2(e, 0)) - groundH(v_sq + vec2(e, 0))) / (2.0 * e),
                           (groundH(v_sq - vec2(0, e)) - groundH(v_sq + vec2(0, e))) / (2.0 * e), 1.0));
  float water = texture(u_flow, v_sq / u_map).a;
  ng = normalize(mix(ng, vec3(0, 0, 1), water * 0.85));
  vec3 sunL = normalize(u_sun);
  // sunlight relative to what flat ground gets, capped: a low sun must not blow out every slope
  #define SUN(n) (u_sunCol * min(max(0.0, dot(n, sunL)) / u_flat, 1.45))
  if (u_debug == 1) { o = vec4(vec3((H(p) + 1.0) / 11.0), 1); return; }
  if (u_debug == 2) { o = vec4(vec3(vis), 1); return; }
  if (u_debug == 3) { o = vec4(vec3(ao), 1); return; }
  if (u_debug == 4) { vec3 n = cano.a > 0.5 ? nc : ng; o = vec4(n * 0.5 + 0.5, 1); return; }
  // the ground: lit like everything (look 2), or the painting with only the crowns' shade (look 1)
  float gvis = under > 0.5 ? min(vis, 0.3) : vis;        // under a ghosted crown: in its shade
  vec3 ground;
  if (u_look == 2) {
    ground = base * (u_amb * mix(ao, 1.0, 0.35) + SUN(ng) * gvis) + base * lamps(v_sq, ng, 0.0);
  } else {
    ground = base * mix(vec3(0.42, 0.47, 0.6), vec3(1.0), gvis) * mix(ao, 1.0, 0.45);
  }
  vec3 crown = cano.rgb * (u_amb * ao + SUN(nc) * vis) + cano.rgb * lamps(v_sq, nc, 2.0) * 0.4;
  if (u_look == 1) crown *= 1.3;                         // the painting's sun is brighter than ours
  vec3 col = mix(ground, crown, cano.a);
  if (u_outline > 0.5) {                                 // a dark line round the canopy's edge
    float c0 = texelFetch(u_cano, p + ivec2(2, 0), 0).a + texelFetch(u_cano, p - ivec2(2, 0), 0).a
             + texelFetch(u_cano, p + ivec2(0, 2), 0).a + texelFetch(u_cano, p - ivec2(0, 2), 0).a;
    float edge = clamp(abs(c0 - 4.0 * cano.a), 0.0, 1.0) * step(0.5, max(c0 * 0.25, cano.a));
    col *= 1.0 - 0.55 * edge;
  }
  o = vec4(col, 1.0);
}`;

// ------------------------------------------------ the fast path
// The expensive light (height field, sun march, crevices) runs only when something it depends on
// changes; its result also lights the ground once into a texture. Every frame then only draws that
// lit ground, the water and the swaying crowns — each crown pixel lit on the spot from its own
// height picture (normal) and the light buffer (shadow, crevice).
const LIGHTING = `
uniform vec3 u_sun, u_sunCol, u_amb; uniform float u_flat;
uniform vec4 u_lamps[4]; uniform vec3 u_lampCol[4]; uniform int u_nlamps; uniform float u_lampOn;
vec3 sunlight(vec3 n) { return u_sunCol * min(max(0.0, dot(n, normalize(u_sun))) / u_flat, 1.45); }
vec3 lamps(vec2 sq, vec3 n, float lift) {
  vec3 add = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_nlamps) break;
    vec3 l = vec3(u_lamps[i].xy - sq, 1.2 - lift);
    float d = length(l.xy), att = pow(clamp(1.0 - d / u_lamps[i].z, 0.0, 1.0), 2.0);
    float flick = 0.92 + 0.08 * sin(u_t * 9.0 + float(i) * 3.0) * sin(u_t * 5.3);
    add += u_lampCol[i] * att * flick * (0.35 + 0.65 * max(0.0, dot(n, normalize(l))));
  }
  return add * u_lampOn;
}
`;

const GROUNDLIT_FS = HEAD + LIGHTING + `
uniform sampler2D u_ground, u_light, u_gh, u_flow; uniform float u_relief, u_layout, u_unlit; uniform int u_look;
in vec2 v_sq; out vec4 o;
float groundH(vec2 sq) { vec4 g = texture(u_gh, sq / u_map); return (g.r * 4.0 - 1.0) * u_layout + ((u_unlit > 0.5 ? g.b : g.g) * 4.0 - 1.0) * u_relief; }
void main() {
  vec3 base = texture(u_ground, v_sq / u_map).rgb;
  vec4 L = texture(u_light, gl_FragCoord.xy / u_res);
  float vis = L.r, ao = L.g, gvis = L.b > 0.5 ? min(vis, 0.3) : vis;
  if (u_look == 1) { o = vec4(base * mix(vec3(0.42, 0.47, 0.6), vec3(1.0), gvis) * mix(ao, 1.0, 0.45), 1.0); return; }
  float e = 1.0 / 32.0;
  vec3 ng = normalize(vec3((groundH(v_sq - vec2(e, 0)) - groundH(v_sq + vec2(e, 0))) / (2.0 * e),
                           (groundH(v_sq - vec2(0, e)) - groundH(v_sq + vec2(0, e))) / (2.0 * e), 1.0));
  ng = normalize(mix(ng, vec3(0, 0, 1), texture(u_flow, v_sq / u_map).a * 0.85));
  o = vec4(base * (u_amb * mix(ao, 1.0, 0.35) + sunlight(ng) * gvis) + base * lamps(v_sq, ng, 0.0), 1.0);
}`;

// the lit ground on screen, with the clouds' shadows drifting over it
const BLIT_FS = HEAD + `
uniform sampler2D u_lit; in vec2 v_sq; out vec4 o;
void main() { o = vec4(texelFetch(u_lit, ivec2(gl_FragCoord.xy), 0).rgb * mix(1.0, cloud(v_sq), 0.6), 1.0); }`;

const CROWN_FWD_FS = HEAD + LIGHTING + `
uniform sampler2D u_atlas, u_slope, u_light; uniform int u_look; uniform float u_gs;
uniform vec2 u_party[8]; uniform int u_nparty; uniform float u_lift;
in vec2 v_uv, v_sq; flat in vec4 v_c; flat in float v_kind; flat in vec4 v_r; in float v_cloud;
out vec4 o;
void main() {
  // one texel holds the slope and the clump label: the cheapest test first (is it this clump's?)
  vec4 sl = texelFetch(u_slope, ivec2(v_uv * vec2(textureSize(u_slope, 0))), 0);
  if (sl.a < 0.5 || (v_kind < 0.5 && abs(sl.b * 255.0 - v_c.w) > 0.5)) discard;
  vec4 c = texture(u_atlas, v_uv);
  // the normal: the sprite's slope, per square, turned with the crown into the map
  vec2 g = (sl.rg - 0.5) / u_gs;
  g = vec2(g.x * v_r.z, g.y) * v_c.y / v_r.w;
  vec2 gm = vec2(v_r.x * g.x - v_r.y * g.y, v_r.y * g.x + v_r.x * g.y);
  vec3 n = normalize(vec3(-gm, 1.0));
  vec4 L = texture(u_light, gl_FragCoord.xy / u_res);
  float vis = L.r * mix(1.0, v_cloud, 0.75), ao = L.g;
  vec3 col = c.rgb / c.a * v_c.z * (u_amb * ao + sunlight(n) * vis) + c.rgb / c.a * lamps(v_sq, n, 2.0) * 0.4;
  if (u_look == 1) col *= 1.3;
  if (v_kind > 4.5) col *= 0.8;                         // the still under the clumps: seen in the gaps
  float a = 1.0;
  if (u_lift > 0.5) {
    float d = 99.0;
    for (int i = 0; i < 8; i++) { if (i >= u_nparty) break; d = min(d, length(v_sq - u_party[i])); }
    a = mix(0.22, 1.0, smoothstep(1.4, 2.8, d));
  }
  o = vec4(col * a, a);
}`;

const ROOF_FWD_FS = HEAD + LIGHTING + `
uniform sampler2D u_roof, u_light; uniform vec4 u_foot; uniform vec2 u_gable; uniform float u_hscale, u_alpha; uniform int u_look;
in vec2 v_uv, v_sq; out vec4 o;
void main() {
  vec4 c = texture(u_roof, v_uv);
  if (c.a < 0.01) discard;
  vec2 rel = (v_sq - u_foot.xy) / u_foot.zw;
  bool alongX = u_foot.z > u_foot.w;
  float across = alongX ? rel.y : rel.x, span = alongX ? u_foot.w : u_foot.z;
  float slope = (u_gable.y - u_gable.x) * u_hscale * 2.0 / span * sign(across - 0.5);   // height falls away from the ridge
  vec3 n = normalize(alongX ? vec3(0.0, slope, 1.0) : vec3(slope, 0.0, 1.0));
  vec4 L = texture(u_light, gl_FragCoord.xy / u_res);
  vec3 lit = u_look == 1 ? vec3(1.0) : u_amb * L.g + sunlight(n) * L.r * mix(1.0, cloud(v_sq), 0.75);
  o = vec4(c.rgb * lit, c.a) * u_alpha;
}`;

// ------------------------------------------------ the painted fallback (today's look)
const ROOF2D_FS = HEAD + `
uniform sampler2D u_roof; uniform float u_alpha; in vec2 v_uv, v_sq; out vec4 o;
void main() { vec4 c = texture(u_roof, v_uv); o = c * u_alpha * cloud(v_sq); o.a = c.a * u_alpha; }`;

const PAINTED_FS = HEAD + `
uniform sampler2D u_base, u_canopy; uniform vec2 u_party[8]; uniform int u_nparty; uniform float u_lift;
in vec2 v_sq; out vec4 o;
void main() {
  vec3 base = texelFetch(u_base, ivec2(gl_FragCoord.xy), 0).rgb * cloud(v_sq) ;
  vec4 c = texture(u_canopy, v_sq / u_map);
  float d = 99.0;
  for (int i = 0; i < 8; i++) { if (i >= u_nparty) break; d = min(d, length(v_sq - u_party[i])); }
  c *= u_lift > 0.5 ? mix(0.22, 1.0, smoothstep(1.4, 2.8, d)) : 1.0;
  o = vec4(base * (1.0 - c.a) + c.rgb * cloud(v_sq), 1.0);
}`;

// ---------------------------------------------------------------- GL helpers

function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n"));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const cache = new Map();
  p.u = (name) => { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name); };
  return p;
}

function texture(gl, src, { repeat = false, mip = false, premultiply = true, nearest = false } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : nearest ? gl.NEAREST : gl.LINEAR);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

/** A render target: `n` RGBA8 colour attachments (+ an optional depth buffer), w × h. */
function target(gl, w, h, n = 1, depth = false, linear = false) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const tex = [];
  for (let i = 0; i < n; i++) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    tex.push(t);
  }
  let rb = null;
  if (depth) {
    rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h, free() { gl.deleteFramebuffer(fb); tex.forEach((t) => gl.deleteTexture(t)); if (rb) gl.deleteRenderbuffer(rb); } };
}

function noiseTexture() {
  const N = 256, out = new Uint8Array(N * N * 4);
  let s = 9; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bands = [[1, 5, 14], [3, 11, 16], [8, 24, 18], [2, 7, 12]].map(([lo, hi, n]) =>
    Array.from({ length: n }, () => { const f = lo + rnd() * (hi - lo); const a = rnd() * 6.283; return [Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), rnd() * 6.283, 1 / Math.sqrt(f)]; }));
  const ch = new Float32Array(N * N);
  bands.forEach((waves, c) => {
    let mn = 1e9, mx = -1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0; for (const [fx, fy, ph, a] of waves) v += a * Math.cos(6.2832 * (fx * x + fy * y) / N + ph);
      ch[y * N + x] = v; mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    for (let i = 0; i < N * N; i++) out[i * 4 + c] = Math.round(255 * (ch[i] - mn) / (mx - mn));
  });
  return out;
}

const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = src; });

// ---------------------------------------------------------------- crowns → one vertex buffer

const FLOATS = 2 + 2 + 2 + 2 + 4 + 4 + 4;   // pos uv pivot centre p(amp seed kind R) c(top thick tint clumpId) r(cos sin flip squares-per-px)

/** Every crown as its still (kind 5, drawn a little lower; all stills first, so they can be left
 *  out) and its clumps (kind 0), each a polygon round the clump; the fragment shader keeps only the
 *  clump's own pixels. Crowns are turned freely and mirrored — the light is the table's.
 *  Returns {data, nStill} (vertex counts: stills first). */
function buildCrowns(scene) {
  const { sprites, crowns, atlas } = scene, v = [], still = [];
  for (const c of [...crowns].sort((a, b) => a.top - b.top)) {   // drawn lowest first: in the fast path the order is the height
    const s = sprites[c.sprite], side = Math.max(s.w, s.h), k = c.d / side;   // squares per sprite px
    const a = (c.rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), fx = c.flip ? -1 : 1;
    const to = (px, py) => { const dx = (px - s.centre[0]) * k * fx, dy = (py - s.centre[1]) * k; return [c.x + co * dx - si * dy, c.y + si * dx + co * dy]; };
    const uv = (px, py) => [(s.at[0] + px) / atlas.w, (s.at[1] + py) / atlas.h];
    const R = c.d / 2, thick = Math.min(2.6, c.d * 0.42), centre = [c.x, c.y];
    const vert = (out, [px, py], pivot, prm, id) => out.push(...to(px, py), ...uv(px, py), ...pivot, ...centre, ...prm, c.top, thick, c.tint, id, co, si, fx, k);
    for (const i of [0, 1, 2, 2, 1, 3]) vert(still, [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]][i], centre, [0, 0, 5, R], 0);
    const A = 0.0175 * R;
    for (const q of s.clumps) {
      const pv = to(...q.pivot), prm = [A, q.seed, 0, R], hl = q.hull;
      for (let i = 1; i + 1 < hl.length; i++) for (const p of [hl[0], hl[i], hl[i + 1]]) vert(v, p, pv, prm, q.id);
    }
  }
  return { data: new Float32Array([...still, ...v]), nStill: still.length / FLOATS };
}

// ---------------------------------------------------------------- sun and sky over the day

/** Sun (or moon) direction, colour and the sky's ambient light for an hour 5…24. `azimuth`:
 *  where the sun stands on the map (radians, 0 = east, y down), used when the sun doesn't move
 *  with the time. Returns {sun:[x,y,z] toward the light, col, amb, lamps 0…1, night}. */
export function sky(hour, azimuth, follow) {
  const day = hour >= 5.5 && hour <= 20.5;
  const elev = day ? Math.max(0.02, Math.sin((Math.PI * (hour - 5.5)) / 15)) * 62 : 38;   // degrees
  const az = follow && day ? (Math.PI * (hour - 5.5)) / 15 : azimuth;                      // east → south → west
  const e = (elev * Math.PI) / 180;
  const sun = [Math.cos(az) * Math.cos(e), Math.sin(az) * Math.cos(e), Math.sin(e)];
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const k = Math.min(1, elev / 35);                      // 0 at the horizon … 1 from 35° up
  let col, amb, lamps;
  if (day) {
    // balanced so flat ground in full sun is about its albedo (1.0) and shade about half of it; a
    // low sun lights flat ground only a little (sin of its height), so its colour is scaled up to
    // keep the sunlit patches bright and warm — the golden hour is contrast, not dimness
    const want = 0.38 + 0.24 * k;
    col = mix([1.0, 0.52, 0.22], [1.0, 0.96, 0.88], Math.pow(k, 0.6)).map((x) => x * want);
    amb = mix([0.24, 0.25, 0.38], [0.42, 0.46, 0.54], k);
    lamps = Math.max(0, 1 - elev / 12);
  } else {                                               // moonlight: cool, dim; the lamps carry the scene
    col = [0.20, 0.26, 0.42]; amb = [0.09, 0.11, 0.19]; lamps = 1;
  }
  return { sun, col, amb, lamps, night: !day, elev, flat: day ? Math.max(Math.sin(e), 0.22) : Math.sin(e) };
}

// ---------------------------------------------------------------- the stage

export async function start(canvas, ui) {
  const scene = await fetch("scene.json").then((r) => r.json());
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) throw new Error("WebGL2 not available");
  const slopeImgs = Object.fromEntries(await Promise.all(Object.entries(scene.atlas.slopes).map(async ([k, f]) => [k, await load(f)])));
  const [albedo, albedoUnlit, painted, gh, water, water2, atlasImg, hatlasImg, roofImg, canopyImg] = await Promise.all([
    load(scene.albedo), load(scene.albedoUnlit), load(scene.painted), load(scene.groundH), load(scene.water), load(scene.water2),
    load(scene.atlas.file), load(scene.atlas.height), load(scene.roof.file), scene.canopyPainted ? load(scene.canopyPainted) : null]);
  const T = {
    albedo: texture(gl, albedo, { mip: true }), albedoUnlit: texture(gl, albedoUnlit, { mip: true }), painted: texture(gl, painted, { mip: true }),
    gh: texture(gl, gh, { premultiply: false }),
    water: texture(gl, water, { premultiply: false }), water2: texture(gl, water2, { premultiply: false }),
    noise: texture(gl, noiseTexture(), { repeat: true, mip: true, premultiply: false }),
    atlas: texture(gl, atlasImg, { mip: true }), hatlas: texture(gl, hatlasImg, { premultiply: false }),
    slope: Object.fromEntries(Object.entries(slopeImgs).map(([k, im]) => [k, texture(gl, im, { premultiply: false, nearest: true })])),
    roof: texture(gl, roofImg, { mip: true }), canopy: canopyImg && texture(gl, canopyImg, { mip: true }),
  };
  const P = {
    ground: program(gl, QUAD_VS, GROUND_FS), water: program(gl, QUAD_VS, WATER_FS),
    groundH: program(gl, QUAD_VS, GROUNDH_FS), crown: program(gl, CROWN_VS, CROWN_FS), roof: program(gl, ROOF_VS, ROOF_FS),
    light: program(gl, QUAD_VS, LIGHT_FS), roof2d: program(gl, ROOF_VS, ROOF2D_FS),
    groundLit: program(gl, QUAD_VS, GROUNDLIT_FS), blit: program(gl, QUAD_VS, BLIT_FS),
    crownFwd: program(gl, CROWN_VS, CROWN_FWD_FS), roofFwd: program(gl, ROOF_VS, ROOF_FWD_FS), compose: program(gl, QUAD_VS, COMPOSE_FS), painted: program(gl, QUAD_VS, PAINTED_FS),
  };
  const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const quadVao = (p) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const l = gl.getAttribLocation(p, "a_p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    return vao;
  };
  // the light pass draws the whole screen (its own resolution), the rest the map's rectangle
  const V = Object.fromEntries(["ground", "water", "groundH", "roof", "roof2d", "compose", "painted", "groundLit", "blit", "roofFwd"].map((k) => [k, quadVao(P[k])]));
  const built = buildCrowns(scene), crowns = built.data, nVerts = crowns.length / FLOATS, nStill = built.nStill;
  const crownBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, crownBuf); gl.bufferData(gl.ARRAY_BUFFER, crowns, gl.STATIC_DRAW);
  const crownVao = (prog) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, crownBuf);
    let off = 0;
    for (const [name, n] of [["a_pos", 2], ["a_uv", 2], ["a_pivot", 2], ["a_centre", 2], ["a_p", 4], ["a_c", 4], ["a_r", 4]]) {
      const l = gl.getAttribLocation(prog, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, FLOATS * 4, off * 4); }
      off += n;
    }
    gl.bindVertexArray(null);
    return vao;
  };
  V.crown = crownVao(P.crown); V.crownFwd = crownVao(P.crownFwd);
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");

  const { cols, rows } = scene;
  let view = [1, 1, 0, 0], W = 0, H = 0, geo = { left: 0, top: 0, sq: 1 }, RT = null, lightScale = 0;
  function fit() {
    // render at most 1920 px wide, like the TV (a Mac's retina would hide what the box would pay)
    const dpr = Math.min(devicePixelRatio || 1, 1920 / canvas.clientWidth);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    const ls = ui.state.lightRes;
    if (w === W && h === H && ls === lightScale) return;
    W = canvas.width = w; H = canvas.height = h; lightScale = ls;
    const s = Math.min(W / cols, H / rows), mw = (cols * s) / W, mh = (rows * s) / H;
    view = [(2 * mw) / cols, (-2 * mh) / rows, -mw, mh];
    geo = { left: ((1 - mw) / 2) * canvas.clientWidth, top: ((1 - mh) / 2) * canvas.clientHeight, sq: s / dpr };
    if (RT) Object.values(RT).forEach((t) => t.free());
    lightSig = "";
    RT = { base: target(gl, W, H), cano: target(gl, W, H, 2, true), litGround: target(gl, W, H),
           light: target(gl, Math.max(1, Math.round(W * ls)), Math.max(1, Math.round(H * ls)), 1, false, true) };
    ui.layout(geo);
    const mb = (W * H * (4 + 8 + 4) + RT.light.w * RT.light.h * 4) / 1048576;
    const tex = (albedo.width * albedo.height * 4 * 4) / 3 + (atlasImg.width * atlasImg.height * 4 * (1 + 4 / 3)) + gh.width * gh.height * 4;
    ui.info({ crowns: scene.crowns.length, quads: Math.round(nVerts / 3) + " tris", targetsMB: mb, texMB: tex / 1048576, W, H, lw: RT.light.w, lh: RT.light.h });
  }

  const common = (p, t) => {
    gl.useProgram(p);
    gl.uniform4f(p.u("u_view"), ...view); gl.uniform2f(p.u("u_map"), cols, rows); gl.uniform2f(p.u("u_res"), W, H);
    gl.uniform1f(p.u("u_t"), t);
    const s = ui.state, a = s.windAngle;
    gl.uniform2f(p.u("u_dir"), Math.cos(a), Math.sin(a));
    gl.uniform1f(p.u("u_wind"), s["Strong wind"] ? 1.0 : 0.45); gl.uniform1f(p.u("u_gusts"), s.Gusts ? 1 : 0);
    gl.uniform1f(p.u("u_cloud"), s.Clouds ? 0.55 : 0); gl.uniform2f(p.u("u_cloudOff"), cloudOff[0], cloudOff[1]);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, T.noise); gl.uniform1i(p.u("u_noise"), 7);
  };
  const bind = (p, name, unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.u(name), unit); };
  const party8 = (party) => { const f = new Float32Array(16); party.slice(0, 8).forEach(([x, y], i) => { f[i * 2] = x; f[i * 2 + 1] = y; }); return f; };

  const t0 = performance.now();
  let last = t0;
  // GPU time per pass: one pass is measured at a time (WebGL allows one timer query in flight),
  // cycling through the passes; averages per pass go to the page
  const PASSES = ["ground+water", "height field", "light", "trees+compose"], prof = PASSES.map(() => 0);
  let query = null, queryPass = -1, profNext = 0;
  // the bench repeats the measured pass (state.repeat) so the GPU clocks up: a nearly idle GPU
  // runs slow and makes small passes look expensive
  let queryRepeat = 1;
  const pass = (i, fn) => {
    if (timer && !query && i === profNext) {
      queryRepeat = Math.max(1, ui.state.repeat | 0);
      query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); queryPass = i;
      for (let r = 0; r < queryRepeat; r++) fn();
      gl.endQuery(timer.TIME_ELAPSED_EXT);
    } else fn();
  };
  let lightSig = "", lightAt = -1, lightRuns = 0, frames = 0;
  const cloudOff = [0, 0];
  let roofAlpha = 1, roofOpen = false;
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - geo.left) / geo.sq, y = (e.clientY - r.top - geo.top) / geo.sq;
    const [fx, fy, fw, fh] = scene.roof.footprint;
    if (x > fx - 0.3 && x < fx + fw + 0.3 && y > fy - 0.3 && y < fy + fh + 0.3) roofOpen = !roofOpen;
  });

  // side by side: one forest patch, zoomed, drawn once per tree shape; the middle third of each
  // render goes into its column of the compare canvas, which lies over the stage
  const SHAPES = ui.shapes || ["dome", "model", "luma"], NAMES = { dome: "Dome · computed", model: "Model · depth model", luma: "Luma · brightness" };
  let patchKey = "", patch = null;
  /** The centre of the patch (`across` × `down` squares) holding the most trees and none of the
   *  party (the canopy opens around them, which would hide the shapes). */
  function forestPatch(party, across, down) {
    const key = JSON.stringify([across.toFixed(2), down.toFixed(2), party.map(([x, y]) => [Math.round(x), Math.round(y)])]);
    if (key === patchKey) return patch;
    const hx = across / 2, hy = Math.min(down, rows) / 2, trees = scene.crowns.filter((c) => c.tier !== "shrub");
    let best = -1;
    for (let cy = hy; cy <= rows - hy + 1e-6; cy += 0.5) for (let cx = hx; cx <= cols - hx + 1e-6; cx += 0.5) {
      if (party.some(([x, y]) => Math.abs(x - cx) < hx + 2.8 && Math.abs(y - cy) < hy + 2.8)) continue;
      const n = trees.filter((c) => Math.abs(c.x - cx) < hx && Math.abs(c.y - cy) < hy).length;
      if (n > best) { best = n; patch = [cx, cy]; }
    }
    if (best < 0) patch = [cols / 2, rows / 2];
    patchKey = key; return patch;
  }
  function compare(party, look, drawShape) {
    const cv = ui.compareCanvas, cx = cv.getContext("2d");
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const colW = Math.floor(W / 3), px = colW / 5;              // five squares across a column
    const [mx, my] = forestPatch(party, 5, H / px), keep = view;
    view = [(2 * px) / W, (-2 * px) / H, (-2 * px * mx) / W, (2 * px * my) / H];
    SHAPES.forEach((k, i) => { drawShape(k); cx.drawImage(canvas, (W - colW) / 2, 0, colW, H, i * colW, 0, colW, H); });
    view = keep;
    const u = W / canvas.clientWidth, chosen = ui.state.height;
    cx.fillStyle = "#121214"; cx.fillRect(3 * colW, 0, W - 3 * colW, H);
    cx.font = `600 ${Math.round(14 * u)}px system-ui`; cx.textAlign = "center"; cx.textBaseline = "middle";
    SHAPES.forEach((k, i) => {
      if (i) { cx.fillStyle = "#121214"; cx.fillRect(i * colW - 2 * u, 0, 4 * u, H); }
      const text = k === chosen ? `${NAMES[k]} ✓` : NAMES[k], w = cx.measureText(text).width + 24 * u, h = 30 * u;
      const x = i * colW + colW / 2, y = H - 28 * u;
      cx.fillStyle = k === chosen ? "#3d5afe" : "#000c"; cx.beginPath(); cx.roundRect(x - w / 2, y - h / 2, w, h, 8 * u); cx.fill();
      cx.fillStyle = "#fff"; cx.fillText(text, x, y);
    });
    if (look === 0) { cx.fillStyle = "#000c"; cx.fillRect(0, H / 2 - 20 * u, W, 40 * u); cx.fillStyle = "#fff"; cx.fillText("Painted look: the trees carry painted light, the shape has no effect", W / 2, H / 2); }
  }

  function frame(now) {
    fit();
    const t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
    const s = ui.state, party = ui.party();
    const cs = (s["Strong wind"] ? 0.05 : 0.022) * dt;
    cloudOff[0] += Math.cos(s.windAngle) * cs; cloudOff[1] += Math.sin(s.windAngle) * cs;
    const look = { painted: 0, trees: 1, all: 2 }[s.look];
    // look 1 keeps the painting's light: the sun stands where the painter put it, at midday
    const sk = look === 1 ? sky(13, Math.atan2(-0.62, -0.78), false) : sky(s.hour, s.sunAngle, s["Sun moves"]);
    const [fx, fy, fw, fh] = scene.roof.footprint;
    const inside = roofOpen || (s["Canopy opens"] && party.some(([x, y]) => x > fx && x < fx + fw && y > fy && y < fy + fh));
    roofAlpha += ((inside ? 0 : 1) - roofAlpha) * Math.min(1, dt * 6);

    if (s.compare && ui.compareCanvas) compare(party, look, (k) => draw(k));
    else draw(s.height);
    // everything below draws the map once with the tree shape `shape`, through the current `view`
    function draw(shape) {
    const unlit = s.ground === "unlit" ? 1 : 0;
    const groundTex = look === 2 ? (unlit ? T.albedoUnlit : T.albedo) : T.painted;
    const relief = look === 2 ? { off: 0, layout: 0, both: 1, depth: 1 }[s.relief] : 0;
    const lay = look === 2 ? { off: 0, layout: 1, both: 1, depth: 0 }[s.relief] : 0;
    const fast = s.pipe === "fast";
    const lamps = scene.lights.slice(0, 4);
    const blend = (on) => { if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND); };
    /** Sun, sky and lamps for a program that lights. */
    const lighting = (p) => {
      gl.uniform3f(p.u("u_sun"), ...sk.sun); gl.uniform3f(p.u("u_sunCol"), ...sk.col); gl.uniform3f(p.u("u_amb"), ...sk.amb); gl.uniform1f(p.u("u_flat"), sk.flat);
      gl.uniform4fv(p.u("u_lamps"), new Float32Array([0, 1, 2, 3].flatMap((i) => (lamps[i] ? [lamps[i].x, lamps[i].y, lamps[i].r, 0] : [0, 0, 1, 0]))));
      gl.uniform3fv(p.u("u_lampCol"), new Float32Array([0, 1, 2, 3].flatMap((i) => (lamps[i] ? lamps[i].color.map((c) => c * 1.3) : [0, 0, 0]))));
      gl.uniform1i(p.u("u_nlamps"), lamps.length); gl.uniform1f(p.u("u_lampOn"), look === 2 ? sk.lamps : 0);
    };
    /** The river over whatever is bound; `lit` 0 = unlit (lit later), 1 = shade only (painted), 2 = sun + sky. */
    const water = (lit) => {
      if (!s.Water) return;
      blend(true);
      const p = P.water; common(p, t); bind(p, "u_ground", 0, groundTex); bind(p, "u_flow", 1, T.water); bind(p, "u_flow2", 2, T.water2);
      bind(p, "u_light", 3, RT.light.tex[0]);
      gl.uniform2f(p.u("u_sunXY"), sk.sun[0], sk.sun[1]); gl.uniform1f(p.u("u_lit"), lit);
      gl.uniform1f(p.u("u_flat"), sk.flat); gl.uniform1f(p.u("u_sunZ"), sk.sun[2]);
      gl.uniform3f(p.u("u_sunCol"), ...sk.col); gl.uniform3f(p.u("u_amb"), ...sk.amb);
      gl.bindVertexArray(V.water); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      blend(false);
    };
    const base = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.base.fb); gl.viewport(0, 0, W, H);
      gl.clearColor(0.07, 0.07, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT); blend(false); gl.disable(gl.DEPTH_TEST);
      common(P.ground, t); bind(P.ground, "u_ground", 0, groundTex); gl.bindVertexArray(V.ground); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      water(0);
    };
    const toScreen = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.clearColor(0.07, 0.07, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
    const crownUniforms = (p) => {
      bind(p, "u_atlas", 0, T.atlas); bind(p, "u_hatlas", 1, T.hatlas);
      gl.uniform1i(p.u("u_hsrc"), { dome: 0, model: 1, luma: 2 }[shape]);
      gl.uniform1f(p.u("u_hscale"), s.heightScale);
      gl.uniform2fv(p.u("u_party"), party8(party)); gl.uniform1i(p.u("u_nparty"), Math.min(8, party.length));
      gl.uniform1f(p.u("u_lift"), s["Canopy opens"] ? 1 : 0);
    };
    const heightField = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.cano.fb); gl.viewport(0, 0, W, H);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]); gl.clearBufferfv(gl.DEPTH, 0, [1]);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); blend(false);
      common(P.groundH, t); bind(P.groundH, "u_gh", 0, T.gh);
      gl.uniform1f(P.groundH.u("u_relief"), relief); gl.uniform1f(P.groundH.u("u_layout"), lay); gl.uniform1f(P.groundH.u("u_unlit"), unlit);
      gl.bindVertexArray(V.groundH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (s.Trees) { common(P.crown, t); crownUniforms(P.crown); gl.bindVertexArray(V.crown); gl.drawArrays(gl.TRIANGLES, 0, nVerts); }
      if (roofAlpha > 0.5) {
        const r = scene.roof;
        common(P.roof, t); bind(P.roof, "u_roof", 0, T.roof);
        gl.uniform4f(P.roof.u("u_box"), ...r.box); gl.uniform4f(P.roof.u("u_foot"), ...r.footprint);
        gl.uniform2f(P.roof.u("u_gable"), r.eave, r.ridge); gl.uniform1f(P.roof.u("u_hscale"), s.heightScale);
        gl.bindVertexArray(V.roof); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.DEPTH_TEST);
    };
    const light = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.light.fb); gl.viewport(0, 0, RT.light.w, RT.light.h);
      gl.clearColor(1, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      common(P.light, t); bind(P.light, "u_h", 0, RT.cano.tex[1]);
      gl.uniform3f(P.light.u("u_sun"), ...sk.sun); gl.uniform1f(P.light.u("u_scale"), RT.light.w / W);
      gl.uniform1i(P.light.u("u_steps"), s.steps); gl.uniform1f(P.light.u("u_shadows"), s.Shadows ? 1 : 0); gl.uniform1f(P.light.u("u_aoOn"), s.Crevices ? 1 : 0);
      gl.bindVertexArray(V.compose); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    // the light reruns when something it depends on changed (sun, heights, the party, the roof),
    // and at most 8 times a second while the wind moves the crowns — or every frame, if asked
    const sig = JSON.stringify([sk.sun.map((x) => x.toFixed(3)), look, s.relief, s.ground, shape, s.heightScale, s.steps, s.lightRes,
      s.Shadows, s.Crevices, s.Trees, roofAlpha > 0.5, party.map(([x, y]) => [x.toFixed(1), y.toFixed(1)]), W, H, s.pipe, view]);
    const due = look > 0 && (s.lightRate === "frame" || sig !== lightSig || (s.Trees && t - lightAt > 0.125));
    if (due) { lightSig = sig; lightAt = t; lightRuns++; }

    if (look === 0) {
      pass(0, base);
      pass(3, () => {
        toScreen();
        common(P.painted, t); bind(P.painted, "u_base", 0, RT.base.tex[0]); bind(P.painted, "u_canopy", 1, T.canopy);
        gl.uniform2fv(P.painted.u("u_party"), party8(party)); gl.uniform1i(P.painted.u("u_nparty"), Math.min(8, party.length));
        gl.uniform1f(P.painted.u("u_lift"), s["Canopy opens"] ? 1 : 0);
        gl.bindVertexArray(V.painted); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (roofAlpha > 0.01) {
          blend(true);
          common(P.roof2d, t); bind(P.roof2d, "u_roof", 0, T.roof); gl.uniform4f(P.roof2d.u("u_box"), ...scene.roof.box);
          gl.uniform1f(P.roof2d.u("u_alpha"), roofAlpha); gl.bindVertexArray(V.roof2d); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          blend(false);
        }
      });
    } else if (!fast) {
      // deferred: everything into buffers every frame, then one compose
      pass(0, base);
      pass(1, heightField);
      if (due) pass(2, light);
      pass(3, () => {
        toScreen();
        const p = P.compose; common(p, t); lighting(p);
        bind(p, "u_base", 0, RT.base.tex[0]); bind(p, "u_cano", 1, RT.cano.tex[0]); bind(p, "u_h", 2, RT.cano.tex[1]);
        bind(p, "u_light", 3, RT.light.tex[0]); bind(p, "u_gh", 4, T.gh); bind(p, "u_flow", 5, T.water);
        gl.uniform1i(p.u("u_look"), look); gl.uniform1i(p.u("u_debug"), { final: 0, height: 1, shadow: 2, crevices: 3, normals: 4 }[s.view]);
        gl.uniform1f(p.u("u_outline"), s.Outline ? 1 : 0);
        gl.uniform1f(p.u("u_relief"), relief); gl.uniform1f(p.u("u_layout"), lay); gl.uniform1f(p.u("u_unlit"), unlit);
        gl.bindVertexArray(V.compose); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });
    } else {
      // fast: height field, light and the lit ground only when due; every frame the lit ground,
      // the water and the crowns, each lit on the spot
      if (due) {
        pass(1, heightField);
        pass(2, () => {
          light();
          gl.bindFramebuffer(gl.FRAMEBUFFER, RT.litGround.fb); gl.viewport(0, 0, W, H);
          gl.clearColor(0.07, 0.07, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT);
          const p = P.groundLit; common(p, t); lighting(p);
          bind(p, "u_ground", 0, groundTex); bind(p, "u_light", 1, RT.light.tex[0]); bind(p, "u_gh", 2, T.gh); bind(p, "u_flow", 3, T.water);
          gl.uniform1f(p.u("u_relief"), relief); gl.uniform1f(p.u("u_layout"), lay); gl.uniform1f(p.u("u_unlit"), unlit); gl.uniform1i(p.u("u_look"), look);
          gl.bindVertexArray(V.groundLit); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });
      }
      pass(0, () => {
        toScreen();
        common(P.blit, t); bind(P.blit, "u_lit", 0, RT.litGround.tex[0]); gl.bindVertexArray(V.blit); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        water(look === 2 ? 2 : 1);
      });
      pass(3, () => {
        blend(true);
        if (s.Trees) {
          const p = P.crownFwd; common(p, t); lighting(p); crownUniforms(p); bind(p, "u_light", 2, RT.light.tex[0]);
          bind(p, "u_slope", 3, T.slope[shape]); gl.uniform1f(p.u("u_gs"), scene.atlas.gs);
          gl.uniform1i(p.u("u_look"), look);
          gl.bindVertexArray(V.crownFwd);
          if (s.Under) gl.drawArrays(gl.TRIANGLES, 0, nVerts); else gl.drawArrays(gl.TRIANGLES, nStill, nVerts - nStill);
        }
        if (roofAlpha > 0.01) {
          const r = scene.roof, p = P.roofFwd; common(p, t); lighting(p);
          bind(p, "u_roof", 0, T.roof); bind(p, "u_light", 1, RT.light.tex[0]);
          gl.uniform4f(p.u("u_box"), ...r.box); gl.uniform4f(p.u("u_foot"), ...r.footprint);
          gl.uniform2f(p.u("u_gable"), r.eave, r.ridge); gl.uniform1f(p.u("u_hscale"), s.heightScale);
          gl.uniform1f(p.u("u_alpha"), roofAlpha); gl.uniform1i(p.u("u_look"), look);
          gl.bindVertexArray(V.roofFwd); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        blend(false);
      });
    }
    }
    if (query && queryPass >= 0 && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / queryRepeat;
        prof[queryPass] = prof[queryPass] ? prof[queryPass] * 0.85 + ms * 0.15 : ms;
      }
      gl.deleteQuery(query); query = null; queryPass = -1;
      do { profNext = (profNext + 1) % PASSES.length; } while (look === 0 && (profNext === 1 || profNext === 2));
      // the light pass costs only on the frames it runs: weigh it by how often it ran
      const rare = (i) => i === 2 || (i === 1 && ui.state.pipe === "fast");
      ui.gpu(PASSES.map((n, i) => [n, prof[i] * (rare(i) ? lightRuns / Math.max(1, frames) : 1)]));
    }
    frames++;
    if (frames > 600) { frames = 1; lightRuns = Math.min(1, lightRuns); }
    ui.sky?.(sk);
    requestAnimationFrame(frame);
  }
  ui.gpu(timer ? 0 : null);
  requestAnimationFrame(frame);
}
