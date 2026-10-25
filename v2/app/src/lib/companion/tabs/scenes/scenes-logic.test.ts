/**
 * The Scenes tab's logic: names, summaries, the frame a scene shows, thumbnail crops, moving,
 * the curtain menu, and the switch under the curtain (lower → wait → apply → wait → lift).
 */
import { describe, expect, test } from 'bun:test';
import {
  apply, captureScene, initialRoot, newGame, wholeGrid,
  type Command, type MapInfo, type RootState, type Scene,
} from '@battlemap/shared';
import { curtainMenu, effectWords, moveScene, nextSceneName, sceneFrame, sceneSummary, switchScene, thumbStyle } from './scenes-logic.ts';

const FILE = { hash: '0123456789abcdef', ext: 'png' as const, bytes: 1000 };
const map = (id: string, cols: number, rows: number): MapInfo => ({
  id, name: id === 'm1' ? 'The crypt' : 'The bridge', kind: 'picture', picture: FILE, tableCopy: null, geometry: null,
  grid: wholeGrid(cols, rows, cols * 100, rows * 100), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
});

function game(): RootState {
  const root = initialRoot();
  let s: RootState = { ...root, table: { ...root.table, viewport: { width: 1920, height: 1080 } }, game: newGame({ id: 'g', name: 'Night', createdAt: '2026-10-25T18:00:00.000Z', map: map('m1', 60, 40) }) };
  s = run(s, { type: 'map.add', map: map('m2', 20, 10), activate: false });
  return s;
}

function run(s: RootState, ...cmds: Command[]): RootState {
  for (const c of cmds) {
    const r = apply(s, c);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return s;
}

const scene = (s: RootState, id: string, name = id): Scene => captureScene(s.game!, id, name)!;

describe('scenes logic', () => {
  test('names count up per map', () => {
    let s = game();
    expect(nextSceneName(s.game!)).toBe('The crypt · 1');
    s = run(s, { type: 'scene.save', scene: scene(s, 'a', 'The crypt · 1') });
    expect(nextSceneName(s.game!)).toBe('The crypt · 2');
  });

  test('summary: map, weather words, loops, lights, fog look', () => {
    let s = run(game(),
      { type: 'fx.place', effect: { id: 'r', effect: 'weather-rain', anchor: { kind: 'global' }, params: {}, on: true } },
      { type: 'fx.place', effect: { id: 't', effect: 'torch', anchor: { kind: 'point', x: 1, y: 1 }, params: {}, on: true } },
      { type: 'fx.place', effect: { id: 'u', effect: 'brazier', anchor: { kind: 'point', x: 2, y: 1 }, params: {}, on: true } },
      { type: 'game.settings', settings: { mapLights: true, fogStyle: 'cloud' } });
    expect(sceneSummary(s.game!, scene(s, 'x'))).toBe('The crypt · rain · 2 map loops · lights · cloud fog');
    expect(sceneSummary(s.game!, { ...scene(s, 'x'), mapId: 'gone' })).toContain('left the game');
    expect(effectWords('screen-flash')).toBe('flash');
  });

  test('frame: the one-inch window, clipped to the map; the whole map in fit mode', () => {
    let s = run(game(), { type: 'view.window', col: 10, row: 5 });
    const g = s.game!;
    const f = sceneFrame(s.table, g.maps.m1!, scene(s, 'a'));
    expect(f).toEqual({ x: 10, y: 5, width: 34, height: 19 });
    s = run(s, { type: 'view.mode', mode: 'fit' });
    expect(sceneFrame(s.table, s.game!.maps.m1!, scene(s, 'b'))).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    // a small map in the big window: clipped to the map
    s = run(s, { type: 'map.switch', mapId: 'm2' });
    expect(sceneFrame(s.table, s.game!.maps.m2!, scene(s, 'c'))).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  test('thumbnail crop covers the box and centres the frame', () => {
    const s = game();
    const m = s.game!.maps.m1!;
    // squares 10–44 × 5–24 of 100 px on a 6000 × 4000 picture, into 72 × 44
    const t = thumbStyle(m, { x: 10, y: 5, width: 34, height: 19 }, { width: 72, height: 44 });
    const scale = Math.max(72 / 3400, 44 / 1900);
    expect(t.size).toBe(`${Math.round(6000 * scale * 10) / 10}px ${Math.round(4000 * scale * 10) / 10}px`);
    const [left] = t.position.split(' ').map((v) => Number.parseFloat(v));
    expect(left).toBeCloseTo((72 - 3400 * scale) / 2 - 1000 * scale, 0);
  });

  test('move up and down; the ends refuse', () => {
    let s = game();
    s = run(s, { type: 'scene.save', scene: scene(s, 'a') }, { type: 'scene.save', scene: scene(s, 'b') }, { type: 'scene.save', scene: scene(s, 'c') });
    expect(moveScene(s.game!.scenes, 'c', 'up')).toEqual(['a', 'c', 'b']);
    expect(moveScene(s.game!.scenes, 'a', 'up')).toBeNull();
    expect(moveScene(s.game!.scenes, 'c', 'down')).toBeNull();
  });

  test('curtain menu: the default first, the look checked', () => {
    const m = curtainMenu({ down: false, plate: true, text: 'Soon' });
    expect(m.map((r) => r.id)).toEqual(['toggle', 'black', 'plate', 'text']);
    expect(m[0]!.label).toBe('Lower the curtain');
    expect(m.find((r) => r.id === 'plate')!.checked).toBe(true);
    expect(curtainMenu({ down: true, plate: false, text: '' })[0]!.label).toBe('Lift the curtain');
  });
});

describe('switching under the curtain', () => {
  function rig(down: boolean) {
    const sent: string[] = [];
    let curtain = { down, plate: false, text: '' };
    const deps = {
      dispatch: (c: Command) => {
        sent.push(c.type === 'curtain.set' ? `curtain ${c.down ? 'down' : 'up'}` : c.type);
        if (c.type === 'curtain.set') curtain = { ...curtain, down: c.down };
        return true;
      },
      sleep: async (ms: number) => void sent.push(`wait ${ms}`),
      curtain: () => curtain,
    };
    return { sent, deps };
  }

  test('lower, wait, apply, wait, lift', async () => {
    const { sent, deps } = rig(false);
    expect(await switchScene('a', true, deps)).toBe(true);
    expect(sent).toEqual(['curtain down', 'wait 900', 'scene.apply', 'wait 600', 'curtain up']);
  });

  test('a curtain already down stays down; without the curtain it applies at once', async () => {
    const a = rig(true);
    await switchScene('a', true, a.deps);
    expect(a.sent).toEqual(['scene.apply']);
    const b = rig(false);
    await switchScene('a', false, b.deps);
    expect(b.sent).toEqual(['scene.apply']);
  });
});
