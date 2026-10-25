/**
 * The reducer: every command, its refusals, undo/redo, gestures, the preview, re-gridding, and
 * determinism (the same commands from the same state give the same result).
 */
import { describe, expect, test } from 'bun:test';
import {
  apply, applyAll, check, Command, Game, classicDisc, emptyMask, initialRoot, maskCells, MAX_SHOTS, MAX_UNDO, RootState, wholeGrid,
  type Token,
} from '../src/index.ts';
import { active, pictureMap, refused, run, uvttMap, withGame } from './fixtures.ts';

const token = (id: string, col = 1, row = 1, placed = true): Token => ({ id, label: id, name: '', color: '#e53935', col, row, placed, hidden: false });
const revealed = (s: RootState) => maskCells(active(s).fog.revealed, active(s).info.grid.cols * active(s).info.grid.rows);

describe('without a game', () => {
  test('game commands are refused, table commands work', () => {
    const s = initialRoot();
    expect(refused(s, { type: 'fog.all', value: 'reveal' })).toContain('No game');
    expect(refused(s, { type: 'token.clear' })).toContain('No game');
    expect(refused(s, { type: 'history.undo' })).toContain('No game');
    const t = run(s, { type: 'table.calibrate', widthInches: 40 }, { type: 'table.overscan', percent: 50 });
    expect(t.table.widthInches).toBe(40);
    expect(t.table.overscanPercent).toBe(12);
    expect(run(t, { type: 'table.reset' }).table).toMatchObject({ widthInches: 34.5, overscanPercent: 0 });
    expect(run(s, { type: 'table.calibrate', widthInches: 500 }).table.widthInches).toBe(90);
  });

  test('pattern keeps its pivot, viewport reports change nothing twice', () => {
    const s = run(initialRoot(), { type: 'table.pattern', on: true, pivot: 'center' }, { type: 'table.pattern', on: false });
    expect(s.table.pattern).toEqual({ on: false, pivot: 'center' });
    const v = run(s, { type: 'table.viewport', width: 960, height: 540 });
    expect(apply(v, { type: 'table.viewport', width: 960, height: 540 })).toEqual({ ok: true, state: v });
  });
});

describe('fog', () => {
  test('apply reveals and hides; nothing changed returns the same state', () => {
    const s = run(withGame(), { type: 'fog.apply', cells: [0, 1, 2], value: 'reveal', gesture: 'g1' });
    expect(revealed(s)).toEqual([0, 1, 2]);
    expect(apply(s, { type: 'fog.apply', cells: [0, 1], value: 'reveal', gesture: 'g2' })).toEqual({ ok: true, state: s });
    expect(revealed(run(s, { type: 'fog.apply', cells: [1], value: 'hide', gesture: 'g3' }))).toEqual([0, 2]);
  });

  test('one gesture is one undo step', () => {
    let s = withGame();
    for (let i = 0; i < 10; i++) s = run(s, { type: 'fog.apply', cells: [i], value: 'reveal', gesture: 'stroke' });
    expect(s.history.undo).toHaveLength(1);
    s = run(s, { type: 'fog.apply', cells: [50], value: 'reveal', gesture: 'other' });
    expect(s.history.undo).toHaveLength(2);
    s = run(s, { type: 'history.undo' });
    expect(revealed(s)).toHaveLength(10);
    s = run(s, { type: 'history.undo' });
    expect(revealed(s)).toEqual([]);
    s = run(s, { type: 'history.redo' }, { type: 'history.redo' });
    expect(revealed(s)).toHaveLength(11);
  });

  test('all reveals and hides everything, undoable', () => {
    const s = run(withGame(pictureMap('m', 4, 3)), { type: 'fog.all', value: 'reveal' });
    expect(revealed(s)).toHaveLength(12);
    expect(revealed(run(s, { type: 'fog.all', value: 'hide' }))).toEqual([]);
    expect(revealed(run(s, { type: 'history.undo' }))).toEqual([]);
  });

  test('preview first stages, commit applies as one step, discard throws away', () => {
    let s = run(withGame(), { type: 'fog.apply', cells: [0], value: 'reveal', gesture: 'a' }, { type: 'fog.preview', on: true });
    s = run(s, { type: 'fog.apply', cells: [1, 2], value: 'reveal', gesture: 'b' }, { type: 'fog.apply', cells: [0], value: 'hide', gesture: 'c' });
    expect(revealed(s)).toEqual([0]);
    const n = 300;
    expect(maskCells(active(s).fog.staged!.reveal, n)).toEqual([1, 2]);
    expect(maskCells(active(s).fog.staged!.hide, n)).toEqual([0]);
    const committed = run(s, { type: 'fog.commit' });
    expect(revealed(committed)).toEqual([1, 2]);
    expect(active(committed).fog.staged).toBeNull();
    expect(revealed(run(committed, { type: 'history.undo' }))).toEqual([0]);
    expect(active(run(s, { type: 'fog.discard' })).fog.staged).toBeNull();
    expect(active(run(s, { type: 'fog.preview', on: false })).fog.staged).toBeNull();
  });

  test('the live circle: replace swaps the last circle, another fog command ends it', () => {
    const n = 300;
    let s = run(withGame(), { type: 'fog.preview', on: true }, { type: 'fog.apply', cells: [5], value: 'reveal', gesture: 'brush' });
    s = run(s, { type: 'fog.apply', cells: [20, 21], value: 'reveal', gesture: 'circle', live: 'start' });
    s = run(s, { type: 'fog.apply', cells: [20, 21, 22, 23], value: 'reveal', gesture: 'circle', live: 'replace' });
    expect(maskCells(active(s).fog.staged!.reveal, n)).toEqual([5, 20, 21, 22, 23]);
    s = run(s, { type: 'fog.apply', cells: [20], value: 'reveal', gesture: 'circle', live: 'replace' });
    expect(maskCells(active(s).fog.staged!.reveal, n)).toEqual([5, 20]);
    s = run(s, { type: 'fog.apply', cells: [40], value: 'reveal', gesture: 'brush2' });
    expect(active(s).fog.live).toBeNull();
    const after = run(s, { type: 'fog.apply', cells: [1], value: 'reveal', gesture: 'circle', live: 'replace' });
    expect(after).toEqual(s);
  });

  test('fog on and off', () => {
    expect(active(run(withGame(), { type: 'fog.enable', on: false })).fog.on).toBe(false);
  });
});

describe('doors', () => {
  test('open and close, undoable; an unknown door is refused', () => {
    let s = run(withGame(uvttMap()), { type: 'door.set', index: 1, open: true });
    expect(active(s).doorsOpen).toEqual([1]);
    s = run(s, { type: 'door.set', index: 0, open: true });
    expect(active(s).doorsOpen).toEqual([0, 1]);
    expect(active(run(s, { type: 'history.undo' })).doorsOpen).toEqual([1]);
    expect(refused(s, { type: 'door.set', index: 2, open: true })).toContain('door');
  });
});

describe('tokens', () => {
  test('add, move (placing), update, remove, clear — each undoable', () => {
    let s = run(withGame(pictureMap('m', 10, 10)), { type: 'token.add', token: token('t1', 50, 50) });
    expect(active(s).tokens[0]).toMatchObject({ col: 9, row: 9 });
    expect(refused(s, { type: 'token.add', token: token('t1') })).toContain('exists');
    s = run(s, { type: 'token.add', token: token('t2', 0, 0, false) }, { type: 'token.move', id: 't2', col: 3, row: 4 });
    expect(active(s).tokens[1]).toMatchObject({ placed: true, col: 3, row: 4 });
    expect(active(run(s, { type: 'history.undo' })).tokens[1]!.placed).toBe(false);
    s = run(s, { type: 'token.update', id: 't1', hidden: true, name: 'Thorin' });
    expect(active(s).tokens[0]).toMatchObject({ hidden: true, name: 'Thorin' });
    s = run(s, { type: 'token.remove', id: 't1' });
    expect(active(s).tokens.map((t) => t.id)).toEqual(['t2']);
    expect(active(run(s, { type: 'history.undo' })).tokens.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    s = run(s, { type: 'token.clear' });
    expect(active(s).tokens).toEqual([]);
    expect(active(run(s, { type: 'history.undo' })).tokens.map((t) => t.id)).toEqual(['t2']);
    expect(refused(s, { type: 'token.move', id: 'nope', col: 1, row: 1 })).toContain('gone');
  });

  test('a drag is one undo step', () => {
    let s = run(withGame(), { type: 'token.add', token: token('t', 0, 0) });
    for (let i = 1; i <= 5; i++) s = run(s, { type: 'token.move', id: 't', col: i, row: 0, gesture: 'drag' });
    expect(s.history.undo).toHaveLength(2);
    expect(active(run(s, { type: 'history.undo' })).tokens[0]).toMatchObject({ col: 0, row: 0 });
  });
});

describe('drawing and tools', () => {
  const stroke = (id: string) => ({ id, points: [0, 0, 1, 1], color: '#ff0000', width: 0.1 });

  test('strokes: add ends the live one, remove, clear, undo of clear brings them back', () => {
    let s = run(withGame(), { type: 'draw.live', stroke: stroke('live') });
    expect(s.live.stroke?.id).toBe('live');
    s = run(s, { type: 'draw.add', stroke: stroke('a') }, { type: 'draw.add', stroke: stroke('b') });
    expect(s.live.stroke).toBeNull();
    expect(active(run(s, { type: 'draw.remove', id: 'a' })).strokes.map((x) => x.id)).toEqual(['b']);
    const cleared = run(s, { type: 'draw.clear' });
    expect(active(cleared).strokes).toEqual([]);
    expect(active(run(cleared, { type: 'history.undo' })).strokes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(refused(s, { type: 'draw.add', stroke: { ...stroke('c'), points: [0, 0, 1] } })).toContain('pairs');
  });

  test('measure, ruler, disc, layers', () => {
    let s = run(withGame(), { type: 'measure.set', line: { a: { x: 0, y: 0 }, b: { x: 3, y: 4 } } });
    expect(s.live.measure?.b).toEqual({ x: 3, y: 4 });
    s = run(s, { type: 'ruler.set', ruler: { visible: true, x: 2, y: 12, rotation: 90 } });
    expect(active(s).ruler.rotation).toBe(90);
    s = run(s, { type: 'disc.set', disc: { ...classicDisc(), visible: true, rotation: -90 } });
    expect(active(s).disc.rotation).toBe(270);
    const layer = { id: 'l', name: 'dm.png', file: { hash: 'abcdefabcdefabcd', ext: 'png' as const, bytes: 1 }, visible: true, opacity: 0.6 };
    expect(active(run(s, { type: 'layers.set', layers: [layer] })).layers).toHaveLength(1);
    expect(refused(s, { type: 'layers.set', layers: [layer, layer] })).toContain('same id');
  });
});

describe('the TV view', () => {
  test('window, pan, clamp, null on an axis that fits', () => {
    let s = run(withGame(pictureMap('big', 60, 15)), { type: 'view.window', col: 99, row: 5 });
    expect(active(s).view).toMatchObject({ col: 26, row: null });
    s = run(s, { type: 'view.pan', dx: -3, dy: 2 });
    expect(active(s).view).toMatchObject({ col: 23, row: null });
  });

  test('rotation keeps the window centre', () => {
    let s = run(withGame(pictureMap('big', 60, 60)), { type: 'view.window', col: 0, row: 0 });
    s = run(s, { type: 'view.rotate', quarterTurns: 1 });
    const v = active(s).view;
    expect(v.quarterTurns).toBe(1);
    // centre was (17, 9.5); sideways the window is 19 × 34 → start (7.5→8, −7.5 → clamp 0)
    expect([v.col, v.row]).toEqual([8, 0]);
  });

  test('modes, free camera, grid', () => {
    let s = run(withGame(), { type: 'view.mode', mode: 'fit' });
    expect(active(s).view.mode).toBe('fit');
    s = run(s, { type: 'view.free', x: 4, y: 5, zoom: 80 });
    expect(active(s).view).toMatchObject({ mode: 'free', free: { x: 4, y: 5, zoom: 80 } });
    expect(active(run(s, { type: 'view.grid', on: false })).showGrid).toBe(false);
  });

  test('pan needs the TV viewport', () => {
    const s = withGame();
    expect(refused({ ...s, table: { ...s.table, viewport: null } }, { type: 'view.pan', dx: 1, dy: 0 })).toContain('screen');
  });
});

describe('maps in a game', () => {
  test('add, switch keeps each map state, remove, rename', () => {
    let s = run(withGame(), { type: 'fog.apply', cells: [3], value: 'reveal', gesture: 'a' });
    s = run(s, { type: 'map.add', map: pictureMap('m2', 5, 5), activate: true });
    expect(s.game!.activeMapId).toBe('m2');
    expect(revealed(s)).toEqual([]);
    s = run(s, { type: 'map.switch', mapId: 'm1' });
    expect(revealed(s)).toEqual([3]);
    expect(refused(s, { type: 'map.add', map: pictureMap('m2'), activate: false })).toContain('already');
    s = run(s, { type: 'map.rename', mapId: 'm2', name: 'Cellar' });
    expect(s.game!.maps.m2!.info.name).toBe('Cellar');
    s = run(s, { type: 'map.remove', mapId: 'm1' });
    expect(s.game!.activeMapId).toBe('m2');
    expect(s.history.undo).toEqual([]);
    expect(refused(s, { type: 'map.remove', mapId: 'm2' })).toContain('one map');
  });

  test('regrid: same counts keep the fog, new counts start over and drop fog undo', () => {
    let s = run(withGame(pictureMap('m', 20, 15)), { type: 'fog.apply', cells: [1, 2], value: 'reveal', gesture: 'a' });
    const fine = { ...wholeGrid(20, 15, 2000, 1500), x: 0.5 };
    s = run(s, { type: 'map.regrid', grid: fine });
    expect(revealed(s)).toEqual([1, 2]);
    s = run(s, { type: 'map.regrid', grid: wholeGrid(25, 12, 2000, 1500), drawGrid: false });
    expect(revealed(s)).toEqual([]);
    expect(active(s).fog.revealed).toBe(emptyMask(300));
    expect(active(s).showGrid).toBe(false);
    expect(s.history.undo).toEqual([]);
    expect(refused(withGame(uvttMap()), { type: 'map.regrid', grid: fine })).toContain('picture');
  });
});

describe('effects and game', () => {
  const anchor = { kind: 'point' as const, x: 2, y: 3 };

  test('place replaces by id, remove, trigger keeps the last shots', () => {
    let s = run(withGame(), { type: 'fx.place', effect: { id: 'e', effect: 'light.torch', anchor, params: { radius: 3 }, on: true } });
    s = run(s, { type: 'fx.place', effect: { id: 'e', effect: 'light.torch', anchor, params: { radius: 5 }, on: true } });
    expect(active(s).effects).toHaveLength(1);
    expect(active(s).effects[0]!.params.radius).toBe(5);
    expect(active(run(s, { type: 'fx.remove', id: 'e' })).effects).toEqual([]);
    for (let i = 0; i < MAX_SHOTS + 3; i++) s = run(s, { type: 'fx.trigger', shot: { id: `s${i}`, effect: 'burst.fire', anchor, params: {}, at: i } });
    expect(s.live.shots.map((x) => x.id)[0]).toBe('s3');
    expect(s.live.shots).toHaveLength(MAX_SHOTS);
  });

  test('effects undo: place and remove each one step, a clear under one gesture is one step', () => {
    const fx = (id: string) => ({ id, effect: 'light.torch', anchor, params: {}, on: true });
    let s = run(withGame(), { type: 'fx.place', effect: fx('a') }, { type: 'fx.place', effect: fx('b') });
    expect(active(run(s, { type: 'history.undo' })).effects.map((e) => e.id)).toEqual(['a']);
    s = run(s, { type: 'fx.remove', id: 'a', gesture: 'clear1' }, { type: 'fx.remove', id: 'b', gesture: 'clear1' });
    expect(active(s).effects).toEqual([]);
    s = run(s, { type: 'history.undo' });
    expect(active(s).effects.map((e) => e.id)).toEqual(['a', 'b']);
    s = run(s, { type: 'history.redo' });
    expect(active(s).effects).toEqual([]);
  });

  test('rename and settings', () => {
    const s = run(withGame(), { type: 'game.rename', name: 'Night 2' }, { type: 'game.settings', settings: { fogEdgeInset: 15 } });
    expect(s.game!.name).toBe('Night 2');
    expect(s.game!.settings).toMatchObject({ fogEdgeInset: 15, fogStyle: 'standard' });
  });

  test('mapLights, drawTools, measureTools: defaults, set alone, old games read with defaults', () => {
    const s0 = withGame();
    expect(s0.game!.settings).toMatchObject({ mapLights: false, drawTools: true, measureTools: true });
    const s1 = run(s0, { type: 'game.settings', settings: { mapLights: true } }, { type: 'game.settings', settings: { drawTools: false } });
    expect(s1.game!.settings).toMatchObject({ mapLights: true, drawTools: false, measureTools: true });
    const parsed = check(Command, { type: 'game.settings', settings: { fogFade: false } });
    expect(parsed.ok && parsed.value.type === 'game.settings' ? Object.keys(parsed.value.settings) : null).toEqual(['fogFade']);
    const { mapLights: _a, drawTools: _b, measureTools: _c, ...oldSettings } = s0.game!.settings;
    const old = check(Game, { ...s0.game!, settings: oldSettings });
    expect(old.ok && old.value.settings).toMatchObject({ mapLights: false, drawTools: true, measureTools: true });
  });
});

describe('history', () => {
  test('nothing to undo, a new action clears redo, at most 50 steps', () => {
    let s = withGame();
    expect(refused(s, { type: 'history.undo' })).toContain('Nothing');
    s = run(s, { type: 'fog.apply', cells: [1], value: 'reveal', gesture: 'a' }, { type: 'history.undo' });
    expect(s.history.redo).toHaveLength(1);
    s = run(s, { type: 'fog.apply', cells: [2], value: 'reveal', gesture: 'b' });
    expect(s.history.redo).toEqual([]);
    for (let i = 0; i < 60; i++) s = run(s, { type: 'fog.apply', cells: [i + 10], value: 'reveal', gesture: `g${i}` });
    expect(s.history.undo).toHaveLength(MAX_UNDO);
  });
});

describe('determinism and the wire', () => {
  const script: Command[] = [
    { type: 'table.viewport', width: 960, height: 540 },
    { type: 'fog.apply', cells: [0, 1, 2, 3], value: 'reveal', gesture: 'a' },
    { type: 'token.add', token: token('t1', 2, 2) },
    { type: 'token.move', id: 't1', col: 5, row: 5, gesture: 'd' },
    { type: 'draw.add', stroke: { id: 's', points: [0, 0, 2, 2, 3, 1], color: '#00ff00', width: 0.2 } },
    { type: 'map.add', map: pictureMap('m2', 50, 40), activate: true },
    { type: 'view.window', col: 10, row: 10 },
    { type: 'fog.preview', on: true },
    { type: 'fog.apply', cells: [100, 101], value: 'reveal', gesture: 'c', live: 'start' },
    { type: 'history.undo' },
    { type: 'map.switch', mapId: 'm1' },
  ];

  test('the same commands from the same state give equal states', () => {
    expect(applyAll(withGame(), script)).toEqual(applyAll(withGame(), script));
  });

  test('a state survives JSON and its schema, and replays the same afterwards', () => {
    const mid = applyAll(withGame(), script.slice(0, 6));
    const copy = check(RootState, JSON.parse(JSON.stringify(mid)));
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.value).toEqual(mid);
    expect(applyAll(copy.value, script.slice(6))).toEqual(applyAll(mid, script.slice(6)));
  });

  test('the input is never changed', () => {
    const s = withGame();
    const before = JSON.stringify(s);
    applyAll(s, script);
    expect(JSON.stringify(s)).toBe(before);
  });
});
