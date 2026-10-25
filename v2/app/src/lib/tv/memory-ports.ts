/**
 * In-memory `TvPorts`: a game store, settings, a fake server backup and library, a file cache
 * that remembers what it was asked for. The tests use them; they also stand in for a seam that
 * isn't built yet. Each part can be told to fail, to test the error paths.
 */
import type { FileRef, Game, GameSummary, LibraryEntry } from '@battlemap/shared';
import type { TvPorts } from './ports.ts';
import { summarize } from './games.ts';

/** In-memory ports plus handles for tests. */
export interface MemoryPorts extends TvPorts {
  /** Games on the "device", by id, with their save time. */
  readonly stored: Map<string, { game: Game; savedAt: string }>;
  /** Settings by key. */
  readonly setting: Map<string, unknown>;
  /** Backups on the "server", by id. */
  readonly server: Map<string, Game>;
  /** Shared maps. */
  readonly shared: LibraryEntry[];
  /** Files asked for, in order. */
  readonly fetched: FileRef[];
  /** How often `reload()` was called. */
  reloads: number;
  /** While true, every server call fails (offline). */
  offline: boolean;
  /** While true, saving a game on the device fails (storage full). */
  storeFails: boolean;
}

/**
 * A fresh set of in-memory ports.
 *
 * @returns the ports and their test handles
 */
export function memoryPorts(): MemoryPorts {
  const p: MemoryPorts = {
    stored: new Map(),
    setting: new Map(),
    server: new Map(),
    shared: [],
    fetched: [],
    reloads: 0,
    offline: false,
    storeFails: false,
    games: {
      list: async () => [...p.stored.values()].map((s) => summarize(s.game, s.savedAt, 'tv')),
      get: async (id) => p.stored.get(id)?.game ?? null,
      put: async (game) => {
        if (p.storeFails) throw new Error('quota exceeded');
        p.stored.set(game.id, { game, savedAt: new Date().toISOString() });
      },
      delete: async (id) => void p.stored.delete(id),
    },
    settings: {
      get: async <T>(key: string) => (p.setting.has(key) ? (p.setting.get(key) as T) : null),
      put: async (key, value) => void p.setting.set(key, value),
    },
    backups: {
      put: async (game) => {
        if (p.offline) throw new Error('offline');
        p.server.set(game.id, structuredClone(game));
      },
      list: async (): Promise<GameSummary[]> => {
        if (p.offline) throw new Error('offline');
        return [...p.server.values()].map((g) => summarize(g, g.createdAt, 'server'));
      },
      get: async (id) => {
        if (p.offline) throw new Error('offline');
        return p.server.has(id) ? structuredClone(p.server.get(id)!) : null;
      },
      delete: async (id) => {
        if (p.offline) throw new Error('offline');
        p.server.delete(id);
      },
    },
    library: {
      list: async () => {
        if (p.offline) throw new Error('offline');
        return p.shared;
      },
    },
    files: {
      get: async (ref, onProgress) => {
        p.fetched.push(ref);
        onProgress?.(1);
        return new Blob([]);
      },
      url: (ref) => `/files/${ref.hash}.${ref.ext}`,
    },
    reload: () => void p.reloads++,
  };
  return p;
}
