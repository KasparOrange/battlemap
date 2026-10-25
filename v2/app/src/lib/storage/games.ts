/**
 * The `games` store: every game this device keeps (on the TV: all of them; it is the
 * authority). A record is the whole game plus its save time — a game is small (fog masks are
 * bits, pictures are file refs), so a list reads the records whole.
 *
 * Writes store the game as it is (states are plain, immutable trees); only a value IndexedDB
 * can't clone (a Svelte `$state` proxy) is copied through JSON first. Every record carries its
 * library row (`summary`), so a listing reads rows, not games (rv#23). Reads of a game check it
 * against the shared `Game` schema; a record that fails is logged and left out instead of
 * breaking the whole list (the old app's one-corrupt-entry bug, parity SN-11).
 *
 * @see ./db.ts for the schema
 */
import { check, Game, GameSummary } from '@battlemap/shared';
import { committed, done, isQuotaError, type GameRecord } from './db.ts';
import { FULL_TEXT, type StorageContext } from './context.ts';

/** Thrown when a game could not be saved because the device is full, even after freeing space. */
export class StorageFullError extends Error {
  /** @param what - what could not be stored */
  constructor(what: string) {
    super(`Storage is full: ${what} was not saved`);
    this.name = 'StorageFullError';
  }
}

/** The games store's API (the storage seam). */
export interface GameStore {
  /** Every stored game as a library row, newest save first (`where: 'tv'`, `thumb: null`). */
  list(): Promise<GameSummary[]>;
  /** A game by id, or null when it isn't here (or its record is broken). */
  get(id: string): Promise<Game | null>;
  /** When a game was saved here, or null. */
  savedAt(id: string): Promise<string | null>;
  /**
   * Saves a game (replacing the stored one with that id).
   *
   * @throws {StorageFullError} when the device stays full after freeing the file cache
   */
  put(game: Game): Promise<void>;
  /** Removes a game; a missing id is fine. */
  delete(id: string): Promise<void>;
}

/** Options of {@link createGameStore}. */
export interface GameStoreOptions {
  /** Frees space when a save hits the quota (the file cache's `freeSpace`). */
  freeSpace?: (() => Promise<void>) | undefined;
  /** The clock for `savedAt` (tests). */
  now?: (() => Date) | undefined;
}

/**
 * A library row for a stored game.
 *
 * @param game - the game
 * @param savedAt - when it was saved
 * @returns its summary, as on this device (`where: 'tv'`, no thumbnail)
 */
export function summarize(game: Game, savedAt: string): GameSummary {
  return {
    id: game.id,
    name: game.name,
    createdAt: game.createdAt,
    savedAt,
    mapNames: game.mapOrder.map((id) => game.maps[id]?.info.name ?? '?'),
    activeMapName: game.maps[game.activeMapId]?.info.name ?? '?',
    thumb: null,
    where: 'tv',
  };
}

/**
 * Creates the games store.
 *
 * @param ctx - database, logger, notifier
 * @param options - space freeing on quota, clock
 * @returns the store
 */
export function createGameStore(ctx: StorageContext, options: GameStoreOptions = {}): GameStore {
  const { log } = ctx;
  const now = options.now ?? (() => new Date());

  /** Reads one record and checks it; null when missing or broken. */
  function checked(rec: unknown, id: string): GameRecord | null {
    if (!rec) return null;
    const r = rec as Partial<GameRecord>;
    const parsed = check(Game, r.game);
    if (!parsed.ok || typeof r.savedAt !== 'string') {
      log.warn('storage', 'Stored game is broken — skipped', {
        gameId: id,
        issue: parsed.ok ? 'savedAt missing' : parsed.error.slice(0, 300),
      });
      return null;
    }
    return { id: r.id ?? id, savedAt: r.savedAt, game: parsed.value };
  }

  async function write(rec: GameRecord): Promise<void> {
    const db = await ctx.db();
    const tx = db.transaction('games', 'readwrite');
    try {
      tx.objectStore('games').put(rec);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'DataCloneError') throw err;
      log.warn('storage', 'Game is not cloneable as is — stored as a JSON copy', { gameId: rec.id });
      tx.objectStore('games').put(JSON.parse(JSON.stringify(rec)) as GameRecord);
    }
    await committed(tx);
  }

  /** A record's row: its stored summary when valid, else made from the checked game. */
  function rowOf(rec: unknown): GameSummary | null {
    const r = rec as Partial<GameRecord> | null;
    if (r?.summary) {
      const s = check(GameSummary, r.summary);
      if (s.ok) return s.value;
    }
    const ok = checked(rec, String(r?.id ?? '?'));
    return ok ? summarize(ok.game, ok.savedAt) : null;
  }

  return {
    async list() {
      const t0 = performance.now();
      const db = await ctx.db();
      const all = (await done(db.transaction('games').objectStore('games').getAll())) as unknown[];
      const rows: GameSummary[] = [];
      for (const rec of all) {
        const row = rowOf(rec);
        if (row) rows.push(row);
      }
      rows.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
      log.debug('storage', 'Listed games', { count: rows.length, broken: all.length - rows.length, ms: Math.round(performance.now() - t0) });
      return rows;
    },

    async get(id) {
      const t0 = performance.now();
      const db = await ctx.db();
      const rec = checked(await done(db.transaction('games').objectStore('games').get(id)), id);
      log.info('storage', rec ? 'Game read' : 'Game not stored here', { gameId: id, ms: Math.round(performance.now() - t0) });
      return rec?.game ?? null;
    },

    async savedAt(id) {
      const db = await ctx.db();
      const rec = (await done(db.transaction('games').objectStore('games').get(id))) as GameRecord | undefined;
      return rec?.savedAt ?? null;
    },

    async put(game) {
      const t0 = performance.now();
      const savedAt = now().toISOString();
      const rec: GameRecord = { id: game.id, savedAt, game, summary: summarize(game, savedAt) };
      try {
        await write(rec);
      } catch (err) {
        if (!isQuotaError(err)) {
          log.error('storage', 'Game save failed', { gameId: game.id, error: String(err) });
          throw err;
        }
        log.warn('storage', 'Game save hit the storage quota — freeing the file cache', { gameId: game.id });
        ctx.notify(FULL_TEXT, 'warning');
        try {
          await options.freeSpace?.();
          await write(rec);
        } catch (again) {
          log.error('storage', 'Game save failed: storage full', { gameId: game.id, error: String(again) });
          ctx.notify('Storage on this device is full — the game could not be saved here.', 'error');
          throw isQuotaError(again) ? new StorageFullError(`game "${game.name}"`) : again;
        }
      }
      log.info('storage', 'Game saved', { gameId: game.id, ms: Math.round(performance.now() - t0) });
    },

    async delete(id) {
      const db = await ctx.db();
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').delete(id);
      await committed(tx);
      log.info('storage', 'Game deleted', { gameId: id });
    },
  };
}
