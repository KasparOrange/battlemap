/**
 * The storage seam: the device's IndexedDB (`games`, `settings`, `files`) and game export /
 * import. `games`, `settings` and `files` are the app's instances — files missing from the
 * cache come from the server through `lib/api`, storage problems show as kit notices.
 *
 * @see ./db.ts for the schema, ./files.ts for the cache rules, ./bundle.ts for `.battlemap` files
 */
import { api } from '../api/index.ts';
import { log } from '../log.ts';
import { notify } from '../ui/notice.svelte.ts';
import { createStorage, type Storage } from './storage.ts';

export { createStorage } from './storage.ts';
export type { Storage, StorageOptions } from './storage.ts';
export { DB_NAME, MIGRATIONS, isQuotaError, openDatabase } from './db.ts';
export type { FileRecord, GameRecord, Migration } from './db.ts';
export { StorageFullError, summarize } from './games.ts';
export type { GameStore } from './games.ts';
export { SETTING } from './settings.ts';
export type { SettingsStore } from './settings.ts';
export { cacheBudget, fileKey, MAX_CACHE_BYTES, MIN_CACHE_BYTES } from './files.ts';
export type { Downloader, FileCache } from './files.ts';
export type { PersistResult } from './persist.ts';
export { BUNDLE_EXT, BundleError, bundleName, exportGame, gameFileRefs, importGame, readGameBundle, remapRefs, saveBlob } from './bundle.ts';
export type { ExportDeps, GameBundle, ImportDeps, ImportOptions } from './bundle.ts';

/** The app's storage. */
export const storage: Storage = createStorage({
  log,
  notify: (text, kind) => notify(text, { kind }),
  download: (ref, onProgress, signal) => api.downloadFile(ref, onProgress, signal),
  url: (ref) => api.fileUrl(ref),
});

/** Games on this device. */
export const games = storage.games;
/** Device settings. */
export const settings = storage.settings;
/** The file cache. */
export const files = storage.files;
