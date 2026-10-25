/**
 * The shared map library: maps kept on the server for every game and every TV, in
 * `library.json` (newest first). An entry is the map only — name, squares, picture grid, files —
 * never fog, tokens or layers. Its files live in the file store and stay when an entry is
 * removed: games that use the map keep working.
 *
 * @see ../../../docs/parity.md §19 "shared map library"
 */
import { join } from 'node:path';
import { check, FileRef, LibraryEntry, MapInfo, type FileRef as FileRefT, type LibraryEntry as Entry } from '@battlemap/shared';
import { KeyedLock, readJsonFile, writeAtomic } from '../store/fsx.ts';
import type { FileStore } from '../files/store.ts';
import { knownThumbnail } from '../files/upload.ts';

/** A library change the server refuses, with the reason. */
export class BadEntry extends Error {}

/** The library file's shape. */
interface LibraryFile {
  entries: Entry[];
}

/** The shared library. */
export class Library {
  private readonly path: string;
  private readonly lock = new KeyedLock();

  /**
   * @param dataDir - the server's data folder
   * @param files - the file store (entries must name stored files)
   */
  constructor(dataDir: string, private readonly files: FileStore) {
    this.path = join(dataDir, 'library.json');
  }

  /**
   * Every entry, newest first.
   *
   * @returns the entries (ones that no longer pass the schema are left out)
   */
  async list(): Promise<Entry[]> {
    const file = await readJsonFile<LibraryFile>(this.path, { entries: [] });
    return file.entries.filter((e) => check(LibraryEntry, e).ok);
  }

  /**
   * Adds a map, or replaces the entry with the same id (keeping when it was added).
   *
   * @param body - `{map: MapInfo, thumb?, originalBytes?, note?, addedAt?}` as sent by the app
   *   (`addedAt` is taken for a new entry only — the v1 import keeps the old dates)
   * @param now - the time to stamp a new entry with
   * @returns the stored entry and whether it was new
   * @throws {BadEntry} when the body isn't a map or names files the server doesn't have
   */
  async put(body: unknown, now = new Date()): Promise<{ entry: Entry; added: boolean }> {
    if (!body || typeof body !== 'object') throw new BadEntry('send {map, thumb?, originalBytes?, note?}');
    const b = body as Record<string, unknown>;
    const map = check(MapInfo, b.map);
    if (!map.ok) throw new BadEntry(`map: ${map.error}`);
    let thumb: FileRefT | null = null;
    if (b.thumb != null) {
      const t = check(FileRef, b.thumb);
      if (!t.ok) throw new BadEntry(`thumb: ${t.error}`);
      thumb = t.value;
    }
    const originalBytes = typeof b.originalBytes === 'number' && Number.isInteger(b.originalBytes) && b.originalBytes >= 0 ? b.originalBytes : null;
    const note = typeof b.note === 'string' ? b.note.slice(0, 200) : null;
    const addedAt = typeof b.addedAt === 'string' && Number.isFinite(Date.parse(b.addedAt)) ? new Date(b.addedAt).toISOString() : now.toISOString();
    const info = { ...map.value, libraryId: map.value.id };
    for (const [what, ref] of [['picture', info.picture], ['tableCopy', info.tableCopy], ['geometry', info.geometry], ['thumb', thumb]] as const) {
      if (ref && !(await this.files.has(ref))) throw new BadEntry(`${what} ${ref.hash.slice(0, 12)}….${ref.ext} is not on the server — upload it first`);
    }
    thumb ??= (await knownThumbnail(this.files, info.picture)) ?? (info.tableCopy ? await knownThumbnail(this.files, info.tableCopy) : null);

    return this.lock.run('library', async () => {
      const file = await readJsonFile<LibraryFile>(this.path, { entries: [] });
      const i = file.entries.findIndex((e) => e.map.id === info.id);
      const entry: Entry = { map: info, thumb, addedAt: i >= 0 ? file.entries[i]!.addedAt : addedAt, originalBytes, note };
      if (i >= 0) file.entries[i] = entry;
      else file.entries.unshift(entry);
      await writeAtomic(this.path, JSON.stringify(file, null, 1));
      return { entry, added: i < 0 };
    });
  }

  /**
   * Removes an entry (its files stay).
   *
   * @param id - the map's library id
   * @returns the removed entry, or null when there was none
   */
  async remove(id: string): Promise<Entry | null> {
    return this.lock.run('library', async () => {
      const file = await readJsonFile<LibraryFile>(this.path, { entries: [] });
      const i = file.entries.findIndex((e) => e.map.id === id);
      if (i < 0) return null;
      const [gone] = file.entries.splice(i, 1);
      await writeAtomic(this.path, JSON.stringify(file, null, 1));
      return gone ?? null;
    });
  }

  /**
   * One entry.
   *
   * @param id - the map's library id
   * @returns the entry, or null
   */
  async get(id: string): Promise<Entry | null> {
    return (await this.list()).find((e) => e.map.id === id) ?? null;
  }
}
