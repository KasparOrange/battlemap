/**
 * Import speed probe (qa#10): how long the browser takes to decode-and-shrink the 114 × 64
 * castle's 17100 × 9600 JPEG to its table copy, and to encode that copy as WebP or JPEG.
 * Prints the numbers; asserts only that the table copy stays within a few seconds.
 */
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

const CASTLE = new URL('../../test_assets/maps/07-STRESS-castle-114x64-30MB.dd2vtt', import.meta.url).pathname;

test.describe('import speed', () => {
  test.skip(!existsSync(CASTLE), 'test map missing');

  test('the castle table copy: decode + shrink, then encode', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/app/');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'perf-e2e';
      document.body.append(input);
    });
    await page.setInputFiles('#perf-e2e', CASTLE);
    const r = await page.evaluate(async () => {
      const { parseUvtt } = await import(/* @vite-ignore */ '/app/src/lib/import/uvtt.ts');
      const file = (document.getElementById('perf-e2e') as HTMLInputElement).files![0]!;
      const parsed = parseUvtt(await file.text());
      const blob = new Blob([parsed.picture], { type: 'image/jpeg' });
      const out: Record<string, number> = {};
      const time = async <T>(k: string, f: () => Promise<T>): Promise<T> => {
        const t0 = performance.now();
        const v = await f();
        out[k] = Math.round(performance.now() - t0);
        return v;
      };
      const w = 5466, h = 3069;
      const small = await time('decodeResizeHigh', () => createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }));
      small.close();
      const med = await time('decodeResizeMedium', () => createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }));
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(med, 0, 0);
      const webp = await time('encodeWebp90', () => canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }));
      const webp8 = await time('encodeWebp80', () => canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }));
      const jpg = await time('encodeJpeg90', () => canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
      out.webpKb = Math.round(webp.size / 1024);
      out.webp80Kb = Math.round(webp8.size / 1024);
      out.jpgKb = Math.round(jpg.size / 1024);
      med.close();
      return out;
    });
    console.log('castle table copy', JSON.stringify(r));
    expect(r.decodeResizeMedium! + Math.min(r.encodeWebp90!, r.encodeJpeg90!)).toBeLessThan(8000);
  });
});
