/**
 * Builds the three stores on one database: `games`, `settings`, `files`. The app uses the
 * instance from `index.ts`; tests build their own with fake-indexeddb and a fake downloader.
 */
import type { FileRef } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { openDatabase, type Migration } from './db.ts';
import { once, throttledNotify, type StorageContext } from './context.ts';
import { createFileCache, type Downloader, type FileCache } from './files.ts';
import { createGameStore, type GameStore } from './games.ts';
import { createSettingsStore, type SettingsStore } from './settings.ts';
import { requestPersistence, type PersistResult } from './persist.ts';

/** What {@link createStorage} needs. */
export interface StorageOptions {
  /** The logger. */
  log: Logger;
  /** Shows a storage problem to the user (the kit's `notify`). */
  notify: (text: string, kind: 'warning' | 'error') => void;
  /** Fetches files the cache doesn't have (the api's `downloadFile`). */
  download: Downloader;
  /** A file's server URL (the api's `fileUrl`). */
  url: (ref: FileRef) => string;
  /** The IndexedDB implementation (default the browser's). */
  idb?: IDBFactory | undefined;
  /** The database name (default `battlemap`). */
  name?: string | undefined;
  /** The schema (default the app's). */
  migrations?: readonly Migration[] | undefined;
  /** The file cache budget in bytes (default from the quota). */
  budget?: number | undefined;
}

/** The device's storage. */
export interface Storage {
  /** Games on this device. */
  games: GameStore;
  /** Device settings. */
  settings: SettingsStore;
  /** The file cache. */
  files: FileCache;
  /** Asks for persistent storage and logs usage (call once at start, TV and companion). */
  persist(): Promise<PersistResult>;
  /** Closes the database (tests, or before deleting it). */
  close(): Promise<void>;
}

/**
 * Creates the device's storage. The database opens on first use.
 *
 * @param options - logger, notifier, downloader, and test overrides
 * @returns the stores
 */
export function createStorage(options: StorageOptions): Storage {
  const db = once(() => openDatabase({ idb: options.idb, name: options.name, migrations: options.migrations, log: options.log }));
  const ctx: StorageContext = { db, log: options.log, notify: throttledNotify(options.notify) };
  const files = createFileCache(ctx, { download: options.download, url: options.url, budget: options.budget });
  return {
    games: createGameStore(ctx, { freeSpace: () => files.freeSpace() }),
    settings: createSettingsStore(ctx),
    files,
    persist: () => requestPersistence(options.log),
    async close() {
      (await db()).close();
    },
  };
}
