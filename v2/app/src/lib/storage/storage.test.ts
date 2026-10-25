/// <reference types="bun" />
/**
 * The storage layer on fake-indexeddb: schema and migrations, games, settings, the file cache
 * (hits, misses, shared downloads, cancel, eviction, quota) and persistence. Run: `bun test`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { recordingLog } from '../../../test/helpers.ts';
import { gameWith, refFor } from './testing.ts';
import { done, isQuotaError, MIGRATIONS, openDatabase, type Migration } from './db.ts';
import { createStorage } from './storage.ts';
import { cacheBudget, MAX_CACHE_BYTES, MIN_CACHE_BYTES, type Downloader } from './files.ts';
import { requestPersistence } from './persist.ts';
import { throttledNotify } from './context.ts';

/** A fake downloader that serves `bytes` zeros per ref and counts calls. */
function fakeDownload(opts: { delayMs?: number; wrongSize?: boolean } = {}) {
  const calls: string[] = [];
  const fn: Downloader = async (ref, onProgress, signal) => {
    calls.push(ref.hash);
    onProgress(0, ref.bytes);
    if (opts.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
      });
    }
    onProgress(ref.bytes, ref.bytes);
    return new Blob([new Uint8Array(opts.wrongSize ? ref.bytes + 1 : ref.bytes)]);
  };
  return { fn, calls };
}

function setup(over: { budget?: number; download?: Downloader; migrations?: readonly Migration[] } = {}) {
  const idb = new IDBFactory();
  const log = recordingLog();
  const notices: string[] = [];
  const dl = fakeDownload();
  const storage = createStorage({
    idb, log, notify: (t) => notices.push(t), download: over.download ?? dl.fn, url: (r) => `http://x/files/${r.hash}.${r.ext}`,
    budget: over.budget ?? 1000, migrations: over.migrations,
  });
  return { idb, log, notices, storage, dl };
}

// Quota simulation: while `quota.full(record)` says so, object store puts throw QuotaExceededError.
const realPut = IDBObjectStore.prototype.put;
const quota = { full: null as null | ((value: unknown) => boolean) };
IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  if (quota.full?.(value)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
  return realPut.call(this, value, key);
} as typeof IDBObjectStore.prototype.put;
afterEach(() => { quota.full = null; });

describe('schema', () => {
  test('a fresh database gets every store at the current version', async () => {
    const idb = new IDBFactory();
    const db = await openDatabase({ idb, log: recordingLog() });
    expect(db.version).toBe(MIGRATIONS.length);
    expect([...db.objectStoreNames].sort()).toEqual(['files', 'games', 'settings']);
    expect([...db.transaction('files').objectStore('files').indexNames]).toEqual(['lastUsed']);
    db.close();
  });

  test('an upgrade runs only the missing steps and keeps the data', async () => {
    const idb = new IDBFactory();
    const log = recordingLog();
    const v1 = await openDatabase({ idb, log });
    const tx = v1.transaction('games', 'readwrite');
    tx.objectStore('games').put({ id: 'g1', savedAt: 'x', game: { name: 'old' } });
    await new Promise((r) => (tx.oncomplete = r));
    v1.close();

    let firstRan = false;
    const steps: Migration[] = [
      (db) => { firstRan = true; MIGRATIONS[0]!(db, undefined as never); },
      (_db, t) => {
        // 1 → 2: an index and a rewrite of every game record.
        const games = t.objectStore('games');
        games.createIndex('savedAt', 'savedAt');
        games.openCursor().onsuccess = function (this: IDBRequest<IDBCursorWithValue | null>) {
          const c = this.result;
          if (!c) return;
          c.update({ ...c.value, migrated: true });
          c.continue();
        };
      },
    ];
    const v2 = await openDatabase({ idb, log, migrations: steps });
    expect(firstRan).toBe(false);
    expect(v2.version).toBe(2);
    const rec = await done(v2.transaction('games').objectStore('games').get('g1'));
    expect(rec).toMatchObject({ id: 'g1', migrated: true });
    expect(log.lines.some((l) => l.msg === 'Upgrading the database' && l.props?.from === 1 && l.props?.to === 2)).toBe(true);
    v2.close();
  });

  test('an open connection closes itself when a newer page upgrades', async () => {
    const idb = new IDBFactory();
    const log = recordingLog();
    await openDatabase({ idb, log });
    const v2 = await openDatabase({ idb, log, migrations: [...MIGRATIONS, () => {}] });
    expect(v2.version).toBe(MIGRATIONS.length + 1);
    expect(log.has('A newer page upgrades the database — closing this connection')).toBe(true);
    v2.close();
  });

  test('isQuotaError knows the spellings', () => {
    expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('games', () => {
  test('put, get, list newest first, delete', async () => {
    const { storage } = setup();
    const a = gameWith('a');
    const b = gameWith('b');
    await storage.games.put(a);
    await new Promise((r) => setTimeout(r, 5));
    await storage.games.put(b);
    expect(await storage.games.get('a')).toEqual(a);
    expect(await storage.games.get('nope')).toBeNull();
    const list = await storage.games.list();
    expect(list.map((g) => g.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ name: 'Game b', mapNames: ['Map m-b'], activeMapName: 'Map m-b', where: 'tv', thumb: null });
    expect(await storage.games.savedAt('a')).toBe(list[1]!.savedAt);
    await storage.games.delete('a');
    expect((await storage.games.list()).map((g) => g.id)).toEqual(['b']);
    await storage.games.delete('a');
  });

  test('stores a copy: later mutation does not reach the database', async () => {
    const { storage } = setup();
    const g = gameWith('c');
    await storage.games.put(g);
    g.name = 'changed';
    expect((await storage.games.get('c'))!.name).toBe('Game c');
  });

  test('a broken record is skipped and logged, the rest lists', async () => {
    const { storage, idb, log } = setup();
    await storage.games.put(gameWith('ok'));
    const db = await openDatabase({ idb, log });
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put({ id: 'bad', savedAt: '2026', game: { id: 'bad', name: 3 } });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
    expect((await storage.games.list()).map((g) => g.id)).toEqual(['ok']);
    expect(await storage.games.get('bad')).toBeNull();
    expect(log.has('Stored game is broken — skipped')).toBe(true);
  });

  test('rv#23: a record carries its row; an older one without lists through its game', async () => {
    const { storage, idb, log } = setup();
    await storage.games.put(gameWith('new'));
    const db = await openDatabase({ idb, log });
    const rec = await new Promise<{ summary?: { id: string } }>((r) => {
      const q = db.transaction('games').objectStore('games').get('new');
      q.onsuccess = () => r(q.result as { summary?: { id: string } });
    });
    expect(rec.summary?.id).toBe('new');
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put({ id: 'old', savedAt: '2020-01-01T00:00:00.000Z', game: gameWith('old') });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
    expect((await storage.games.list()).map((g) => g.id)).toEqual(['new', 'old']);
  });

  test('quota on save frees the file cache and retries', async () => {
    const { storage, notices, log } = setup();
    await storage.files.get(refFor('f1', 300));
    let failOnce = true;
    quota.full = (val) => {
      if (failOnce && (val as { game?: unknown }).game) { failOnce = false; return true; }
      return false;
    };
    await storage.games.put(gameWith('q'));
    expect(await storage.games.get('q')).not.toBeNull();
    expect(notices.length).toBe(1);
    expect(log.has('Game save hit the storage quota — freeing the file cache')).toBe(true);
  });

  test('quota that persists throws StorageFullError and tells the user', async () => {
    const { storage, notices } = setup();
    quota.full = (val) => Boolean((val as { game?: unknown }).game);
    await expect(storage.games.put(gameWith('q'))).rejects.toMatchObject({ name: 'StorageFullError' });
    expect(notices.some((n) => n.includes('could not be saved'))).toBe(true);
  });
});

describe('settings', () => {
  test('get / put / clear', async () => {
    const { storage } = setup();
    expect(await storage.settings.get('tv.table')).toBeNull();
    const table = { widthInches: 40, overscanPercent: 2 };
    await storage.settings.put('tv.table', table);
    table.widthInches = 1;
    expect(await storage.settings.get('tv.table')).toEqual({ widthInches: 40, overscanPercent: 2 });
    await storage.settings.put('tv.table', null);
    expect(await storage.settings.get('tv.table')).toBeNull();
    await storage.settings.put('x', 5);
    await storage.settings.delete('x');
    expect(await storage.settings.get('x')).toBeNull();
  });
});

describe('file cache', () => {
  test('miss downloads with progress and keeps it; hit comes from the cache', async () => {
    const { storage, dl, log } = setup();
    const ref = refFor('a', 100);
    const seen: number[] = [];
    const blob = await storage.files.get(ref, (l) => seen.push(l));
    expect(blob.size).toBe(100);
    expect(seen).toEqual([0, 100]);
    expect(await storage.files.has(ref)).toBe(true);
    const again = await storage.files.get(ref, () => { throw new Error('no progress on a hit'); });
    expect(again.size).toBe(100);
    expect(dl.calls.length).toBe(1);
    expect(log.has('File cache hit')).toBe(true);
    expect(storage.files.url(ref)).toBe(`http://x/files/${ref.hash}.png`);
  });

  test('two callers share one download', async () => {
    const dl = fakeDownload({ delayMs: 20 });
    const { storage } = setup({ download: dl.fn });
    const ref = refFor('s', 50);
    const [a, b] = await Promise.all([storage.files.get(ref), storage.files.get(ref)]);
    expect(a.size).toBe(50);
    expect(b.size).toBe(50);
    expect(dl.calls.length).toBe(1);
  });

  test('cancel: the only waiter cancels the download; another waiter keeps it alive', async () => {
    const dl = fakeDownload({ delayMs: 40 });
    const { storage, log } = setup({ download: dl.fn });
    const ref = refFor('c', 50);
    const ctl = new AbortController();
    const p = storage.files.get(ref, undefined, ctl.signal);
    p.catch(() => {});
    while (dl.calls.length === 0) await new Promise((r) => setTimeout(r, 1));
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 10));
    expect(await storage.files.has(ref)).toBe(false);
    expect(dl.calls.length).toBe(1);
    expect(log.has('File download cancelled')).toBe(true);

    const ref2 = refFor('d', 50);
    const ctl2 = new AbortController();
    const cancelled = storage.files.get(ref2, undefined, ctl2.signal);
    const kept = storage.files.get(ref2);
    cancelled.catch(() => {});
    while (dl.calls.length === 1) await new Promise((r) => setTimeout(r, 1));
    ctl2.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect((await kept).size).toBe(50);
    expect(await storage.files.has(ref2)).toBe(true);
  });

  test('a download of the wrong size is refused and not kept', async () => {
    const dl = fakeDownload({ wrongSize: true });
    const { storage } = setup({ download: dl.fn });
    const ref = refFor('w', 10);
    await expect(storage.files.get(ref)).rejects.toThrow('instead of 10');
    expect(await storage.files.has(ref)).toBe(false);
  });

  test('evicts least recently used files down to the budget, never the new one', async () => {
    let clock = 1_000_000;
    const idb = new IDBFactory();
    const log = recordingLog();
    const dl = fakeDownload();
    // createStorage has no clock; build the cache directly for a controlled lastUsed.
    const { createFileCache } = await import('./files.ts');
    const { once } = await import('./context.ts');
    const db = once(() => openDatabase({ idb, log }));
    const files = createFileCache({ db, log, notify: () => {} }, { download: dl.fn, url: () => '', budget: 1000, now: () => clock });
    const a = refFor('a', 400);
    const b = refFor('b', 400);
    const c = refFor('c', 400);
    await files.get(a); clock += 120_000;
    await files.get(b); clock += 120_000;
    await files.get(a); clock += 120_000; // a is now newer than b (touched after a minute)
    await new Promise((r) => setTimeout(r, 5));
    await files.get(c);
    expect(await files.has(a)).toBe(true);
    expect(await files.has(b)).toBe(false);
    expect(await files.has(c)).toBe(true);
    expect((await files.usage()).bytes).toBe(800);
    expect(log.has('File cache evicted')).toBe(true);

    const big = refFor('big', 1500);
    await files.get(big);
    expect(await files.has(big)).toBe(true);
    expect((await files.usage()).files).toBe(1);
  });

  test('put keeps an own upload; delete, freeSpace and clear', async () => {
    const { storage, dl } = setup();
    const ref = refFor('own', 300);
    await storage.files.put(ref, new Blob([new Uint8Array(300)]));
    expect((await storage.files.get(ref)).size).toBe(300);
    expect(dl.calls.length).toBe(0);
    await storage.files.put(refFor('o2', 300), new Blob([new Uint8Array(300)]));
    await storage.files.freeSpace();
    expect((await storage.files.usage()).bytes).toBeLessThanOrEqual(500);
    await storage.files.delete(refFor('o2', 300));
    await storage.files.clear();
    expect(await storage.files.usage()).toEqual({ files: 0, bytes: 0, budget: 1000 });
  });

  test('quota: frees space and retries; when that fails too the file still comes back', async () => {
    const { storage, notices, log } = setup();
    await storage.files.get(refFor('old', 400));
    let fails = 1;
    quota.full = (val) => (val as { key?: string }).key?.startsWith(refFor('new', 1).hash) === true && fails-- > 0;
    expect((await storage.files.get(refFor('new', 100))).size).toBe(100);
    expect(await storage.files.has(refFor('old', 400))).toBe(false);
    expect(await storage.files.has(refFor('new', 100))).toBe(true);
    expect(notices.length).toBe(1);

    quota.full = (val) => (val as { key?: string }).key?.startsWith(refFor('full', 1).hash) === true;
    expect((await storage.files.get(refFor('full', 100))).size).toBe(100);
    expect(await storage.files.has(refFor('full', 100))).toBe(false);
    expect(log.has('File not cached: storage full')).toBe(true);
    expect(notices.some((n) => n.includes('downloaded every time'))).toBe(true);
  });

  test('cacheBudget: half the quota, clamped', () => {
    expect(cacheBudget(undefined)).toBe(MAX_CACHE_BYTES);
    expect(cacheBudget(10 * 1024 ** 3)).toBe(MAX_CACHE_BYTES);
    expect(cacheBudget(400 * 1024 ** 2)).toBe(200 * 1024 ** 2);
    expect(cacheBudget(10 * 1024 ** 2)).toBe(MIN_CACHE_BYTES);
  });
});

describe('notices and persistence', () => {
  test('the same problem is told at most once a minute', () => {
    let t = 0;
    const told: string[] = [];
    const n = throttledNotify((text) => told.push(text), () => t);
    n('full', 'warning'); n('full', 'warning'); n('other', 'error');
    t = 61_000;
    n('full', 'warning');
    expect(told).toEqual(['full', 'other', 'full']);
  });

  test('requestPersistence asks once and reports usage', async () => {
    const log = recordingLog();
    let asked = 0;
    const fake = {
      persisted: async () => false,
      persist: async () => { asked++; return true; },
      estimate: async () => ({ usage: 5 * 1048576, quota: 100 * 1048576 }),
    } as unknown as StorageManager;
    expect(await requestPersistence(log, fake)).toEqual({ persisted: true, usage: 5 * 1048576, quota: 100 * 1048576 });
    expect(asked).toBe(1);
    expect(log.lines.find((l) => l.msg === 'Persistent storage')?.props).toMatchObject({ persisted: true, usageMb: 5, quotaMb: 100 });
    expect(await requestPersistence(log, undefined)).toEqual({ persisted: null, usage: null, quota: null });
  });
});
