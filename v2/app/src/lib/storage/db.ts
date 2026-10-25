/**
 * The device's IndexedDB database `battlemap` — opening it, its versioned schema, and small
 * promise helpers around IndexedDB's event API.
 *
 * Stores (schema version 1):
 *
 * | Store | Key | Value |
 * |---|---|---|
 * | `games` | `id` (in the value) | {@link GameRecord}: the full game, when it was saved |
 * | `settings` | the setting's name (out of line) | any structured-cloneable value |
 * | `files` | `<hash>.<ext>` (in the value, `key`) | {@link FileRecord}: the blob, its size, last use (index `lastUsed`) |
 *
 * The schema grows only by appending a migration to {@link MIGRATIONS}: migration *n* takes the
 * database from version *n* to *n + 1*, so a device on any old version runs exactly the steps it
 * missed. Never edit a migration that has shipped.
 *
 * @see ../../../../docs/architecture.md "persistence"
 */
import type { FileExt, Game } from '@battlemap/shared';
import type { Logger } from '../log.ts';

/** The database's name on every device. */
export const DB_NAME = 'battlemap';

/** A stored game: the game and the time it was saved. */
export interface GameRecord {
  /** The game's id (the store's key). */
  id: string;
  /** When it was saved here (ISO time). */
  savedAt: string;
  /** The game itself. */
  game: Game;
}

/** A cached file. */
export interface FileRecord {
  /** `<hash>.<ext>` — the store's key, the same as the server's file name. */
  key: string;
  /** The content hash. */
  hash: string;
  /** The file's kind. */
  ext: FileExt;
  /** Its size in bytes. */
  bytes: number;
  /** The content. */
  blob: Blob;
  /** When it was last read or written (epoch ms) — the eviction order. */
  lastUsed: number;
}

/**
 * One schema step: changes the database from the version before it to the next one. Runs inside
 * the `versionchange` transaction, so it may create stores and indexes and rewrite records.
 */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/** The schema, one step per version. Version = the number of steps. */
export const MIGRATIONS: readonly Migration[] = [
  // 0 → 1: the three stores.
  (db) => {
    db.createObjectStore('games', { keyPath: 'id' });
    db.createObjectStore('settings');
    const files = db.createObjectStore('files', { keyPath: 'key' });
    files.createIndex('lastUsed', 'lastUsed');
  },
];

/** What {@link openDatabase} needs. */
export interface OpenOptions {
  /** The IndexedDB implementation (default `globalThis.indexedDB`; tests pass fake-indexeddb). */
  idb?: IDBFactory | undefined;
  /** The database name (default {@link DB_NAME}). */
  name?: string | undefined;
  /** The schema steps (default {@link MIGRATIONS}; tests pass their own). */
  migrations?: readonly Migration[] | undefined;
  /** The logger. */
  log: Logger;
}

/**
 * Turns an IndexedDB request into a promise.
 *
 * @param req - the request
 * @returns its result
 * @throws the request's error (a `DOMException`)
 */
export function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Waits for a transaction to commit.
 *
 * @param tx - the transaction
 * @throws the transaction's error, or an `AbortError` when it was aborted
 */
export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/**
 * Opens (and if needed upgrades) the database. Another tab holding an older version is asked to
 * close by `versionchange`; this connection closes itself the same way when a newer page
 * upgrades, so an update never stalls on a stale tab.
 *
 * @param options - IndexedDB implementation, name, schema, logger
 * @returns the open database
 * @throws when IndexedDB is missing or refuses to open (private mode, a broken profile)
 */
export async function openDatabase(options: OpenOptions): Promise<IDBDatabase> {
  const idb = options.idb ?? globalThis.indexedDB;
  const name = options.name ?? DB_NAME;
  const steps = options.migrations ?? MIGRATIONS;
  const { log } = options;
  if (!idb) throw new Error('IndexedDB is not available here');
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const req = idb.open(name, steps.length);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction!;
      const from = ev.oldVersion;
      log.info('storage', 'Upgrading the database', { name, from, to: steps.length });
      for (let v = from; v < steps.length; v++) steps[v]!(db, tx);
    };
    req.onblocked = () => log.warn('storage', 'Database upgrade waits for another tab to close it', { name });
    req.onerror = () => {
      log.error('storage', 'Database did not open', { name, error: String(req.error) });
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        log.info('storage', 'A newer page upgrades the database — closing this connection', { name });
        db.close();
      };
      log.info('storage', 'Database open', { name, version: db.version, ms: Math.round(performance.now() - t0) });
      resolve(db);
    };
  });
}

/**
 * Whether an error means the device's storage quota is used up.
 *
 * @param err - anything thrown by IndexedDB or the storage API
 * @returns true for `QuotaExceededError` (and the old Firefox/Safari spellings)
 */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  const code = (err as { code?: unknown }).code;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}
