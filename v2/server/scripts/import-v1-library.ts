/**
 * One-shot import of v1's shared map library into v2's, through the v2 server's own HTTP API
 * (so it checks and stores everything the way an upload from the app would):
 *
 * ```sh
 * bun scripts/import-v1-library.ts --from ~/battlemap/build/web/uploads/library --to http://127.0.0.1:5929 [--dry-run]
 * ```
 *
 * For each v1 entry (oldest first, so the list keeps v1's order): the picture is uploaded as it
 * is (a `.dd2vtt` is split — picture + geometry file), a table copy (≤ 72 px per square, WebP)
 * is made for dense pictures, then the map joins the library with v1's id, name, squares,
 * own-grid flag and date. Entries whose id is already in v2's library are skipped, so running it
 * again is harmless.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { init } from 'mwlog';
import type { FileRef, LibraryEntry, MapInfo } from '@battlemap/shared';
import { makeTableCopy, pictureInfo } from '../src/files/convert.ts';
import type { UploadResult } from '../src/files/upload.ts';
import { splitUvtt, v1Grid, type V1Entry } from './v1-library.ts';

/** What one run did. */
export interface ImportResult {
  /** Ids imported. */
  imported: string[];
  /** Ids already in v2's library. */
  skipped: string[];
  /** Ids that failed, with why. */
  failed: { id: string; error: string }[];
}

/** The logger's calls this script uses. */
interface Log {
  info(area: string, msg: string, props?: Record<string, unknown>): void;
  warn(area: string, msg: string, props?: Record<string, unknown>): void;
}

/** Uploads bytes to the v2 server. */
async function uploadTo(server: string, data: Uint8Array, ext: string): Promise<UploadResult> {
  const res = await fetch(`${server}/files?ext=${ext}`, { method: 'POST', body: data });
  const body = (await res.json()) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(`upload ${ext}: ${res.status} ${body.error ?? ''}`);
  return body;
}

/** A FileRef out of an upload answer. */
function ref(u: UploadResult): FileRef {
  return { hash: u.hash, ext: u.ext, bytes: u.bytes };
}

/**
 * Imports v1's library.
 *
 * @param from - v1's library folder (with `index.json`)
 * @param server - the v2 server's base URL
 * @param log - the logger
 * @param dryRun - only say what would be imported
 * @returns what was imported, skipped and failed
 */
export async function importV1Library(from: string, server: string, log: Log, dryRun = false): Promise<ImportResult> {
  const index = JSON.parse(await readFile(join(from, 'index.json'), 'utf8')) as { maps: V1Entry[] };
  const existing = (await (await fetch(`${server}/api/library`)).json()) as { entries: LibraryEntry[] };
  const have = new Set(existing.entries.map((e) => e.map.id));
  const result: ImportResult = { imported: [], skipped: [], failed: [] };
  const oldestFirst = [...index.maps].sort((a, b) => a.addedAt.localeCompare(b.addedAt) || index.maps.indexOf(b) - index.maps.indexOf(a));
  for (const v1 of oldestFirst) {
    if (have.has(v1.id)) {
      result.skipped.push(v1.id);
      continue;
    }
    const t0 = performance.now();
    try {
      const raw = new Uint8Array(await readFile(join(from, v1.file)));
      let pictureBytes: Uint8Array = raw;
      let geometry: FileRef | null = null;
      let cols = v1.gridCols ?? 20;
      let rows = v1.gridRows ?? 15;
      let drawDoors = false;
      let doorCount = 0;
      if (v1.kind === 'vtt') {
        const parts = splitUvtt(new TextDecoder().decode(raw));
        pictureBytes = parts.picture;
        cols = parts.cols;
        rows = parts.rows;
        drawDoors = parts.drawDoors;
        doorCount = parts.geometry.doors.length;
        if (!dryRun) geometry = ref(await uploadTo(server, new TextEncoder().encode(JSON.stringify(parts.geometry)), 'json'));
      }
      const info = await pictureInfo(pictureBytes);
      if (!info) throw new Error('the picture is unreadable');
      if (dryRun) {
        log.info('import', 'Would import', { id: v1.id, name: v1.name, kind: v1.kind, squares: `${cols}x${rows}`, picture: `${info.width}x${info.height}` });
        result.imported.push(v1.id);
        continue;
      }
      const picture = await uploadTo(server, pictureBytes, 'png');
      const copy = await makeTableCopy(pictureBytes, info.width / cols);
      const tableCopy = copy ? ref(await uploadTo(server, copy, 'webp')) : null;
      const map: MapInfo = {
        id: v1.id,
        name: v1.name.slice(0, 200),
        kind: v1.kind === 'vtt' ? 'uvtt' : 'picture',
        picture: ref(picture),
        tableCopy,
        geometry,
        grid: v1Grid(cols, rows, info.width, info.height),
        drawGrid: !v1.hasOwnGrid,
        doorCount,
        drawDoors,
        libraryId: v1.id,
      };
      const res = await fetch(`${server}/api/library`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map, thumb: picture.thumb, addedAt: v1.addedAt, note: 'imported from v1' }),
      });
      if (!res.ok) throw new Error(`library: ${res.status} ${((await res.json()) as { error?: string }).error ?? ''}`);
      result.imported.push(v1.id);
      log.info('import', 'Imported', { id: v1.id, name: v1.name, kind: map.kind, squares: `${cols}x${rows}`, doors: doorCount, pictureBytes: picture.bytes, tableCopy: tableCopy?.bytes ?? null, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      result.failed.push({ id: v1.id, error });
      log.warn('import', 'Import failed', { id: v1.id, name: v1.name, error });
    }
  }
  return result;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = arg('--from');
  const to = (arg('--to') ?? 'http://127.0.0.1:5929').replace(/\/$/, '');
  const log = init({ app: 'battlemap-v2-import', tenant: 'battlemap', hooks: false });
  if (!from) {
    log.warn('import', 'Usage: bun import-v1-library.ts --from <v1 library folder> [--to <v2 server>] [--dry-run]');
    await log.stop('usage');
    process.exit(2);
  }
  const result = await importV1Library(from, to, log, args.includes('--dry-run'));
  log.info('import', 'Done', { imported: result.imported.length, skipped: result.skipped.length, failed: result.failed.length, failures: result.failed });
  await log.stop('done');
  process.exit(result.failed.length ? 1 : 0);
}
