/**
 * Sync between the TV's host and companions' clients: prediction, echoes, rejections, gaps,
 * reconnects, convergence — over an in-memory relay.
 */
import { describe, expect, test } from 'bun:test';
import { newGame, wholeGrid, type MapInfo } from '@battlemap/shared';
import { FakeRoom } from './helpers.ts';

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
    expect(room.notices.some((n) => n.text.includes("didn't reach the TV"))).toBe(true);
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
});
