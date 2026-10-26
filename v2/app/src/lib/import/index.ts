/**
 * Map import — the seam the companion codes against. `importFile` reads a picked file
 * (`.dd2vtt` / `.uvtt`, PDF, PNG / JPEG / WebP) and makes, without uploading yet: the picture, the
 * geometry file (walls, doors, lights in squares), the table copy (≤ 72 px per square), the
 * 288 px thumbnail, and the first guess at the squares (a drawn grid, the file name, or 20
 * across) for the squares dialog; `upload` sends it all once the DM confirmed the squares, so a
 * cancelled import leaves nothing on the server. The heavy work runs in a Web Worker; pdf.js loads only for a
 * PDF. Errors are `ImportError`s whose message the companion shows as a notice as is.
 *
 * Usage:
 * ```ts
 * const r = await importFile(file, (p) => progress.set(p.label, p.fraction));
 * const choice = r.needsGrid ? await squaresDialog(r) : { grid: r.draft.grid, drawGrid: r.draft.drawGrid };
 * const { map } = await r.upload({ ...choice, format: 'webp' }, (p) => progress.set(p.label, p.fraction));
 * send({ type: 'map.add', map, activate: true });
 * ```
 *
 * @see ../../../../docs/architecture.md "Work packages" #6
 */
import { api } from '../api/index.ts';
import { log } from '../log.ts';
import { runImport, type ImportOptions, type ImportProgress, type ImportResult } from './pipeline.ts';
import { renderPdfPage } from './pdf.ts';
import { runInWorker } from './worker-client.ts';

export { ImportError, type ImportErrorCode } from './errors.ts';
export {
  detectionAligned, detectionCrop, detectionToRasterGrid, describeDetection, type GridDetection,
} from './grid-detect.ts';
export { gridCountsFromName, type SquareCounts } from './name-counts.ts';
export { guessGrid, DEFAULT_COLS, type GridGuess, type GridSource } from './grid-choice.ts';
export { kindFromName, UNSUPPORTED_MESSAGE, EMPTY_MESSAGE, type FileKind } from './kind.ts';
export { tableCopyPlan, thumbSize, TABLE_PX_PER_SQUARE, THUMB_SIDE, MAX_FILE_BYTES } from './sizing.ts';
export {
  STEP_LABELS, type ImportOptions, type ImportProgress, type ImportResult, type UploadFn, type ImportDeps, type MapDraft, type UploadChoice,
  type UploadedMap,
} from './pipeline.ts';
export type { ImportStep, GridOrigin } from './prepare.ts';
export { pdfPageThumbs, MAX_PICKER_PAGES, type PdfThumbs } from './pdf.ts';

/** File types for the picker's `accept` (Safari doesn't know `.dd2vtt`, so it also takes any). */
export const ACCEPT = '.dd2vtt,.uvtt,.pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf';

/**
 * Reads a map file and makes its files; nothing is uploaded until `upload` on the result.
 *
 * @param file - the picked (or fetched) file
 * @param onProgress - progress in steps, with a label for the DM and an overall fraction
 * @param options - `format`: the default "Store as" for the picture (as is)
 * @returns the draft map, whether the squares need checking, the detection and its note, and
 *   `upload` for the squares the DM settles on
 * @throws ImportError with a message for the DM
 */
export function importFile(file: File, onProgress?: (p: ImportProgress) => void, options: ImportOptions = {}): Promise<ImportResult> {
  return runImport(file, onProgress, {
    upload: (blob, opts, progress) => api.uploadFile(blob, opts, progress),
    work: runInWorker,
    renderPdf: (pdf, page) => renderPdfPage(pdf, page ?? 1),
    log,
    now: () => performance.now(),
  }, options);
}
