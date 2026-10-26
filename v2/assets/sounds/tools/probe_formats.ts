/**
 * Which compressed audio formats the browsers' Web Audio decodes (`decodeAudioData`), and whether
 * a decoded file keeps its exact length (no encoder priming at the start — a loop with priming
 * clicks at its seam). Run with Playwright's Chromium (stands in for the Android WebView) and
 * WebKit (stands in for Safari):
 *
 *   bun v2/assets/sounds/tools/probe_formats.ts <dir with t.ogg t.webm t.m4a>
 *
 * Make the test files with ffmpeg: a 2 s 440 Hz sine at 48 kHz mono, as Opus/Ogg, Opus/WebM,
 * AAC/M4A (`docs/sounds.md` "format").
 */
import { chromium, webkit } from '@playwright/test';
import { readFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: probe_formats.ts <dir>');
const files = ['t.ogg', 't.webm', 't.m4a'];
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]] as const) {
  const browser = await type.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const f of files) {
    const b64 = readFileSync(`${dir}/${f}`).toString('base64');
    const result = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      try {
        const buf = await ctx.decodeAudioData(bytes.buffer);
        const d = buf.getChannelData(0);
        let first = 0;
        while (first < d.length && Math.abs(d[first]!) < 1e-3) first++;
        return `ok length=${buf.length} (2 s = 96000) rate=${buf.sampleRate} channels=${buf.numberOfChannels} first sound at sample ${first}`;
      } catch (e) {
        return `FAIL ${String(e)}`;
      }
    }, b64);
    console.log(`${name} ${browser.version()} ${f}: ${result}`);
  }
  await browser.close();
}
