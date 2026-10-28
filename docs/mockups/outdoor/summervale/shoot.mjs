// The viewer's exit check in headless Chromium (GPU via Metal): shots of named windows + the whole
// map at 1920 × 1080, a pan over the whole map (every window position on a coarse raster, then a
// serpentine of square steps) checking no window stays on the preview after settling, GPU MB per
// window, GPU frame time (the draw repeated 20× per timed frame so the GPU clocks up).
//
//   python3 -m http.server 8765 -d docs/mockups/outdoor/summervale &   (any static server)
//   node docs/mockups/outdoor/summervale/shoot.mjs [http://localhost:8765/] [out-dir]
//
// Playwright comes from v2/node_modules. Shots: full-size PNG + a half-size JPEG to look at.
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
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`${base}#repeat=20&clean`);
await page.waitForFunction(() => window.sv);
const renderer = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; });
const settle = async (ms = 20000) => { await page.waitForFunction(() => window.sv.settled(), null, { timeout: ms, polling: 50 }); };
const stats = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sv.stats)));
const report = { renderer, windows: {} };

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
report.pan = pan;
console.log("pan", JSON.stringify(pan));
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log("renderer", renderer);
await browser.close();
