/**
 * The temp cleanup: link fetches in `uploads/` go after 7 days, deleted games in `trash/` after
 * 30, leftover `*.tmp` files of interrupted writes after a day. Runs at start and every few
 * hours. The file store, the library and the backups are never touched.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerLog } from './log.ts';

/** What one cleanup removed. */
export interface CleanupResult {
  /** Link fetches removed. */
  uploads: number;
  /** Deleted games removed for good. */
  trash: number;
  /** Leftover temp files removed. */
  tmp: number;
}

/** Removes the entries of `dir` older than `maxAgeMs` that `pick` accepts; returns how many. */
async function sweep(dir: string, maxAgeMs: number, now: number, pick: (name: string) => boolean): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!pick(name)) continue;
    const path = join(dir, name);
    try {
      if (now - (await stat(path)).mtimeMs > maxAgeMs) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* gone meanwhile */
    }
  }
  return removed;
}

/**
 * Runs the cleanup once.
 *
 * @param dataDir - the server's data folder
 * @param ages - `uploadDays` and `trashDays`
 * @param log - the logger
 * @param now - the current time (tests pass their own)
 * @returns how much was removed
 */
export async function cleanup(dataDir: string, ages: { uploadDays: number; trashDays: number }, log: ServerLog, now = Date.now()): Promise<CleanupResult> {
  const day = 86_400_000;
  const result: CleanupResult = {
    uploads: await sweep(join(dataDir, 'uploads'), ages.uploadDays * day, now, () => true),
    trash: await sweep(join(dataDir, 'trash'), ages.trashDays * day, now, () => true),
    tmp:
      (await sweep(join(dataDir, 'files'), day, now, (n) => n.endsWith('.tmp'))) +
      (await sweep(dataDir, day, now, (n) => n.endsWith('.tmp'))),
  };
  const total = result.uploads + result.trash + result.tmp;
  log.info('cleanup', total ? 'Cleaned up' : 'Nothing to clean up', { ...result });
  return result;
}
