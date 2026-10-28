// summervale on the table: the 136 × 76 map streamed the way the TV would — 512 px cells at
// 56 px/square, only the 34 × 19 window and a ring of half a screen loaded, a blurry preview under
// cells still on their way. Per cell: painted ground, water from the flow masks, the forest canopy
// as leaf clumps cut from the cell's canopy picture by its id map, plants from one atlas, roofs.
// Assets: prepare.py → manifest.json + cells/. Shaders follow the riverbend slice (../outdoor.js).
// Design notes: battlemap docs/ai-art.md "outdoor maps"; tools/mapgen/out/summervale/HANDOVER-viewer.md.

// ---------------------------------------------------------------- shaders

const HEAD = `#version 300 es
precision highp float;
uniform vec4 u_view;      // squares → clip: x*sx + ox, y*sy + oy
uniform float u_t;
uniform vec2 u_dir;       // wind direction
uniform float u_wind;     // base strength (0.45 breeze, 1 strong)
uniform float u_gusts;    // 1 = gusts roll across the map
uniform float u_cloud;    // cloud shadow strength 0..1
uniform vec2 u_cloudOff;  // how far the clouds have drifted (integrated on the CPU)
uniform sampler2D u_noise;
const float PPS = 56.0;   // map px per square
float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), u); }
// wind at a point: a gust front travels downwind at ~7 squares a second
float windAt(vec2 sq) {
  float along = dot(sq, u_dir) / 7.0;
  return u_wind * (u_gusts > 0.5 ? 0.45 + 1.1 * noise1((u_t - along) * 0.45) : 0.8);
}
// big soft cloud shadows drifting with the wind
float cloud(vec2 sq) {
  vec2 p = sq / 30.0 - u_cloudOff;
  float n = texture(u_noise, p).r * 0.65 + texture(u_noise, p * 2.7 + 0.31).r * 0.35;
  return 1.0 - u_cloud * 0.30 * smoothstep(0.50, 0.70, n);
}
vec4 clip(vec2 sq) { return vec4(sq.x * u_view.x + u_view.z, sq.y * u_view.y + u_view.w, 0, 1); }
`;

// one quad over a box in squares (u_box = x, y, w, h); v_uv 0..1 across it, v_sq where it lies
const BOX_VS = HEAD + `
in vec2 a_p; uniform vec4 u_box; uniform vec2 u_shift; out vec2 v_uv, v_sq;
void main() { v_uv = a_p; v_sq = u_box.xy + a_p * u_box.zw; gl_Position = clip(v_sq + u_shift); }`;

const PICTURE_FS = HEAD + `
uniform sampler2D u_tex; in vec2 v_uv, v_sq; out vec4 o;
void main() { o = vec4(texture(u_tex, v_uv).rgb * cloud(v_sq), 1.0); }`;

// Water as on the slice — the painted riverbed seen through moving water, two flow phases half a
// cycle apart — but the noise lives in the river's own coordinates (s along the centre line, n
// across it; prepare.py `river_coords`) instead of being rotated by the flow direction about the
// map's origin (on a big map that greys the noise to a coarse mip: the rapids stood still).
// Noise periods along the river divide 32 squares, the period s is stored in. Per cell: masks at
// 1/4 with a 1 px gutter; the bed is the cell's own ground, so a ripple's displacement clamps at
// the cell's edge.
const WATER_FS = HEAD + `
uniform sampler2D u_ground, u_flow, u_flow2; uniform vec4 u_cellPx; uniform vec2 u_wsize; uniform float u_wq, u_dbg;
in vec2 v_uv, v_sq; out vec4 o;
vec2 gx, gy;   // screen derivatives of (s, n)
vec4 tap(float s, float n, float ka, float kn) {
  vec2 k = vec2(ka, kn);
  return textureGrad(u_noise, vec2(s, n) * k, gx * k, gy * k);
}
void main() {
  vec2 px = v_sq * PPS - u_cellPx.xy, uv = (1.0 + px / u_wq) / u_wsize;
  vec4 f = texture(u_flow, uv), f2 = texture(u_flow2, uv);
  float mask = f.a, shallow = f2.r, bank = f2.g, rockfoam = f2.b, speed = f.b;
  float s1 = f.r * 32.0, s2 = f.g * 32.0, sa = s1 > 8.0 && s1 < 24.0 ? s1 : s2 - 16.0, n = f2.a * 16.0 - 8.0;
  vec2 g1 = vec2(dFdx(s1), dFdy(s1)), g2 = vec2(dFdx(s2), dFdy(s2)), gs = dot(g1, g1) < dot(g2, g2) ? g1 : g2;
  vec2 gn = vec2(dFdx(n), dFdy(n));   // derivatives before the discard (uniform control flow)
  gx = vec2(gs.x, gn.x); gy = vec2(gs.y, gn.y);
  if (mask < 0.004) discard;
  float t = u_t;
  float vel = mix(0.30, 3.0, speed), cyc = mix(2.2, 1.3, speed);
  float ph0 = fract(t / cyc), ph1 = fract(t / cyc + 0.5), w1 = abs(ph0 * 2.0 - 1.0);
  float a0 = sa - vel * ph0 * cyc, a1 = sa - vel * ph1 * cyc + 0.37, n1 = n + 0.37;
  // the slice's taps, periods along the river rounded to divide 32: ripples 3.6 sq, chop 6.4, streaks 32, caustics 1.4
  vec4 r = mix(tap(a0, n, 9.0 / 32.0, 0.54), tap(a1, n1, 9.0 / 32.0, 0.54), w1);
  float still = smoothstep(0.0, 0.35, bank);
  vec4 chop = mix(tap(a0, n, 5.0 / 32.0, 0.28), tap(a1, n1, 5.0 / 32.0, 0.28), w1);
  vec2 disp = ((r.gb - 0.5) * (0.05 + 0.06 * speed) + (chop.rg - 0.5) * 0.16 * speed) * still * (1.0 - 0.5 * shallow);
  vec3 bed = texture(u_ground, (px + disp * PPS) / u_cellPx.zw).rgb;
  float streak = mix(tap(a0, n, 1.0 / 32.0, 0.32).b, tap(a1, n1, 1.0 / 32.0, 0.32).b, w1);
  float fast = smoothstep(0.3, 0.9, speed);
  float foam = fast * max(smoothstep(0.60, 0.80, chop.b) * 0.9, smoothstep(0.62, 0.82, streak) * smoothstep(0.5, 0.8, chop.g) * 0.7);
  foam = max(foam, smoothstep(0.35, 0.75, chop.a * 0.6 + chop.b * 0.4) * smoothstep(0.05, 0.6, rockfoam) * 0.95);
  if (u_dbg > 0.5) { o = vec4(foam, fast, chop.b, 1.0); return; }
  float cn = mix(tap(a0, n, 23.0 / 32.0, 0.71).a, tap(a1, n1, 23.0 / 32.0, 0.71).a, w1);
  float caus = pow(1.0 - abs(cn * 2.0 - 1.0), 10.0) * shallow * (1.0 - speed);
  float crest = smoothstep(0.68, 0.86, dot(r.gb - 0.5, vec2(-0.7, -0.7)) + 0.5 + r.r * 0.25);
  float lap = smoothstep(0.10, 0.0, abs(bank - 0.06 - 0.03 * sin(t * 1.3 + dot(v_sq, vec2(1.7, 2.3))))) * (1.0 - speed);
  vec3 col = bed * (1.0 + 0.28 * caus);
  col += vec3(0.9, 0.95, 1.0) * crest * 0.09 * (1.0 - 0.6 * speed);
  col *= 1.0 - 0.12 * fast * (chop.r - 0.5);
  col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam * 0.85 + lap * 0.22, 0.0, 1.0));
  col *= cloud(v_sq);
  o = vec4(col * mask, mask);
}`;

// The canopy's shadow: the cell's small copy (1/4) blurred a little, offset away from the sun.
const SHADOW_FS = HEAD + `
uniform sampler2D u_small; uniform vec2 u_texel; in vec2 v_uv, v_sq; out vec4 o;
void main() {
  vec2 d = u_texel * 1.5;
  float a = texture(u_small, v_uv).a * 0.4 + 0.15 * (texture(u_small, v_uv + vec2(d.x, 0)).a + texture(u_small, v_uv - vec2(d.x, 0)).a
          + texture(u_small, v_uv + vec2(0, d.y)).a + texture(u_small, v_uv - vec2(0, d.y)).a);
  o = vec4(0.0, 0.0, 0.0, a * 0.42);
}`;

// The still under the clumps: the canopy's own silhouette, coloured from the blurred small copy and
// darkened — fills the hairline gaps a swaying clump opens (as the slice's "under" sprite).
const UNDER_FS = HEAD + `
uniform sampler2D u_canopy, u_small; in vec2 v_uv, v_sq; out vec4 o;
void main() {
  float a = texture(u_canopy, v_uv).a;
  if (a < 0.004) discard;
  vec4 s = texture(u_small, v_uv);
  o = vec4(s.rgb / max(s.a, 1e-3) * 0.62 * a * cloud(v_sq), a);
}`;

// Leaf clumps: a quad over the clump's box (cut to the cell) swings round its branch end like the
// slice's kind 0; each pixel reads the canopy at its rest place and keeps it only if the id map
// says it is this clump's. One texture per cell, no atlas.
const CLUMP_VS = HEAD + `
in vec2 a_pos, a_pivot, a_centre; in vec4 a_p;   // amp, seed, radius, id
out vec2 v_src, v_sq; flat out float v_id;
void main() {
  float amp = a_p.x, seed = a_p.y, R = max(a_p.z, 1e-3);
  vec2 dir = u_dir, perp = vec2(-dir.y, dir.x);
  float w = windAt(a_centre);
  vec2 rr = (a_pivot - a_centre) / R; float r = min(1.0, length(rr));
  float k = 0.35 + 0.65 * r, ph = 2.4 * dot(rr, dir) + seed * 1.4;
  float wave = sin(u_t * 2.6 - ph) + 0.35 * sin(u_t * 5.9 - ph * 1.7 + seed * 6.0);
  float along = amp * w * k * (0.55 + 0.45 * wave), across = amp * 0.35 * w * k * sin(u_t * 3.3 + seed * 9.0);
  float rot = 0.022 * w * k * wave, sc = 1.0 + 0.012 * w * sin(u_t * 1.9 + ph);
  vec2 d = (a_pos - a_pivot) * sc; float c = cos(rot), s = sin(rot);
  vec2 p = a_pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y) + dir * along + perp * across;
  v_src = a_pos; v_sq = p; v_id = a_p.w;
  gl_Position = clip(p);
}`;
const CLUMP_FS = HEAD + `
uniform sampler2D u_canopy, u_ids; uniform vec4 u_cellPx;
in vec2 v_src, v_sq; flat in float v_id; out vec4 o;
void main() {
  vec2 px = v_src * PPS - u_cellPx.xy;
  ivec2 ip = clamp(ivec2(floor(px)), ivec2(0), ivec2(u_cellPx.zw) - 1);
  if (abs(texelFetch(u_ids, ip, 0).r * 255.0 - v_id) > 0.5) discard;
  vec4 c = texture(u_canopy, px / u_cellPx.zw);
  c.rgb *= cloud(v_sq);
  o = c;
}`;

// Plants: the slice's plant shader (bushes, ferns, reeds bend as meshes, lilies turn, trunks still).
const VEG_VS = HEAD + `
in vec2 a_pos, a_uv, a_pivot, a_centre; in vec4 a_p; in vec4 a_tint; in float a_radius;
out vec2 v_uv, v_sq; out vec4 v_tint;
uniform vec2 u_sun;
void main() {
  float amp = a_p.x, seed = a_p.y, kind = a_p.z, flags = a_p.w, R = max(a_radius, 1e-3);
  vec2 dir = u_dir, perp = vec2(-dir.y, dir.x);
  float w = windAt(a_centre);
  vec2 p = a_pos;
  if (kind < 0.5) {
    vec2 rr = (a_pivot - a_centre) / R; float r = min(1.0, length(rr));
    float k = 0.35 + 0.65 * r, ph = 2.4 * dot(rr, dir) + seed * 1.4;
    float wave = sin(u_t * 2.6 - ph) + 0.35 * sin(u_t * 5.9 - ph * 1.7 + seed * 6.0);
    float along = amp * w * k * (0.55 + 0.45 * wave), across = amp * 0.35 * w * k * sin(u_t * 3.3 + seed * 9.0);
    float rot = 0.022 * w * k * wave, sc = 1.0 + 0.012 * w * sin(u_t * 1.9 + ph);
    vec2 d = (a_pos - a_pivot) * sc; float c = cos(rot), s = sin(rot);
    p = a_pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y) + dir * along + perp * across;
  } else if (kind > 2.5 && kind < 3.5) {
    vec2 rel = a_pos - a_centre;
    float a = 0.035 * sin(u_t * 0.35 + seed * 6.0), c = cos(a), s = sin(a);
    p = a_centre + vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y) + dir * 0.03 * sin(u_t * 0.5 + seed * 4.0);
  } else if (kind < 4.5) {
    float r = min(1.2, length(a_pos - a_centre) / R);
    float fr = kind < 1.5 ? 1.7 : kind < 2.5 ? 2.3 : 0.9;
    float kx = kind > 1.5 && kind < 2.5 ? 1.6 : 0.5;
    float wave = sin(u_t * fr * 2.0 - dot(a_pos, dir) * kx + seed * 6.0);
    float flutter = sin(u_t * fr * 5.3 + dot(a_pos, perp) * 2.1 + seed * 11.0);
    float bend = amp * w * pow(r, 1.4);
    p = a_pos + dir * bend * (0.6 + 0.4 * wave) + perp * bend * 0.25 * flutter;
  }
  if (mod(flags, 4.0) >= 2.0) p += u_sun * R;
  v_sq = p; v_uv = a_uv; v_tint = a_tint;
  gl_Position = clip(p);
}`;
const VEG_FS = HEAD + `
uniform sampler2D u_atlas; in vec2 v_uv, v_sq; in vec4 v_tint; out vec4 o;
void main() { vec4 c = texture(u_atlas, v_uv); c.rgb *= v_tint.rgb; c *= v_tint.a; c.rgb *= cloud(v_sq); o = c; }`;

const ROOF_FS = HEAD + `
uniform sampler2D u_tex; uniform float u_shadow; in vec2 v_uv, v_sq; out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv);
  if (u_shadow > 0.5) { o = vec4(0.0, 0.0, 0.0, c.a * 0.38); return; }
  c.rgb *= cloud(v_sq); o = c;
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

/** Uploads a picture (ImageBitmap or 256² bytes); returns { tex, bytes } — bytes = what the GPU holds. */
function texture(gl, src, { repeat = false, mip = false, r8 = false } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  let w = 256, h = 256;
  if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else if (r8) { w = src.width; h = src.height; gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, src); }
  else { w = src.width; h = src.height; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  const f = r8 ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : f);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return { tex: t, bytes: w * h * (r8 ? 1 : 4) * (mip ? 4 / 3 : 1) };
}

/** A tileable 256² noise (as the slice): R broad, G mid, B fine, A a ridge net. */
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

/** Fetches and decodes a picture off the main thread; `premultiply` for anything blended, never for masks. */
async function bitmap(url, { premultiply = false, resize = null } = {}) {
  const blob = await fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); });
  const o = { premultiplyAlpha: premultiply ? "premultiply" : "none", colorSpaceConversion: "none" };
  const bmp = await createImageBitmap(blob, o);
  if (!resize) return bmp;
  const small = await createImageBitmap(bmp, { ...o, resizeWidth: Math.max(1, Math.round(bmp.width / resize)), resizeHeight: Math.max(1, Math.round(bmp.height / resize)), resizeQuality: "medium" });
  return [bmp, small];
}

// ---------------------------------------------------------------- vertex buffers

const KIND = { clump: 0, bush: 1, fern: 1, reed: 2, lily: 3, willow: 4, spruce: 4, tree: 4, under: 5, trunk: 5 };
const LAYERS = ["lily", "reed", "trunk", "low", "bush"];
const VEG_FLOATS = 17, CLUMP_FLOATS = 10;
const SUN_TINT = { bush: 0.34, low: 0.22, reed: 0.26, lily: 0.12 };

/** The plants standing in the live cells → one vertex array (shadows first, then by layer): the slice's buildPlants. */
function buildPlants(P, idx) {
  const { types, mesh, atlas } = P, v = [];
  const list = idx.map((i) => P.list[i]).map(([type, layer, x, y, rot, scale, tint]) => ({ type, layer, x, y, rot, scale, tint: [tint, tint, tint] }));
  list.sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer));
  const uv = (r, u, w) => [(r[0] + u * r[2]) / atlas.w, (r[1] + w * r[3]) / atlas.h];
  const place = (p, t) => {
    const s = (t.squares * p.scale) / Math.max(t.w, t.h), a = (p.rot * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
    return (px, py) => { const dx = (px - t.centre[0]) * s, dy = (py - t.centre[1]) * s; return [p.x + c * dx - si * dy, p.y + si * dx + c * dy]; };
  };
  let R = 1;
  const quad = (pts, uvs, pivot, centre, prm, tint) => { for (const i of [0, 1, 2, 2, 1, 3]) v.push(...pts[i], ...uvs[i], ...pivot, ...centre, ...prm, ...tint, R); };
  const grid = (to, rect, x0, y0, w, h, n, pivot, centre, prm, tint) => {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cs = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      quad(cs.map(([a, b]) => to(x0 + (w * a) / n, y0 + (h * b) / n)), cs.map(([a, b]) => uv(rect, a / n, b / n)), pivot, centre, prm, tint);
    }
  };
  for (const p of list) {
    const t = types[p.type];
    if (!t.shadow) continue;
    const to = place(p, t), k = KIND[t.kind] ?? 1, c = to(t.centre[0], t.centre[1]);
    R = (t.squares * p.scale) / 2;
    const kk = t.clumps || k === 3 ? 1 : k;
    grid(to, t.shadow, 0, 0, t.w, t.h, 3, c, c, [k === 3 ? 0 : 0.035 * R, (p.x * 0.37) % 1, kk, 2], [1, 1, 1, SUN_TINT[p.layer] ?? 0.3]);
  }
  for (const p of list) {
    const t = types[p.type], to = place(p, t), centre = to(t.centre[0], t.centre[1]);
    R = (t.squares * p.scale) / 2;
    const tint = [...p.tint, 1], seed = (p.x * 3.7 + p.y * 1.3) % 1;
    if (t.clumps) {
      grid(to, t.under, 0, 0, t.w, t.h, 1, centre, centre, [0, seed, KIND.under, 0], tint);
      const A = 0.0175 * R;
      for (const q of t.clumps) grid(to, q.rect, q.x0, q.y0, q.rect[2], q.rect[3], 1, to(q.pivot[0], q.pivot[1]), centre, [A, q.seed, KIND.clump, 0], tint);
    } else {
      const k = KIND[t.kind] ?? 1, n = mesh[t.kind] ?? 4;
      const amp = ({ 1: 0.06, 2: 0.10, 3: 0, 4: 0.075 }[k] ?? 0) * R;
      grid(to, t.still, 0, 0, t.w, t.h, n, centre, centre, [amp, seed, k, 0], tint);
    }
  }
  return new Float32Array(v);
}

/** A cell's leaf clumps → quads over each clump's box cut to the cell (squares), id = its index + 1 in the id map. */
function buildClumps(M, c) {
  const v = [], pps = M.pps;
  c.clumps.forEach((g, i) => {
    const [x0, y0, x1, y1, px, py, tree, seed] = M.clumps[g], [tx, ty, R] = M.trees[tree];
    const a = Math.max(x0, c.x) / pps, b = Math.max(y0, c.y) / pps, e = Math.min(x1 + 1, c.x + c.w) / pps, f = Math.min(y1 + 1, c.y + c.h) / pps;
    if (e <= a || f <= b) return;
    const prm = [0.0175 * R, seed, R, i + 1];
    for (const [x, y] of [[a, b], [e, b], [a, f], [a, f], [e, b], [e, f]]) v.push(x, y, px / pps, py / pps, tx, ty, ...prm);
  });
  return new Float32Array(v);
}

// ---------------------------------------------------------------- streaming maths (as v2's tile-window.ts)

const SW = 34, SH = 19;          // one TV screen in squares
const RING = 0.5, LEAN = 0.25;   // ring per side and its lean into the pan direction, in screens
const KEEP = 0.25;               // a loaded cell may stay this many cells past the load rectangle

// ---------------------------------------------------------------- the stage

export async function start(canvas, ui) {
  const M = await fetch("manifest.json").then((r) => r.json());
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) throw new Error("WebGL2 not available");
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const { cols, rows, pps, cell: CELL } = M, [NX, NY] = M.grid, cellSq = CELL / pps;

  const P = {
    picture: program(gl, BOX_VS, PICTURE_FS), water: program(gl, BOX_VS, WATER_FS), shadow: program(gl, BOX_VS, SHADOW_FS),
    under: program(gl, BOX_VS, UNDER_FS), clump: program(gl, CLUMP_VS, CLUMP_FS), veg: program(gl, VEG_VS, VEG_FS), roof: program(gl, BOX_VS, ROOF_FS),
  };
  const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const boxVao = {};
  for (const k of ["picture", "water", "shadow", "under", "roof"]) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const l = gl.getAttribLocation(P[k], "a_p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    boxVao[k] = vao;
  }
  const attribs = (p, layout, stride) => {
    let off = 0;
    for (const [name, n] of layout) {
      const l = gl.getAttribLocation(p, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, stride * 4, off * 4); }
      off += n;
    }
  };
  const vertexArray = (p, data, layout, stride) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    attribs(p, layout, stride); gl.bindVertexArray(null);
    return { vao, buf, n: data.length / stride, bytes: data.byteLength };
  };
  const freeArray = (a) => { if (a) { gl.deleteVertexArray(a.vao); gl.deleteBuffer(a.buf); } };

  // shared: noise, plant atlas, preview (the whole map at 1/4 — overview and stand-in for cells not loaded)
  const [atlasBmp, previewBmp] = await Promise.all([bitmap(M.plants.atlas.file, { premultiply: true }), bitmap(M.preview.file)]);
  const S = { noise: texture(gl, noiseTexture(), { repeat: true, mip: true }), atlas: texture(gl, atlasBmp, { mip: true }), preview: texture(gl, previewBmp) };
  atlasBmp.close(); previewBmp.close();

  // ---- cells: key → { state: "loading" | "live", tex…, bytes, clumps (vao) }
  const cells = new Map(), roofTex = new Map();
  let liveDirty = true, plantsArr = null, loading = 0;
  const queue = [];
  const freeCell = (key) => {
    const c = cells.get(key); if (!c) return;
    cells.delete(key);
    if (c.state !== "live") { c.cancelled = true; return; }
    for (const t of Object.values(c.tex)) gl.deleteTexture(t.tex);
    freeArray(c.clumpArr); liveDirty = true;
  };
  async function loadCell(key) {
    const m = M.cells[key], c = cells.get(key);
    const base = `cells/${key}`;
    try {
      const [g, can, ids, w1, w2] = await Promise.all([
        bitmap(`${base}.g.webp`),
        m.canopy ? bitmap(`${base}.c.webp`, { premultiply: true, resize: 4 }) : null,
        m.canopy ? bitmap(`${base}.ids.png`) : null,
        m.water ? bitmap(`${base}.w1.png`) : null, m.water ? bitmap(`${base}.w2.png`) : null]);
      if (c.cancelled) return;
      c.tex = { ground: texture(gl, g) };
      if (can) { c.tex.canopy = texture(gl, can[0]); c.tex.small = texture(gl, can[1]); c.tex.ids = texture(gl, ids, { r8: true }); c.clumpArr = vertexArray(P.clump, buildClumps(M, m), [["a_pos", 2], ["a_pivot", 2], ["a_centre", 2], ["a_p", 4]], CLUMP_FLOATS); }
      if (w1) { c.tex.w1 = texture(gl, w1); c.tex.w2 = texture(gl, w2); }
      for (const b of [g, ...(can || []), ids, w1, w2]) b?.close();
      c.state = "live"; c.at = performance.now(); liveDirty = true;
    } catch (e) { console.warn(e); cells.delete(key); setTimeout(plan, 500); }   // a failed fetch is queued again
  }
  function pump() {
    while (loading < 6 && queue.length) {
      const key = queue.shift();
      if (cells.has(key)) continue;
      cells.set(key, { state: "loading", tex: {} }); loading++;
      loadCell(key).finally(() => { loading--; pump(); });
    }
  }
  const cellsIn = (r) => {
    const out = [];
    const cx0 = Math.max(0, Math.floor(r.x0 / cellSq)), cx1 = Math.min(NX - 1, Math.floor((r.x1 - 1e-6) / cellSq));
    const cy0 = Math.max(0, Math.floor(r.y0 / cellSq)), cy1 = Math.min(NY - 1, Math.floor((r.y1 - 1e-6) / cellSq));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) out.push(`${x}_${y}`);
    return out;
  };

  // ---- the window: whole squares, clamped to the map
  const view = { x: 0, y: 0, whole: false, dir: { dx: 0, dy: 0 } };
  const shown = { x: 0, y: 0 };
  const viewRect = () => ({ x0: view.x, y0: view.y, x1: view.x + SW, y1: view.y + SH });
  function plan() {
    const v = viewRect(), d = view.dir;
    const lr = { x0: v.x0 - SW * (RING - d.dx * LEAN), x1: v.x1 + SW * (RING + d.dx * LEAN), y0: v.y0 - SH * (RING - d.dy * LEAN), y1: v.y1 + SH * (RING + d.dy * LEAN) };
    const k = KEEP * cellSq, keep = new Set(cellsIn({ x0: lr.x0 - k, y0: lr.y0 - k, x1: lr.x1 + k, y1: lr.y1 + k }));
    const vis = new Set(cellsIn(v)), cx = v.x0 + SW / 2, cy = v.y0 + SH / 2;
    const dist = (key) => { const [a, b] = key.split("_").map(Number); return Math.hypot((a + 0.5) * cellSq - cx, (b + 0.5) * cellSq - cy); };
    const want = cellsIn(lr).sort((a, b) => (vis.has(b) - vis.has(a)) || dist(a) - dist(b));
    queue.length = 0; queue.push(...want.filter((key) => !cells.has(key)));
    for (const key of [...cells.keys()]) if (!keep.has(key)) freeCell(key);
    pump();
  }
  function moveTo(x, y) {
    x = Math.max(0, Math.min(cols - SW, Math.round(x))); y = Math.max(0, Math.min(rows - SH, Math.round(y)));
    const dx = Math.sign(x - view.x), dy = Math.sign(y - view.y);
    if (dx || dy) view.dir = { dx, dy };
    view.x = x; view.y = y; plan();
  }

  // roofs: a sprite is loaded while any cell it covers is live
  async function syncRoofs() {
    M.roofs.forEach(async (r, i) => {
      const need = r.cells.some((k) => cells.get(k)?.state === "live");
      const have = roofTex.get(i);
      if (need && !have) {
        roofTex.set(i, "loading");
        try {
          const b = await bitmap(r.file, { premultiply: true });
          if (roofTex.get(i) === "loading") roofTex.set(i, texture(gl, b)); b.close();
        } catch (e) { console.warn(e); roofTex.delete(i); setTimeout(() => (liveDirty = true), 500); }   // retried on the next sync
      } else if (!need && have) { if (have !== "loading") gl.deleteTexture(have.tex); roofTex.delete(i); }
    });
  }

  // ---- input: arrows = a square, shift = a screen; a drag moves the window in whole squares; M = whole map
  let geo = { s: 1, ox: 0, oy: 0 };
  addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (step) { e.preventDefault(); const k = e.shiftKey ? [SW, SH] : [1, 1]; moveTo(view.x + step[0] * k[0], view.y + step[1] * k[1]); }
    if (e.key === "m" || e.key === "M") ui.setWhole(!view.whole);
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (view.whole) {   // a tap on the overview jumps the window there
      const x = (e.offsetX * dpr() - geo.ox) / geo.s, y = (e.offsetY * dpr() - geo.oy) / geo.s;
      ui.setWhole(false); moveTo(x - SW / 2, y - SH / 2); return;
    }
    canvas.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, vx = view.x, vy = view.y;
    canvas.onpointermove = (m) => moveTo(vx - ((m.clientX - sx) * dpr()) / geo.s, vy - ((m.clientY - sy) * dpr()) / geo.s);
    canvas.onpointerup = () => (canvas.onpointermove = null);
  });
  const dpr = () => Math.min(devicePixelRatio || 1, 2);

  // ---- frame
  let W = 0, H = 0;
  const cloudOff = [0, 0], t0 = performance.now();
  let last = t0, frames = 0, fpsT = t0, fps = 0, gpuMs = 0, query = null, queryRepeat = 1;
  const stats = { live: 0, loading: 0, standIns: 0, gpuMB: 0, parts: {} };

  function common(p, t) {
    gl.useProgram(p);
    gl.uniform4f(p.u("u_view"), ...geo.view); gl.uniform1f(p.u("u_t"), t);
    const s = ui.state, a = s.windAngle;
    gl.uniform2f(p.u("u_dir"), Math.cos(a), Math.sin(a));
    gl.uniform1f(p.u("u_wind"), s["Strong wind"] ? 1.0 : 0.45); gl.uniform1f(p.u("u_gusts"), s.Gusts ? 1 : 0);
    gl.uniform1f(p.u("u_cloud"), s.Clouds ? 1 : 0); gl.uniform2f(p.u("u_cloudOff"), cloudOff[0], cloudOff[1]);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, S.noise.tex); gl.uniform1i(p.u("u_noise"), 7);
    gl.uniform2f(p.u("u_shift"), 0, 0);
  }
  const bind = (p, name, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(p.u(name), unit); };
  const box = (p, x, y, w, h) => gl.uniform4f(p.u("u_box"), x, y, w, h);
  const cellBox = (m) => [m.x / pps, m.y / pps, m.w / pps, m.h / pps];

  function draw(t, list) {
    const s = ui.state;
    gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.clearColor(0.07, 0.07, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(...geo.scissor);
    gl.disable(gl.BLEND);
    // the preview under everything: the whole map at 1/4 (in the overview it is the picture)
    common(P.picture, t); bind(P.picture, "u_tex", 0, S.preview); gl.bindVertexArray(boxVao.picture);
    box(P.picture, 0, 0, cols, rows); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (view.whole) return;
    for (const [, m, c] of list) { bind(P.picture, "u_tex", 0, c.tex.ground); box(P.picture, ...cellBox(m)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (s.Water) {
      const p = P.water; common(p, t); gl.bindVertexArray(boxVao.water); gl.uniform1f(p.u("u_wq"), M.waterScale); gl.uniform1f(p.u("u_dbg"), s.debugWater ? 1 : 0);
      for (const [, m, c] of list) {
        if (!c.tex.w1) continue;
        bind(p, "u_ground", 0, c.tex.ground); bind(p, "u_flow", 1, c.tex.w1); bind(p, "u_flow2", 2, c.tex.w2);
        gl.uniform4f(p.u("u_cellPx"), m.x, m.y, m.w, m.h); gl.uniform2f(p.u("u_wsize"), m.water[0] + 2, m.water[1] + 2);
        box(p, ...cellBox(m)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (s.Canopy) {   // the crowns' shadows fall before the plants (bushes keep their own)
      const p = P.shadow; common(p, t); gl.bindVertexArray(boxVao.shadow); gl.uniform2f(p.u("u_shift"), 0.45, 0.6);
      for (const [, m, c] of list) {
        if (!c.tex.small) continue;
        bind(p, "u_small", 0, c.tex.small); gl.uniform2f(p.u("u_texel"), 4 / m.w, 4 / m.h);
        box(p, ...cellBox(m)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (s.Plants && plantsArr?.n) {
      const p = P.veg; common(p, t); bind(p, "u_atlas", 0, S.atlas); gl.uniform2f(p.u("u_sun"), 0.22, 0.30);
      gl.bindVertexArray(plantsArr.vao); gl.drawArrays(gl.TRIANGLES, 0, plantsArr.n);
    }
    if (s.Canopy) {
      let p = P.under; common(p, t); gl.bindVertexArray(boxVao.under);
      for (const [, m, c] of list) {
        if (!c.tex.canopy) continue;
        bind(p, "u_canopy", 0, c.tex.canopy); bind(p, "u_small", 1, c.tex.small);
        box(p, ...cellBox(m)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      p = P.clump; common(p, t);
      for (const [, m, c] of list) {
        if (!c.clumpArr?.n) continue;
        bind(p, "u_canopy", 0, c.tex.canopy); bind(p, "u_ids", 1, c.tex.ids); gl.uniform4f(p.u("u_cellPx"), m.x, m.y, m.w, m.h);
        gl.bindVertexArray(c.clumpArr.vao); gl.drawArrays(gl.TRIANGLES, 0, c.clumpArr.n);
      }
    }
    if (s.Roofs) {
      const p = P.roof; common(p, t); gl.bindVertexArray(boxVao.roof);
      for (const [i, rt] of roofTex) {
        if (rt === "loading") continue;
        const r = M.roofs[i], b = [r.x / pps, r.y / pps, r.w / pps, r.h / pps];
        bind(p, "u_tex", 0, rt);
        gl.uniform2f(p.u("u_shift"), 0.22, 0.3); gl.uniform1f(p.u("u_shadow"), 1); box(p, ...b); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform2f(p.u("u_shift"), 0, 0); gl.uniform1f(p.u("u_shadow"), 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
  }

  function fit() {
    const w = Math.round(canvas.clientWidth * dpr()), h = Math.round(canvas.clientHeight * dpr());
    if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; }
    const [vw, vh] = view.whole ? [cols, rows] : [SW, SH];
    const s = Math.min(W / vw, H / vh), ox = Math.round((W - vw * s) / 2), oy = Math.round((H - vh * s) / 2);
    const fx = view.whole ? 0 : shown.x, fy = view.whole ? 0 : shown.y;
    geo = { s, ox: ox - fx * s, oy: oy - fy * s, scissor: [ox, H - oy - Math.round(vh * s), Math.round(vw * s), Math.round(vh * s)] };
    geo.view = [(2 * s) / W, (-2 * s) / H, (2 * geo.ox) / W - 1, 1 - (2 * geo.oy) / H];
  }

  function frame(now) {
    const t = ui.state.time ?? (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;   // state.time freezes the clock (tests)
    // the window glides to its whole-square target in ~0.12 s (the TV's pan); snaps once close
    for (const k of ["x", "y"]) { const d = view[k] - shown[k]; shown[k] = Math.abs(d) < 0.01 ? view[k] : shown[k] + d * Math.min(1, dt * 18); }
    fit();
    const s = ui.state, cs = (s["Strong wind"] ? 0.05 : 0.022) * dt;
    cloudOff[0] += Math.cos(s.windAngle) * cs; cloudOff[1] += Math.sin(s.windAngle) * cs;
    if (liveDirty) {
      liveDirty = false;
      const idx = [];
      for (const [key, c] of cells) if (c.state === "live") idx.push(...(M.cells[key].plants || []));
      freeArray(plantsArr);
      plantsArr = vertexArray(P.veg, buildPlants(M.plants, idx), [["a_pos", 2], ["a_uv", 2], ["a_pivot", 2], ["a_centre", 2], ["a_p", 4], ["a_tint", 4], ["a_radius", 1]], VEG_FLOATS);
      syncRoofs();
    }
    // cells drawn: live ones touching the shown window (+1 square for shadows and sway)
    const vr = { x0: shown.x - 1, y0: shown.y - 1, x1: shown.x + SW + 1, y1: shown.y + SH + 1 };
    const list = [];
    let standIns = 0;
    for (const key of cellsIn(vr)) { const c = cells.get(key); if (c?.state === "live") list.push([key, M.cells[key], c]); }
    for (const key of cellsIn({ x0: shown.x, y0: shown.y, x1: shown.x + SW, y1: shown.y + SH })) if (cells.get(key)?.state !== "live") standIns++;
    // GPU time: every 10th frame the whole draw runs `repeat` times inside one timer query (a near idle GPU clocks down)
    if (timer && !query && frames % 10 === 0) {
      queryRepeat = Math.max(1, s.repeat | 0); query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      for (let r = 0; r < queryRepeat; r++) draw(t, list);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
    } else draw(t, list);
    if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / queryRepeat; gpuMs = gpuMs ? gpuMs * 0.8 + ms * 0.2 : ms; }
      gl.deleteQuery(query); query = null;
    }
    frames++;
    if (now - fpsT >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
    // memory: what the GPU holds right now
    const parts = { ground: 0, canopy: 0, water: 0, shared: S.noise.bytes + S.atlas.bytes + S.preview.bytes, roofs: 0, vertices: plantsArr?.bytes || 0 };
    let live = 0;
    for (const c of cells.values()) {
      if (c.state !== "live") continue; live++;
      parts.ground += c.tex.ground.bytes;
      parts.canopy += (c.tex.canopy?.bytes || 0) + (c.tex.small?.bytes || 0) + (c.tex.ids?.bytes || 0);
      parts.water += (c.tex.w1?.bytes || 0) + (c.tex.w2?.bytes || 0);
      parts.vertices += c.clumpArr?.bytes || 0;
    }
    for (const rt of roofTex.values()) if (rt !== "loading") parts.roofs += rt.bytes;
    const mb = (b) => b / 1048576;
    Object.assign(stats, { live, loading: [...cells.values()].filter((c) => c.state === "loading").length, queued: queue.length, standIns,
      gpuMB: mb(Object.values(parts).reduce((a, b) => a + b, 0)), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, mb(v)])),
      gpuMs, fps, view: [view.x, view.y], whole: view.whole, scale: geo.s, drawn: list.length });
    ui.info(stats);
    requestAnimationFrame(frame);
  }

  moveTo(ui.at?.[0] ?? 0, ui.at?.[1] ?? 0); shown.x = view.x; shown.y = view.y;
  requestAnimationFrame(frame);
  return {
    stats, moveTo, view,
    setWhole(on) { view.whole = on; if (!on) { shown.x = view.x; shown.y = view.y; } },
    settled: () => stats.standIns === 0 && stats.loading === 0 && stats.queued === 0 && shown.x === view.x && shown.y === view.y,
  };
}
