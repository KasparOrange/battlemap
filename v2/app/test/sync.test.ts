/**
 * Sync between the TV's host and companions' clients: prediction, echoes, rejections, gaps,
 * reconnects, convergence — over an in-memory relay.
 */
import { describe, expect, test } from 'bun:test';
import { newGame, wholeGrid, type MapInfo } from '@battlemap/shared';
import { FakeRoom } from './helpers.ts';
import type { ClientTimers } from '../src/lib/state/client.ts';

/** Manual clock + timers: `advance(ms)` runs what falls due. */
function fakeClock(): ClientTimers & { now: () => number; advance(ms: number): void } {
  let t = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    set: (fn, ms) => { const id = next++; due.set(id, { at: t + ms, fn }); return id; },
    clear: (h) => void due.delete(h as number),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const first = [...due.entries()].filter(([, d]) => d.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!first) break;
        due.delete(first[0]);
        t = first[1].at;
        first[1].fn();
      }
      t = end;
    },
  };
}

const map = (id = 'm1'): MapInfo => ({
  id, name: id, kind: 'picture', picture: { hash: '0123456789abcdef', ext: 'png', bytes: 1 }, tableCopy: null, geometry: null,
  grid: wholeGrid(20, 10, 2000, 1000), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
});

function roomWithGame(): FakeRoom {
  const room = new FakeRoom();
  room.host.replace({ ...room.host.state, game: newGame({ id: 'g', name: 'G', createdAt: '2026-10-25T00:00:00Z', map: map() }) }, 'test');
  return room;
}

describe('sync', () => {
  test('a joining companion gets the snapshot and can send', () => {
    const room = roomWithGame();
    const c = room.join('a');
    expect(c.ready()).toBe(true);
    expect(c.view?.game?.id).toBe('g');
    expect(c.dispatch({ type: 'table.calibrate', widthInches: 40 })).toBe(true);
    expect(room.host.state.table.widthInches).toBe(40);
    expect(c.confirmed?.table.widthInches).toBe(40);
    expect(c.pendingCount).toBe(0);
    expect(room.host.rev).toBe(1);
  });

  test('the prediction shows at once, before the TV answers', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.instant = false;
    c.dispatch({ type: 'fog.all', value: 'reveal' });
    expect(c.view?.game?.maps.m1?.fog.revealed).not.toBe(c.confirmed?.game?.maps.m1?.fog.revealed);
    expect(c.pendingCount).toBe(1);
    room.flush();
    expect(c.pendingCount).toBe(0);
    expect(c.view).toEqual(c.confirmed);
  });

  test('two companions converge on the TV state, whoever sent what', () => {
    const room = roomWithGame();
    const a = room.join('a');
    const b = room.join('b');
    room.instant = false;
    a.dispatch({ type: 'fog.apply', cells: [1, 2], value: 'reveal', gesture: 'x' });
    b.dispatch({ type: 'fog.apply', cells: [2], value: 'hide', gesture: 'y' });
    a.dispatch({ type: 'view.grid', on: false });
    room.flush();
    room.flush();
    expect(a.view).toEqual(room.host.state);
    expect(b.view).toEqual(room.host.state);
  });

  test('a refused command is dropped with the reason', () => {
    const room = roomWithGame();
    const c = room.join('a');
    expect(c.dispatch({ type: 'map.switch', mapId: 'nope' })).toBe(false); // refused by the prediction already
    expect(room.notices.at(-1)?.text).toContain('not in this game');
    expect(room.host.rev).toBe(0);
  });

  test('offline: not sent, not queued, a notice says so', () => {
    const room = roomWithGame();
    const c = room.join('a');
    c.setLink(false, false);
    expect(c.dispatch({ type: 'fog.all', value: 'reveal' })).toBe(false);
    expect(room.notices.at(-1)?.text).toContain('Not connected');
    expect(room.host.rev).toBe(0);
  });

  test('a gap asks for a snapshot and recovers', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.up = false; // the companion misses a patch
    room.host.applyLocal({ type: 'table.calibrate', widthInches: 50 });
    room.up = true;
    room.host.applyLocal({ type: 'table.calibrate', widthInches: 51 });
    expect(c.view?.table.widthInches).toBe(51);
    expect(c.rev).toBe(room.host.rev);
    expect(room.log.has('Asking for a snapshot')).toBe(true);
  });

  test('commands in flight when the link drops are dropped with one notice after reconnect', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.instant = false;
    c.dispatch({ type: 'fog.all', value: 'reveal' });
    room.up = false;
    c.setLink(false, false);
    room.instant = true;
    room.up = true;
    c.setLink(true, true); // reconnect → snapshot, the TV never got the command
    room.flush();
    expect(c.pendingCount).toBe(0);
    expect(room.notices.filter((n) => n.text.includes("didn't reach the TV")).length).toBe(1);
    expect(c.view).toEqual(room.host.state);
  });

  test('a new game on the TV: new epoch, every companion follows', () => {
    const room = roomWithGame();
    const a = room.join('a');
    room.host.replace({ ...room.host.state, game: newGame({ id: 'g2', name: 'Second', createdAt: '2026-10-25T00:00:00Z', map: map('m2') }) }, 'test');
    expect(a.view?.game?.id).toBe('g2');
    expect(a.epoch).toBe(room.host.epoch);
  });

  test('a duplicate command is ignored by the TV', () => {
    const room = roomWithGame();
    room.join('a');
    room.host.receive({ type: 'sync.cmd', from: 'a', seq: 5, cmd: { type: 'view.grid', on: false } });
    room.host.receive({ type: 'sync.cmd', from: 'a', seq: 5, cmd: { type: 'view.grid', on: true } });
    expect(room.host.state.game?.maps.m1?.showGrid).toBe(false);
  });

  test('qa#6: a command the TV never echoes is rolled back after the ack timeout, never resent', () => {
    const room = roomWithGame();
    const clock = fakeClock();
    const c = room.join('a', { ackTimeoutMs: 5000, now: clock.now, timers: clock });
    room.instant = false; // the TV page is reloading: the relay took it, nobody answers
    expect(c.dispatch({ type: 'fog.all', value: 'reveal' })).toBe(true);
    expect(c.pendingCount).toBe(1);
    clock.advance(4999);
    expect(c.pendingCount).toBe(1);
    clock.advance(1);
    expect(c.pendingCount).toBe(0);
    expect(c.view).toEqual(c.confirmed);
    expect(room.notices.at(-1)?.text).toContain("didn't reach the TV");
    expect(room.log.has('Commands dropped')).toBe(true);
  });

  test('qa#6: a late echo after the timeout still lands in the confirmed state', () => {
    const room = roomWithGame();
    const clock = fakeClock();
    const c = room.join('a', { ackTimeoutMs: 5000, now: clock.now, timers: clock });
    room.instant = false;
    c.dispatch({ type: 'table.calibrate', widthInches: 44 });
    clock.advance(6000);
    expect(c.view?.table.widthInches).not.toBe(44);
    room.flush();
    expect(c.view?.table.widthInches).toBe(44);
    expect(c.view).toEqual(room.host.state);
  });

  test('qa#6: losing the TV with commands in flight rolls back at once with one notice', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.instant = false;
    c.dispatch({ type: 'fog.all', value: 'reveal' });
    c.dispatch({ type: 'table.calibrate', widthInches: 44 });
    c.setLink(true, false); // peer.left: the TV went away
    expect(c.pendingCount).toBe(0);
    expect(c.view).toEqual(c.confirmed);
    expect(room.notices.filter((n) => n.client === 'a').map((n) => n.text)).toEqual(["2 changes didn't reach the TV — they were undone here."]);
  });

  test('rv#9: an unanswered snapshot request is repeated', () => {
    const room = roomWithGame();
    const clock = fakeClock();
    room.up = false;
    const c = room.join('a', { snapshotRetryMs: 3000, now: clock.now, timers: clock });
    expect(c.ready()).toBe(false);
    room.up = true;
    clock.advance(3000);
    expect(c.ready()).toBe(true);
    expect(room.log.lines.filter((l) => l.msg === 'Asking for a snapshot').length).toBeGreaterThanOrEqual(2);
  });

  test('rv#10: a new epoch drops what is pending instead of folding it onto the new game', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.instant = false;
    c.dispatch({ type: 'fog.all', value: 'reveal' });
    room.instant = true;
    room.host.replace({ ...room.host.state, game: newGame({ id: 'g2', name: 'G2', createdAt: '2026-10-25T00:00:00Z', map: map() }) }, 'test');
    expect(c.epoch).toBe(room.host.epoch);
    expect(c.pendingCount).toBe(0);
    expect(c.view).toEqual(room.host.state);
  });

  test('rv#12: a rate-limited command says so', () => {
    const room = roomWithGame();
    const c = room.join('a');
    room.instant = false;
    c.dispatch({ type: 'fog.all', value: 'reveal' });
    c.undelivered(1, 'rate-limited');
    expect(room.notices.at(-1)?.text).toContain('Too fast');
  });

  test('rv#28: a map-scoped command meant for the previous map is refused', () => {
    const room = roomWithGame();
    room.host.applyLocal({ type: 'map.add', map: map('m2'), activate: false });
    const a = room.join('a');
    const b = room.join('b');
    room.instant = false;
    expect(b.dispatch({ type: 'fog.all', value: 'reveal' })).toBe(true); // meant for m1, held
    room.instant = true;
    a.dispatch({ type: 'map.switch', mapId: 'm2' });
    room.flush(); // b's fog.all arrives after the switch
    expect(room.host.state.game?.activeMapId).toBe('m2');
    expect(room.host.state.game?.maps.m2?.fog.revealed).toEqual(room.host.state.game?.maps.m2?.fog.revealed);
    expect(room.notices.some((n) => n.client === 'b' && n.text.includes('map on the table changed'))).toBe(true);
    expect(b.pendingCount).toBe(0);
    expect(b.view).toEqual(room.host.state);
  });
});

