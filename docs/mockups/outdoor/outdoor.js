// The riverbend slice on the table: one painted ground, and everything that moves drawn by us on
// top of it in four WebGL2 passes — ground, water (a flow map over the painted riverbed), every
// plant in ONE batched draw (wind in the vertex shader), roofs. Clouds drift over all of them.
// Assets: prepare.py → scene.json. Design notes: battlemap docs/ai-art.md "outdoor maps".

// ---------------------------------------------------------------- shaders

const HEAD = `#version 300 es
precision highp float;
uniform vec4 u_view;      // squares → clip: x*sx + ox, y*sy + oy
uniform vec2 u_map;       // cols, rows
uniform float u_t;
uniform vec2 u_dir;       // wind direction
uniform float u_wind;     // base strength (0.45 breeze, 1 strong)
uniform float u_gusts;    // 1 = gusts roll across the map
uniform float u_cloud;    // cloud shadow strength 0..1
uniform vec2 u_cloudOff;  // how far the clouds have drifted (integrated on the CPU)
uniform sampler2D u_noise;
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
`;

const QUAD_VS = HEAD + `
in vec2 a_p; out vec2 v_sq;
void main() { v_sq = a_p * u_map; gl_Position = vec4(v_sq.x * u_view.x + u_view.z, v_sq.y * u_view.y + u_view.w, 0, 1); }`;

const GROUND_FS = HEAD + `
uniform sampler2D u_ground; in vec2 v_sq; out vec4 o;
void main() { o = vec4(texture(u_ground, v_sq / u_map).rgb * cloud(v_sq), 1.0); }`;

// Water: the painted riverbed seen through moving water. Two flow-map phases half a cycle apart
// (no stretching), noise sampled in the flow's own frame (streaks run along it). Calm: slow
// wobble + soft glints. Rapids (speed → 1): fast, white streaks, foam boiling behind boulders.
// Ford (shallow → 1): caustic light nets over the pebbles. Banks: still water, a lapping line.
const WATER_FS = HEAD + `
uniform sampler2D u_ground, u_flow, u_flow2; uniform float u_move;
in vec2 v_sq; out vec4 o;
// noise in the flow's frame; one tile of the 256² noise = s squares (channel R ~3 blobs a tile,
// G ~7, B ~16, A ~4 ridges) — too small an s and the mipmaps grey it out: nothing visibly moves
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
  float t = u_t * u_move;
  float vel = mix(0.30, 3.0, speed);                  // squares a second
  float cyc = mix(2.2, 1.3, speed);
  float ph0 = fract(t / cyc), ph1 = fract(t / cyc + 0.5), w1 = abs(ph0 * 2.0 - 1.0);
  vec2 q0 = v_sq - dir * vel * ph0 * cyc, q1 = v_sq - dir * vel * ph1 * cyc + 0.37;
  // ripples: distortion of the bed + glints
  vec4 r0 = tap(q0, dir, vec2(0.7, 1.4), 2.6), r1 = tap(q1, dir, vec2(0.7, 1.4), 2.6);
  vec4 r = mix(r0, r1, w1);
  float still = smoothstep(0.0, 0.35, bank);
  // the painted bed (and its painted white water) wobbles — hard and fast in the rapids
  vec4 c0 = tap(q0, dir, vec2(0.8, 1.4), 5.0), c1 = tap(q1, dir, vec2(0.8, 1.4), 5.0);   // B blobs ~0.3 sq
  vec4 chop = mix(c0, c1, w1);                        // small choppy blobs: their travel is what you see move
  vec2 disp = ((r.gb - 0.5) * (0.05 + 0.06 * speed) + (chop.rg - 0.5) * 0.16 * speed) * still * (1.0 - 0.5 * shallow);
  vec3 bed = texture(u_ground, (v_sq + disp) / u_map).rgb;
  // streaks along the flow (rapids)
  vec4 s0 = tap(q0, dir, vec2(0.22, 1.9), 6.0), s1 = tap(q1, dir, vec2(0.22, 1.9), 6.0);
  float streak = mix(s0.b, s1.b, w1);
  float fast = smoothstep(0.3, 0.9, speed);
  // white water: broken flecks riding the chop (never long smooth streaks — those hide their motion)
  float foam = fast * max(smoothstep(0.60, 0.80, chop.b) * 0.9, smoothstep(0.62, 0.82, streak) * smoothstep(0.5, 0.8, chop.g) * 0.7);
  // boulders: flecks thick at the rock, thinning down the wake — always moving, never a solid ring
  foam = max(foam, smoothstep(0.35, 0.75, chop.a * 0.6 + chop.b * 0.4) * smoothstep(0.05, 0.6, rockfoam) * 0.95);
  // caustics in the shallows: a ridge net drifting slowly
  float cn = mix(tap(q0, dir, vec2(1.0), 1.4).a, tap(q1, dir, vec2(1.0), 1.4).a, w1);
  float caus = pow(1.0 - abs(cn * 2.0 - 1.0), 10.0) * shallow * (1.0 - speed);
  // glints: the sun from the upper left catching ripple crests
  float crest = smoothstep(0.68, 0.86, dot(r.gb - 0.5, vec2(-0.7, -0.7)) + 0.5 + r.r * 0.25);
  // a lapping line at the bank
  float lap = smoothstep(0.10, 0.0, abs(bank - 0.06 - 0.03 * sin(t * 1.3 + dot(v_sq, vec2(1.7, 2.3))))) * (1.0 - speed);
  vec3 col = bed * (1.0 + 0.28 * caus);
  col += vec3(0.9, 0.95, 1.0) * crest * 0.09 * (1.0 - 0.6 * speed);
  col *= 1.0 - 0.12 * fast * (chop.r - 0.5);         // troughs and crests darken / lighten the run
  col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam * 0.85 + lap * 0.22, 0.0, 1.0));
  col *= cloud(v_sq);
  o = vec4(col * mask, mask);
}`;

// Plants: every vertex carries its rest position, the pivot it swings around, the plant's
// centre and radius, a sway amplitude, a seed, its kind and flags. kind 0 = a clump of a crown
// (swings around its branch end), 1 = bush mesh, 2 = reed bed, 3 = lily, 4 = willow/heavy mesh,
// 5 = still (the darkened under-copy). flags: 1 = canopy (lifts around the party), 2 = shadow.
const VEG_VS = HEAD + `
in vec2 a_pos, a_uv, a_pivot, a_centre; in vec4 a_p; in vec4 a_tint; in float a_radius;
out vec2 v_uv, v_sq; out vec4 v_tint; out float v_flags;
uniform vec2 u_sun;  // shadow offset per square of radius
void main() {
  float amp = a_p.x, seed = a_p.y, kind = a_p.z, flags = a_p.w, R = max(a_radius, 1e-3);
  vec2 dir = u_dir, perp = vec2(-dir.y, dir.x);
  float w = windAt(a_centre);
  vec2 p = a_pos;
  if (kind < 0.5) {                       // a clump hangs off its branch end and sways; a wave runs through the crown
    vec2 rr = (a_pivot - a_centre) / R; float r = min(1.0, length(rr));
    float k = 0.35 + 0.65 * r, ph = 2.4 * dot(rr, dir) + seed * 1.4;
    float wave = sin(u_t * 2.6 - ph) + 0.35 * sin(u_t * 5.9 - ph * 1.7 + seed * 6.0);
    float along = amp * w * k * (0.55 + 0.45 * wave), across = amp * 0.35 * w * k * sin(u_t * 3.3 + seed * 9.0);
    float rot = 0.022 * w * k * wave, sc = 1.0 + 0.012 * w * sin(u_t * 1.9 + ph);
    vec2 d = (a_pos - a_pivot) * sc; float c = cos(rot), s = sin(rot);
    p = a_pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y) + dir * along + perp * across;
  } else if (kind > 2.5 && kind < 3.5) {  // lily: turns and drifts a little on the water
    vec2 rel = a_pos - a_centre;
    float a = 0.035 * sin(u_t * 0.35 + seed * 6.0), c = cos(a), s = sin(a);
    p = a_centre + vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y) + dir * 0.03 * sin(u_t * 0.5 + seed * 4.0);
  } else if (kind < 4.5) {                // meshes: the rim moves, the middle holds
    float r = min(1.2, length(a_pos - a_centre) / R);
    float fr = kind < 1.5 ? 1.7 : kind < 2.5 ? 2.3 : 0.9;     // bush, reed, willow / conifer
    float kx = kind > 1.5 && kind < 2.5 ? 1.6 : 0.5;          // reeds: a wave rolls through the bed
    float wave = sin(u_t * fr * 2.0 - dot(a_pos, dir) * kx + seed * 6.0);
    float flutter = sin(u_t * fr * 5.3 + dot(a_pos, perp) * 2.1 + seed * 11.0);
    float bend = amp * w * pow(r, 1.4);
    p = a_pos + dir * bend * (0.6 + 0.4 * wave) + perp * bend * 0.25 * flutter;
  }
  if (mod(flags, 4.0) >= 2.0) p += u_sun * R;   // shadow: offset away from the sun
  v_sq = p; v_uv = a_uv; v_tint = a_tint; v_flags = flags;
  gl_Position = vec4(p.x * u_view.x + u_view.z, p.y * u_view.y + u_view.w, 0, 1);
}`;

const VEG_FS = HEAD + `
uniform sampler2D u_atlas; uniform vec2 u_party[8]; uniform int u_nparty; uniform float u_lift;
in vec2 v_uv, v_sq; in vec4 v_tint; in float v_flags; out vec4 o;
void main() {
  vec4 c = texture(u_atlas, v_uv);
  c.rgb *= v_tint.rgb; c *= v_tint.a;
  if (mod(v_flags, 2.0) >= 1.0 && u_lift > 0.5) {   // canopy: see-through around the party
    float d = 99.0;
    for (int i = 0; i < 8; i++) { if (i >= u_nparty) break; d = min(d, length(v_sq - u_party[i])); }
    c *= mix(0.22, 1.0, smoothstep(1.4, 2.8, d));   // a ghost of the crown stays: you are under a tree
  }
  c.rgb *= cloud(v_sq);
  o = c;
}`;

const ROOF_VS = HEAD + `
in vec2 a_p; uniform vec4 u_box; out vec2 v_uv, v_sq;
void main() { v_uv = a_p; v_sq = u_box.xy + a_p * u_box.zw; gl_Position = vec4(v_sq.x * u_view.x + u_view.z, v_sq.y * u_view.y + u_view.w, 0, 1); }`;
const ROOF_FS = HEAD + `
uniform sampler2D u_roof; uniform float u_alpha, u_shadow; in vec2 v_uv, v_sq; out vec4 o;
void main() {
  vec4 c = texture(u_roof, v_uv);
  if (u_shadow > 0.5) { o = vec4(0.0, 0.0, 0.0, c.a * 0.38 * u_alpha); return; }
  c.rgb *= cloud(v_sq); o = c * u_alpha;
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

function texture(gl, src, { repeat = false, mip = false, premultiply = true } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

/** A tileable 256² noise: R broad fBm, G mid, B fine, A a ridge net (for caustics). Sums of
 *  cosines with whole-number frequencies tile by construction. */
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

// ---------------------------------------------------------------- plants → one vertex buffer

const KIND = { clump: 0, bush: 1, fern: 1, reed: 2, lily: 3, willow: 4, spruce: 4, tree: 4, under: 5, trunk: 5 };
const FLOATS = 2 + 2 + 2 + 2 + 4 + 4 + 1;   // pos uv pivot centre p tint radius

/** Builds the plants' vertices: shadows first, then every plant in scene order. */
function buildPlants(scene) {
  const { types, plants, atlas, mesh } = scene, v = [];
  const uv = (r, u, w) => [(r[0] + u * r[2]) / atlas.w, (r[1] + w * r[3]) / atlas.h];
  const place = (p, t) => {
    const s = (t.squares * p.scale) / Math.max(t.w, t.h), a = (p.rot * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
    return (px, py) => { const dx = (px - t.centre[0]) * s, dy = (py - t.centre[1]) * s; return [p.x + c * dx - si * dy, p.y + si * dx + c * dy]; };
  };
  let R = 1;   // the plant being laid: its radius in squares
  const quad = (pts, uvs, pivot, centre, prm, tint) => {
    for (const i of [0, 1, 2, 2, 1, 3]) v.push(...pts[i], ...uvs[i], ...pivot, ...centre, ...prm, ...tint, R);
  };
  // a picture laid as an n×n mesh (so its vertices can bend); rect in atlas, (x0,y0,w,h) in still px
  const grid = (to, rect, x0, y0, w, h, n, pivot, centre, prm, tint) => {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cs = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      quad(cs.map(([a, b]) => to(x0 + (w * a) / n, y0 + (h * b) / n)), cs.map(([a, b]) => uv(rect, a / n, b / n)), pivot, centre, prm, tint);
    }
  };
  const layerOf = (p) => p.layer === "tree";
  const sunTint = { tree: 0.42, bush: 0.34, low: 0.22, reed: 0.26, lily: 0.12 };
  // shadows (one pass under everything)
  for (const p of plants) {
    const t = types[p.type];
    if (!t.shadow) continue;                 // trunks lie flat: no shadow
    const to = place(p, t), k = KIND[t.kind] ?? 1, c = to(t.centre[0], t.centre[1]);
    R = (t.squares * p.scale) / 2;
    const kk = t.clumps || k === 3 ? 1 : k;   // a crown's shadow bends as one bush; a lily's lies still
    grid(to, t.shadow, 0, 0, t.w, t.h, 3, c, c, [k === 3 ? 0 : 0.035 * R, (p.x * 0.37) % 1, kk, (layerOf(p) ? 1 : 0) + 2], [1, 1, 1, sunTint[p.layer] ?? 0.3]);
  }
  for (const p of plants) {
    const t = types[p.type], to = place(p, t), centre = to(t.centre[0], t.centre[1]);
    R = (t.squares * p.scale) / 2;
    const flags = layerOf(p) ? 1 : 0, tint = [...p.tint, 1], seed = (p.x * 3.7 + p.y * 1.3) % 1;
    if (t.clumps) {
      grid(to, t.under, 0, 0, t.w, t.h, 1, centre, centre, [0, seed, KIND.under, flags], tint);
      const A = 0.0175 * R;                              // sway at the rim, squares (demo: 4.5 px of 512)
      for (const q of t.clumps) {
        const [qx, qy] = [q.x0, q.y0], pv = to(q.pivot[0], q.pivot[1]);
        grid(to, q.rect, qx, qy, q.rect[2], q.rect[3], 1, pv, centre, [A, q.seed, KIND.clump, flags], tint);
      }
    } else {
      const k = KIND[t.kind] ?? 1, n = mesh[t.kind] ?? 4;
      const amp = ({ 1: 0.06, 2: 0.10, 3: 0, 4: 0.075 }[k] ?? 0) * R;
      grid(to, t.still, 0, 0, t.w, t.h, n, centre, centre, [amp, seed, k, flags], tint);
    }
  }
  return new Float32Array(v);
}

// ---------------------------------------------------------------- the stage

export async function start(canvas, ui) {
  const scene = await fetch("scene.json").then((r) => r.json());
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) throw new Error("WebGL2 not available");
  const [ground, water, water2, atlasImg] = await Promise.all([
    load(scene.ground), load(scene.water), load(scene.water2), scene.plants.length ? load(scene.atlas.file) : null]);
  const roofs = await Promise.all(scene.roofs.map(async (r) => ({ ...r, img: await load(r.file), alpha: 1 })));

  const T = {
    ground: texture(gl, ground, { mip: true }),
    water: texture(gl, water, { premultiply: false }), water2: texture(gl, water2, { premultiply: false }),
    noise: texture(gl, noiseTexture(), { repeat: true, mip: true, premultiply: false }),
    atlas: atlasImg && texture(gl, atlasImg, { mip: true }),
  };
  roofs.forEach((r) => (r.tex = texture(gl, r.img, { mip: true })));
  const P = {
    ground: program(gl, QUAD_VS, GROUND_FS), water: program(gl, QUAD_VS, WATER_FS),
    veg: program(gl, VEG_VS, VEG_FS), roof: program(gl, ROOF_VS, ROOF_FS),
  };
  const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const quadVao = (p) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const l = gl.getAttribLocation(p, "a_p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    return vao;
  };
  const V = { ground: quadVao(P.ground), water: quadVao(P.water), roof: quadVao(P.roof) };
  const plants = buildPlants(scene), nVerts = plants.length / FLOATS;
  V.veg = gl.createVertexArray(); gl.bindVertexArray(V.veg);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, plants, gl.STATIC_DRAW);
  let off = 0;
  for (const [name, n] of [["a_pos", 2], ["a_uv", 2], ["a_pivot", 2], ["a_centre", 2], ["a_p", 4], ["a_tint", 4], ["a_radius", 1]]) {
    const l = gl.getAttribLocation(P.veg, name);
    if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, FLOATS * 4, off * 4); }
    off += n;
  }
  gl.bindVertexArray(null);

  const gpu = (ground.width * ground.height * 4 * 4) / 3 + (atlasImg ? (atlasImg.width * atlasImg.height * 4 * 4) / 3 : 0)
    + water.width * water.height * 8 + roofs.reduce((a, r) => a + r.img.width * r.img.height * 4, 0) + 256 * 256 * 4;
  ui.info({ plants: scene.plants.length, quads: nVerts / 6, gpuMB: gpu / 1048576, types: Object.keys(scene.types).length });

  const { cols, rows } = scene;
  let view = [1, 1, 0, 0], W = 0, H = 0, geo = { left: 0, top: 0, sq: 1 };
  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h;
    const s = Math.min(W / cols, H / rows), mw = (cols * s) / W, mh = (rows * s) / H;   // fraction of the canvas
    view = [(2 * mw) / cols, (-2 * mh) / rows, -mw, mh];
    geo = { left: ((1 - mw) / 2) * canvas.clientWidth, top: ((1 - mh) / 2) * canvas.clientHeight, sq: s / dpr };
    ui.layout(geo);
  }

  const common = (p, t) => {
    gl.useProgram(p);
    gl.uniform4f(p.u("u_view"), ...view); gl.uniform2f(p.u("u_map"), cols, rows); gl.uniform1f(p.u("u_t"), t);
    const s = ui.state, a = s.windAngle;
    gl.uniform2f(p.u("u_dir"), Math.cos(a), Math.sin(a));
    gl.uniform1f(p.u("u_wind"), s["Strong wind"] ? 1.0 : 0.45); gl.uniform1f(p.u("u_gusts"), s.Gusts ? 1 : 0);
    gl.uniform1f(p.u("u_cloud"), s.Clouds ? 1 : 0); gl.uniform2f(p.u("u_cloudOff"), cloudOff[0], cloudOff[1]);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.noise); gl.uniform1i(p.u("u_noise"), 3);
  };
  const bind = (p, name, unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.u(name), unit); };

  const t0 = performance.now();
  let last = t0;
  const cloudOff = [0, 0];
  // a tap on a house opens or closes its roof (the DM's hand); a party token inside opens it too
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - geo.left) / geo.sq, y = (e.clientY - r.top - geo.top) / geo.sq;
    for (const roof of roofs) {
      const [fx, fy, fw, fh] = roof.footprint;
      if (x > fx - 0.3 && x < fx + fw + 0.3 && y > fy - 0.3 && y < fy + fh + 0.3) roof.open = !roof.open;
    }
  });
  function frame(now) {
    fit();
    const t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
    const s = ui.state, party = ui.party();
    const cs = (s["Strong wind"] ? 0.05 : 0.022) * dt;   // clouds drift with the wind (in units of 30 squares)
    cloudOff[0] += Math.cos(s.windAngle) * cs; cloudOff[1] += Math.sin(s.windAngle) * cs;
    gl.viewport(0, 0, W, H); gl.clearColor(0.07, 0.07, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    common(P.ground, t); bind(P.ground, "u_ground", 0, T.ground);
    gl.bindVertexArray(V.ground); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (s.Water) {
      common(P.water, t); bind(P.water, "u_ground", 0, T.ground); bind(P.water, "u_flow", 1, T.water); bind(P.water, "u_flow2", 2, T.water2);
      gl.uniform1f(P.water.u("u_move"), 1);
      gl.bindVertexArray(V.water); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (s.Plants && nVerts) {
      common(P.veg, t); bind(P.veg, "u_atlas", 4, T.atlas);
      gl.uniform2f(P.veg.u("u_sun"), 0.22, 0.30);
      const flat = new Float32Array(16); party.slice(0, 8).forEach(([x, y], i) => { flat[i * 2] = x; flat[i * 2 + 1] = y; });
      gl.uniform2fv(P.veg.u("u_party"), flat); gl.uniform1i(P.veg.u("u_nparty"), Math.min(8, party.length));
      gl.uniform1f(P.veg.u("u_lift"), s["Canopy opens"] ? 1 : 0);
      gl.bindVertexArray(V.veg); gl.drawArrays(gl.TRIANGLES, 0, nVerts);
    }
    for (const r of roofs) {
      const [fx, fy, fw, fh] = r.footprint;
      const inside = r.open || (s["Roof opens"] && party.some(([x, y]) => x > fx && x < fx + fw && y > fy && y < fy + fh));
      r.alpha += ((inside ? 0 : 1) - r.alpha) * Math.min(1, dt * 6);
      if (r.alpha < 0.01) continue;
      const box = [(r.x / r.px[0]) * cols, (r.y / r.px[1]) * rows, (r.w / r.px[0]) * cols, (r.h / r.px[1]) * rows];
      common(P.roof, t); bind(P.roof, "u_roof", 5, r.tex); gl.bindVertexArray(V.roof);
      gl.uniform1f(P.roof.u("u_alpha"), r.alpha);
      gl.uniform4f(P.roof.u("u_box"), box[0] + 0.22, box[1] + 0.3, box[2], box[3]); gl.uniform1f(P.roof.u("u_shadow"), 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.uniform4f(P.roof.u("u_box"), ...box); gl.uniform1f(P.roof.u("u_shadow"), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
