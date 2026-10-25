// Effects demo shooter (development only): opens the demo page in headless Chromium, waits for
// the effects to load, screenshots it at a few moments and prints a timing probe per page.
// Usage (dev server on BATTLEMAP_APP_PORT, default 6171):
//   node src/lib/effects/demo/shoot.mjs <out-dir> "<query>" [<query> …]
//   e.g. "scene=torches-rain" "only=fireball,cloudkill,rain" "scene=heavy&sync=1"
import { chromium } from '@playwright/test';

const [out, ...queries] = process.argv.slice(2);
const port = process.env.BATTLEMAP_APP_PORT ?? '6171';
// The full Chromium's new headless mode uses the real GPU; FX_SOFTWARE=1 runs the headless
// shell on SwiftShader instead (a CPU renderer — a pessimistic stand-in for a weak GPU).
const browser = await chromium.launch(process.env.FX_SOFTWARE === '1' ? {} : { channel: 'chromium', args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const [i, q] of queries.entries()) {
  await page.goto(`http://localhost:${port}/app/src/lib/effects/demo/index.html?${q}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
  await page.waitForFunction(() => window.fx.stats().loading === 0 && window.fx.stats().placed + window.fx.stats().shots > 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  const name = q.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  await page.screenshot({ path: `${out}/${i}-${name}-a.png` });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${i}-${name}-b.png` });
  if (process.env.FX_LOOK_ONLY === '1') continue;
  const m = await page.evaluate(() => window.fx.measure(4000));
  const idle = await page.evaluate(async () => {
    const f0 = window.fx.frames();
    await new Promise((r) => setTimeout(r, 1000));
    return window.fx.frames() - f0;
  });
  const { stats, ...timing } = m;
  const cost = await page.evaluate(() => window.fx.frameCost(120));
  console.log(JSON.stringify({ q, frameMs: cost, rafP50: timing.intervalP50, cpuP95: timing.renderP95, framesPer1s: idle, placed: stats.placed, shots: stats.shots, draws: stats.cost.drawCalls, particles: stats.cost.particles, mb: +(stats.textureBytes / 1048576).toFixed(1), degrade: stats.degrade }));
}
await browser.close();
