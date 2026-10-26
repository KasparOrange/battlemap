/**
 * The main-thread half of an import: check the file, render a PDF's first page, hand the rest to
 * the worker; then — only when the DM confirmed the squares (`ImportResult.upload`) — upload
 * what it made (picture, geometry, table copy, thumbnail) and build the `MapInfo`. Progress in
 * steps, every phase logged. Its collaborators come in as
 * `ImportDeps`, so tests run it with a fake worker and a fake upload; `index.ts` wires the
 * real ones.
 */
import { check, MapInfo, newId, type FileRef, type RasterGrid } from '@battlemap/shared';
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
  pdf: 'Rendering the PDF page…',
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

/** The map as the import read it, before anything is uploaded. */
export interface MapDraft {
  /** The name from the file ("Crypt level"). */
  name: string;
  /** `uvtt` for `.dd2vtt`/`.uvtt`, `picture` for pictures and PDF pages. */
  kind: MapInfo['kind'];
  /** The squares (`.dd2vtt`: exact; pictures: the first guess). */
  grid: RasterGrid;
  /** Whether battlemap draws grid lines. */
  drawGrid: boolean;
  /** Doors of a `.dd2vtt` (0 for pictures). */
  doorCount: number;
  /** Whether battlemap draws the doors. */
  drawDoors: boolean;
  /** The picture's extension as read (a PDF page: its WebP / PNG). */
  pictureExt: FileRef['ext'];
}

/** What the upload of a prepared import made. */
export interface UploadedMap {
  /** The map, uploaded, ready for `map.add` or a library entry. */
  map: MapInfo;
  /** The 288 px thumbnail on the server (ours, else the server's), or null. */
  thumb: FileRef | null;
}

/** The squares and format the DM settled on, for {@link ImportResult.upload}. */
export interface UploadChoice {
  /** Where the squares lie (same picture). */
  grid: RasterGrid;
  /** Whether battlemap draws grid lines. */
  drawGrid: boolean;
  /** The server's "Store as" for the picture (default: the import's `format`, else as is). */
  format?: StoreAs;
}

/**
 * The result of an import: everything is read and examined, **nothing is uploaded yet** — a
 * cancelled squares dialog leaves nothing on the server. {@link ImportResult.upload} sends the
 * files with the squares the DM chose.
 */
export interface ImportResult {
  /** The map as read (name, kind, first-guess squares). */
  draft: MapDraft;
  /** Whether the DM should check the squares (pictures and PDFs: yes; `.dd2vtt`: no). */
  needsGrid: boolean;
  /** The drawn grid found in a picture, or null. */
  detection: GridDetection | null;
  /** Where the squares came from. */
  gridOrigin: GridOrigin;
  /** What the squares dialog says about them ("Found a drawn grid: …"), or null. */
  note: string | null;
  /** The original picture, kept for previews and the grid editor (the PDF page as WebP / PNG). */
  pictureBlob: Blob;
  /**
   * Uploads the map with the squares the DM chose: picture (with `format`), geometry, table copy
   * (remade in the worker first when the chosen squares need another density) and thumbnail.
   * Files that went up in an earlier, failed try are not sent again.
   *
   * @param choice - squares, grid lines, "Store as"
   * @param onProgress - progress of a remade copy and of the upload
   * @returns the uploaded map and its thumbnail
   * @throws ImportError (`upload`) when an upload fails — calling again retries
   */
  upload(choice: UploadChoice, onProgress?: (p: ImportProgress) => void): Promise<UploadedMap>;
}

/** Options of `importFile`. */
export interface ImportOptions {
  /** The server's "Store as" for the original picture (default `asis`). */
  format?: StoreAs;
  /**
   * A PDF's page to import, from 1 (default 1). When given, the map's name says the page
   * ("Dungeon — page 2"), so several pages of one PDF stay apart in a game.
   */
  pdfPage?: number;
}

/** What the pipeline needs from the outside. */
export interface ImportDeps {
  /** The upload (`$lib/api` `uploadFile`). */
  upload: UploadFn;
  /** Runs a job in the import worker. */
  work<T>(job: WorkerJob, onStep: (step: ImportStep) => void): Promise<T>;
  /** Renders a PDF's page (pdf.js), page 1 when `page` is missing. */
  renderPdf(file: Blob, page?: number): Promise<{ bitmap: ImageBitmap; pageCount: number }>;
  /** The logger. */
  log: Logger;
  /** Clock in ms. */
  now(): number;
}

/**
 * A small reporter that turns steps into a weighted overall fraction.
 *
 * @param kind - the file kind (its step weights)
 * @param onProgress - gets each report
 * @param only - the steps this phase runs (reading: all but the upload; uploading: copy + upload)
 */
function progressOf(kind: FileKind, onProgress: ((p: ImportProgress) => void) | undefined, only: ImportStep[] | null = null) {
  const weights = Object.fromEntries(Object.entries(WEIGHTS[kind]).filter(([s]) => (only ? only.includes(s as ImportStep) : s !== 'upload'))) as Partial<Record<ImportStep, number>>;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
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

/** Whether two grids of the same picture need the same table copy (within 2 % in width). */
function sameDensity(a: RasterGrid, b: RasterGrid): boolean {
  const before = tableCopyPlan(a);
  const after = tableCopyPlan(b);
  if (!before || !after) return !before && !after;
  return Math.abs(before.width - after.width) / before.width < 0.02;
}

/**
 * Reads a map file — `.dd2vtt` / `.uvtt`, PDF (page 1) or picture — and makes its files (picture,
 * geometry, table copy, thumbnail) **without uploading anything**: the result's `upload` sends
 * them once the DM settled the squares, so a cancelled import leaves nothing on the server.
 *
 * @param file - the picked file (its `name` decides the kind, checked against the content)
 * @param onProgress - progress of the reading steps (ends at 1 before the upload)
 * @param deps - the worker, pdf.js, the upload, the logger
 * @param options - `format`: the default "Store as" for the picture's upload
 * @returns the draft map, what the squares dialog needs, and `upload`
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
      const pageNo = options.pdfPage ?? 1;
      const page = await deps.renderPdf(file, pageNo);
      pdfMs = Math.round(deps.now() - tp);
      pageCount = page.pageCount;
      deps.log.info('import', 'PDF page rendered', { name, page: pageNo, width: page.bitmap.width, height: page.bitmap.height, pages: page.pageCount, ms: pdfMs });
      prepared = await deps.work<Prepared>({ op: 'pdfPage', bitmap: page.bitmap, name }, onStep);
    }
    for (const w of prepared.warnings) deps.log.warn('import', 'Import warning', { name, warning: w });

    progress.step(lastStep, 1); // reading is done: the bar is full before the squares dialog
    const prepareMs = Math.round(deps.now() - t0);
    deps.log.info('import', 'Map read', {
      name, kind, bytes: file.size, ms: prepareMs,
      timings: { ...prepared.timings, ...(pdfMs !== undefined ? { pdf: pdfMs } : {}) },
      squares: `${prepared.grid.cols}x${prepared.grid.rows}`, gridOrigin: prepared.gridOrigin,
      detection: describeDetection(prepared.detection),
      picture: `${prepared.picture.width}x${prepared.picture.height} ${prepared.picture.ext}`,
      tableCopy: prepared.tableCopy ? `${prepared.tableCopy.width}x${prepared.tableCopy.height} ${prepared.tableCopy.ext}` : null,
      ...(prepared.counts ?? {}), pages: pageCount,
    });

    const draft: MapDraft = {
      name: kind === 'pdf' && options.pdfPage !== undefined ? `${mapNameFromFile(name)} — page ${options.pdfPage}` : mapNameFromFile(name),
      kind: prepared.kind,
      grid: prepared.grid,
      drawGrid: prepared.drawGrid,
      doorCount: prepared.counts?.doors ?? 0,
      drawDoors: prepared.drawDoors,
      pictureExt: prepared.picture.ext,
    };
    /** Uploads that went through, per file and format (a retry doesn't send them again). */
    const sentFiles = new Map<PreparedFile, Map<string, { ref: FileRef; serverThumb: FileRef | null }>>();
    /** The table copy for a grid density, once made (the prepared one is for the first guess). */
    let copyFor: { grid: RasterGrid; file: PreparedFile | null } = { grid: prepared.grid, file: prepared.tableCopy };

    const result: ImportResult = {
      draft,
      needsGrid: prepared.kind === 'picture',
      detection: prepared.detection,
      gridOrigin: prepared.gridOrigin,
      note: prepared.note,
      pictureBlob: prepared.picture.blob,
      async upload(choice, onUploadProgress) {
        const tu = deps.now();
        const grid = choice.grid;
        const format = choice.format ?? options.format;
        // the chosen squares may need a copy of another density than the first guess had
        const remake = !sameDensity(copyFor.grid, grid);
        const p = progressOf(kind === 'uvtt' ? 'uvtt' : 'picture', onUploadProgress, remake ? ['table-copy', 'upload'] : ['upload']);
        if (remake) {
          const tc = deps.now();
          const made = await deps.work<PreparedFile | null>({ op: 'tableCopy', picture: prepared.picture.blob, grid }, (s) => p.step(s));
          copyFor = { grid, file: made };
          deps.log.info('import', 'Table copy remade for the chosen squares', {
            name, squares: `${grid.cols}x${grid.rows}`, copy: made ? `${made.width}x${made.height}` : null, ms: Math.round(deps.now() - tc),
          });
        }
        const files = [prepared.picture, prepared.geometry, copyFor.file, prepared.thumb].filter((f): f is PreparedFile => f !== null);
        const totalBytes = files.reduce((a, f) => a + f.blob.size, 0) || 1;
        let sent = 0;
        p.step('upload', 0);
        const put = async (f: PreparedFile, fmt?: StoreAs): Promise<{ ref: FileRef; serverThumb: FileRef | null }> => {
          const key = fmt ?? '';
          const known = sentFiles.get(f)?.get(key);
          if (known) {
            sent += f.blob.size;
            return known;
          }
          try {
            const res = await deps.upload(f.blob, { ext: f.ext, format: fmt }, (loaded) => p.step('upload', (sent + Math.min(loaded, f.blob.size)) / totalBytes));
            sent += f.blob.size;
            const done = { ref: plainRef(res), serverThumb: res.thumb ? plainRef(res.thumb) : null };
            if (!sentFiles.has(f)) sentFiles.set(f, new Map());
            sentFiles.get(f)!.set(key, done);
            return done;
          } catch (e) {
            throw asImportError(e, 'upload', 'Upload failed — check the connection and try again.');
          }
        };
        const pic = await put(prepared.picture, format);
        const geometry = prepared.geometry ? (await put(prepared.geometry)).ref : null;
        const tableCopy = copyFor.file ? (await put(copyFor.file)).ref : null;
        let thumb: FileRef | null = null;
        if (prepared.thumb) {
          try {
            thumb = (await put(prepared.thumb)).ref;
          } catch (e) {
            deps.log.warn('import', 'Thumbnail upload failed', { name, error: String(e) });
          }
        }
        thumb ??= pic.serverThumb;
        p.step('upload', 1);
        const map = checkedMap({
          id: newId(),
          name: draft.name,
          kind: draft.kind,
          picture: pic.ref,
          tableCopy,
          geometry,
          grid,
          drawGrid: choice.drawGrid,
          doorCount: draft.doorCount,
          drawDoors: draft.drawDoors,
          libraryId: null,
        });
        const uploadMs = Math.round(deps.now() - tu);
        deps.log.info('import', 'Map imported', {
          name, kind, bytes: file.size, ms: prepareMs + uploadMs,
          timings: { ...prepared.timings, ...(pdfMs !== undefined ? { pdf: pdfMs } : {}), upload: uploadMs },
          squares: `${grid.cols}x${grid.rows}`, gridOrigin: prepared.gridOrigin, format: format ?? 'asis',
          tableCopy: copyFor.file ? `${copyFor.file.width}x${copyFor.file.height} ${copyFor.file.ext}` : null,
          ...(prepared.counts ?? {}), pages: pageCount, uploadedBytes: totalBytes,
        });
        return { map, thumb };
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
