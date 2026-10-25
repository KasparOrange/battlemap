/**
 * The main-thread half of an import: check the file, render a PDF's first page, hand the rest to
 * the worker, upload what it made (picture, geometry, table copy, thumbnail), build the
 * `MapInfo`, report progress in steps and log the import. Its collaborators come in as
 * `ImportDeps`, so tests run it with a fake worker and a fake upload; `index.ts` wires the
 * real ones.
 */
import { check, gridsClose, MapInfo, newId, type FileRef, type RasterGrid } from '@battlemap/shared';
import type { Api, StoreAs } from '../api/index.ts';
import type { Logger } from '../log.ts';
import { ImportError, asImportError } from './errors.ts';
import { describeDetection, type GridDetection } from './grid-detect.ts';
import { classifyFile, mapNameFromFile, type FileKind } from './kind.ts';
import type { GridOrigin, ImportStep, Prepared, PreparedFile } from './prepare.ts';
import { tableCopyPlan } from './sizing.ts';
import type { WorkerJob } from './worker-client.ts';

/** The upload as `$lib/api` offers it (`api.uploadFile`: `POST /files`, answers the `FileRef` and extras). */
export type UploadFn = Api['uploadFile'];

/** What `importFile` reports while it works. */
export interface ImportProgress {
  /** The step that is running. */
  step: ImportStep;
  /** What it means for the DM ("Looking for a grid in the picture…"). */
  label: string;
  /** The whole import's progress, 0..1 (steps weighted by their usual cost). */
  fraction: number;
}

/** Labels of the steps, as the progress shows them. */
export const STEP_LABELS: Record<ImportStep, string> = {
  read: 'Reading the map file…',
  parse: 'Reading walls and doors…',
  pdf: 'Rendering PDF page 1…',
  decode: 'Decoding the picture…',
  detect: 'Looking for a grid in the picture…',
  'table-copy': 'Making the copy for the TV…',
  thumb: 'Making the thumbnail…',
  upload: 'Uploading the map…',
};

/** Relative cost of the steps, per file kind (what the progress bar moves by). */
const WEIGHTS: Record<FileKind, Partial<Record<ImportStep, number>>> = {
  uvtt: { read: 1, parse: 2, 'table-copy': 3, thumb: 1, upload: 4 },
  picture: { read: 0.5, decode: 2, detect: 2, 'table-copy': 2, thumb: 1, upload: 4 },
  pdf: { pdf: 4, decode: 2, detect: 2, 'table-copy': 2, thumb: 1, upload: 4 },
};

/** The result of an import. */
export interface ImportResult {
  /** The map, uploaded, ready for `map.add` or a library entry. */
  map: MapInfo;
  /** Whether the DM should check the squares (pictures and PDFs: yes; `.dd2vtt`: no). */
  needsGrid: boolean;
  /** The drawn grid found in a picture, or null. */
  detection: GridDetection | null;
  /** Where the squares came from. */
  gridOrigin: GridOrigin;
  /** What the squares dialog says about them ("Found a drawn grid: …"), or null. */
  note: string | null;
  /** The 288 px thumbnail for the library entry, or null when it couldn't be made. */
  thumb: FileRef | null;
  /** The original picture, kept for the grid editor (the PDF page as PNG). */
  pictureBlob: Blob;
  /**
   * The same map with the squares the DM chose. Makes a new table copy (in a worker) and
   * uploads it when the new grid needs another density; otherwise only the grid changes.
   *
   * @param grid - the new grid (same picture)
   * @param drawGrid - whether battlemap draws grid lines
   * @param onProgress - progress of the copy and its upload
   * @returns the updated map (also kept as `map`)
   * @throws ImportError when the copy or its upload fails
   */
  regrid(grid: RasterGrid, drawGrid: boolean, onProgress?: (p: ImportProgress) => void): Promise<MapInfo>;
}

/** Options of `importFile`. */
export interface ImportOptions {
  /** The server's "Store as" for the original picture (default `asis`). */
  format?: StoreAs;
}

/** What the pipeline needs from the outside. */
export interface ImportDeps {
  /** The upload (`$lib/api` `uploadFile`). */
  upload: UploadFn;
  /** Runs a job in the import worker. */
  work<T>(job: WorkerJob, onStep: (step: ImportStep) => void): Promise<T>;
  /** Renders a PDF's first page (pdf.js). */
  renderPdf(file: Blob): Promise<{ bitmap: ImageBitmap; pageCount: number }>;
  /** The logger. */
  log: Logger;
  /** Clock in ms. */
  now(): number;
}

/** A small reporter that turns steps into a weighted overall fraction. */
function progressOf(kind: FileKind, onProgress?: (p: ImportProgress) => void) {
  const weights = WEIGHTS[kind];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const done = new Set<ImportStep>();
  let current: ImportStep | null = null;
  const sumDone = () => [...done].reduce((a, s) => a + (weights[s] ?? 0), 0);
  return {
    step(step: ImportStep, within = 0) {
      if (current && current !== step) done.add(current);
      current = step;
      const f = (sumDone() + (weights[step] ?? 0) * Math.min(1, Math.max(0, within))) / total;
      onProgress?.({ step, label: STEP_LABELS[step], fraction: Math.min(1, f) });
    },
  };
}

/**
 * Imports a map file: `.dd2vtt` / `.uvtt`, PDF (page 1) or picture.
 *
 * @param file - the picked file (its `name` decides the kind, checked against the content)
 * @param onProgress - progress in steps
 * @param deps - the worker, pdf.js, the upload, the logger
 * @param options - `format` for the picture's upload
 * @returns the uploaded map and what the squares dialog needs
 * @throws ImportError with a message for the DM (unsupported, empty, too big, damaged, PDF,
 *   picture, upload, internal)
 */
export async function runImport(
  file: File, onProgress: ((p: ImportProgress) => void) | undefined, deps: ImportDeps, options: ImportOptions = {},
): Promise<ImportResult> {
  const t0 = deps.now();
  const name = file.name || 'map';
  let kind: FileKind | null = null;
  let lastStep: ImportStep = 'read';
  try {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    kind = classifyFile(name, file.size, head);
    deps.log.info('import', 'Import started', { name, kind, bytes: file.size });
    const progress = progressOf(kind, onProgress);
    const onStep = (s: ImportStep) => {
      lastStep = s;
      progress.step(s);
    };

    let prepared: Prepared;
    let pdfMs: number | undefined;
    let pageCount: number | undefined;
    if (kind === 'uvtt') {
      prepared = await deps.work<Prepared>({ op: 'uvtt', file }, onStep);
    } else if (kind === 'picture') {
      prepared = await deps.work<Prepared>({ op: 'picture', file, name }, onStep);
    } else {
      onStep('pdf');
      const tp = deps.now();
      const page = await deps.renderPdf(file);
      pdfMs = Math.round(deps.now() - tp);
      pageCount = page.pageCount;
      deps.log.info('import', 'PDF page 1 rendered', { name, width: page.bitmap.width, height: page.bitmap.height, pages: page.pageCount, ms: pdfMs });
      prepared = await deps.work<Prepared>({ op: 'pdfPage', bitmap: page.bitmap, name }, onStep);
    }
    for (const w of prepared.warnings) deps.log.warn('import', 'Import warning', { name, warning: w });

    onStep('upload');
    const tu = deps.now();
    const files = [prepared.picture, prepared.geometry, prepared.tableCopy, prepared.thumb].filter((f): f is PreparedFile => f !== null);
    const totalBytes = files.reduce((a, f) => a + f.blob.size, 0) || 1;
    let sent = 0;
    let serverThumb: FileRef | null = null;
    const put = async (f: PreparedFile, format?: StoreAs): Promise<FileRef> => {
      try {
        const res = await deps.upload(f.blob, { ext: f.ext, format }, (loaded) => progress.step('upload', (sent + Math.min(loaded, f.blob.size)) / totalBytes));
        sent += f.blob.size;
        if (f === prepared.picture && res.thumb) serverThumb = plainRef(res.thumb);
        return plainRef(res);
      } catch (e) {
        throw asImportError(e, 'upload', 'Upload failed — check the connection and try again.');
      }
    };
    const picture = await put(prepared.picture, options.format);
    const geometry = prepared.geometry ? await put(prepared.geometry) : null;
    const tableCopy = prepared.tableCopy ? await put(prepared.tableCopy) : null;
    let thumb: FileRef | null = null;
    if (prepared.thumb) {
      try {
        thumb = await put(prepared.thumb);
      } catch (e) {
        deps.log.warn('import', 'Thumbnail upload failed', { name, error: String(e) });
      }
    }
    thumb ??= serverThumb;
    const uploadMs = Math.round(deps.now() - tu);

    let map: MapInfo = checkedMap({
      id: newId(),
      name: mapNameFromFile(name),
      kind: prepared.kind,
      picture,
      tableCopy,
      geometry,
      grid: prepared.grid,
      drawGrid: prepared.drawGrid,
      doorCount: prepared.counts?.doors ?? 0,
      drawDoors: prepared.drawDoors,
      libraryId: null,
    });

    deps.log.info('import', 'Map imported', {
      name, kind, bytes: file.size, ms: Math.round(deps.now() - t0),
      timings: { ...prepared.timings, ...(pdfMs !== undefined ? { pdf: pdfMs } : {}), upload: uploadMs },
      squares: `${map.grid.cols}x${map.grid.rows}`, gridOrigin: prepared.gridOrigin,
      detection: describeDetection(prepared.detection),
      picture: `${prepared.picture.width}x${prepared.picture.height} ${prepared.picture.ext}`,
      tableCopy: prepared.tableCopy ? `${prepared.tableCopy.width}x${prepared.tableCopy.height} ${prepared.tableCopy.ext}` : null,
      ...(prepared.counts ?? {}), pages: pageCount, uploadedBytes: totalBytes,
    });

    const pictureBlob = prepared.picture.blob;
    const result: ImportResult = {
      map,
      needsGrid: prepared.kind === 'picture',
      detection: prepared.detection,
      gridOrigin: prepared.gridOrigin,
      note: prepared.note,
      thumb,
      pictureBlob,
      async regrid(grid, drawGrid, onRegridProgress) {
        if (gridsClose(grid, map.grid) && drawGrid === map.drawGrid) return map;
        const before = tableCopyPlan(map.grid);
        const after = tableCopyPlan(grid);
        const sameCopy = (!before && !after) || (before && after && Math.abs(before.width - after.width) / before.width < 0.02);
        let copy = map.tableCopy;
        if (!sameCopy) {
          const p = progressOf('picture', onRegridProgress);
          const t = deps.now();
          const made = await deps.work<PreparedFile | null>({ op: 'tableCopy', picture: pictureBlob, grid }, (s) => p.step(s));
          p.step('upload');
          copy = made ? plainRef(await deps.upload(made.blob, { ext: made.ext }, (loaded, total) => p.step('upload', total > 0 ? loaded / total : 0)).catch((e: unknown) => {
            throw asImportError(e, 'upload', 'Upload failed — check the connection and try again.');
          })) : null;
          deps.log.info('import', 'Table copy remade for the new grid', {
            name, squares: `${grid.cols}x${grid.rows}`, copy: made ? `${made.width}x${made.height}` : null, ms: Math.round(deps.now() - t),
          });
        }
        map = checkedMap({ ...map, grid, drawGrid, tableCopy: copy });
        result.map = map;
        return map;
      },
    };
    return result;
  } catch (e) {
    const err = asImportError(e, 'internal', 'The import stopped with an internal error.');
    const level = err.code === 'internal' || err.code === 'picture' ? 'error' : 'warn';
    deps.log[level]('import', 'Import failed', {
      name, kind, bytes: file.size, step: lastStep, code: err.code, message: err.message, detail: err.detail, ms: Math.round(deps.now() - t0),
    });
    throw err;
  }
}

/** Just the `FileRef` of an upload answer (the extras don't belong in the state). */
function plainRef(r: FileRef): FileRef {
  return { hash: r.hash, ext: r.ext, bytes: r.bytes };
}

/** Checks a built map against the shared schema (a bug here must not reach the TV). */
function checkedMap(map: MapInfo): MapInfo {
  const r = check(MapInfo, map);
  if (!r.ok) throw new ImportError('internal', 'The import made an invalid map.', r.error);
  return r.value;
}
