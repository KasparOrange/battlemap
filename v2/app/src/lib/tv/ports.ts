/**
 * What TV mode needs from the rest of the app, as small interfaces: the device's game store and
 * settings (`lib/storage`), the server's game backups and shared library (`lib/api`), the file
 * cache, and a way to reload the page. `seams.ts` builds the real ones from those packages; the
 * tests pass fakes. Keeping the TV's logic (`games.ts`) behind these makes it testable under
 * `bun test` without IndexedDB, a server or a DOM.
 *
 * @see ../../../../docs/architecture.md "persistence" and "work packages" #3
 */
import type { FileRef, Game, GameSummary, LibraryEntry } from '@battlemap/shared';

/** The games kept on this device (IndexedDB `games`). */
export interface TvGameStore {
  /** Every stored game as a library row (`where: 'tv'`). */
  list(): Promise<GameSummary[]>;
  /**
   * One game.
   *
   * @param id - the game's id
   * @returns the game, or null when it isn't stored here
   */
  get(id: string): Promise<Game | null>;
  /**
   * Stores a game (replaces one with the same id; the store stamps the save time).
   *
   * @param game - the game
   */
  put(game: Game): Promise<void>;
  /**
   * Deletes a game; nothing happens when it isn't there.
   *
   * @param id - the game's id
   */
  delete(id: string): Promise<void>;
}

/** Small device settings (IndexedDB `settings`). */
export interface TvSettingsStore {
  /**
   * A setting.
   *
   * @param key - its key
   * @returns the value, or null when never written
   */
  get<T>(key: string): Promise<T | null>;
  /**
   * Writes a setting.
   *
   * @param key - its key
   * @param value - a structured-cloneable value (null clears it)
   */
  put(key: string, value: unknown): Promise<void>;
}

/** The server's game backups (`/api/games`). */
export interface TvBackups {
  /**
   * Uploads a game as its latest backup.
   *
   * @param game - the game
   */
  put(game: Game): Promise<void>;
  /** The backed-up games. */
  list(): Promise<GameSummary[]>;
  /**
   * One backed-up game.
   *
   * @param id - the game's id
   * @returns the game, or null when the server has none
   */
  get(id: string): Promise<Game | null>;
  /**
   * Deletes a game's backup — optional: the server API may not offer it yet.
   *
   * @param id - the game's id
   */
  delete?(id: string): Promise<void>;
}

/** The shared map library on the server (`/api/library`). */
export interface TvLibrary {
  /** The shared maps. */
  list(): Promise<LibraryEntry[]>;
}

/** The file cache (by hash, fetched from the server when missing). */
export interface TvFiles {
  /**
   * Makes sure a file is on the device.
   *
   * @param ref - the file
   * @param onProgress - 0–1 while it downloads
   * @returns the file's contents
   */
  get(ref: FileRef, onProgress?: (fraction: number) => void): Promise<Blob>;
  /**
   * The URL a picture can be shown from (`<server>/files/<hash>.<ext>`).
   *
   * @param ref - the file
   */
  url(ref: FileRef): string;
}

/** Everything TV mode's logic uses from outside. */
export interface TvPorts {
  /** Games on this device. */
  games: TvGameStore;
  /** Settings on this device. */
  settings: TvSettingsStore;
  /** The server's backups. */
  backups: TvBackups;
  /** The shared library. */
  library: TvLibrary;
  /** The file cache. */
  files: TvFiles;
  /** Reloads the app (the shell's `reload()`, else `location.reload()`). */
  reload(): void;
}
