// Bake a Lottie animation into PNG frames (transparent background) with a headless browser,
// so the table never runs Lottie (CPU-heavy on the TV box) — build.py then packs the frames.
//
// Usage (bun or node):
//   PLAYWRIGHT_CORE=<…/node_modules/playwright-core/index.mjs> CHROME=<chrome binary> \
//     bun bake_lottie.mjs ANIMATION.json OUT_DIR SIZE_PX FRAMES [--hide "name,name"] [--from F] [--to F]
//   --hide   layer names to switch off (a solid background baked into the animation)
//   --from/--to  frame range in the animation's own frames (default: its in/out points)
// Frames are spread evenly over [from, to) so the result loops like the source.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lottieJs = resolve(here, "../../../../docs/mockups/effects/vendor/lottie.min.js");
const [file, outDir, sizeArg, framesArg, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];
const size = Number(sizeArg), frames = Number(framesArg);
const data = JSON.parse(readFileSync(file, "utf8"));
const hide = (opt.hide || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const layer of data.layers || []) if (hide.includes(layer.nm)) layer.hd = true;
const from = opt.from !== undefined ? Number(opt.from) : data.ip;
const to = opt.to !== undefined ? Number(opt.to) : data.op;

const { chromium } = await import(process.env.PLAYWRIGHT_CORE);
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: size, height: size } });
await page.setContent(`<html><body style="margin:0;background:transparent"><div id="a" style="width:${size}px;height:${size}px"></div></body></html>`);
await page.addScriptTag({ path: lottieJs });
await page.evaluate((d) => {
  window.anim = lottie.loadAnimation({ container: document.getElementById("a"), renderer: "canvas",
    loop: false, autoplay: false, animationData: d,
    rendererSettings: { clearCanvas: true, preserveAspectRatio: "xMidYMid meet" } });
  window.dom = false; window.imgs = !(d.assets || []).some((a) => a.p);
  window.anim.addEventListener("DOMLoaded", () => { window.dom = true; });
  window.anim.addEventListener("loaded_images", () => { window.imgs = true; });
}, data);
// Ready when the DOM is built and embedded pictures (if any) have decoded.
await page.waitForFunction(() => window.dom && window.imgs, null, { timeout: 60000 });
mkdirSync(outDir, { recursive: true });
for (let i = 0; i < frames; i++) {
  const f = from + (i * (to - from)) / frames;
  const url = await page.evaluate((fr) => { window.anim.goToAndStop(fr, true); return document.querySelector("#a canvas").toDataURL("image/png"); }, f);
  writeFileSync(`${outDir}/${String(i).padStart(4, "0")}.png`, Buffer.from(url.split(",")[1], "base64"));
}
await browser.close();
console.log(`${frames} frames → ${outDir} (${from}..${to} of ${data.ip}..${data.op}, ${data.w}×${data.h})`);
