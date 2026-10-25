/// <reference types="bun" />
import '../../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { apply, classicDisc, defaultTable, newMapPlay, wholeGrid, type MapInfo, type MapPlay, type TableState } from '@battlemap/shared';
import { addLayer, addedText, moveLayer, removeLayer, restoreLayer, topFirst, updateLayer } from '../layers/layers-logic.ts';
import { addSize, lookOf, readLook, removeSize, sameLook, stepSize, turned, withLook } from '../measure/disc-look.ts';
import { fakeContext, stateWithGame, testMap } from '../../game/fake-context.ts';
import { followCommand, followOf } from './follow.svelte.ts';
import { panReach, rotationLabel, tvQuad, viewOf, viewSentence, windowAt } from './view-logic.ts';

const file = (c: string) => ({ hash: c.repeat(16), ext: 'png' as const, bytes: 10 });

describe('layers', () => {
  test('add, update, order, remove, undo', () => {
    let l = addLayer([], 'a', 'Secrets', file('a'));
    l = addLayer(l, 'b', 'Notes', file('b'));
    expect(l.map((x) => x.id)).toEqual(['a', 'b']);
    expect(l[0]!.opacity).toBe(0.6);
    expect(topFirst(l).map((x) => x.id)).toEqual(['b', 'a']);
    l = moveLayer(l, 'a', 'up');
    expect(l.map((x) => x.id)).toEqual(['b', 'a']);
    expect(moveLayer(l, 'a', 'up').map((x) => x.id)).toEqual(['b', 'a']);
    l = updateLayer(l, 'b', { visible: false, opacity: 0.3 });
    expect(l[0]).toMatchObject({ id: 'b', visible: false, opacity: 0.3 });
    const r = removeLayer(l, 'b');
    expect(r.list.map((x) => x.id)).toEqual(['a']);
    expect(restoreLayer(r.list, r.removed!, r.index).map((x) => x.id)).toEqual(['b', 'a']);
    expect(restoreLayer(l, r.removed!, r.index)).toHaveLength(2);
  });
  test('added text', () => {
    expect(addedText(1, [])).toBe('Layer added — only you see it');
    expect(addedText(3, [])).toBe('3 layers added — only you see them');
    expect(addedText(1, ['x.gif'])).toBe('1 added, 1 skipped: x.gif');
  });
});

describe('disc look', () => {
  test('look without place; withLook keeps the place', () => {
    const d = { ...classicDisc(), visible: true, x: 4, y: 5, rotation: 30 };
    const look = { ...lookOf(classicDisc()), markers: 4 };
    const e = withLook(d, look);
    expect([e.visible, e.x, e.y, e.rotation, e.markers]).toEqual([true, 4, 5, 30, 4]);
    expect(sameLook(lookOf(d), lookOf(classicDisc()))).toBe(true);
    expect(sameLook(lookOf(e), lookOf(d))).toBe(false);
  });
  test('reading a stored look fills what is missing', () => {
    const l = readLook({ markers: 8, rings: { color: '#ffffff' } });
    expect(l.markers).toBe(8);
    expect(l.rings.color).toBe('#ffffff');
    expect(l.rings.sizes).toEqual([5, 10, 15, 20]);
    expect(readLook(null).markers).toBe(12);
  });
  test('sizes', () => {
    const rings = classicDisc().rings;
    expect(addSize(rings)).toMatchObject({ added: 25 });
    expect(stepSize(rings, 20, 5).set.sizes).toEqual([5, 10, 15, 25]);
    expect(stepSize(rings, 15, 5).set.sizes).toEqual(rings.sizes); // would duplicate 20
    expect(stepSize(rings, 5, -5).set.sizes).toEqual(rings.sizes); // below 5
    expect(removeSize(rings, 10).sizes).toEqual([5, 15, 20]);
    expect(addSize({ ...rings, sizes: [120] }).added).toBeNull();
  });
  test('turning wraps', () => {
    expect(turned({ ...classicDisc(), rotation: 350 }, 15).rotation).toBe(5);
    expect(turned({ ...classicDisc(), rotation: 5 }, -15).rotation).toBe(350);
  });
});

describe('view', () => {
  const info = (cols: number, rows: number): MapInfo => ({
    id: 'm', name: 'M', kind: 'picture', picture: file('c'), tableCopy: null, geometry: null,
    grid: wholeGrid(cols, rows, cols * 50, rows * 50), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  });
  const t: TableState = { ...defaultTable(), viewport: { width: 1920, height: 1080 } };
  const big: MapPlay = newMapPlay(info(60, 40));
  test('window quad and arrows on a big map', () => {
    const v = viewOf(t, big)!;
    const q = tvQuad(v);
    expect(q[1].x - q[0].x).toBe(34);
    expect(q[2].y - q[1].y).toBe(19);
    const reach = panReach(v, big);
    expect(reach).toEqual({ left: true, right: true, up: true, down: true });
    const edge = viewOf(t, { ...big, view: { ...big.view, col: 0, row: 21 } })!;
    expect(panReach(edge, big)).toMatchObject({ left: false, down: false });
  });
  test('tap on the overview centres the window, clamped', () => {
    const v = viewOf(t, big)!;
    expect(windowAt(v, big, { x: 30, y: 20 })).toEqual({ col: 13, row: 11 });
    expect(windowAt(v, big, { x: 0, y: 0 })).toEqual({ col: 0, row: 0 });
    expect(windowAt(v, big, { x: 99, y: 99 })).toEqual({ col: 26, row: 21 });
  });
  test('a small map fits: no arrows, the sentence says so', () => {
    const small = newMapPlay(info(20, 10));
    const v = viewOf(t, small)!;
    expect(panReach(v, small).left).toBe(false);
    expect(windowAt(v, small, { x: 3, y: 3 })).toBeNull();
    expect(viewSentence(v, small)).toContain('fits the table (34 × 19)');
    expect(viewSentence(viewOf(t, big), big)).toContain('34 × 19 of the map');
  });
  test('fit mode: the screen quad covers the map', () => {
    const fit = { ...big, view: { ...big.view, mode: 'fit' as const } };
    const q = tvQuad(viewOf(t, fit)!);
    expect(q[0].y).toBeCloseTo(0);
    expect(q[2].y).toBeCloseTo(40);
    expect(viewSentence(viewOf(t, fit), fit)).toContain('whole map is on the TV');
    expect(rotationLabel(3)).toBe('270°');
  });
});

describe('TV follows the tablet (rv#1)', () => {
  const bigGame = () => {
    const s = stateWithGame(testMap(60, 40));
    return { ...s, table: { ...s.table, viewport: { width: 1920, height: 1080 } } };
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test('sends only when the camera moves somewhere the TV does not show; the echo sends nothing', async () => {
    const ctx = fakeContext(bigGame());
    const follow = followOf(ctx);
    follow.set(true);
    const first = ctx.sent.length;
    await wait(100);
    expect(ctx.sent.length).toBe(first); // nothing while the DM does nothing
    ctx.camera.set({ ...ctx.camera.get()!, centerX: 45, centerY: 30 });
    await wait(100);
    expect(ctx.sent.at(-1)).toMatchObject({ type: 'view.window' });
    const n = ctx.sent.length;
    ctx.camera.set({ ...ctx.camera.get()!, centerX: 45.2 }); // same window
    await wait(100);
    expect(ctx.sent.length).toBe(n);
    expect(followOf(ctx)).toBe(follow);
  });

  test('stops with the screen; a new screen starts with following off', async () => {
    const ctx = fakeContext(bigGame());
    followOf(ctx).set(true);
    ctx.dispose();
    expect(followOf(ctx).on).toBe(false);
    const n = ctx.sent.length;
    ctx.camera.set({ ...ctx.camera.get()!, centerX: 50, centerY: 35 });
    await wait(100);
    expect(ctx.sent.length).toBe(n);
    expect(followOf(fakeContext(bigGame())).on).toBe(false);
  });

  test('the command: nothing when the TV shows it already or the map fits', () => {
    const s = bigGame();
    const cam = { centerX: 17, centerY: 9.5, zoom: 40, quarterTurns: 0 };
    const cmd = followCommand(s, cam);
    expect(cmd).toEqual({ type: 'view.window', col: 0, row: 0 }); // the window starts centred
    const moved = apply(s, cmd!);
    expect(moved.ok && followCommand(moved.state, cam)).toBeNull(); // the echo asks for nothing
    expect(followCommand(s, { ...cam, centerX: 40 })).toMatchObject({ type: 'view.window', row: 0 });
    const small = { ...stateWithGame(testMap(20, 10)), table: s.table };
    expect(followCommand(small, cam)).toBeNull();
  });
});
