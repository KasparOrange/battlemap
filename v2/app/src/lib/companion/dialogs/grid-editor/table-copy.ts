/**
 * The in-game regrid's table copy (rv#29): when the DM fits a much finer or coarser grid on a
 * picture map mid-game, the TV's downscaled copy (`MapInfo.tableCopy`, made at about
 * `TABLE_PX_PER_SQUARE` px per square) no longer matches — the TV would draw the map blurry or
 * waste memory. The upload path remakes it (`import/pipeline.ts` `regrid`); this does the same
 * for a map already in the game: same rule, same worker job, then the upload.
 */
import type { FileRef, RasterGrid } from '@battlemap/shared';
import { tableCopyPlan } from '../../../import/index.ts';
import { runInWorker } from '../../../import/worker-client.ts';
import { log } from '../../../log.ts';
import { services, type ProgressFn } from '../../library/services.ts';

/**
 * Whether a new grid needs a new table copy — the import's rule: the copy's planned width
 * changes by 2 % or more, or one grid needs a copy and the other doesn't.
 *
 * @param before - the map's grid now
 * @param after - the new grid
 * @returns true when the copy must be remade
 */
export function copyChanges(before: RasterGrid, after: RasterGrid): boolean {
  const a = tableCopyPlan(before);
  const b = tableCopyPlan(after);
  if (!a && !b) return false;
  if (!a || !b) return true;
  return Math.abs(a.width - b.width) / a.width >= 0.02;
}

/** What the worker answers for a table copy. */
interface MadeCopy {
  /** The copy. */
  blob: Blob;
  /** Its extension. */
  ext: FileRef['ext'];
  /** Its width in px. */
  width: number;
  /** Its height in px. */
  height: number;
}

/**
 * Makes and uploads the table copy for a new grid.
 *
 * @param picture - the full picture (`MapInfo.picture`)
 * @param grid - the new grid
 * @param onProgress - progress for the DM
 * @returns the new copy's ref, or null when the grid needs none (the TV then uses the picture)
 * @throws {Error} with a readable message when the picture can't be read or the upload fails
 */
export async function remakeTableCopy(picture: FileRef, grid: RasterGrid, onProgress: ProgressFn): Promise<FileRef | null> {
  const t0 = performance.now();
  onProgress(null, 'Reading the picture');
  const blob = await services().getFile(picture);
  onProgress(null, 'Making the table copy');
  const made = await runInWorker<MadeCopy | null>({ op: 'tableCopy', picture: blob, grid }, () => {});
  if (!made) return null;
  const ref = await services().uploadFile(made.blob, { ext: made.ext, format: 'asis' }, onProgress);
  log.info('companion', 'Table copy remade for an in-game regrid', {
    squares: `${grid.cols}x${grid.rows}`, copy: `${made.width}x${made.height}`, bytes: made.blob.size, ms: Math.round(performance.now() - t0),
  });
  return ref;
}
