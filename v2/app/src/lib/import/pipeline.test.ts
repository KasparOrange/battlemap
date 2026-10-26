/// <reference types="bun" />
/**
 * Tests of the main-thread pipeline with a fake worker (the real `prepare.ts` jobs on the sharp
 * engine where they matter, canned results elsewhere) and a fake upload: what gets uploaded,
 * that nothing goes up before `upload`, the `MapInfo`, progress, logging, errors, a changed grid. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import { check, MapInfo, wholeGrid, type FileRef } from '@battlemap/shared';
import { ImportError } from './errors.ts';
import { runImport, type ImportDeps, type ImportProgress, type UploadFn } from './pipeline.ts';
import { prepareUvtt, preparePicture, type ImportStep, type Prepared, type PreparedFile } from './prepare.ts';
import { sharpBackend } from './test/sharp-backend.ts';
import type { WorkerJob } from './worker-client.ts';

const backend = sharpBackend();

/** A logger that keeps its lines. */
function recordingLog() {
  const lines: { level: string; msg: string; props?: Record<string, unknown> }[] = [];
  const add = (level: string) => (_area: string, msg: string, props?: Record<string, unknown>) => void lines.push({ level, msg, props });
  return { lines, debug: add('debug'), info: add('info'), warn: add('warn'), error: add('error') };
}

/** An upload that remembers what it got and answers made-up refs. */
function fakeUpload(fail = false) {
  const calls: { bytes: number; ext: string; format: string | undefined }[] = [];
  const upload: UploadFn = async (blob, opts, onProgress) => {
    if (fail) throw new Error('network down');
    onProgress?.(blob.size / 2, blob.size);
    onProgress?.(blob.size, blob.size);
    calls.push({ bytes: blob.size, ext: opts.ext, format: opts.format });
    const ref: FileRef = { hash: (calls.length.toString(16) + 'a'.repeat(32)).slice(0, 32), ext: opts.ext, bytes: blob.size };
    return { ...ref, width: null, height: null, thumb: null, originalBytes: null, note: null };
  };
  return { upload, calls };
}

/** Deps with a worker that runs the jobs in this thread. */
function deps(over: Partial<Omit<ImportDeps, 'log'>> & { upload: UploadFn }): Omit<ImportDeps, 'log'> & { log: ReturnType<typeof recordingLog>; jobs: string[] } {
  const jobs: string[] = [];
  const log = recordingLog();
  return {
    log,
    jobs,
    now: () => performance.now(),
    renderPdf: async () => {
      throw new Error('no pdf here');
    },
    work: async <T,>(job: WorkerJob, onStep: (s: ImportStep) => void): Promise<T> => {
      jobs.push(job.op);
      if (job.op === 'uvtt') return (await prepareUvtt(job.file, backend!, onStep)) as T;
      if (job.op === 'picture') return (await preparePicture(job.file, job.name, backend!, onStep)) as T;
      throw new Error(`unexpected job ${job.op}`);
    },
    ...over,
  };
}

/** A small real picture (sharp-made PNG): `w × h` grey with grid lines every `cell` px. */
async function gridPng(w: number, h: number, cell: number): Promise<Uint8Array> {
  const raw = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const line = x % cell < 2 || y % cell < 2;
      const p = (y * w + x) * 4;
      const v = line ? 60 : 120 + ((x * 7 + y * 13) % 17);
      raw[p] = raw[p + 1] = raw[p + 2] = v;
      raw[p + 3] = 255;
    }
  }
  const enc = await backend!.encode({ width: w, height: h, data: raw, readRows: async () => raw, close() {} } as never, { width: w, height: h }, 'page');
  return new Uint8Array(await enc.blob.arrayBuffer());
}

/** A `.dd2vtt` around a picture. */
function dd2vtt(png: Uint8Array, cols: number, rows: number, ppg: number): string {
  return JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 1, y: 0 }, map_size: { x: cols, y: rows }, pixels_per_grid: ppg },
    line_of_sight: [[{ x: 1, y: 0 }, { x: 5, y: 0 }]],
    portals: [{ position: { x: 3, y: 2 }, bounds: [{ x: 3, y: 1.5 }, { x: 3, y: 2.5 }], rotation: 0, closed: true, freestanding: false }],
    lights: [],
    image: Buffer.from(png).toString('base64'),
    battlemap: { draw_doors: true },
  });
}

describe('runImport', () => {
  test.skipIf(!backend)('a .dd2vtt: nothing uploaded until upload; then picture, geometry, table copy and thumbnail, a valid MapInfo', async () => {
    const png = await gridPng(1000, 600, 100); // 10 × 6 squares of 100 px → a 72 px table copy
    const file = new File([dd2vtt(png, 10, 6, 100)], 'Crypt_level.dd2vtt');
    const up = fakeUpload();
    const d = deps({ upload: up.upload });
    const progress: ImportProgress[] = [];
    const r = await runImport(file, (p) => progress.push(p), d);
    expect(up.calls).toEqual([]); // reading uploads nothing (a cancelled dialog leaves nothing)
    expect(r.draft).toMatchObject({ name: 'Crypt level', kind: 'uvtt', doorCount: 1, drawDoors: true, drawGrid: true });
    expect(r.needsGrid).toBe(false);
    // Reading progress: in order, never back, ends at 1.
    const fr = progress.map((p) => p.fraction);
    expect(fr).toEqual([...fr].sort((a, b) => a - b));
    expect(fr.at(-1)).toBeCloseTo(1, 5);
    expect(d.log.lines.some((l) => l.msg === 'Map read')).toBe(true);

    const sent: ImportProgress[] = [];
    const { map, thumb } = await r.upload({ grid: r.draft.grid, drawGrid: r.draft.drawGrid }, (p) => sent.push(p));
    expect(check(MapInfo, map).ok).toBe(true);
    expect(map).toMatchObject({ name: 'Crypt level', kind: 'uvtt', doorCount: 1, drawDoors: true, drawGrid: true, libraryId: null });
    expect([map.grid.cols, map.grid.rows, map.grid.cellW]).toEqual([10, 6, 100]);
    expect(up.calls.map((c) => c.ext)).toEqual(['png', 'json', 'webp', 'webp']);
    expect(map.geometry).not.toBeNull();
    expect(map.tableCopy).not.toBeNull();
    expect(thumb).not.toBeNull();
    expect(sent.at(-1)).toMatchObject({ step: 'upload', label: 'Uploading the map…', fraction: 1 });
    // One summary line with the timings.
    const done = d.log.lines.find((l) => l.msg === 'Map imported')!;
    expect(done.props).toMatchObject({ kind: 'uvtt', squares: '10x6', gridOrigin: 'uvtt', doors: 1, walls: 1 });
    expect(Object.keys(done.props!['timings'] as object)).toEqual(expect.arrayContaining(['read', 'parse', 'table-copy', 'thumb', 'upload']));
  });

  test.skipIf(!backend)('a picture: the drawn grid found, the format only for the picture, the squares to check', async () => {
    const file = new File([await gridPng(800, 640, 40) as Uint8Array<ArrayBuffer>], 'cave.png');
    const up = fakeUpload();
    const r = await runImport(file, undefined, deps({ upload: up.upload }));
    expect(r.needsGrid).toBe(true);
    expect(r.gridOrigin).toBe('detected');
    expect([r.draft.grid.cols, r.draft.grid.rows]).toEqual([20, 16]);
    expect(r.draft.drawGrid).toBe(false);
    expect(r.note).toContain('Found a drawn grid: 20 × 16 squares of 40 px');
    expect(up.calls).toEqual([]);
    const { map } = await r.upload({ grid: r.draft.grid, drawGrid: false, format: 'webp' });
    expect(up.calls.map((c) => c.format)).toEqual(['webp', undefined]); // picture, thumbnail (40 px squares: no table copy)
    expect(map.tableCopy).toBeNull();
  });

  test.skipIf(!backend)('upload with other squares: same density keeps the copy, a coarser grid makes a new one', async () => {
    const file = new File([await gridPng(800, 640, 40) as Uint8Array<ArrayBuffer>], 'cave.png');
    const up = fakeUpload();
    const d = deps({ upload: up.upload });
    const r = await runImport(file, undefined, d);
    const moved = (await r.upload({ grid: { ...r.draft.grid, x: 1 }, drawGrid: true })).map;
    expect(moved.grid.x).toBe(1);
    expect(moved.drawGrid).toBe(true);
    expect(d.jobs).toEqual(['picture']); // no copy needed for 40 px squares
    // 8 × 6 squares of 100 px: over 72 → a table copy is made in the worker and uploaded.
    const copyJob: PreparedFile = { blob: new Blob(['x']), ext: 'webp', width: 576, height: 432 };
    d.work = (async (job: WorkerJob) => {
      d.jobs.push(job.op);
      return copyJob;
    }) as ImportDeps['work'];
    const before = up.calls.length;
    const coarse = (await r.upload({ grid: wholeGrid(8, 6, 800, 640), drawGrid: true })).map;
    expect(d.jobs).toEqual(['picture', 'tableCopy']);
    expect(coarse.tableCopy).not.toBeNull();
    // picture and thumbnail went up in the first try already: only the new copy goes now
    expect(up.calls.length - before).toBe(1);
  });

  test('a PDF goes through pdf.js, then the worker', async () => {
    const up = fakeUpload();
    const fakePrepared: Prepared = {
      kind: 'picture', picture: { blob: new Blob(['png']), ext: 'png', width: 4096, height: 3165 }, geometry: null, counts: null,
      grid: wholeGrid(20, 15, 4096, 3165), drawGrid: true, drawDoors: false, detection: null, gridOrigin: 'default', note: null,
      tableCopy: null, thumb: null, timings: { decode: 5 }, warnings: [],
    };
    const d = deps({
      upload: up.upload,
      renderPdf: async () => ({ bitmap: { width: 4096, height: 3165 } as ImageBitmap, pageCount: 3 }),
      work: (async (job: WorkerJob) => {
        expect(job.op).toBe('pdfPage');
        return fakePrepared;
      }) as ImportDeps['work'],
    });
    const r = await runImport(new File(['%PDF-1.7\n...'], 'Dungeon.pdf'), undefined, d);
    expect(r.draft.kind).toBe('picture');
    expect(r.draft.name).toBe('Dungeon');
    expect(d.log.lines.some((l) => l.msg === 'PDF page rendered' && l.props!['page'] === 1 && l.props!['pages'] === 3)).toBe(true);

    // a picked page (S16): rendered by number, named after it
    const asked: (number | undefined)[] = [];
    const d2 = deps({
      upload: up.upload,
      renderPdf: async (_f: Blob, page?: number) => {
        asked.push(page);
        return { bitmap: { width: 4096, height: 3165 } as ImageBitmap, pageCount: 3 };
      },
      work: (async () => fakePrepared) as ImportDeps['work'],
    });
    const r2 = await runImport(new File(['%PDF-1.7\n...'], 'Dungeon.pdf'), undefined, d2, { pdfPage: 3 });
    expect(asked).toEqual([3]);
    expect(r2.draft.name).toBe('Dungeon — page 3');
  });

  test('bad files fail with the DM\'s message and a log line', async () => {
    const d = deps({ upload: fakeUpload().upload });
    const err = await runImport(new File(['hello'], 'notes.txt'), undefined, d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('unsupported');
    expect((err as Error).message).toBe('Unsupported file. Use .dd2vtt, .uvtt, .pdf, .png, .jpg, or .webp files.');
    expect(d.log.lines.find((l) => l.msg === 'Import failed')).toMatchObject({ level: 'warn', props: { code: 'unsupported' } });

    const empty = await runImport(new File([], 'm.png'), undefined, d).catch((e: unknown) => e);
    expect((empty as ImportError).code).toBe('empty');

    const broken = await runImport(new File(['{"resolution": 1}'], 'm.dd2vtt'), undefined, deps({
      upload: fakeUpload().upload,
      work: (async (job: WorkerJob) => prepareUvtt((job as { file: Blob }).file, backend ?? ({} as never), () => {})) as ImportDeps['work'],
    })).catch((e: unknown) => e);
    expect((broken as ImportError).code).toBe('corrupt');
  });

  test.skipIf(!backend)('an upload that fails says so, and a second try works', async () => {
    const file = new File([await gridPng(200, 200, 40) as Uint8Array<ArrayBuffer>], 'room.png');
    const down = fakeUpload(true);
    const d = deps({ upload: down.upload });
    const r = await runImport(file, undefined, d);
    const err = await r.upload({ grid: r.draft.grid, drawGrid: true }).catch((e: unknown) => e);
    expect((err as ImportError).code).toBe('upload');
    expect((err as Error).message).toBe('Upload failed — check the connection and try again.');
    d.upload = fakeUpload().upload;
    expect(check(MapInfo, (await r.upload({ grid: r.draft.grid, drawGrid: true })).map).ok).toBe(true);
  });
});
