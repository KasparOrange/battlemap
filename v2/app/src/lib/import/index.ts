/**
 * Map import — the seam the companion codes against. `importFile` turns a picked file
 * (`.dd2vtt` / `.uvtt`, PDF, PNG / JPEG / WebP) into an uploaded `MapInfo`: the picture, the
 * geometry file (walls, doors, lights in squares), the table copy (≤ 72 px per square), the
 * 288 px thumbnail, and the first guess at the squares (a drawn grid, the file name, or 20
 * across) for the squares dialog. The heavy work runs in a Web Worker; pdf.js loads only for a
 * PDF. Errors are `ImportError`s whose message the companion shows as a notice as is.
 *
 * Usage:
 * ```ts
 * const r = await importFile(file, (p) => progress.set(p.label, p.fraction), { format: 'webp' });
 * if (r.needsGrid) { const choice = await squaresDialog(r); await r.regrid(choice.grid, choice.drawGrid); }
 * send({ type: 'map.add', map: r.map, activate: true });
 * ```
 *
 * @see ../../../../docs/architecture.md "Work packages" #6
 */
import { api } from '../api/index.ts';
import { log } from '../log.ts';
import { runImport, type ImportOptions, type ImportProgress, type ImportResult } from './pipeline.ts';
import { renderPdfFirstPage } from './pdf.ts';
import { runInWorker } from './worker-client.ts';

export { ImportError, type ImportErrorCode } from './errors.ts';
export {
  detectionAligned, detectionCrop, detectionToRasterGrid, describeDetection, type GridDetection,
} from './grid-detect.ts';
export { gridCountsFromName, type SquareCounts } from './name-counts.ts';
export { guessGrid, DEFAULT_COLS, type GridGuess, type GridSource } from './grid-choice.ts';
export { kindFromName, UNSUPPORTED_MESSAGE, EMPTY_MESSAGE, type FileKind } from './kind.ts';
export { tableCopyPlan, thumbSize, TABLE_PX_PER_SQUARE, THUMB_SIDE, MAX_FILE_BYTES } from './sizing.ts';
export { STEP_LABELS, type ImportOptions, type ImportProgress, type ImportResult, type UploadFn, type ImportDeps } from './pipeline.ts';
export type { ImportStep, GridOrigin } from './prepare.ts';

/** File types for the picker's `accept` (Safari doesn't know `.dd2vtt`, so it also takes any). */
export const ACCEPT = '.dd2vtt,.uvtt,.pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf';

/**
 * Imports a map file and uploads it.
 *
 * @param file - the picked (or fetched) file
 * @param onProgress - progress in steps, with a label for the DM and an overall fraction
 * @param options - `format`: the server's "Store as" for the picture (default as is)
 * @returns the uploaded map, whether the squares need checking, the detection and its note,
 *   the thumbnail, and `regrid` for the squares the DM settles on
 * @throws ImportError with a message for the DM
 */
export function importFile(file: File, onProgress?: (p: ImportProgress) => void, options: ImportOptions = {}): Promise<ImportResult> {
  return runImport(file, onProgress, {
    upload: (blob, opts, progress) => api.uploadFile(blob, opts, progress),
    work: runInWorker,
    renderPdf: renderPdfFirstPage,
    log,
    now: () => performance.now(),
  }, options);
}
