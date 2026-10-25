/**
 * The map import in a real browser: the Web Worker (decode, detection, copies with
 * `createImageBitmap` + `OffscreenCanvas`), pdf.js with its worker under the base `/app/`, and
 * the main thread's budget — no task over 50 ms while an import runs (long-task observer).
 * Uploads are faked in the page; the test maps come from `test_assets/` (gitignored — skipped
 * where they are missing). Run: `bun run e2e -- import-worker` (ports via BATTLEMAP_APP_PORT /
 * BATTLEMAP_SERVER_PORT).
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';

const ASSETS = new URL('../../test_assets/', import.meta.url).pathname;

/** What the page reports back about one import. */
interface Outcome {
  ok: boolean;
  error?: string;
  code?: string;
  kind?: string;
  cols?: number;
  rows?: number;
  gridOrigin?: string;
  drawGrid?: boolean;
  doorCount?: number;
  tableCopy?: boolean;
  thumb?: boolean;
  uploads?: string[];
  steps?: string[];
  ms?: number;
  longTasks: number[];
  log: string[];
}

/** Imports one file in the page through the real worker and pdf.js, with a fake upload. */
async function importInPage(page: Page, path: string): Promise<Outcome> {
  await page.goto('/app/');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'import-e2e';
    document.body.append(input);
  });
  await page.setInputFiles('#import-e2e', path);
  return page.evaluate(async () => {
    const base = '/app/src/lib/import/';
    const { runImport } = await import(/* @vite-ignore */ `${base}pipeline.ts`);
    const { runInWorker } = await import(/* @vite-ignore */ `${base}worker-client.ts`);
    const { renderPdfFirstPage } = await import(/* @vite-ignore */ `${base}pdf.ts`);
    // Warm up module loading (dev transforms are long tasks of their own), then observe.
    await import(/* @vite-ignore */ 'pdfjs-dist').catch(() => null);
    const longTasks: number[] = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
    });
    obs.observe({ type: 'longtask' });
    const file = (document.getElementById('import-e2e') as HTMLInputElement).files![0]!;
    const uploads: string[] = [];
    const steps: string[] = [];
    const log: string[] = [];
    const rec = (level: string) => (_a: string, msg: string, props?: unknown) => void log.push(`${level} ${msg} ${JSON.stringify(props)}`);
    let n = 0;
    const deps = {
      upload: async (blob: Blob, opts: { ext: string }, onProgress?: (l: number, t: number) => void) => {
        onProgress?.(blob.size, blob.size);
        uploads.push(`${opts.ext}:${blob.size}`);
        n++;
        return { hash: n.toString(16).padStart(32, '0'), ext: opts.ext, bytes: blob.size, width: null, height: null, thumb: null, originalBytes: null, note: null };
      },
      work: runInWorker,
      renderPdf: renderPdfFirstPage,
      log: { debug: rec('debug'), info: rec('info'), warn: rec('warn'), error: rec('error') },
      now: () => performance.now(),
    };
    const t0 = performance.now();
    try {
      const r = await runImport(file, (p: { step: string }) => {
        if (steps.at(-1) !== p.step) steps.push(p.step);
      }, deps);
      await new Promise((res) => setTimeout(res, 100)); // let the observer deliver
      obs.disconnect();
      return {
        ok: true, kind: r.map.kind, cols: r.map.grid.cols, rows: r.map.grid.rows, gridOrigin: r.gridOrigin, drawGrid: r.map.drawGrid,
        doorCount: r.map.doorCount, tableCopy: r.map.tableCopy !== null, thumb: r.thumb !== null, uploads, steps,
        ms: Math.round(performance.now() - t0), longTasks, log,
      };
    } catch (e) {
      obs.disconnect();
      return { ok: false, error: String(e), code: (e as { code?: string }).code, longTasks, log };
    }
  });
}

/** Prints the outcome (the report's numbers) and checks the main-thread budget. */
function report(name: string, o: Outcome): void {
  process.stdout.write(`${name}: ${JSON.stringify({ ...o, log: o.log.filter((l) => !l.startsWith('debug')) })}\n`);
  expect(o.ok, o.error).toBe(true);
  expect(Math.max(0, ...o.longTasks), `long tasks ${o.longTasks.join(', ')}`).toBeLessThanOrEqual(50);
}

test.describe('import in the browser', () => {
  test.skip(!existsSync(`${ASSETS}maps`), 'test maps not on this machine');

  test('a .dd2vtt: 01 Eldrica house, 10 × 8, two doors', async ({ page }) => {
    const o = await importInPage(page, `${ASSETS}maps/01-eldrica-house-10x8.dd2vtt`);
    report('01', o);
    expect(o).toMatchObject({ kind: 'uvtt', cols: 10, rows: 8, doorCount: 2, tableCopy: true, thumb: true });
    expect(o.uploads!.map((u) => u.split(':')[0])).toEqual(['jpg', 'json', 'webp', 'webp']);
  });

  test('a big picture: 09 Dyson tavern, its own grid 25 × 25', async ({ page }) => {
    const o = await importInPage(page, `${ASSETS}maps/09-dyson-twelve-goats-tavern-6000px.png`);
    report('09', o);
    expect(o).toMatchObject({ kind: 'picture', cols: 25, rows: 25, gridOrigin: 'detected', drawGrid: false, tableCopy: true });
  });

  test('a WebP: 08b small home, 16 × 18 from the name', async ({ page }) => {
    const o = await importInPage(page, `${ASSETS}maps/08b-small-home-image-16x18.webp`);
    report('08b', o);
    expect(o).toMatchObject({ kind: 'picture', cols: 16, rows: 18 });
  });

  test('a PDF: page 1 through pdf.js and its worker', async ({ page }) => {
    test.skip(!existsSync(`${ASSETS}test_map.pdf`), 'no test PDF');
    const o = await importInPage(page, `${ASSETS}test_map.pdf`);
    report('pdf', o);
    expect(o.kind).toBe('picture');
    expect(o.steps![0]).toBe('pdf');
    expect(o.uploads![0]!.startsWith('webp:')).toBe(true);
  });

  test('the 30 MB castle: 114 × 64, 57 doors, a table copy', async ({ page }) => {
    test.setTimeout(120_000);
    const o = await importInPage(page, `${ASSETS}maps/07-STRESS-castle-114x64-30MB.dd2vtt`);
    report('07', o);
    expect(o).toMatchObject({ kind: 'uvtt', cols: 114, rows: 64, doorCount: 57, tableCopy: true });
  });

  test('a damaged file says so', async ({ page }) => {
    const o = await importInPage(page, `${ASSETS}maps/../../pubspec.yaml`);
    expect(o.ok).toBe(false);
    expect(o.code).toBe('unsupported');
  });
});
