// Screenshot the effects preview in a headless browser — to LOOK at the library (alpha, loops,
// top-down fit) without a person at the screen. Serves v2/assets/effects on a local port itself.
//
// Usage (bun or node):
//   PLAYWRIGHT_CORE=<…/playwright-core/index.mjs> CHROME=<chrome binary> \
//     bun shoot_preview.mjs OUT_PREFIX "QUERY" [SHOTS=1] [GAP_S=0.5] [WIDTH=1600]
//   QUERY  the preview's query string, e.g. "cat=aura&cell=180" or "only=fireball,web"
//   writes OUT_PREFIX-0.png … (SHOTS pictures, GAP_S apart, after 1.5 s of play)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [prefix, query = "", shotsArg = "1", gapArg = "0.5", widthArg = "1600"] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".json": "application/json", ".webp": "image/webp", ".frag": "text/plain", ".vert": "text/plain", ".js": "text/javascript" };

const server = createServer(async (req, res) => {
  const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const port = server.address().port;

const { chromium } = await import(process.env.PLAYWRIGHT_CORE);
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(widthArg), height: 900 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`http://127.0.0.1:${port}/preview.html?${query}`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const failed = await page.evaluate(() => window.failed);
if (failed) console.error("preview failed:", failed);
await page.waitForTimeout(1500);
for (let i = 0; i < Number(shotsArg); i++) {
  await page.screenshot({ path: `${prefix}-${i}.png`, fullPage: true });
  await page.waitForTimeout(Number(gapArg) * 1000);
}
if (process.argv.includes("--thumbs")) {
  // Write each shown cell as the effect's 128 px thumb.webp (for shaders and others without art).
  const { writeFile } = await import("node:fs/promises");
  const cells = await page.evaluate(() => window.cells());
  for (const c of cells) {
    const url = await page.evaluate((c) => {
      const t = document.createElement("canvas"); t.width = t.height = 128;
      t.getContext("2d").drawImage(document.getElementById("stage"), c.x, c.y, c.size, c.size, 0, 0, 128, 128);
      return t.toDataURL("image/webp", 0.8);
    }, c);
    await writeFile(resolve(root, c.id, "thumb.webp"), Buffer.from(url.split(",")[1], "base64"));
  }
  console.log(`thumbs: ${cells.length}`);
}
await browser.close();
server.close();
console.log(`shot ${shotsArg} × ${prefix}-N.png (${query})`);
