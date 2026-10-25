/**
 * The real `TvPorts`: the device's storage (`$lib/storage`), the server API (`$lib/api`) and
 * the shell's reload. The only file of TV mode that knows those packages' shapes.
 */
import { api } from '../api/index.ts';
import { shellBridge } from '../shell.ts';
import { storage } from '../storage/index.ts';
import type { TvPorts } from './ports.ts';

/**
 * Builds the ports TV mode runs on.
 *
 * @returns the ports
 */
export function realPorts(): TvPorts {
  return {
    games: {
      list: () => storage.games.list(),
      get: (id) => storage.games.get(id),
      put: (game) => storage.games.put(game),
      delete: (id) => storage.games.delete(id),
    },
    settings: {
      get: async <T>(key: string) => (await storage.settings.get<T>(key)) ?? null,
      put: (key, value) => storage.settings.put(key, value),
    },
    backups: {
      put: (game) => api.backups.put(game),
      list: () => api.backups.list(),
      get: (id) => api.backups.get(id),
      delete: (id) => api.backups.delete(id),
    },
    library: { list: () => api.library.list() },
    files: {
      get: (ref, onProgress) => storage.files.get(ref, onProgress ? (loaded, total) => onProgress(total > 0 ? loaded / total : 0) : undefined),
      url: (ref) => api.fileUrl(ref),
    },
    reload: () => {
      const shell = shellBridge();
      if (shell) shell.reload();
      else location.reload();
    },
  };
}

/** Asks the browser to keep the TV's storage (logged by the storage package). */
export function requestPersistentStorage(): void {
  void storage.persist().catch(() => {});
}
