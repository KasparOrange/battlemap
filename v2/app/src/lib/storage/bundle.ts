/**
 * Game export / import: one `.battlemap` file that holds a game and every file it uses, so a
 * DM can move a game between devices or keep a backup file of their own.
 *
 * **Format** (version 1) — a text line, a JSON header, then the files' raw bytes back to back:
 *
 * ```
 * battlemap-game 1 <header length in bytes>\n
 * {"format":"battlemap-game","version":1,"exportedAt":…,"build":…,"game":{…},"files":[{"hash","ext","bytes"},…]}
 * <bytes of files[0]><bytes of files[1]>…
 * ```
 *
 * Why not JSON with base64 files, or a zip: base64 makes a 30 MB map a 40 MB string that has to
 * exist in memory at once (the TV box and phones have little); a zip needs a library or a
 * hand-written deflate/CRC. This layout is built as a `Blob` of blobs and read with
 * `blob.slice()`, so no file is ever copied into JS memory — export and import cost no more RAM
 * than the header. `head -1` of the file says what it is; the header is plain JSON.
 *
 * **Import** uploads every file to the server as it is (no conversion, so the hash comes out the
 * same), keeps it in the device's file cache, puts the game in the server backup, and returns
 * the game — the TV can then open it like any backed-up game (`game.open`). If the server's hash
 * differs (another server), the game's refs are rewritten to the new ones.
 */
import { check, FileRef, Game, newId } from '@battlemap/shared';
import type { Logger } from '../log.ts';

/** The first word of a bundle. */
export const BUNDLE_MAGIC = 'battlemap-game';

/** The bundle format version this code writes and reads. */
export const BUNDLE_VERSION = 1;

/** The extension of a bundle file. */
export const BUNDLE_EXT = '.battlemap';

/** Longest header accepted (a game is small; this guards against reading a wrong file). */
const MAX_HEADER = 64 * 1024 * 1024;

/** A bundle that can't be read, with a sentence for the user. */
export class BundleError extends Error {
  /** @param message - what is wrong, in plain words */
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

/** What a bundle holds after reading. */
export interface GameBundle {
  /** The game. */
  game: Game;
  /** Its files, each a slice of the bundle (no copy). */
  files: { ref: FileRef; blob: Blob }[];
  /** When it was exported (ISO time). */
  exportedAt: string;
  /** The app build that exported it. */
  build: string;
}

/** Progress: bytes done of the total. */
export type Progress = (done: number, total: number) => void;

/** The bundle's JSON header. */
interface Header {
  format: typeof BUNDLE_MAGIC;
  version: number;
  exportedAt: string;
  build: string;
  game: Game;
  files: FileRef[];
}

/** Whether a value has the shape of a `FileRef`. */
function isRef(x: unknown): x is FileRef {
  return check(FileRef, x).ok;
}

/**
 * Checks a parsed header.
 *
 * @returns the header, or the problem
 */
function checkHeader(raw: unknown): { ok: true; value: Header } | { ok: false; error: string } {
  const h = raw as Partial<Record<keyof Header, unknown>> | null;
  if (!h || typeof h !== 'object' || h.format !== BUNDLE_MAGIC) return { ok: false, error: 'not a game header' };
  if (typeof h.exportedAt !== 'string' || typeof h.build !== 'string' || typeof h.version !== 'number') return { ok: false, error: 'header fields missing' };
  const game = check(Game, h.game);
  if (!game.ok) return { ok: false, error: game.error };
  if (!Array.isArray(h.files) || !h.files.every(isRef)) return { ok: false, error: 'file list broken' };
  return { ok: true, value: { format: BUNDLE_MAGIC, version: h.version, exportedAt: h.exportedAt, build: h.build, game: game.value, files: h.files } };
}

/**
 * Every file a game uses — pictures, table copies, geometry, DM layers, and any file ref a later
 * model adds (found by shape, so nothing new is forgotten). Each once.
 *
 * @param game - the game
 * @returns its file refs, in the order first met
 */
export function gameFileRefs(game: Game): FileRef[] {
  const seen = new Map<string, FileRef>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if (isRef(x)) {
      const key = `${x.hash}.${x.ext}`;
      if (!seen.has(key)) seen.set(key, { hash: x.hash, ext: x.ext, bytes: x.bytes });
      return;
    }
    for (const val of Array.isArray(x) ? x : Object.values(x)) walk(val);
  };
  walk(game);
  return [...seen.values()];
}

/**
 * A copy of a game with file refs replaced.
 *
 * @param game - the game
 * @param map - new ref per `<hash>.<ext>`
 * @returns the rewritten copy (the input is untouched)
 */
export function remapRefs(game: Game, map: ReadonlyMap<string, FileRef>): Game {
  const walk = (x: unknown): unknown => {
    if (!x || typeof x !== 'object') return x;
    if (isRef(x)) return map.get(`${x.hash}.${x.ext}`) ?? x;
    if (Array.isArray(x)) return x.map(walk);
    return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val)]));
  };
  return walk(game) as Game;
}

/**
 * A file name for a game's bundle: its name, safe on every file system.
 *
 * @param name - the game's name
 * @returns `<name>.battlemap`
 */
export function bundleName(name: string): string {
  const safe = name.normalize('NFKD').replace(/[^\w\s.-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (safe || 'game') + BUNDLE_EXT;
}

/** What {@link exportGame} needs. */
export interface ExportDeps {
  /** A file's content (the file cache's `get`). */
  getFile: (ref: FileRef, onProgress: Progress, signal?: AbortSignal) => Promise<Blob>;
  /** The logger. */
  log: Logger;
  /** The app build, written into the header. */
  build: string;
  /** The clock (tests). */
  now?: (() => Date) | undefined;
}

/**
 * Packs a game and its files into one `.battlemap` blob.
 *
 * @param game - the game
 * @param deps - file source, logger, build
 * @param onProgress - bytes gathered of the total
 * @param signal - cancels
 * @returns the bundle and a file name for it
 * @throws whatever fetching a file throws (an `AbortError` when cancelled)
 */
export async function exportGame(
  game: Game,
  deps: ExportDeps,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<{ blob: Blob; name: string }> {
  const t0 = performance.now();
  const refs = gameFileRefs(game);
  const total = refs.reduce((s, r) => s + r.bytes, 0);
  deps.log.info('storage', 'Export …', { gameId: game.id, files: refs.length, bytes: total });
  const blobs: Blob[] = [];
  const stored: FileRef[] = [];
  let doneBytes = 0;
  onProgress?.(0, total);
  for (const ref of refs) {
    const blob = await deps.getFile(ref, (l) => onProgress?.(doneBytes + l, total), signal);
    blobs.push(blob);
    stored.push({ ...ref, bytes: blob.size });
    doneBytes += ref.bytes;
    onProgress?.(doneBytes, total);
  }
  const header = JSON.stringify({
    format: BUNDLE_MAGIC,
    version: BUNDLE_VERSION,
    exportedAt: (deps.now?.() ?? new Date()).toISOString(),
    build: deps.build,
    game,
    files: stored,
  });
  const headerBytes = new TextEncoder().encode(header);
  const blob = new Blob([`${BUNDLE_MAGIC} ${BUNDLE_VERSION} ${headerBytes.byteLength}\n`, headerBytes, ...blobs], { type: 'application/octet-stream' });
  deps.log.info('storage', 'Export done', { gameId: game.id, files: refs.length, bytes: blob.size, ms: Math.round(performance.now() - t0) });
  return { blob, name: bundleName(game.name) };
}

/**
 * Reads a `.battlemap` bundle (checks it, no upload).
 *
 * @param file - the picked file
 * @returns the game and its files (slices of `file`)
 * @throws {BundleError} when it isn't a bundle, is from a newer app, or is cut short
 */
export async function readGameBundle(file: Blob): Promise<GameBundle> {
  const head = await file.slice(0, 64).text();
  const nl = head.indexOf('\n');
  const m = nl > 0 ? /^battlemap-game (\d+) (\d+)$/.exec(head.slice(0, nl)) : null;
  if (!m) throw new BundleError('This is not a battlemap game file.');
  const version = Number(m[1]);
  const headerLen = Number(m[2]);
  if (version > BUNDLE_VERSION) throw new BundleError('This game file is from a newer battlemap — update the app first.');
  if (headerLen > MAX_HEADER) throw new BundleError('This game file is damaged.');
  const start = nl + 1;
  if (start + headerLen > file.size) throw new BundleError('This game file is cut short.');
  let raw: unknown;
  try {
    raw = JSON.parse(await file.slice(start, start + headerLen).text());
  } catch {
    throw new BundleError('This game file is damaged.');
  }
  const parsed = checkHeader(raw);
  if (!parsed.ok) throw new BundleError(`This game file is damaged (${parsed.error.slice(0, 120)}).`);
  const h = parsed.value;
  const files: GameBundle['files'] = [];
  let at = start + headerLen;
  for (const ref of h.files) {
    if (at + ref.bytes > file.size) throw new BundleError('This game file is cut short.');
    files.push({ ref, blob: file.slice(at, at + ref.bytes) });
    at += ref.bytes;
  }
  return { game: h.game, files, exportedAt: h.exportedAt, build: h.build };
}

/** What {@link importGame} needs. */
export interface ImportDeps {
  /** Uploads one file as it is (the api's `uploadFile` with `format: 'asis'`). */
  upload: (blob: Blob, ref: FileRef, onProgress: Progress, signal?: AbortSignal) => Promise<FileRef>;
  /** Keeps a file on this device (the file cache's `put`), optional. */
  keep?: ((ref: FileRef, blob: Blob) => Promise<void>) | undefined;
  /** Puts the game in the server's backup (the api's `backups.put`), optional. */
  backup?: ((game: Game, signal?: AbortSignal) => Promise<void>) | undefined;
  /** The logger. */
  log: Logger;
}

/** Options of {@link importGame}. */
export interface ImportOptions {
  /** Import as a new game (new id, "(copy)" in the name) instead of replacing one with the same id. */
  asCopy?: boolean | undefined;
  /** Cancels. */
  signal?: AbortSignal | undefined;
}

/**
 * Imports a `.battlemap` file: uploads its files, keeps them on this device, backs the game up
 * on the server, and returns it ready to open.
 *
 * @param file - the picked file
 * @param deps - upload, cache, backup, logger
 * @param onProgress - bytes uploaded of the total
 * @param options - as a copy, signal
 * @returns the imported game (refs rewritten if the server hashed differently)
 * @throws {BundleError} for a bad file; the upload's or backup's error otherwise
 */
export async function importGame(
  file: Blob,
  deps: ImportDeps,
  onProgress?: Progress,
  options: ImportOptions = {},
): Promise<Game> {
  const t0 = performance.now();
  const bundle = await readGameBundle(file);
  const total = bundle.files.reduce((s, f) => s + f.ref.bytes, 0);
  deps.log.info('storage', 'Import …', { gameId: bundle.game.id, files: bundle.files.length, bytes: total, exportedAt: bundle.exportedAt, fromBuild: bundle.build });
  const remap = new Map<string, FileRef>();
  let doneBytes = 0;
  onProgress?.(0, total);
  for (const { ref, blob } of bundle.files) {
    const stored = await deps.upload(blob, ref, (l) => onProgress?.(doneBytes + l, total), options.signal);
    if (stored.hash !== ref.hash || stored.ext !== ref.ext || stored.bytes !== ref.bytes) {
      remap.set(`${ref.hash}.${ref.ext}`, stored);
    }
    await deps.keep?.(stored, blob);
    doneBytes += ref.bytes;
    onProgress?.(doneBytes, total);
  }
  let game = remap.size ? remapRefs(bundle.game, remap) : bundle.game;
  if (remap.size) deps.log.warn('storage', 'Import: the server hashed files differently — refs rewritten', { gameId: game.id, files: remap.size });
  if (options.asCopy) game = { ...game, id: newId(), name: `${game.name} (copy)`.slice(0, 200) };
  await deps.backup?.(game, options.signal);
  deps.log.info('storage', 'Import done', { gameId: game.id, files: bundle.files.length, bytes: total, ms: Math.round(performance.now() - t0) });
  return game;
}

/**
 * Offers a blob to the user as a download (the companion's "Export game"). Uses the share
 * sheet where files can be shared (phones), else a download link.
 *
 * @param blob - the content
 * @param name - the file name
 * @param log - the logger
 * @returns how it was offered
 */
export async function saveBlob(blob: Blob, name: string, log: Logger): Promise<'shared' | 'downloaded'> {
  const nav = globalThis.navigator as Navigator | undefined;
  const asFile = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/octet-stream' }) : null;
  if (asFile && nav?.canShare?.({ files: [asFile] })) {
    try {
      await nav.share({ files: [asFile], title: name });
      log.info('storage', 'Export shared', { name, bytes: blob.size });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      log.warn('storage', 'Share failed — downloading instead', { error: String(err) });
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  log.info('storage', 'Export downloaded', { name, bytes: blob.size });
  return 'downloaded';
}
