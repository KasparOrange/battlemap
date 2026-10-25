/**
 * Game backups: the TV sends its game after every save; the server keeps the latest and the
 * previous ten, so a reset box (or a second TV) can open any game again.
 *
 * Layout under the data folder, one folder per game:
 *
 * ```
 * games/<id>/latest.json        {savedAt, game}
 * games/<id>/summary.json       the GameSummary the library lists (small, read for listings)
 * games/<id>/<savedAt ms>.json  previous versions, the newest ten
 * trash/game-<id>-<ms>/         a deleted game's folder, removed after 30 days
 * ```
 *
 * @see ../../../docs/architecture.md "persistence"
 */
import { readdir, rename, rm, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { check, Game, type Game as GameT, type GameSummary } from '@battlemap/shared';
import { KeyedLock, readJsonFile, writeAtomic } from '../store/fsx.ts';
import type { FileStore } from '../files/store.ts';
import { knownThumbnail } from '../files/upload.ts';
import type { Library } from '../library/library.ts';

/** Game ids the server stores (they become folder names). */
export const GAME_ID = /^[0-9A-Za-z_-]{1,64}$/;

/** A backup the server refuses, with the reason. */
export class BadBackup extends Error {}

/** One stored version. */
interface Stored {
  /** When the server received it (ISO). */
  savedAt: string;
  /** The game. */
  game: GameT;
}

/** A previous version as `GET /api/games/<id>/versions` lists it. */
export interface VersionInfo {
  /** When it was saved (ISO); pass as `?at=` to get it. */
  savedAt: string;
  /** Its size in bytes. */
  bytes: number;
  /** Whether it is the latest one. */
  latest: boolean;
}

/** The backups. */
export class Backups {
  private readonly dir: string;
  private readonly trash: string;
  private readonly lock = new KeyedLock();

  /**
   * @param dataDir - the server's data folder
   * @param files - the file store (for thumbnails)
   * @param library - the shared library (a map's thumbnail)
   * @param keep - previous versions kept per game
   */
  constructor(dataDir: string, private readonly files: FileStore, private readonly library: Library, private readonly keep = 10) {
    this.dir = join(dataDir, 'games');
    this.trash = join(dataDir, 'trash');
  }

  /**
   * Stores a game as its latest backup; the one before becomes a previous version.
   *
   * @param id - the game id from the URL
   * @param body - the game as sent
   * @param now - the save time
   * @returns the game's summary
   * @throws {BadBackup} when the body isn't a game or its id isn't `id`
   */
  async put(id: string, body: unknown, now = new Date()): Promise<GameSummary> {
    const parsed = check(Game, body);
    if (!parsed.ok) throw new BadBackup(`not a game: ${parsed.error}`);
    const game = parsed.value;
    if (game.id !== id) throw new BadBackup(`the game's id is ${game.id}, not ${id}`);
    const summary = await this.summarize(game, now.toISOString());
    const folder = join(this.dir, id);
    await this.lock.run(id, async () => {
      await mkdir(folder, { recursive: true });
      const latest = join(folder, 'latest.json');
      const before = await readJsonFile<Stored | null>(latest, null);
      if (before) {
        let ms = Date.parse(before.savedAt);
        if (!Number.isFinite(ms)) ms = Date.now();
        await rename(latest, join(folder, `${ms}.json`));
      }
      await writeAtomic(latest, JSON.stringify({ savedAt: summary.savedAt, game } satisfies Stored));
      await writeAtomic(join(folder, 'summary.json'), JSON.stringify(summary));
      const old = (await this.previous(folder)).slice(this.keep);
      for (const v of old) await rm(join(folder, `${v}.json`), { force: true });
    });
    return summary;
  }

  /**
   * Every backed-up game, newest save first.
   *
   * @returns the summaries
   */
  async list(): Promise<GameSummary[]> {
    let ids: string[];
    try {
      ids = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: GameSummary[] = [];
    for (const id of ids) {
      if (!GAME_ID.test(id)) continue;
      const s = await readJsonFile<GameSummary | null>(join(this.dir, id, 'summary.json'), null).catch(() => null);
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /**
   * A game's latest backup, or the version saved at `at`.
   *
   * @param id - the game id
   * @param at - a `savedAt` from {@link versions}, or null for the latest
   * @returns the stored version, or null
   */
  async get(id: string, at: string | null = null): Promise<Stored | null> {
    const folder = join(this.dir, id);
    const latest = await readJsonFile<Stored | null>(join(folder, 'latest.json'), null);
    if (at === null || latest?.savedAt === at) return latest;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) return null;
    return readJsonFile<Stored | null>(join(folder, `${ms}.json`), null);
  }

  /**
   * A game's versions, newest first (the latest first of all).
   *
   * @param id - the game id
   * @returns the versions, empty for an unknown game
   */
  async versions(id: string): Promise<VersionInfo[]> {
    const folder = join(this.dir, id);
    const latest = await readJsonFile<Stored | null>(join(folder, 'latest.json'), null);
    if (!latest) return [];
    const out: VersionInfo[] = [{ savedAt: latest.savedAt, bytes: (await stat(join(folder, 'latest.json'))).size, latest: true }];
    for (const ms of await this.previous(folder)) {
      out.push({ savedAt: new Date(ms).toISOString(), bytes: (await stat(join(folder, `${ms}.json`))).size, latest: false });
    }
    return out;
  }

  /**
   * Deletes a game's backups (moved to the trash, removed after 30 days).
   *
   * @param id - the game id
   * @returns false when there was no such game
   */
  async remove(id: string): Promise<boolean> {
    return this.lock.run(id, async () => {
      const folder = join(this.dir, id);
      if (!(await Bun.file(join(folder, 'latest.json')).exists())) return false;
      await mkdir(this.trash, { recursive: true });
      await rename(folder, join(this.trash, `game-${id}-${Date.now()}`));
      return true;
    });
  }

  /** The previous versions' times (ms), newest first. */
  private async previous(folder: string): Promise<number[]> {
    const names = await readdir(folder).catch(() => [] as string[]);
    return names
      .map((n) => /^(\d+)\.json$/.exec(n)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => b - a);
  }

  /** The summary of a game as the library lists it. */
  private async summarize(game: GameT, savedAt: string): Promise<GameSummary> {
    const maps = game.mapOrder.map((id) => game.maps[id]).filter((m) => m !== undefined);
    const active = game.maps[game.activeMapId] ?? maps[0];
    let thumb = null;
    if (active) {
      const info = active.info;
      if (info.libraryId) thumb = (await this.library.get(info.libraryId))?.thumb ?? null;
      thumb ??= await knownThumbnail(this.files, info.picture);
      if (!thumb && info.tableCopy) thumb = await knownThumbnail(this.files, info.tableCopy);
    }
    return {
      id: game.id,
      name: game.name,
      createdAt: game.createdAt,
      savedAt,
      mapNames: maps.map((m) => m.info.name),
      activeMapName: active?.info.name ?? '',
      thumb,
      where: 'server',
    };
  }
}
