// The viewer's exit check in headless Chromium (GPU via Metal): shots of named windows + the whole
// map at 1920 × 1080, a pan over the whole map (every window position on a coarse raster, then a
// serpentine of square steps) checking no window stays on the preview after settling, GPU MB per
// window, GPU frame time (the draw repeated 20× per timed frame so the GPU clocks up). Then the
// interactions (step 4b): tokens in the forest show through the canopy ghost, a token inside a house
// lifts its roof, a tap toggles a roof, the wind dial turns the wind without jumps; console errors.
// With "ring" as the third argument: the ring bench instead (½ · ¼ · no ring: GPU MB, preview seen
// after a one-square and a one-screen pan); a fourth argument delays every cell load by that many ms
// (a stand-in for the TV box's slower fetch + decode).
//
//   python3 -m http.server 8765 -d docs/mockups/outdoor/summervale &   (any static server)
//   node docs/mockups/outdoor/summervale/shoot.mjs [http://localhost:8765/] [out-dir] [ring]
//
// Playwright comes from v2/node_modules. Shots: full-size PNG; `*-small.jpg` (downscaled) to look at.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../../v2/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const base = process.argv[2] || "http://localhost:8765/";
const out = process.argv[3] || "/tmp/summervale-shots";
mkdirSync(out, { recursive: true });
const WINDOWS = { village: [34, 4], rapids: [62, 38], stones: [96, 17], ruin: [100, 56], "great-forest": [80, 18] };

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [], resets = [];   // resets: python's http.server drops a few fetches under load; the viewer retries them
page.on("console", (m) => m.type() === "error" && (/ERR_CONNECTION_RESET/.test(m.text()) ? resets : errors).push(m.text()) && console.log("console:", m.text()));
page.on("pageerror", (e) => (errors.push(e.message), console.log("pageerror:", e.message)));
await page.goto(`${base}#repeat=20&clean`);
await page.waitForFunction(() => window.sv);
const renderer = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; });
const settle = async (ms = 20000) => { await page.waitForFunction(() => window.sv.settled(), null, { timeout: ms, polling: 50 }); };
const stats = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sv.stats)));
const report = { renderer, windows: {} };
const r1 = (v) => Math.round(v * 10) / 10;
// a shot downscaled in the page (JPEG, `w` px wide) — the one to look at
const small = async (name, w = 960, clip) => {
  const buf = await page.screenshot(clip ? { clip } : {});
  writeFileSync(`${out}/${name}.png`, buf);
  const jpg = await page.evaluate(async ([b64, w]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas"); c.width = w; c.height = Math.round((bmp.height * w) / bmp.width);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }, [buf.toString("base64"), w]);
  writeFileSync(`${out}/${name}-small.jpg`, Buffer.from(jpg, "base64"));
};
const go = async (x, y) => { await page.evaluate(([x, y]) => window.sv.moveTo(x, y), [x, y]); await settle(); };

if (process.argv[4] === "ring") {   // ---- the ring bench
  const bench = { loadDelayMs: +(process.argv[5] || 0) };
  await page.evaluate((d) => (window.sv.state.loadDelay = d), bench.loadDelayMs);
  // a move, then every frame for `ms`: how many window cells showed the preview, and until when
  const watch = async (x, y, ms) => page.evaluate(async ([x, y, ms]) => {
    const tr = window.sv.trace(ms), t0 = performance.now(); window.sv.moveTo(x, y);
    const rows = await tr; let max = 0, lastMs = 0;
    for (const r of rows) if (r.standIns) { max = Math.max(max, r.standIns); lastMs = r.t - t0; }
    return { max, ms: Math.round(lastMs) };
  }, [x, y, ms]);
  for (const ring of [0.5, 0.25, 0]) {
    await page.evaluate((r) => { window.sv.state.ring = r; window.sv.plan(); }, ring);
    const mb = {};
    for (const [name, [x, y]] of Object.entries(WINDOWS)) { await go(x, y); await page.waitForTimeout(300); const s = await stats(); mb[name] = [r1(s.gpuMB), r1(s.parts.ground), r1(s.parts.canopy), s.live]; }
    const sq = [], scr = [];
    await go(60, 30); await page.waitForTimeout(400);
    const steps = [...Array.from({ length: 10 }, (_, i) => [61 + i, 30]), ...Array.from({ length: 6 }, (_, i) => [70, 31 + i])];   // crosses cell borders (9.14 sq) both ways
    for (const [x, y] of steps) { sq.push(await watch(x, y, 1200)); await settle(); await page.waitForTimeout(300); }
    await go(34, 19); await page.waitForTimeout(400);
    for (const [x, y] of [[68, 19], [68, 38], [34, 38], [34, 19], [0, 19], [0, 0]]) { scr.push(await watch(x, y, 2500)); await settle(); await page.waitForTimeout(300); }
    const agg = (a) => ({ pansWithPreview: a.filter((r) => r.max).length, of: a.length, maxCells: Math.max(...a.map((r) => r.max)), maxMs: Math.max(...a.map((r) => r.ms)) });
    bench[ring] = { maxMB: Math.max(...Object.values(mb).map((v) => v[0])), windows: mb, square: agg(sq), screen: agg(scr) };
    console.log("ring", ring, JSON.stringify(bench[ring]));
  }
  report.ring = bench; report.errors = errors;
  writeFileSync(`${out}/ring-${bench.loadDelayMs}.json`, JSON.stringify(report, null, 2));
  await browser.close(); process.exit(0);
}

for (const [name, [x, y]] of Object.entries(WINDOWS)) {
  await page.evaluate(([x, y]) => window.sv.moveTo(x, y), [x, y]);
  const t = Date.now(); await settle(); const loadMs = Date.now() - t;
  await page.waitForTimeout(2500);     // GPU timer settles over several timed frames
  const s = await stats();
  report.windows[name] = { at: [x, y], loadMs, live: s.live, gpuMB: +s.gpuMB.toFixed(1), parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, +v.toFixed(1)])), gpuMs: +s.gpuMs.toFixed(3), fps: s.fps };
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(report.windows[name]));
}
await page.evaluate(() => window.sv.setWhole(true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/whole.png` });
await page.evaluate(() => window.sv.setWhole(false));

// ---- interactions (step 4b). Clouds off and the clock frozen so reads compare like with like.
const checks = {};
await page.evaluate(() => { window.sv.state.Clouds = false; window.sv.state.time = 7; window.sv.state.repeat = 1; });   // ×1: real frame rate
const setParty = (pts) => page.evaluate((pts) => pts.forEach(([x, y], i) => { window.sv.party[i][0] = Math.floor(x) + 0.5; window.sv.party[i][1] = Math.floor(y) + 0.5; }), pts);
const read = (x, y, w, h) => page.evaluate(([x, y, w, h]) => window.sv.read(x, y, w, h), [x, y, w, h]);
const setS = (o) => page.evaluate((o) => Object.assign(window.sv.state, o), o);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 1. tokens in the great forest: each on the tree nearest a point of the window; read 2 × 2 squares
//    round each with the ghost, without it, and with no canopy at all → how far the crowns opened
{
  const [wx, wy] = WINDOWS["great-forest"]; await go(wx, wy);
  const pts = await page.evaluate(([wx, wy]) => [[9, 6], [24, 6], [9, 13], [24, 13]].map(([px, py]) =>
    window.sv.trees.reduce((b, t) => Math.hypot(t[0] - wx - px, t[1] - wy - py) < Math.hypot(b[0] - wx - px, b[1] - wy - py) ? t : b)), [wx, wy]);
  await setParty(pts);
  const tok = await page.evaluate(() => window.sv.party.map(([x, y]) => [x, y]));
  const readAll = async () => { await page.waitForTimeout(150); return Promise.all(tok.map(([x, y]) => read(x - 1, y - 1, 2, 2))); };
  const on = await readAll(); await small("forest-ghost-on", 960);
  await setS({ "Canopy opens": false }); const off = await readAll(); await small("forest-ghost-off", 960);
  await setS({ Canopy: false }); const bare = await readAll();
  await setS({ Canopy: true, "Canopy opens": true });
  const opened = tok.map((_, i) => +(dist(off[i], on[i]) / Math.max(1, dist(off[i], bare[i]))).toFixed(2));
  // opened = how far the colour moved from closed canopy towards bare ground (ghost 22 % → ~0.78; plants under it stay)
  checks.ghost = { tokens: tok, opened, pass: opened.every((v) => v > 0.25) && opened.reduce((a, b) => a + b) / opened.length > 0.5 };
  console.log("ghost", JSON.stringify(checks.ghost));
}
// 2. a token inside the inn lifts its roof; 3. a tap on another roof toggles it, a second tap closes it
{
  await go(...WINDOWS.village);
  const roofs = await page.evaluate(() => window.sv.roofs.map((r) => ({ id: r.id, f: r.footprint })));
  const v = WINDOWS.village, inWin = (f) => f[0] > v[0] && f[1] > v[1] && f[0] + f[2] < v[0] + 34 && f[1] + f[3] < v[1] + 19;
  const inn = roofs.findIndex((r) => r.id === "inn"), other = roofs.findIndex((r, i) => i !== inn && inWin(r.f));
  const fi = roofs[inn].f, fo = roofs[other].f;
  await setParty([[fi[0] + fi[2] / 2, fi[1] + fi[3] / 2], [v[0] + 3, v[1] + 16], [v[0] + 4, v[1] + 16], [v[0] + 5, v[1] + 16]]);
  await page.waitForTimeout(1200);
  const alpha = () => page.evaluate(() => window.sv.roofAlpha.map((a) => +a.toFixed(3)));
  const a1 = await alpha(); await small("roof-lift", 960);
  await setParty([[v[0] + 2, v[1] + 16]]);   // the token steps out: the roof comes back
  await page.waitForTimeout(1200); const a2 = await alpha();
  const [cx, cy] = await page.evaluate(([x, y]) => window.sv.toScreen(x, y), [fo[0] + fo[2] / 2, fo[1] + fo[3] / 2]);
  await page.mouse.click(cx, cy); await page.waitForTimeout(1200); const a3 = await alpha(); await small("roof-tap", 960);
  await page.mouse.click(cx, cy); await page.waitForTimeout(1200); const a4 = await alpha();
  checks.roofs = { inn: roofs[inn].id, tapped: roofs[other].id, innWithToken: a1[inn], innAfterLeaving: a2[inn], tappedOpen: a3[other], tappedAgain: a4[other],
    pass: a1[inn] < 0.05 && a2[inn] > 0.95 && a3[other] < 0.05 && a4[other] > 0.95 };
  console.log("roofs", JSON.stringify(checks.roofs));
}
// 4. the wind dial: drag half a turn round it; the wind follows ~1 s behind, no step larger than the easing allows
{
  await page.evaluate(() => { document.body.classList.remove("clean"); delete window.sv.state.time; });
  const b = await page.locator(".dial").boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const a0 = await page.evaluate(() => window.sv.state.windAngle);
  const tr = page.evaluate(() => window.sv.trace(4500));
  await page.mouse.move(cx + 40 * Math.cos(a0), cy + 40 * Math.sin(a0)); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { const a = a0 + (Math.PI * 0.95 * i) / 20; await page.mouse.move(cx + 40 * Math.cos(a), cy + 40 * Math.sin(a)); await page.waitForTimeout(15); }
  await page.mouse.up();
  await small("dial-turning", 960);
  const rows = await tr, aim = await page.evaluate(() => window.sv.state.windAim);
  const steps = rows.slice(1).map((r, i) => Math.abs(Math.atan2(Math.sin(r.windAngle - rows[i].windAngle), Math.cos(r.windAngle - rows[i].windAngle))));
  const cl = rows.slice(1).map((r, i) => Math.hypot(r.cloud[0] - rows[i].cloud[0], r.cloud[1] - rows[i].cloud[1]));
  const dts = rows.slice(1).map((r, i) => r.t - rows[i].t);
  const miss = rows.map((r) => Math.abs(Math.atan2(Math.sin(aim - r.windAngle), Math.cos(aim - r.windAngle))));
  // the easing allows a frame to turn the wind by min(1, 1.6 · dt) of what was left; more = a jump
  const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const jump = Math.max(...rows.slice(1).map((r, i) => ang(r.windAngle, rows[i].windAngle) / (Math.min(1, 1.6 * Math.min(0.1, (r.t - rows[i].t) / 1000)) * ang(r.windAim, rows[i].windAngle) + 1e-4)));
  const reached = rows.findIndex((r, i) => miss[i] < 0.1);
  checks.dial = { turnedRad: +Math.abs(Math.atan2(Math.sin(aim - a0), Math.cos(aim - a0))).toFixed(2), frames: rows.length, maxStepRad: +Math.max(...steps).toFixed(3), jumpRatio: +jump.toFixed(2),
    maxFrameMs: Math.round(Math.max(...dts)), maxCloudStep: +Math.max(...cl).toFixed(5), meanCloudStep: +(cl.reduce((a, b) => a + b, 0) / cl.length).toFixed(5),
    within01RadAfterMs: reached < 0 ? null : Math.round(rows[reached].t - rows[0].t), finalMissRad: +miss.at(-1).toFixed(3) };
  // no jump: jumpRatio ≤ 1 (headless frames run 50–130 ms, so raw steps reach 0.17 rad); the clouds' step stays ~constant
  checks.dial.pass = checks.dial.turnedRad > 2.5 && checks.dial.jumpRatio <= 1.05 && checks.dial.maxCloudStep < 3 * checks.dial.meanCloudStep && checks.dial.finalMissRad < 0.05;
  console.log("dial", JSON.stringify(checks.dial));
  await page.evaluate(() => { document.body.classList.add("clean"); window.sv.state.Clouds = true; window.sv.state.repeat = 20; });
}
report.checks = checks;

// the pan: a serpentine over the map in screen steps (the shift+arrow move), then square steps along one row
const pan = { positions: 0, maxSettleMs: 0, maxGpuMB: 0, maxAt: null, failures: [] };
const visit = async (x, y, wait = true) => {
  await page.evaluate(([x, y]) => window.sv.moveTo(x, y), [x, y]);
  if (!wait) return;
  const t = Date.now();
  try { await settle(15000); } catch { pan.failures.push([x, y]); return; }
  const s = await stats(); pan.positions++;
  pan.maxSettleMs = Math.max(pan.maxSettleMs, Date.now() - t);
  if (s.gpuMB > pan.maxGpuMB) { pan.maxGpuMB = +s.gpuMB.toFixed(1); pan.maxAt = [x, y, +s.parts.ground.toFixed(1), +s.parts.canopy.toFixed(1)]; }
};
const xs = [0, 17, 34, 51, 68, 85, 102], ys = [0, 19, 38, 57];
for (let j = 0; j < ys.length; j++) for (const x of j % 2 ? [...xs].reverse() : xs) await visit(x, ys[j]);
for (let x = 0; x <= 102; x++) await visit(x, 30, x % 6 === 0);   // square steps: settle every 6th
await visit(102, 30);
report.pan = pan; pan.pass = pan.failures.length === 0;
console.log("pan", JSON.stringify(pan));
report.errors = errors; report.serverResets = resets.length;
console.log("errors", errors.length, `(+${resets.length} server resets, retried)`, "· pass:", Object.entries({ ...checks, pan }).map(([k, v]) => `${k} ${v.pass ? "ok" : "FAIL"}`).join(" · "));
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log("renderer", renderer);
await browser.close();
