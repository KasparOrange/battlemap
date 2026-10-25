/**
 * Typed client for the server's HTTP API (`docs/protocol.md` "over HTTP", architecture package
 * 1): files, the shared map library, game backups, link fetch. Every call has an idle timeout,
 * takes an `AbortSignal`, retries with backoff where a retry can help (not on 4xx), checks the
 * answer against the shared schemas, and logs start, done (ms, bytes) and failures (area `api`).
 *
 * | Call | Route |
 * |---|---|
 * | {@link Api.uploadFile} | `POST /files?ext=&format=` (raw body) → `FileRef` + width, height, thumb, originalBytes, note |
 * | {@link Api.downloadFile} | `GET /files/<hash>.<ext>` |
 * | {@link LibraryApi.list} / `add` / `remove` | `GET /api/library`, `POST /api/library`, `DELETE /api/library/<id>` |
 * | {@link BackupApi.put} / `list` / `get` / `delete` | `PUT /api/games/<id>`, `GET /api/games`, `GET /api/games/<id>`, `DELETE /api/games/<id>` |
 * | {@link Api.fetchLink} | `GET /api/fetch?url=` → `{url, name, bytes, kind, ext}`, then `GET <url>` (`/uploads/…`) |
 *
 * Answers may come bare or wrapped (`{entries: […]}`, `{file: …}`): the client unwraps both,
 * so it doesn't break when the server settles on one.
 */
import { check, FileExt, FileRef, Game, GameSummary, LibraryEntry, type Parsed } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { ApiError } from './errors.ts';
import { withRetry, DEFAULT_RETRY, type RetryPolicy } from './retry.ts';
import { defaultTransport, type HttpResponse, type Progress, type Transport } from './transport.ts';

/** How an upload is stored (the old "Store as"): converted to WebP / JPEG / PNG, or as it came. */
export type StoreAs = 'webp' | 'jpeg' | 'png' | 'asis';

/** Options of {@link Api.uploadFile}. */
export interface UploadOptions {
  /** The file's kind (its extension on the server). */
  ext: FileExt;
  /** Pictures: how the server stores it (default `asis`: no conversion). */
  format?: StoreAs | undefined;
  /** Cancels the upload. */
  signal?: AbortSignal | undefined;
}

/** What {@link Api.fetchLink} got. */
export interface FetchedLink {
  /** The file's content. */
  blob: Blob;
  /** A name for it (from the server, the response, or the link). */
  name: string;
  /** Its extension as the server sniffed it (`png`, `jpg`, `webp`, `pdf`, `dd2vtt`, `uvtt`), else from the name, else null. */
  ext: string | null;
  /** What it is, as the server sniffed it, or null when it didn't say. */
  kind: 'picture' | 'pdf' | 'uvtt' | null;
}

/** What an upload answers: the stored file and what the server made of it. */
export interface UploadResult extends FileRef {
  /** Picture width in pixels, or null (JSON, PDF, or the server didn't say). */
  width: number | null;
  /** Picture height in pixels, or null. */
  height: number | null;
  /** The thumbnail (≤ 288 px) the server made of a picture, or null. */
  thumb: FileRef | null;
  /** Bytes as uploaded when the server converted it, else null. */
  originalBytes: number | null;
  /** What the conversion did ("lossless", "already smaller as it was"), or null. */
  note: string | null;
}

/** The shared map library. */
export interface LibraryApi {
  /** The shared maps, as the server orders them (newest first). Broken entries are skipped. */
  list(signal?: AbortSignal): Promise<LibraryEntry[]>;
  /** Adds a map; returns the stored entry. */
  add(entry: LibraryEntry, signal?: AbortSignal): Promise<LibraryEntry>;
  /** Removes a map (TVs keep their copies). A missing id is fine. */
  remove(id: string, signal?: AbortSignal): Promise<void>;
}

/** The server's game backups (latest wins). */
export interface BackupApi {
  /** Stores a game's backup. */
  put(game: Game, signal?: AbortSignal): Promise<void>;
  /** Every backed-up game, as library rows. Broken entries are skipped. */
  list(signal?: AbortSignal): Promise<GameSummary[]>;
  /** A backed-up game, or null when the server has none with that id. */
  get(id: string, signal?: AbortSignal): Promise<Game | null>;
  /** Deletes a game's backup (and its previous versions). A missing id is fine. */
  delete(id: string, signal?: AbortSignal): Promise<void>;
}

/** The API client (the api seam). */
export interface Api {
  /** The server's base URL. */
  readonly serverUrl: string;
  /** A file's URL on the server. */
  fileUrl(ref: FileRef): string;
  /**
   * Uploads a file; retried on network errors and 5xx (restarting from zero), not on 4xx.
   *
   * @param blob - the content
   * @param options - kind, Store-as, signal
   * @param onProgress - bytes sent so far, of the total
   * @returns the stored file's ref (the hash is the server's) with size, thumbnail and conversion note
   * @throws {ApiError}
   */
  uploadFile(blob: Blob, options: UploadOptions, onProgress?: Progress): Promise<UploadResult>;
  /**
   * Downloads a file by ref, with progress.
   *
   * @throws {ApiError}
   */
  downloadFile(ref: FileRef, onProgress?: Progress, signal?: AbortSignal): Promise<Blob>;
  /** The shared map library. */
  readonly library: LibraryApi;
  /** Game backups. */
  readonly backups: BackupApi;
  /**
   * Has the server fetch a link (a picture, PDF, `.dd2vtt`, a page's main picture, a Drive or
   * Dropbox share) and returns its content.
   *
   * @throws {ApiError} — `http` with the server's reason when it refused the link
   */
  fetchLink(url: string, onProgress?: Progress, signal?: AbortSignal): Promise<FetchedLink>;
}

/** Timeouts in ms. */
export interface ApiTimeouts {
  /** JSON calls: fail with no answer for this long. */
  jsonMs: number;
  /** File transfers: fail when no byte moved for this long. */
  transferIdleMs: number;
  /** Link fetches: the server downloads first, so the first byte may take long. */
  linkMs: number;
}

/** The default timeouts. */
export const DEFAULT_TIMEOUTS: ApiTimeouts = { jsonMs: 15_000, transferIdleMs: 30_000, linkMs: 60_000 };

/** Options of {@link createApi}. */
export interface ApiOptions {
  /** The server's base URL, no trailing slash. */
  serverUrl: string;
  /** The logger. */
  log: Logger;
  /** The HTTP transport (tests may pass their own). */
  transport?: Transport | undefined;
  /** Retry policy (tests shorten it). */
  retry?: RetryPolicy | undefined;
  /** Timeouts (tests shorten them). */
  timeouts?: Partial<ApiTimeouts> | undefined;
}

/** Picks a list out of a bare array or `{<key>: [...]}`. */
function unwrapList(body: unknown, keys: readonly string[]): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    for (const k of keys) {
      const val = (body as Record<string, unknown>)[k];
      if (Array.isArray(val)) return val;
    }
  }
  return null;
}

/** Checks a value against one of the shared schemas. */
type Checker<T> = (x: unknown) => Parsed<T>;

const asRef: Checker<FileRef> = (x) => check(FileRef, x);
const asEntry: Checker<LibraryEntry> = (x) => check(LibraryEntry, x);
const asSummary: Checker<GameSummary> = (x) => check(GameSummary, x);
const asGame: Checker<Game> = (x) => check(Game, x);

/** Picks an object out of itself or `{<key>: {...}}`. */
function unwrapOne<T>(checker: Checker<T>, body: unknown, keys: readonly string[]): T | null {
  const bare = checker(body);
  if (bare.ok) return bare.value;
  if (body && typeof body === 'object') {
    for (const k of keys) {
      const inner = checker((body as Record<string, unknown>)[k]);
      if (inner.ok) return inner.value;
    }
  }
  return null;
}

/** The extension a name ends in (`jpeg` → `jpg`), lowercase, or null. */
function extOf(name: string): string | null {
  const e = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? null;
  return e === 'jpeg' ? 'jpg' : e;
}

/** An upload answer: the ref plus the extras the server sends (null where it sends none). */
function uploadResult(ref: FileRef, body: unknown): UploadResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const thumb = asRef(b.thumb);
  return {
    ...ref,
    width: num(b.width),
    height: num(b.height),
    thumb: thumb.ok ? thumb.value : null,
    originalBytes: num(b.originalBytes),
    note: typeof b.note === 'string' ? b.note : null,
  };
}

/** The last path segment of a link, as a name. */
function nameFromLink(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : 'link';
  } catch {
    return 'link';
  }
}

/**
 * Creates the API client.
 *
 * @param options - server URL, logger, transport, retry, timeouts
 * @returns the client
 */
export function createApi(options: ApiOptions): Api {
  const base = options.serverUrl.replace(/\/+$/, '');
  const { log } = options;
  const send = options.transport ?? defaultTransport;
  const policy = options.retry ?? DEFAULT_RETRY;
  const t = { ...DEFAULT_TIMEOUTS, ...options.timeouts };

  /** Throws an `http` ApiError for an error status, with the server's `error` text if any. */
  async function check(res: HttpResponse, path: string): Promise<HttpResponse> {
    if (res.status >= 200 && res.status < 300) return res;
    let reason = `HTTP ${res.status}`;
    try {
      const text = await res.body.text();
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === 'string') reason = body.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError('http', reason, path, res.status);
  }

  /** Parses a JSON body. */
  async function jsonOf(res: HttpResponse, path: string): Promise<unknown> {
    try {
      return JSON.parse(await res.body.text()) as unknown;
    } catch {
      throw new ApiError('invalid', 'Answer is not JSON', path, res.status);
    }
  }

  /** A JSON call with retry, logging and timing. */
  async function callJson(what: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, signal?: AbortSignal, allow404 = false): Promise<unknown> {
    const t0 = performance.now();
    const text = body === undefined ? undefined : JSON.stringify(body);
    log.debug('api', `${what} …`, { path, bytes: text?.length ?? 0 });
    try {
      const out = await withRetry(what, path, async () => {
        const res = await send({
          method, url: base + path, path, signal, idleMs: t.jsonMs,
          body: text, headers: text === undefined ? undefined : { 'content-type': 'application/json' },
        });
        if (allow404 && res.status === 404) return null;
        await check(res, path);
        if (res.body.size === 0) return null;
        return jsonOf(res, path);
      }, policy, log, signal);
      log.info('api', `${what} done`, { path, ms: Math.round(performance.now() - t0), sentBytes: text?.length ?? 0 });
      return out;
    } catch (err) {
      failed(what, path, err, t0);
      throw err;
    }
  }

  function failed(what: string, path: string, err: unknown, t0: number, props: Record<string, unknown> = {}): void {
    const e = err instanceof ApiError ? err : null;
    const line = { path, ms: Math.round(performance.now() - t0), kind: e?.kind ?? 'other', status: e?.status ?? 0, error: err instanceof Error ? err.message : String(err), ...props };
    if (e?.kind === 'aborted') log.info('api', `${what} cancelled`, line);
    else log.error('api', `${what} failed`, line);
  }

  /** Checks list entries one by one; broken ones are logged and skipped. */
  function each<T>(what: string, checker: Checker<T>, items: unknown[]): T[] {
    const ok: T[] = [];
    for (const item of items) {
      const r = checker(item);
      if (r.ok) ok.push(r.value);
      else log.warn('api', `${what}: broken entry skipped`, { issue: r.error.slice(0, 300) });
    }
    return ok;
  }

  async function download(path: string, what: string, expected: number, onProgress?: Progress, signal?: AbortSignal): Promise<HttpResponse> {
    const t0 = performance.now();
    log.debug('api', `${what} …`, { path, bytes: expected });
    try {
      const res = await withRetry(what, path, async () => check(await send({
        method: 'GET', url: base + path, path, signal, idleMs: t.transferIdleMs, onDownload: onProgress, expectedBytes: expected,
      }), path), policy, log, signal);
      const ms = Math.round(performance.now() - t0);
      log.info('api', `${what} done`, { path, bytes: res.body.size, ms, kbps: ms > 0 ? Math.round(res.body.size / ms) : null });
      return res;
    } catch (err) {
      failed(what, path, err, t0, { bytes: expected });
      throw err;
    }
  }

  const fileUrl = (ref: FileRef) => `${base}/files/${ref.hash}.${ref.ext}`;

  async function downloadFile(ref: FileRef, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
    const res = await download(`/files/${ref.hash}.${ref.ext}`, 'Download', ref.bytes, onProgress, signal);
    return res.body;
  }

  return {
    serverUrl: base,
    fileUrl,

    async uploadFile(blob, opts, onProgress) {
      const q = new URLSearchParams({ ext: opts.ext });
      if (opts.format && opts.format !== 'asis') q.set('format', opts.format);
      const path = `/files?${q}`;
      const t0 = performance.now();
      log.info('api', 'Upload …', { path, bytes: blob.size, format: opts.format ?? 'asis' });
      try {
        const ref = await withRetry('Upload', path, async () => {
          const res = await check(await send({
            method: 'POST', url: base + path, path, body: blob, signal: opts.signal, idleMs: t.transferIdleMs,
            headers: { 'content-type': blob.type || 'application/octet-stream' },
            onUpload: onProgress ?? (() => {}),
          }), path);
          const body = await jsonOf(res, path);
          const ref = unwrapOne(asRef, body, ['file', 'ref']);
          if (!ref) throw new ApiError('invalid', 'Answer is not a file ref', path, res.status);
          return uploadResult(ref, body);
        }, policy, log, opts.signal);
        const ms = Math.round(performance.now() - t0);
        log.info('api', 'Upload done', { path, bytes: blob.size, storedBytes: ref.bytes, file: `${ref.hash}.${ref.ext}`, ms, kbps: ms > 0 ? Math.round(blob.size / ms) : null });
        return ref;
      } catch (err) {
        failed('Upload', path, err, t0, { bytes: blob.size });
        throw err;
      }
    },

    downloadFile,

    library: {
      async list(signal) {
        const path = '/api/library';
        const body = await callJson('Library list', 'GET', path, undefined, signal);
        const items = unwrapList(body, ['entries', 'maps', 'library']);
        if (!items) throw new ApiError('invalid', 'Answer is not a list', path);
        return each('Library list', asEntry, items);
      },
      async add(entry, signal) {
        const path = '/api/library';
        const body = await callJson('Library add', 'POST', path, entry, signal);
        const out = body === null ? entry : unwrapOne(asEntry, body, ['entry', 'map']);
        if (!out) throw new ApiError('invalid', 'Answer is not a library entry', path);
        return out;
      },
      async remove(id, signal) {
        await callJson('Library remove', 'DELETE', `/api/library/${encodeURIComponent(id)}`, undefined, signal, true);
      },
    },

    backups: {
      async put(game, signal) {
        await callJson('Backup', 'PUT', `/api/games/${encodeURIComponent(game.id)}`, game, signal);
      },
      async list(signal) {
        const path = '/api/games';
        const body = await callJson('Backup list', 'GET', path, undefined, signal);
        const items = unwrapList(body, ['games', 'entries']);
        if (!items) throw new ApiError('invalid', 'Answer is not a list', path);
        return each('Backup list', asSummary, items);
      },
      async get(id, signal) {
        const path = `/api/games/${encodeURIComponent(id)}`;
        const body = await callJson('Backup read', 'GET', path, undefined, signal, true);
        if (body === null) return null;
        const game = unwrapOne(asGame, body, ['game']);
        if (!game) throw new ApiError('invalid', 'Answer is not a game', path);
        return game;
      },
      async delete(id, signal) {
        await callJson('Backup delete', 'DELETE', `/api/games/${encodeURIComponent(id)}`, undefined, signal, true);
      },
    },

    async fetchLink(url, onProgress, signal) {
      const path = `/api/fetch?${new URLSearchParams({ url })}`;
      const t0 = performance.now();
      log.info('api', 'Link fetch …', { link: url.slice(0, 200) });
      try {
        // 1. The server downloads the link into its uploads/ and says where it put it.
        const res = await withRetry('Link fetch', path, async () => check(await send({
          method: 'GET', url: base + path, path, signal, idleMs: t.linkMs,
        }), path), policy, log, signal);
        const got = (await jsonOf(res, path)) as Partial<Record<'url' | 'name' | 'bytes' | 'kind' | 'ext', unknown>>;
        if (typeof got.url !== 'string') throw new ApiError('invalid', 'Answer names no file', path);
        const name = typeof got.name === 'string' && got.name ? got.name : nameFromLink(url);
        const bytes = typeof got.bytes === 'number' ? got.bytes : 0;
        const kind = got.kind === 'picture' || got.kind === 'pdf' || got.kind === 'uvtt' ? got.kind : null;
        const ext = typeof got.ext === 'string' && got.ext ? got.ext.toLowerCase() : extOf(name);
        // 2. This device downloads that copy (same-server path, absolute or relative).
        const rel = got.url.startsWith('http') ? new URL(got.url).pathname + new URL(got.url).search : got.url;
        const file = await download(rel, 'Link download', bytes, onProgress, signal);
        const out: FetchedLink = { blob: file.body, name, ext, kind };
        log.info('api', 'Link fetch done', { link: url.slice(0, 200), name, ext, kind, bytes: out.blob.size, ms: Math.round(performance.now() - t0) });
        return out;
      } catch (err) {
        failed('Link fetch', path, err, t0, { link: url.slice(0, 200) });
        throw err;
      }
    },
  };
}
