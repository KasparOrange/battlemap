/**
 * The `files` store: a cache of the server's files (map pictures, table copies, geometry, DM
 * layers) by content hash. A file never changes, so a cached copy is good forever; the cache
 * only decides what to keep when space runs short.
 *
 * - **Hit:** the blob comes from IndexedDB, its `lastUsed` is refreshed (at most once a minute).
 * - **Miss:** the injected downloader fetches it (with progress), the size is checked against
 *   the ref, the blob is stored and returned. Two callers asking for the same file share one
 *   download; one of them cancelling doesn't cancel the other's.
 * - **Budget:** after a store the least recently used files are dropped until the cache fits
 *   its budget ({@link cacheBudget}: at most 768 MB, at most half the origin's quota — the TV
 *   box has 8 GB of flash, ~4–5 GB usable, and its games must always fit).
 * - **Quota:** a store that hits the quota frees half the cache (oldest first) and tries
 *   once more; if that fails too the file is still returned, just not kept, and the user gets a
 *   notice.
 *
 * Blobs in IndexedDB live on disk, not in RAM; reading one returns a handle, so listing and
 * evicting stay cheap even with large maps.
 */
import { type FileRef } from '@battlemap/shared';
import { committed, done, isQuotaError, type FileRecord } from './db.ts';
import { FULL_TEXT, type StorageContext } from './context.ts';

/** Fetches a file the cache doesn't have (the api's `downloadFile`). */
export type Downloader = (ref: FileRef, onProgress: (loaded: number, total: number) => void, signal: AbortSignal) => Promise<Blob>;

/** Download progress: bytes so far and the total (the ref's size when the server sends none). */
export type Progress = (loaded: number, total: number) => void;

/** The file cache's API (the storage seam). */
export interface FileCache {
  /**
   * A file's content: from the cache, else downloaded and kept.
   *
   * @param ref - the file
   * @param onProgress - download progress (not called on a hit)
   * @param signal - cancels this caller's wait (and the download when nobody else waits)
   * @returns the content
   * @throws the downloader's error, an `AbortError`, or an `Error` when the size is wrong
   */
  get(ref: FileRef, onProgress?: Progress, signal?: AbortSignal): Promise<Blob>;
  /** The file's URL on the server (to show a picture straight from there). */
  url(ref: FileRef): string;
  /** Keeps a file the device already has (the companion's own upload) — no download later. */
  put(ref: FileRef, blob: Blob): Promise<void>;
  /** Whether a file is cached. */
  has(ref: FileRef): Promise<boolean>;
  /** Drops one file. */
  delete(ref: FileRef): Promise<void>;
  /** Files, bytes and the budget. */
  usage(): Promise<{ files: number; bytes: number; budget: number }>;
  /** Drops least recently used files until the cache holds at most half of what it held (and of its budget). */
  freeSpace(): Promise<void>;
  /** Drops everything. */
  clear(): Promise<void>;
}

/** Options of {@link createFileCache}. */
export interface FileCacheOptions {
  /** Fetches missing files. */
  download: Downloader;
  /** The budget in bytes, or a function that works it out (default: {@link cacheBudget} of the origin's quota). */
  budget?: number | (() => Promise<number>) | undefined;
  /** A file's URL on the server (the api's `fileUrl`). */
  url: (ref: FileRef) => string;
  /** The clock (tests). */
  now?: (() => number) | undefined;
}

/** The cache never grows past this, whatever the quota. */
export const MAX_CACHE_BYTES = 768 * 1024 * 1024;

/** Nor is it squeezed below this (one big map and its copies). */
export const MIN_CACHE_BYTES = 64 * 1024 * 1024;

/** `lastUsed` is rewritten on a hit only when older than this. */
const TOUCH_MS = 60_000;

/**
 * The cache budget for a storage quota: half the quota (games and settings must always fit
 * next to it), between {@link MIN_CACHE_BYTES} and {@link MAX_CACHE_BYTES}.
 *
 * @param quota - the origin's quota in bytes (`navigator.storage.estimate()`), undefined when unknown
 * @returns the budget in bytes
 */
export function cacheBudget(quota: number | undefined): number {
  if (!quota || !Number.isFinite(quota)) return MAX_CACHE_BYTES;
  return Math.max(MIN_CACHE_BYTES, Math.min(MAX_CACHE_BYTES, Math.floor(quota / 2)));
}

/** The budget from the storage API's estimate. */
async function estimatedBudget(): Promise<number> {
  try {
    const est = await globalThis.navigator?.storage?.estimate?.();
    return cacheBudget(est?.quota);
  } catch {
    return MAX_CACHE_BYTES;
  }
}

/**
 * The cache key of a file — the same as its name on the server.
 *
 * @param ref - the file
 * @returns `<hash>.<ext>`
 */
export function fileKey(ref: FileRef): string {
  return `${ref.hash}.${ref.ext}`;
}

/** An `AbortError` like `fetch` throws. */
function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

/** A download several callers wait for. */
interface Shared {
  promise: Promise<Blob>;
  listeners: Set<Progress>;
  waiting: number;
  ctl: AbortController;
}

/**
 * Creates the file cache.
 *
 * @param ctx - database, logger, notifier
 * @param options - downloader, budget, clock
 * @returns the cache
 */
export function createFileCache(ctx: StorageContext, options: FileCacheOptions): FileCache {
  const { log } = ctx;
  const now = options.now ?? Date.now;
  const inflight = new Map<string, Shared>();
  let budgetValue: number | null = typeof options.budget === 'number' ? options.budget : null;

  async function budget(): Promise<number> {
    if (budgetValue === null) {
      budgetValue = typeof options.budget === 'function' ? await options.budget() : await estimatedBudget();
      log.info('storage', 'File cache budget', { budgetMb: Math.round(budgetValue / 1048576) });
    }
    return budgetValue;
  }

  /** Records oldest use first (blob handles only, no content read). */
  async function byAge(): Promise<FileRecord[]> {
    const db = await ctx.db();
    return (await done(db.transaction('files').objectStore('files').index('lastUsed').getAll())) as FileRecord[];
  }

  /** Drops the oldest files until at most `limit` bytes remain; `keep` is never dropped. */
  async function evictTo(limit: number, keep?: string): Promise<void> {
    const all = await byAge();
    let total = all.reduce((s, r) => s + r.bytes, 0);
    if (total <= limit) return;
    const drop: FileRecord[] = [];
    for (const r of all) {
      if (total <= limit) break;
      if (r.key === keep) continue;
      drop.push(r);
      total -= r.bytes;
    }
    if (!drop.length) return;
    const db = await ctx.db();
    const tx = db.transaction('files', 'readwrite');
    for (const r of drop) tx.objectStore('files').delete(r.key);
    await committed(tx);
    log.info('storage', 'File cache evicted', { files: drop.length, freedMb: Math.round(drop.reduce((s, r) => s + r.bytes, 0) / 1048576), leftMb: Math.round(total / 1048576), limitMb: Math.round(limit / 1048576) });
  }

  /** Frees the cache to half of what it holds (at most half its budget) — the response to a full device. */
  async function halve(): Promise<void> {
    const total = (await byAge()).reduce((s, r) => s + r.bytes, 0);
    await evictTo(Math.floor(Math.min(total, await budget()) / 2));
  }

  async function write(rec: FileRecord): Promise<void> {
    const db = await ctx.db();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(rec);
    await committed(tx);
  }

  /** Stores a file, evicting to the budget; never throws (a cache that can't keep is still a pass-through). */
  async function keep(ref: FileRef, blob: Blob): Promise<boolean> {
    const rec: FileRecord = { key: fileKey(ref), hash: ref.hash, ext: ref.ext, bytes: blob.size, blob, lastUsed: now() };
    try {
      await write(rec);
      await evictTo(await budget(), rec.key);
      return true;
    } catch (err) {
      if (!isQuotaError(err)) {
        log.error('storage', 'File not cached', { file: rec.key, bytes: rec.bytes, error: String(err) });
        return false;
      }
      log.warn('storage', 'File cache hit the storage quota — freeing space', { file: rec.key, bytes: rec.bytes });
      try {
        await halve();
        await write(rec);
        ctx.notify(FULL_TEXT, 'warning');
        return true;
      } catch (again) {
        log.error('storage', 'File not cached: storage full', { file: rec.key, bytes: rec.bytes, error: String(again) });
        ctx.notify('Storage on this device is full — map files are downloaded every time.', 'error');
        return false;
      }
    }
  }

  async function cached(key: string): Promise<FileRecord | undefined> {
    const db = await ctx.db();
    return (await done(db.transaction('files').objectStore('files').get(key))) as FileRecord | undefined;
  }

  function startDownload(ref: FileRef, key: string): Shared {
    const shared: Shared = { listeners: new Set(), waiting: 0, ctl: new AbortController(), promise: Promise.resolve(new Blob()) };
    const t0 = performance.now();
    log.info('storage', 'File not cached — downloading', { file: key, bytes: ref.bytes });
    shared.promise = (async () => {
      await null; // let the first caller subscribe to progress before anything is reported
      try {
        const blob = await options.download(ref, (l, t) => { for (const f of shared.listeners) f(l, t); }, shared.ctl.signal);
        if (ref.bytes > 0 && blob.size !== ref.bytes) {
          log.error('storage', 'Downloaded file has the wrong size — not cached', { file: key, expected: ref.bytes, got: blob.size });
          throw new Error(`File ${key} arrived with ${blob.size} bytes instead of ${ref.bytes}`);
        }
        const kept = await keep(ref, blob);
        log.info('storage', 'File downloaded', { file: key, bytes: blob.size, kept, ms: Math.round(performance.now() - t0) });
        return blob;
      } finally {
        inflight.delete(key);
      }
    })();
    shared.promise.catch(() => { /* each waiter sees it */ });
    inflight.set(key, shared);
    return shared;
  }

  return {
    async get(ref, onProgress, signal) {
      if (signal?.aborted) throw abortError();
      const key = fileKey(ref);
      const hit = await cached(key);
      if (signal?.aborted) throw abortError();
      if (hit) {
        if (now() - hit.lastUsed > TOUCH_MS) {
          write({ ...hit, lastUsed: now() }).catch((err: unknown) => log.debug('storage', 'File touch failed', { file: key, error: String(err) }));
        }
        log.debug('storage', 'File cache hit', { file: key, bytes: hit.bytes });
        return hit.blob;
      }
      const shared = inflight.get(key) ?? startDownload(ref, key);
      if (onProgress) shared.listeners.add(onProgress);
      shared.waiting++;
      try {
        if (!signal) return await shared.promise;
        return await new Promise<Blob>((resolve, reject) => {
          const onAbort = () => reject(abortError());
          signal.addEventListener('abort', onAbort, { once: true });
          shared.promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        });
      } finally {
        shared.waiting--;
        if (onProgress) shared.listeners.delete(onProgress);
        if (shared.waiting === 0 && signal?.aborted) {
          log.info('storage', 'File download cancelled', { file: key });
          shared.ctl.abort();
        }
      }
    },

    url: options.url,

    async put(ref, blob) {
      if (await keep(ref, blob)) log.info('storage', 'File cached from this device', { file: fileKey(ref), bytes: blob.size });
    },

    async has(ref) {
      return (await cached(fileKey(ref))) !== undefined;
    },

    async delete(ref) {
      const db = await ctx.db();
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(fileKey(ref));
      await committed(tx);
    },

    async usage() {
      const all = await byAge();
      return { files: all.length, bytes: all.reduce((s, r) => s + r.bytes, 0), budget: await budget() };
    },

    async freeSpace() {
      await halve();
    },

    async clear() {
      const db = await ctx.db();
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').clear();
      await committed(tx);
      log.info('storage', 'File cache cleared');
    },
  };
}
