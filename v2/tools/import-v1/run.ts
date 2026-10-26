/**
 * The v1 import, start to end, with its outside world passed in (so tests run it against a fake
 * v1 TV and a test server): every map of the v1 TV's library gets its file from where it is —
 * the old dev server's shared library, its upload link, or the TV itself over the relay — and is
 * converted and uploaded (`maps.ts`); every DM layer picture is copied; every game is converted
 * (`convert.ts`) and stored on the v2 server as a backup, where a v2 TV lists and opens it.
 */
import type { FileExt, FileRef, LibraryEntry } from '../../shared/src/index.ts';
import type { Logger } from '../../app/src/lib/log.ts';
import { convertSession, type ConvertedMap } from './convert.ts';
import { prepareMap, type V1MapSpec } from './maps.ts';
import type { TvMapTransfer } from './relay.ts';
import { mapIdsOf, mapStateOf, type V1Listing, type V1MapEntry, type V1SharedMap } from './v1.ts';
import type { V2Server } from './v2-server.ts';

/** The v1 TV as far as the import needs it (a `V1Bot`, or a fake in tests). */
export interface V1Tv {
  /**
   * Opens a game on the map (an existing session, else a new one) and catches the map the TV
   * then sends.
   */
  mapFromTv(mapId: string, sessionId: string | null): Promise<TvMapTransfer>;
  /** The TV's library again (to find a game the import started). */
  listing(): Promise<V1Listing>;
  /** Deletes a game on the TV. */
  deleteSession(sessionId: string): void;
  /** Back to the TV's library. */
  goToLibrary(): void;
}

/** What the import needs from outside. */
export interface ImportV1Options {
  /** The v1 TV's maps and games. */
  listing: V1Listing;
  /** The old dev server (`http://72.62.88.197:4242`): its shared library and uploads. */
  v1Http: string;
  /** The v2 server. */
  server: V2Server;
  /** The v1 TV over the relay, for maps that exist only on it; null = don't ask it. */
  tv: V1Tv | null;
  /** Also add every converted map to the v2 shared library (a map already there is kept). */
  library: boolean;
  /** Convert and upload files, but store no game and no library entry. */
  dryRun: boolean;
  /** The logger. */
  log: Logger;
  /** One line per step for the person running it. */
  say?: (line: string) => void;
  /** Downloads a URL (default `fetch`); null when it isn't there. */
  download?: (url: string) => Promise<Uint8Array | null>;
}

/** Where a map's file came from. */
export type MapSource = 'shared library' | 'upload link' | 'TV' | 'none';

/** One map in the report. */
export interface MapReport {
  /** v1's map id. */
  v1Id: string;
  /** Its name. */
  name: string;
  /** The v2 map id it got (null when it failed). */
  id: string | null;
  /** Where the file came from. */
  source: MapSource;
  /** Why it failed, or null. */
  error: string | null;
}

/** One game in the report. */
export interface GameReport {
  /** The game's id (v1's session id). */
  id: string;
  /** Its name. */
  name: string;
  /** Maps it holds in v2. */
  maps: number;
  /** Whether it was stored on the v2 server. */
  stored: boolean;
  /** What was dropped or changed. */
  issues: string[];
}

/** What a run did. */
export interface ImportV1Report {
  /** Every TV map. */
  maps: MapReport[];
  /** Every game. */
  games: GameReport[];
  /** DM layer pictures copied / missing. */
  layers: { copied: number; missing: string[] };
  /** Maps added to the v2 shared library. */
  libraryAdded: string[];
}

/** The default download: GET, null on 404 or a network error. */
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** An absolute URL for a v1 link (relative ones are on the old dev server). */
function absolute(url: string, v1Http: string): string {
  return /^https?:\/\//.test(url) ? url : `${v1Http.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

/** Whether bytes look like a `.dd2vtt` (JSON) rather than a picture. */
function looksLikeJson(b: Uint8Array): boolean {
  for (let i = 0; i < Math.min(b.length, 64); i++) {
    const c = b[i]!;
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0xef || c === 0xbb || c === 0xbf) continue;
    return c === 0x7b;
  }
  return false;
}

/** A picture's extension from its first bytes, or null. */
function pictureExtOf(b: Uint8Array): FileExt | null {
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'webp';
  return null;
}

/**
 * The old dev server's shared library, by id (empty when it can't be read).
 *
 * @param v1Http - the old dev server
 * @param download - the downloader
 * @returns the entries
 */
async function sharedLibrary(v1Http: string, download: (url: string) => Promise<Uint8Array | null>): Promise<Map<string, V1SharedMap>> {
  const bytes = await download(absolute('/library', v1Http));
  if (!bytes) return new Map();
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { maps?: V1SharedMap[] };
    return new Map((body.maps ?? []).map((m) => [m.id, m]));
  } catch {
    return new Map();
  }
}

/**
 * Runs the import.
 *
 * @param o - the listing, the servers, the TV, the switches
 * @returns what it did, per map and game
 */
export async function importV1(o: ImportV1Options): Promise<ImportV1Report> {
  const say = o.say ?? (() => undefined);
  const download = o.download ?? fetchBytes;
  const report: ImportV1Report = { maps: [], games: [], layers: { copied: 0, missing: [] }, libraryAdded: [] };
  const shared = await sharedLibrary(o.v1Http, download);
  o.log.info('import-v1', 'v1 import started', { maps: o.listing.maps.length, games: o.listing.sessions.length, shared: shared.size, dryRun: o.dryRun, tv: o.tv !== null });
  const v2Library: Map<string, LibraryEntry> = o.library && !o.dryRun ? await o.server.library().catch(() => new Map()) : new Map();

  // ── maps ──
  const converted = new Map<string, ConvertedMap>();
  const startedOnTv: string[] = [];
  let usedTv = false;
  const total = o.listing.maps.length;
  for (const [i, entry] of o.listing.maps.entries()) {
    say(`[${i + 1}/${total}] map "${entry.displayName}"`);
    const r = await importMap(entry, o, shared, download, startedOnTv, () => { usedTv = true; });
    report.maps.push(r.report);
    if (!r.map) {
      say(`  ✗ ${r.report.error}`);
      continue;
    }
    converted.set(entry.id, r.map);
    say(`  ✓ from the ${r.report.source}, ${r.map.info.grid.cols}×${r.map.info.grid.rows} squares`);
    if (o.library && !o.dryRun && !v2Library.has(r.map.info.id)) {
      try {
        await o.server.addToLibrary(r.map.info, r.thumb, entry.addedAt);
        report.libraryAdded.push(r.map.info.id);
      } catch (e) {
        o.log.warn('import-v1', 'Library add failed', { id: r.map.info.id, error: String(e) });
      }
    }
  }
  for (const s of o.listing.sessions) {
    for (const id of mapIdsOf(s)) {
      if (!o.listing.maps.some((m) => m.id === id) && !report.maps.some((m) => m.v1Id === id)) {
        report.maps.push({ v1Id: id, name: '?', id: null, source: 'none', error: `game "${s.name}" names a map the TV's library doesn't have` });
      }
    }
  }

  // ── DM layer pictures ──
  const layerFiles = new Map<string, FileRef>();
  const urls = new Set<string>();
  for (const s of o.listing.sessions) for (const id of mapIdsOf(s)) for (const l of mapStateOf(s, id)?.dmOverlayData ?? []) urls.add(l.url);
  for (const url of urls) {
    const bytes = await download(absolute(url, o.v1Http));
    const ext = bytes ? pictureExtOf(bytes) : null;
    if (!bytes || !ext) {
      report.layers.missing.push(url);
      continue;
    }
    const up = await o.server.uploadFile(new Blob([bytes as Uint8Array<ArrayBuffer>]), ext);
    layerFiles.set(url, { hash: up.hash, ext: up.ext, bytes: up.bytes });
    report.layers.copied++;
  }

  // ── games ──
  for (const s of o.listing.sessions) {
    if (startedOnTv.includes(s.id)) continue;
    const { game, issues } = convertSession(s, converted, layerFiles);
    let stored = false;
    if (game && !o.dryRun) {
      try {
        await o.server.putGame(game);
        stored = true;
      } catch (e) {
        issues.push(`storing the backup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    report.games.push({ id: s.id, name: s.name, maps: game?.mapOrder.length ?? 0, stored, issues });
    say(`game "${s.name}": ${game ? `${game.mapOrder.length} map(s)` : 'not converted'}${stored ? ', stored' : ''}${issues.length ? ` — ${issues.length} note(s)` : ''}`);
    o.log.info('import-v1', 'Game converted', { id: s.id, name: s.name, maps: game?.mapOrder.length ?? 0, stored, issues });
  }

  // ── leave the TV as it was ──
  if (o.tv && usedTv) {
    for (const id of startedOnTv) o.tv.deleteSession(id);
    o.tv.goToLibrary();
  }
  o.log.info('import-v1', 'v1 import done', {
    maps: report.maps.length, mapsOk: report.maps.filter((m) => m.id).length,
    games: report.games.length, gamesStored: report.games.filter((g) => g.stored).length,
    layers: report.layers.copied, layersMissing: report.layers.missing.length, libraryAdded: report.libraryAdded.length,
  });
  return report;
}

/**
 * Gets one TV map's file and converts it.
 *
 * @param entry - the TV library map
 * @param o - the import's options
 * @param shared - the old shared library
 * @param download - the downloader
 * @param startedOnTv - gets the ids of games the TV started for the import (deleted at the end)
 * @param markTv - called when the TV was asked
 * @returns the converted map (or null) and its report line
 */
async function importMap(
  entry: V1MapEntry, o: ImportV1Options, shared: Map<string, V1SharedMap>,
  download: (url: string) => Promise<Uint8Array | null>, startedOnTv: string[], markTv: () => void,
): Promise<{ map: ConvertedMap | null; thumb: FileRef | null; report: MapReport }> {
  const base: MapReport = { v1Id: entry.id, name: entry.displayName, id: null, source: 'none', error: null };
  const fromShared = entry.serverMapId ? shared.get(entry.serverMapId) ?? null : null;
  let bytes: Uint8Array | null = null;
  let source: MapSource = 'none';
  // A PDF map's links lead to the PDF; only the TV has the page it rendered (its grid's picture).
  if (!entry.isPdf && fromShared) {
    bytes = await download(absolute(fromShared.url, o.v1Http));
    if (bytes) source = 'shared library';
  }
  if (!bytes && !entry.isPdf && entry.vpsUrl) {
    bytes = await download(absolute(entry.vpsUrl, o.v1Http));
    if (bytes) source = 'upload link';
  }
  if (!bytes && o.tv) {
    markTv();
    try {
      const session = o.listing.sessions.find((s) => s.mapId === entry.id) ?? null;
      const before = session ? null : new Set((await o.tv.listing()).sessions.map((s) => s.id));
      const t = await o.tv.mapFromTv(entry.id, session?.id ?? null);
      if (before) {
        const after = await o.tv.listing();
        for (const s of after.sessions) if (!before.has(s.id)) startedOnTv.push(s.id);
      }
      bytes = 'bytes' in t ? t.bytes : await download(absolute(t.url, o.v1Http));
      if (bytes) source = 'TV';
    } catch (e) {
      o.log.warn('import-v1', 'The v1 TV did not send the map', { id: entry.id, error: String(e) });
    }
  }
  if (!bytes) {
    const why = entry.isPdf ? 'a PDF map — only the v1 TV has its rendered page, and it did not send it'
      : o.tv ? 'its file is gone from the dev server and the TV did not send it' : 'its file is gone from the dev server (run with the TV online)';
    return { map: null, thumb: null, report: { ...base, error: why } };
  }
  const kind: V1MapSpec['kind'] = looksLikeJson(bytes) ? 'uvtt' : 'picture';
  const spec: V1MapSpec = {
    id: (entry.serverMapId ?? entry.id).slice(0, 64),
    name: entry.displayName,
    kind,
    cols: entry.pdfGridCols ?? entry.gridCols,
    rows: entry.pdfGridRows ?? entry.gridRows,
    rasterGrid: entry.rasterGrid ?? fromShared?.grid ?? null,
    drawGrid: entry.drawGrid ?? !(fromShared?.hasOwnGrid ?? false),
    libraryId: entry.serverMapId ?? (o.library ? entry.id : null),
  };
  try {
    const m = await prepareMap(bytes, spec, o.server, o.log);
    if (kind === 'uvtt' && (m.info.grid.cols !== entry.gridCols || m.info.grid.rows !== entry.gridRows)) {
      o.log.warn('import-v1', 'Squares differ from the TV library entry', { id: entry.id, file: `${m.info.grid.cols}x${m.info.grid.rows}`, entry: `${entry.gridCols}x${entry.gridRows}` });
    }
    return { map: m, thumb: m.thumb, report: { ...base, id: m.info.id, source } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    o.log.warn('import-v1', 'Map conversion failed', { id: entry.id, name: entry.displayName, source, error: msg });
    return { map: null, thumb: null, report: { ...base, source, error: msg } };
  }
}
