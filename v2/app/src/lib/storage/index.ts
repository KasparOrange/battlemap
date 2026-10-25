/**
 * The storage seam: the device's IndexedDB (`games`, `settings`, `files`) and game export /
 * import. `games`, `settings` and `files` are the app's instances — files missing from the
 * cache come from the server through `lib/api`, storage problems show as kit notices.
 *
 * @see ./db.ts for the schema, ./files.ts for the cache rules, ./bundle.ts for `.battlemap` files
 */
import type { Game } from '@battlemap/shared';
import { api } from '../api/index.ts';
import { appConfig } from '../config.ts';
import { log } from '../log.ts';
import { notify } from '../ui/notice.svelte.ts';
import { createStorage, type Storage } from './storage.ts';
import { exportGame, importGame, type ImportOptions, type Progress } from './bundle.ts';

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
export type { ExportDeps, GameBundle, ImportDeps, ImportOptions, Progress } from './bundle.ts';

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

/**
 * Exports a game with this app's file cache (files it lacks come from the server).
 *
 * @param game - the game
 * @param onProgress - bytes gathered of the total
 * @param signal - cancels
 * @returns the `.battlemap` blob and its file name (hand both to `saveBlob`)
 */
export function exportGameFile(game: Game, onProgress?: Progress, signal?: AbortSignal): Promise<{ blob: Blob; name: string }> {
  return exportGame(game, { getFile: (ref, p, s) => files.get(ref, p, s), log, build: appConfig().build }, onProgress, signal);
}

/**
 * Imports a `.battlemap` file through this app's server and cache: uploads its files as they
 * are, keeps them here, backs the game up — then `game.open` with its id opens it on the TV.
 *
 * @param file - the picked file
 * @param onProgress - bytes uploaded of the total
 * @param options - as a copy, signal
 * @returns the imported game
 * @throws {BundleError} for a bad file; an `ApiError` when the server can't be reached
 */
export function importGameFile(file: Blob, onProgress?: Progress, options?: ImportOptions): Promise<Game> {
  return importGame(file, {
    upload: (blob, ref, p, signal) => api.uploadFile(blob, { ext: ref.ext, format: 'asis', signal }, p),
    keep: (ref, blob) => files.put(ref, blob),
    backup: (game, signal) => api.backups.put(game, signal),
    log,
  }, onProgress, options);
}
