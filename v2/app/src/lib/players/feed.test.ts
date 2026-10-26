/**
 * The TV's players' feed (S12): sends only with players there, throttles, answers joins and asks,
 * and never sends the full state.
 */
import { describe, expect, test } from 'bun:test';
import { initialRoot, newGame, type Peer, type RootState } from '@battlemap/shared';
import { PlayersFeed, type FeedTimers } from './feed.ts';

const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as never;
const FILE = { hash: 'a'.repeat(64), ext: 'png' as const, bytes: 10 };
const MAP = {
  id: 'm1', name: 'Crypt', kind: 'picture' as const, picture: FILE, tableCopy: null, geometry: null,
  grid: { x: 0, y: 0, cellW: 100, cellH: 100, cols: 4, rows: 3, pictureW: 400, pictureH: 300 }, drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
};

/** A state with a DM layer on the map (it must never be sent). */
function state(n: number): RootState {
  const game = newGame({ id: 'g', name: `Game ${n}`, createdAt: '2026-10-26T00:00:00.000Z', map: MAP });
  const m = game.maps['m1']!;
  return { ...initialRoot(), game: { ...game, maps: { m1: { ...m, layers: [{ id: 'l', name: 'DM only', file: FILE, visible: true, opacity: 1 }] } } } };
}

/** Fake timers: `run()` fires what is pending. */
function fakeTimers(): FeedTimers & { run(): void; pending: number } {
  let fns: (() => void)[] = [];
  return {
    set: (fn) => fns.push(fn),
    clear: () => (fns = []),
    run() {
      const now = fns;
      fns = [];
      for (const f of now) f();
    },
    get pending() {
      return fns.length;
    },
  };
}

const player = (client: string): Peer => ({ client, role: 'players', name: 'Phone' });

describe('players feed', () => {
  test('silent without players; a joining player gets the view at once, addressed', () => {
    const sent: Record<string, unknown>[] = [];
    const feed = new PlayersFeed({ send: (m) => (sent.push(m), true), log: quiet, timers: fakeTimers() });
    feed.changed(state(1), 1);
    expect(sent).toEqual([]);
    feed.peers([{ client: 'c', role: 'companion', name: 'Tab' }, player('p1')]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'players.state', rev: 1, to: 'p1' });
    expect(JSON.stringify(sent[0])).not.toContain('DM only');
    expect(feed.count).toBe(1);
  });

  test('changes go to all players, at most one per interval, the last one always', () => {
    const sent: Record<string, unknown>[] = [];
    const timers = fakeTimers();
    const feed = new PlayersFeed({ send: (m) => (sent.push(m), true), log: quiet, timers, intervalMs: 1_000_000 });
    feed.peers([player('p1'), player('p2')]);
    feed.changed(state(1), 1); // first change: at once (nothing sent to all yet)
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBeUndefined();
    feed.changed(state(2), 2);
    feed.changed(state(3), 3);
    expect(sent).toHaveLength(1);
    expect(timers.pending).toBe(1);
    timers.run();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ rev: 3 });
    expect((sent[1]!.state as RootState).game!.name).toBe('Game 3');
  });

  test('a request is answered to the asker; the last player leaving stops the pending send', () => {
    const sent: Record<string, unknown>[] = [];
    const timers = fakeTimers();
    const feed = new PlayersFeed({ send: (m) => (sent.push(m), true), log: quiet, timers, intervalMs: 1_000_000 });
    feed.request('p9');
    expect(sent).toEqual([]); // no state yet
    feed.changed(state(1), 1);
    feed.request('p9');
    expect(sent.at(-1)).toMatchObject({ to: 'p9', rev: 1 });
    feed.peers([player('p1')]);
    feed.changed(state(2), 2);
    feed.changed(state(3), 3);
    feed.peers([]);
    expect(timers.pending).toBe(0);
  });
});
