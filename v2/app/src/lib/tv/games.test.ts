/// <reference types="bun" />
/**
 * TV mode's games logic against in-memory ports and a real `SyncHost`: requests (open, new,
 * close, delete, rename, list, deploy, reload), the 2 s autosave and its flushes, the backup
 * after each save with retry, and the restore at start (also from the server backup).
 */
import { describe, expect, test } from 'bun:test';
import { initialRoot, newGame, wholeGrid, type Game, type MapInfo } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SyncHost } from '../state/host.ts';
import { KEY_LAST_GAME, KEY_TABLE, mergeListings, summarize, TvGames, withOpenGame, type Timers } from './games.ts';
import { memoryPorts, type MemoryPorts } from './memory-ports.ts';
import { answerRequest } from './requests.ts';

const map = (id = 'm1', name = 'Tower'): MapInfo => ({
  id, name, kind: 'picture', picture: { hash: '0123456789abcdef', ext: 'png', bytes: 100 },
  tableCopy: { hash: 'fedcba9876543210', ext: 'webp', bytes: 50 }, geometry: null,
  grid: wholeGrid(20, 10, 2000, 1000), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
});

const gameInput = (id = 'g1', name = 'Game one') => ({ id, name, createdAt: '2026-10-25T10:00:00.000Z', map: map() });

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };

/** Fake timers: `advance(ms)` runs what is due. */
function fakeTimers(): Timers & { advance(ms: number): void; pending(): number; clock: () => number } {
  let now = 1_000_000;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      const id = next++;
      due.set(id, { at: now + ms, fn });
      return id;
    },
    clear(h) {
      due.delete(h as number);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const first = [...due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!first) break;
        due.delete(first[0]);
        now = first[1].at;
        first[1].fn();
      }
      now = end;
    },
    pending: () => due.size,
    clock: () => now,
  };
}

/** Lets queued promises run. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

interface Rig {
  ports: MemoryPorts;
  host: SyncHost;
  games: TvGames;
  timers: ReturnType<typeof fakeTimers>;
  sent: ({ type: string } & Record<string, unknown>)[];
}

function rig(ports: MemoryPorts = memoryPorts()): Rig {
  const sent: Rig['sent'] = [];
  const send = (m: { type: string } & Record<string, unknown>) => {
    sent.push(m);
    return true;
  };
  const host = new SyncHost(initialRoot(), send, 'tv-self', quiet);
  const timers = fakeTimers();
  const games = new TvGames(ports, host, send, quiet, { build: 'test', timers, now: timers.clock });
  host.onChange = (s) => games.changed(s);
  host.onRequest = (req, from) => void answerRequest(req, from, games, quiet);
  return { ports, host, games, timers, sent };
}

/** Sends a peer message to the host as if from companion `c1`. */
function fromCompanion(r: Rig, msg: Record<string, unknown>): void {
  r.host.receive({ ...msg, from: 'c1' });
}

describe('requests', () => {
  test('game.new starts the game, saves it at once and remembers it', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    expect(r.host.state.game?.id).toBe('g1');
    expect(r.ports.stored.has('g1')).toBe(true);
    expect(r.ports.setting.get(KEY_LAST_GAME)).toBe('g1');
    expect(r.ports.server.has('g1')).toBe(true);
    expect(r.sent.some((m) => m.type === 'sync.snapshot')).toBe(true);
  });

  test('stored: true only while a start would bring back what the table shows (qa#34/#35)', async () => {
    const r = rig();
    expect(r.games.stored).toBe(false); // before boot read the last game
    await r.games.boot();
    expect(r.games.stored).toBe(true); // nothing open, nothing remembered
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    expect(r.games.stored).toBe(true);
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    expect(r.games.stored).toBe(false); // unsaved change
    await r.games.flush('test');
    expect(r.games.stored).toBe(true);
  });

  test('game.open loads from the device, saving the open game first', async () => {
    const r = rig();
    r.ports.stored.set('g2', { game: newGame(gameInput('g2', 'Second')), savedAt: '2026-10-24T00:00:00.000Z' });
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    const changed = r.host.state.game;
    fromCompanion(r, { type: 'game.open', gameId: 'g2' });
    await settle();
    expect(r.host.state.game?.name).toBe('Second');
    expect(r.ports.stored.get('g1')?.game).toBe(changed!);
    expect(r.ports.setting.get(KEY_LAST_GAME)).toBe('g2');
  });

  test('game.open falls back to the server backup and stores it here, fetching its files', async () => {
    const r = rig();
    r.ports.server.set('g9', newGame(gameInput('g9', 'From the server')));
    await r.games.boot();
    fromCompanion(r, { type: 'game.open', gameId: 'g9' });
    await settle();
    expect(r.host.state.game?.name).toBe('From the server');
    expect(r.ports.stored.has('g9')).toBe(true);
    expect(r.ports.fetched.map((f) => f.hash)).toEqual(['fedcba9876543210']);
    const statuses = r.sent.filter((m) => m.type === 'tv.status');
    expect(statuses.some((m) => typeof m.busy === 'string')).toBe(true);
    expect(statuses.at(-1)?.busy).toBeNull();
  });

  test('a game nowhere is a notice to the asker, nothing changes', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.open', gameId: 'nope00000000' });
    await settle();
    expect(r.host.state.game).toBeNull();
    const notice = r.sent.find((m) => m.type === 'tv.notice');
    expect(notice?.to).toBe('c1');
    expect(notice?.level).toBe('error');
  });

  test('game.close saves, closes and forgets the last game', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    const changed = r.host.state.game;
    fromCompanion(r, { type: 'game.close' });
    await settle();
    expect(r.host.state.game).toBeNull();
    expect(r.ports.stored.get('g1')?.game).toBe(changed!);
    expect(r.ports.setting.get(KEY_LAST_GAME)).toBeNull();
  });

  test('game.delete removes it here and on the server, closes it when open, and lists', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    fromCompanion(r, { type: 'game.delete', gameId: 'g1' });
    await settle();
    expect(r.host.state.game).toBeNull();
    expect(r.ports.stored.has('g1')).toBe(false);
    expect(r.ports.server.has('g1')).toBe(false);
    const listing = r.sent.findLast((m) => m.type === 'lib.listing');
    expect(listing?.games).toEqual([]);
  });

  test('rv#6: deleting the open game while its backup is on the way leaves no backup behind', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    // Hold the next backup PUT until released, as a slow network would.
    const put = r.ports.backups.put;
    let release: () => void = () => {};
    r.ports.backups.put = (game) => new Promise<void>((done) => { release = () => void put(game).then(done); });
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    r.timers.advance(2500); // autosave → backup PUT starts and hangs
    await settle();
    fromCompanion(r, { type: 'game.delete', gameId: 'g1' });
    await settle();
    release();
    await settle();
    await settle();
    expect(r.ports.server.has('g1')).toBe(false);
    expect(r.ports.stored.has('g1')).toBe(false);
  });

  test('game.renameStored renames a stored game, and the open one through the reducer', async () => {
    const r = rig();
    r.ports.stored.set('g2', { game: newGame(gameInput('g2', 'Second')), savedAt: '2026-10-24T00:00:00.000Z' });
    await r.games.boot();
    fromCompanion(r, { type: 'game.renameStored', gameId: 'g2', name: 'Renamed' });
    await settle();
    expect(r.ports.stored.get('g2')?.game.name).toBe('Renamed');
    expect(r.ports.server.get('g2')?.name).toBe('Renamed');
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    const rev = r.host.rev;
    fromCompanion(r, { type: 'game.renameStored', gameId: 'g1', name: 'Open one' });
    await settle();
    expect(r.host.state.game?.name).toBe('Open one');
    expect(r.host.rev).toBe(rev + 1);
  });

  test('lib.list merges the device and the server, newest first', async () => {
    const r = rig();
    r.ports.stored.set('g2', { game: newGame(gameInput('g2', 'Both')), savedAt: '2026-10-26T00:00:00.000Z' });
    r.ports.server.set('g2', newGame(gameInput('g2', 'Both')));
    r.ports.server.set('g3', newGame(gameInput('g3', 'Server only')));
    await r.games.boot();
    fromCompanion(r, { type: 'lib.list' });
    await settle();
    const listing = r.sent.findLast((m) => m.type === 'lib.listing') as unknown as { to: string; games: { id: string; where: string }[] };
    expect(listing.to).toBe('c1');
    expect(listing.games.map((g) => [g.id, g.where])).toEqual([['g2', 'both'], ['g3', 'server']]);
  });

  test('lib.list still answers when the server is down', async () => {
    const r = rig();
    r.ports.offline = true;
    r.ports.stored.set('g2', { game: newGame(gameInput('g2')), savedAt: '2026-10-24T00:00:00.000Z' });
    await r.games.boot();
    fromCompanion(r, { type: 'lib.list' });
    await settle();
    const listing = r.sent.findLast((m) => m.type === 'lib.listing') as unknown as { games: { where: string }[] };
    expect(listing.games.map((g) => g.where)).toEqual(['tv']);
  });

  test('deploy.prepare flushes and answers deploy.ready', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    fromCompanion(r, { type: 'deploy.prepare' });
    await settle();
    expect(r.games.dirty).toBe(false);
    expect(r.sent.findLast((m) => m.type === 'deploy.ready')).toMatchObject({ to: 'c1', gameId: 'g1' });
  });

  test('tv.reload flushes, says so and reloads', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    fromCompanion(r, { type: 'tv.reload' });
    await settle();
    expect(r.games.dirty).toBe(false);
    expect(r.games.status.busy).toContain('Updating');
    r.timers.advance(500);
    expect(r.ports.reloads).toBe(1);
  });

  test('diag.status answers with the table size', async () => {
    const r = rig();
    await r.games.boot();
    r.host.applyLocal({ type: 'table.viewport', width: 1920, height: 1080 });
    fromCompanion(r, { type: 'diag.status' });
    expect(r.sent.findLast((m) => m.type === 'diag.report')).toMatchObject({ to: 'c1', table: '34x19', build: 'test' });
  });
});

describe('autosave', () => {
  test('saves 2 s after the last change, not before; live changes do not count', async () => {
    const r = rig();
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    const first = r.ports.stored.get('g1')!.game;
    r.host.applyLocal({ type: 'measure.set', line: { a: { x: 1, y: 1 }, b: { x: 3, y: 3 } } });
    expect(r.games.dirty).toBe(false);
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    r.timers.advance(1500);
    expect(r.host.applyLocal({ type: 'view.grid', on: false })).toBe(true);
    r.timers.advance(1500);
    await settle();
    expect(r.ports.stored.get('g1')!.game).toBe(first);
    r.timers.advance(600);
    await settle();
    expect(r.ports.stored.get('g1')!.game).toBe(r.host.state.game!);
    expect(r.games.dirty).toBe(false);
  });

  test('a failed save keeps the game dirty and tells the DM', async () => {
    const r = rig();
    const problems: string[] = [];
    r.games.onProblem = (t) => problems.push(t);
    await r.games.boot();
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    r.ports.storeFails = true;
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    await r.games.flush('test');
    expect(r.games.dirty).toBe(true);
    expect(problems.length).toBe(1);
    expect(r.sent.some((m) => m.type === 'tv.notice' && m.level === 'error')).toBe(true);
  });

  test('a backup that fails is retried later, newest version only', async () => {
    const r = rig();
    await r.games.boot();
    r.ports.offline = true;
    fromCompanion(r, { type: 'game.new', game: gameInput() });
    await settle();
    expect(r.games.backupsPending).toBe(1);
    r.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    await r.games.flush('test');
    await settle();
    r.ports.offline = false;
    r.timers.advance(30_000);
    await settle();
    expect(r.games.backupsPending).toBe(0);
    expect(r.ports.server.get('g1')).toEqual(r.host.state.game!);
  });

  test('the calibration is stored when it changes, the viewport is not', async () => {
    const r = rig();
    await r.games.boot();
    r.host.applyLocal({ type: 'table.viewport', width: 1920, height: 1080 });
    expect(r.ports.setting.has(KEY_TABLE)).toBe(false);
    r.host.applyLocal({ type: 'table.calibrate', widthInches: 40 });
    await settle();
    expect(r.ports.setting.get(KEY_TABLE)).toEqual({ widthInches: 40, overscanPercent: 0 });
  });
});

describe('boot', () => {
  test('reopens the last game and the calibration', async () => {
    const ports = memoryPorts();
    const first = rig(ports);
    await first.games.boot();
    first.host.applyLocal({ type: 'table.calibrate', widthInches: 41 });
    fromCompanion(first, { type: 'game.new', game: gameInput() });
    await settle();
    first.host.applyLocal({ type: 'fog.all', value: 'reveal' });
    await first.games.flush('page hidden');
    const saved = first.host.state.game as Game;

    const second = rig(ports);
    await second.games.boot();
    expect(second.host.state.game).toEqual(saved);
    expect(second.host.state.table.widthInches).toBe(41);
    expect(second.games.dirty).toBe(false);
  });

  test('a viewport reported before boot keeps the stored calibration (qa#3, rv#24)', async () => {
    const ports = memoryPorts();
    ports.setting.set(KEY_TABLE, { widthInches: 26, overscanPercent: 3 });
    const r = rig(ports);
    r.host.applyLocal({ type: 'table.viewport', width: 1920, height: 1080 });
    await settle();
    expect(ports.setting.get(KEY_TABLE)).toEqual({ widthInches: 26, overscanPercent: 3 });
    await r.games.boot();
    await settle();
    expect(r.host.state.table.widthInches).toBe(26);
    expect(r.host.state.table.overscanPercent).toBe(3);
    expect(r.host.state.table.viewport?.width).toBe(1920);
    expect(ports.setting.get(KEY_TABLE)).toEqual({ widthInches: 26, overscanPercent: 3 });
  });

  test('a box reset (empty device) gets the last game from the server', async () => {
    const ports = memoryPorts();
    ports.server.set('g1', newGame(gameInput()));
    ports.setting.set(KEY_LAST_GAME, 'g1');
    const r = rig(ports);
    await r.games.boot();
    expect(r.host.state.game?.id).toBe('g1');
    expect(ports.stored.has('g1')).toBe(true);
  });

  test('a broken store still boots, onto no game', async () => {
    const ports = memoryPorts();
    ports.settings.get = async () => {
      throw new Error('IndexedDB is gone');
    };
    const r = rig(ports);
    await r.games.boot();
    expect(r.host.state.game).toBeNull();
  });
});

describe('listing helpers', () => {
  test('mergeListings keeps the device copy and the server thumbnail', () => {
    const g = newGame(gameInput());
    const local = [summarize(g, '2026-10-25T00:00:00.000Z', 'tv')];
    const thumb = { hash: 'aaaaaaaaaaaaaaaa', ext: 'webp' as const, bytes: 1 };
    const remote = [{ ...summarize(g, '2026-10-20T00:00:00.000Z', 'server'), thumb }];
    expect(mergeListings(local, remote)).toEqual([{ ...local[0]!, where: 'both', thumb }]);
    expect(mergeListings(local, null)).toEqual(local);
  });
});

describe('withOpenGame (qa#9)', () => {
  test('the open game is listed under the map on the table, not the stored one', () => {
    const stored = newGame(gameInput());
    const live = { ...stored, maps: { ...stored.maps, m1: { ...stored.maps.m1!, info: { ...stored.maps.m1!.info, name: 'Tower upper' } } } };
    const rows = [summarize(stored, '2026-10-25T10:00:00.000Z', 'both')];
    const out = withOpenGame(rows, live, '2026-10-25T11:00:00.000Z');
    expect(out[0]!.activeMapName).toBe('Tower upper');
    expect(out[0]!.where).toBe('both');
    expect(out[0]!.savedAt).toBe('2026-10-25T10:00:00.000Z');
    expect(withOpenGame([], live, 'now')[0]!.where).toBe('tv');
    expect(withOpenGame(rows, null, 'now')).toBe(rows);
  });
});

