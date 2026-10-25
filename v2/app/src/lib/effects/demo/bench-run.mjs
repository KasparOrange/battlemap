// Runs the renderer's bench page with the effect scenes in headless Chromium (real GPU) and
// prints its result rows. Development only. Usage: node src/lib/effects/demo/bench-run.mjs [fx ids] [shot.png]
import { chromium } from '@playwright/test';

const port = process.env.BATTLEMAP_APP_PORT ?? '6171';
const fx = process.argv[2] ?? 'all';
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${port}/app/bench.html?scene=fx&fx=${fx}&seconds=5`);
await page.waitForFunction(() => window.__bench?.done, null, { timeout: 120000 });
const out = await page.evaluate(() => window.__bench);
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
for (const r of out.results) console.log(JSON.stringify({ id: r.id, fps: r.fpsAvg, p95: r.frameP95Ms, cpu: r.cpuAvgMs, draws: r.drawCalls, gpuMs: r.gpuMs, texMb: r.textureMb, idle: r.idleFrames }));
console.log('gpu', out.gpu, out.error ?? '');
await browser.close();
