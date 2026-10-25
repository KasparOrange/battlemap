/**
 * The heavy half of an import, run in the worker: read and check the file, split a `.dd2vtt`
 * into picture + geometry, decode, look for a drawn grid, guess the squares, make the table
 * copy and the thumbnail. Everything up to the upload, which the main thread does
 * (`pipeline.ts`). The picture engine comes in as a `RasterBackend`, so this runs under
 * `bun test` with sharp on the real test maps.
 *
 * @see ./worker.ts for the message wrapper
 */
import { wholeGrid, type MapGeometry, type RasterGrid } from '@battlemap/shared';
import { ImportError, asImportError } from './errors.ts';
import {
  detectFromLuminance, LuminanceBuilder, rescaleDetection, type GridDetection,
} from './grid-detect.ts';
import { guessGrid, type GridSource } from './grid-choice.ts';
import type { Encoded, RasterBackend, RasterImage } from './raster.ts';
import { readPictureHeader, type PictureExt } from './sniff.ts';
import {
  detectionPlan, MAX_CANVAS_PIXELS, MAX_PICTURE_PIXELS, tableCopyPlan, thumbSize, type DetectionPlan,
} from './sizing.ts';
import { parseUvtt } from './uvtt.ts';

/** The steps an import goes through, in order (not every import has every step). */
export type ImportStep = 'read' | 'parse' | 'pdf' | 'decode' | 'detect' | 'table-copy' | 'thumb' | 'upload';

/** Called when a step starts. */
export type StepReporter = (step: ImportStep) => void;

/** Where a map's squares came from: the `.dd2vtt` itself, or a picture's guess. */
export type GridOrigin = 'uvtt' | GridSource;

/** A file ready to upload. */
export interface PreparedFile {
  /** The bytes. */
  blob: Blob;
  /** Its stored kind. */
  ext: PictureExt | 'json';
  /** Width in pixels (pictures). */
  width: number;
  /** Height in pixels (pictures). */
  height: number;
}

/** What the worker hands back for the upload. */
export interface Prepared {
  /** `uvtt` for `.dd2vtt`/`.uvtt`, `picture` for pictures and PDF pages. */
  kind: 'uvtt' | 'picture';
  /** The original picture (a PDF page as PNG, a `.dd2vtt`'s picture as it was inside). */
  picture: PreparedFile;
  /** The geometry JSON (`MapGeometry`), `.dd2vtt` only. */
  geometry: PreparedFile | null;
  /** Wall, door and light counts (`.dd2vtt`), for the log and the door count. */
  counts: { walls: number; doors: number; lights: number; dropped: number } | null;
  /** The squares (`.dd2vtt`: exact; pictures: the first guess). */
  grid: RasterGrid;
  /** Whether battlemap draws grid lines. */
  drawGrid: boolean;
  /** Whether battlemap draws the doors (`battlemap.draw_doors`). */
  drawDoors: boolean;
  /** The drawn grid found in a picture, or null. */
  detection: GridDetection | null;
  /** Where the squares came from. */
  gridOrigin: GridOrigin;
  /** What the squares dialog says about the guess, or null. */
  note: string | null;
  /** The table copy (≤ 72 px per square), or null when the picture keeps to the limits. */
  tableCopy: PreparedFile | null;
  /** The 288 px thumbnail, or null when it couldn't be made (not fatal). */
  thumb: PreparedFile | null;
  /** Milliseconds per step. */
  timings: Partial<Record<ImportStep, number>>;
  /** Things worth a log line (a picture size that disagrees with the file, a failed thumbnail). */
  warnings: string[];
}

/** Timing helper: runs `fn` as `step`, records its time. */
type Timed = <T>(step: ImportStep, fn: () => Promise<T>) => Promise<T>;

function timer(report: StepReporter, timings: Prepared['timings'], now: () => number): Timed {
  return async (step, fn) => {
    report(step);
    const t0 = now();
    try {
      return await fn();
    } finally {
      timings[step] = Math.round((timings[step] ?? 0) + now() - t0);
    }
  };
}

const PICTURE_TYPES: Record<PictureExt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Throws `too-big` for pictures over `MAX_PICTURE_PIXELS`. */
function checkPixels(width: number, height: number): void {
  if (width * height > MAX_PICTURE_PIXELS) {
    throw new ImportError('too-big', `This picture is ${width} × ${height} px — too big to use. Scale it down below 16384 × 16384 px first.`);
  }
}

/**
 * Prepares a `.dd2vtt` / `.uvtt`.
 *
 * @param file - the file
 * @param backend - the picture engine
 * @param report - step callback
 * @param now - clock in ms
 * @returns the prepared map
 * @throws ImportError on a damaged file or a picture the engine can't decode
 */
export async function prepareUvtt(file: Blob, backend: RasterBackend, report: StepReporter, now: () => number = Date.now): Promise<Prepared> {
  const timings: Prepared['timings'] = {};
  const timed = timer(report, timings, now);
  const warnings: string[] = [];
  const text = await timed('read', () => file.text());
  const parsed = await timed('parse', async () => parseUvtt(text));
  const header = readPictureHeader(parsed.picture);
  if (!header) throw new ImportError('corrupt', 'The picture inside this map file is damaged.');
  checkPixels(header.width, header.height);
  const expectW = parsed.cols * parsed.pixelsPerGrid;
  const expectH = parsed.rows * parsed.pixelsPerGrid;
  if (Math.abs(header.width - expectW) > 1 || Math.abs(header.height - expectH) > 1) {
    warnings.push(`picture ${header.width}×${header.height} px, file says ${expectW}×${expectH}`);
  }
  const blob = new Blob([parsed.picture as Uint8Array<ArrayBuffer>], { type: PICTURE_TYPES[header.ext] });
  const geometry: MapGeometry = parsed.geometry;
  const geometryBlob = new Blob([JSON.stringify(geometry)], { type: 'application/json' });
  const grid = wholeGrid(parsed.cols, parsed.rows, header.width, header.height);
  const copies = await makeCopies(null, blob, grid, backend, timed, warnings);
  const d = parsed.dropped;
  if (d.walls + d.doors + d.lights > 0) warnings.push(`dropped malformed entries: ${d.walls} walls, ${d.doors} doors, ${d.lights} lights`);
  return {
    kind: 'uvtt',
    picture: { blob, ext: header.ext, width: header.width, height: header.height },
    geometry: { blob: geometryBlob, ext: 'json', width: 0, height: 0 },
    counts: { walls: geometry.walls.length, doors: geometry.doors.length, lights: geometry.lights.length, dropped: d.walls + d.doors + d.lights },
    grid,
    drawGrid: true,
    drawDoors: parsed.drawDoors,
    detection: null,
    gridOrigin: 'uvtt',
    note: null,
    ...copies,
    timings,
    warnings,
  };
}

/**
 * Prepares a picture (PNG, JPEG, WebP).
 *
 * @param file - the file
 * @param name - its file name (for squares in the name)
 * @param backend - the picture engine
 * @param report - step callback
 * @param now - clock in ms
 * @returns the prepared map
 * @throws ImportError when the picture is damaged, too big or can't be decoded
 */
export async function preparePicture(file: Blob, name: string, backend: RasterBackend, report: StepReporter, now: () => number = Date.now): Promise<Prepared> {
  const timings: Prepared['timings'] = {};
  const timed = timer(report, timings, now);
  const warnings: string[] = [];
  const head = await timed('read', async () => {
    const first = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    return readPictureHeader(first) ?? readPictureHeader(new Uint8Array(await file.arrayBuffer()));
  });
  if (!head) throw new ImportError('corrupt', `"${name}" is damaged — its picture header can't be read.`);
  checkPixels(head.width, head.height);
  const plan = detectionPlan(head.width, head.height);
  const image = await timed('decode', () => decodeOrThrow(backend, file, plan.mode === 'scaled' ? plan : undefined));
  try {
    // EXIF rotation can swap the sides: the decoded picture is the truth.
    const width = plan.mode === 'scaled' ? head.width : image.width;
    const height = plan.mode === 'scaled' ? head.height : image.height;
    const detection = await timed('detect', () => detectOnImage(image, plan, width, height));
    const guess = guessGrid(name, width, height, detection);
    const copies = await makeCopies(plan.mode === 'strips' ? image : null, file, guess.grid, backend, timed, warnings);
    return {
      kind: 'picture',
      picture: { blob: file, ext: head.ext, width, height },
      geometry: null,
      counts: null,
      grid: guess.grid,
      drawGrid: guess.drawGrid,
      drawDoors: false,
      detection,
      gridOrigin: guess.source,
      note: guess.note,
      ...copies,
      timings,
      warnings,
    };
  } finally {
    image.close();
  }
}

/**
 * Prepares a rendered PDF page: stored as a lossless PNG, then treated like any picture.
 *
 * @param page - the rendered page
 * @param name - the PDF's file name
 * @param backend - the picture engine
 * @param report - step callback
 * @param now - clock in ms
 * @returns the prepared map
 * @throws ImportError when encoding fails
 */
export async function preparePdfPage(page: RasterImage, name: string, backend: RasterBackend, report: StepReporter, now: () => number = Date.now): Promise<Prepared> {
  const timings: Prepared['timings'] = {};
  const timed = timer(report, timings, now);
  const warnings: string[] = [];
  const { width, height } = page;
  const png = await timed('decode', () => encodeOrThrow(backend, page, { width, height }, 'lossless'));
  const plan = detectionPlan(width, height);
  const detection = await timed('detect', () => detectOnImage(page, { ...plan, mode: 'strips', width, height }, width, height));
  const guess = guessGrid(name, width, height, detection);
  const copies = await makeCopies(page, png.blob, guess.grid, backend, timed, warnings);
  return {
    kind: 'picture',
    picture: { blob: png.blob, ext: png.ext, width, height },
    geometry: null,
    counts: null,
    grid: guess.grid,
    drawGrid: guess.drawGrid,
    drawDoors: false,
    detection,
    gridOrigin: guess.source,
    note: guess.note,
    ...copies,
    timings,
    warnings,
  };
}

/**
 * A new table copy for a picture whose grid changed (the squares dialog, the grid editor).
 *
 * @param picture - the original picture file
 * @param grid - the new grid
 * @param backend - the picture engine
 * @returns the copy, or null when the picture needs none for this grid
 * @throws ImportError when the picture can't be decoded or encoded
 */
export async function remakeTableCopy(picture: Blob, grid: RasterGrid, backend: RasterBackend): Promise<PreparedFile | null> {
  const plan = tableCopyPlan(grid);
  if (!plan) return null;
  const size = { width: plan.width, height: plan.height };
  const image = await decodeOrThrow(backend, picture, size);
  try {
    return await encodeOrThrow(backend, image, size, 'table');
  } finally {
    image.close();
  }
}

/**
 * The table copy and the thumbnail, from `source` (the decoded picture at full size) or
 * decoded anew from `blob` at the size needed.
 */
async function makeCopies(
  source: RasterImage | null, blob: Blob, grid: RasterGrid, backend: RasterBackend, timed: Timed, warnings: string[],
): Promise<{ tableCopy: PreparedFile | null; thumb: PreparedFile | null }> {
  const plan = tableCopyPlan(grid);
  let small: RasterImage | null = null; // the table copy's pixels, reused for the thumbnail
  let tableCopy: PreparedFile | null = null;
  try {
    if (plan) {
      const size = { width: plan.width, height: plan.height };
      tableCopy = await timed('table-copy', async () => {
        if (source) return encodeOrThrow(backend, source, size, 'table');
        small = await decodeOrThrow(backend, blob, size);
        return encodeOrThrow(backend, small, size, 'table');
      });
    }
    let thumb: PreparedFile | null = null;
    try {
      thumb = await timed('thumb', async () => {
        const size = thumbSize(grid.pictureW, grid.pictureH);
        const from = small ?? source;
        if (from) return backend.encode(from, size, 'thumb');
        const decoded = await backend.decode(blob, size);
        try {
          return await backend.encode(decoded, size, 'thumb');
        } finally {
          decoded.close();
        }
      });
    } catch (e) {
      warnings.push(`thumbnail failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { tableCopy, thumb };
  } finally {
    (small as RasterImage | null)?.close();
  }
}

/**
 * Runs the detection on a decoded picture, strip by strip.
 *
 * @param image - the picture (full size for `strips`, scaled for `scaled`)
 * @param plan - how it was decoded
 * @param width - the original picture's width
 * @param height - its height
 * @returns the detection in the original's pixels, or null
 */
export async function detectOnImage(image: RasterImage, plan: DetectionPlan, width: number, height: number): Promise<GridDetection | null> {
  const f = plan.mode === 'strips' ? plan.factor : 1;
  const lb = new LuminanceBuilder(image.width, image.height, f);
  const rows = Math.min(image.height, Math.max(f, Math.floor(MAX_CANVAS_PIXELS / 4 / image.width / f) * f));
  for (let y = 0; y < image.height; y += rows) {
    const n = Math.min(rows, image.height - y);
    lb.addRows(await image.readRows(y, n), y, n);
  }
  const d = detectFromLuminance(lb);
  if (!d || plan.mode === 'strips') return d;
  return rescaleDetection(d, width, height);
}

async function decodeOrThrow(backend: RasterBackend, blob: Blob, size?: { width: number; height: number }): Promise<RasterImage> {
  try {
    return await backend.decode(blob, size ? { width: size.width, height: size.height } : undefined);
  } catch (e) {
    throw asImportError(e, 'picture', "This picture can't be decoded on this device — it is damaged or in a format the browser doesn't know.");
  }
}

async function encodeOrThrow(backend: RasterBackend, image: RasterImage, size: { width: number; height: number }, purpose: 'table' | 'thumb' | 'lossless'): Promise<Encoded> {
  try {
    return await backend.encode(image, size, purpose);
  } catch (e) {
    throw asImportError(e, 'picture', "This device couldn't make a copy of the picture (out of memory?). Try a smaller picture.");
  }
}
