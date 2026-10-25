/**
 * The curtain and scene presets: curtain down / up (plate and text kept), scene save / update /
 * rename / order / delete (+ Undo by saving back), apply (map, view, effects, lights, fog look;
 * fog and tokens untouched), refusals, old games without the fields, and the wire.
 */
import { describe, expect, test } from 'bun:test';
import {
  apply, captureScene, check, checkCommand, Game, maskCells, sceneShown, type PlacedEffect, type RootState, type Scene,
} from '../src/index.ts';
import { active, pictureMap, refused, run, withGame } from './fixtures.ts';

const rain: PlacedEffect = { id: 'rain', effect: 'weather.rain', anchor: { kind: 'global' }, params: { intensity: 0.6 }, on: true };
const torch: PlacedEffect = { id: 'torch', effect: 'fire.torch', anchor: { kind: 'point', x: 3, y: 4 }, params: {}, on: true };
const aura: PlacedEffect = { id: 'aura', effect: 'aura.holy', anchor: { kind: 'token', tokenId: 't1' }, params: {}, on: true };

/** A game with two maps: `m1` on the table, `m2` waiting. */
function twoMaps(): RootState {
  return run(withGame(pictureMap('m1', 60, 40)), { type: 'map.add', map: pictureMap('m2', 30, 20), activate: false });
}

/** A scene of the table now. */
function snap(s: RootState, id: string, name = id): Scene {
  const scene = captureScene(s.game!, id, name);
  if (!scene) throw new Error('no map');
  return scene;
}

describe('the curtain', () => {
  test('down and up; plate and text are kept when left out; nothing changed = same state', () => {
    let s = withGame();
    expect(s.game!.curtain).toEqual({ down: false, plate: false, text: '' });
    s = run(s, { type: 'curtain.set', down: true, plate: true, text: 'The crypt awaits' });
    expect(s.game!.curtain).toEqual({ down: true, plate: true, text: 'The crypt awaits' });
    s = run(s, { type: 'curtain.set', down: false });
    expect(s.game!.curtain).toEqual({ down: false, plate: true, text: 'The crypt awaits' });
    expect(apply(s, { type: 'curtain.set', down: false })).toEqual({ ok: true, state: s });
    expect(s.history.undo).toEqual([]);
  });

  test('refused without a game', () => {
    const s = { ...withGame(), game: null };
    expect(refused(s, { type: 'curtain.set', down: true })).toContain('No game');
  });

  test('changes behind it land in the state (the TV hides them until it lifts)', () => {
    let s = run(twoMaps(), { type: 'curtain.set', down: true });
    s = run(s, { type: 'map.switch', mapId: 'm2' }, { type: 'fog.apply', cells: [0, 1], value: 'reveal', gesture: 'g' });
    expect(s.game!.curtain.down).toBe(true);
    s = run(s, { type: 'curtain.set', down: false });
    expect(s.game!.activeMapId).toBe('m2');
    expect(maskCells(active(s).fog.revealed, 600)).toEqual([0, 1]);
  });
});

describe('scene presets', () => {
  test('save captures map, view, effects without token ones, lights and fog look', () => {
    let s = run(twoMaps(),
      { type: 'view.window', col: 5, row: 3 },
      { type: 'fx.place', effect: rain }, { type: 'fx.place', effect: torch }, { type: 'fx.place', effect: aura },
      { type: 'game.settings', settings: { mapLights: true, fogStyle: 'cloud', fogEdgeInset: 20 } });
    const scene = snap(s, 'sc1', 'Storm over the keep');
    expect(scene).toMatchObject({ mapId: 'm1', mapLights: true, fog: { style: 'cloud', edgeInset: 20, fade: true } });
    expect(scene.view).toMatchObject({ mode: 'table', col: 5, row: 3 });
    expect(scene.effects.map((e) => e.id)).toEqual(['rain', 'torch']);
    s = run(s, { type: 'scene.save', scene });
    expect(s.game!.scenes).toEqual([scene]);
    expect(sceneShown(s.game!, scene)).toBe(true);
  });

  test('apply puts it back — map, view, effects, settings; fog and tokens stay', () => {
    let s = run(twoMaps(), { type: 'fx.place', effect: rain }, { type: 'view.window', col: 10, row: 8 });
    const storm = snap(s, 'storm');
    s = run(s, { type: 'scene.save', scene: storm });
    // the night goes on: another map, the effects gone, fog revealed, a token placed
    s = run(s, { type: 'fx.remove', id: 'rain' }, { type: 'fx.place', effect: aura },
      { type: 'token.add', token: { id: 't1', label: '1', name: '', color: '#e53935', col: 2, row: 2, placed: true, hidden: false } },
      { type: 'fog.apply', cells: [7], value: 'reveal', gesture: 'g' },
      { type: 'game.settings', settings: { fogStyle: 'soft' } },
      { type: 'map.switch', mapId: 'm2' }, { type: 'measure.set', line: { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } } });
    expect(sceneShown(s.game!, storm)).toBe(false);
    s = run(s, { type: 'scene.apply', id: 'storm' });
    const m = active(s);
    expect(s.game!.activeMapId).toBe('m1');
    expect(m.view).toEqual(storm.view);
    expect(m.effects.map((e) => e.id)).toEqual(['aura', 'rain']); // the token's aura stays
    expect(s.game!.settings.fogStyle).toBe('standard');
    expect(maskCells(m.fog.revealed, 2400)).toEqual([7]);
    expect(m.tokens).toHaveLength(1);
    expect(s.live.measure).toBeNull(); // live tools belonged to the other map
    expect(sceneShown(s.game!, storm)).toBe(true);
    expect(apply(s, { type: 'scene.apply', id: 'storm' })).toEqual({ ok: true, state: s });
  });

  test('update from now replaces in place; rename; order; delete and Undo by saving back', () => {
    let s = twoMaps();
    const a = snap(s, 'a', 'Arrival');
    s = run(s, { type: 'map.switch', mapId: 'm2' });
    const b = snap(s, 'b', 'Bridge');
    s = run(s, { type: 'scene.save', scene: a }, { type: 'scene.save', scene: b });
    s = run(s, { type: 'fx.place', effect: rain });
    const b2 = snap(s, 'b', 'Bridge');
    s = run(s, { type: 'scene.save', scene: b2 });
    expect(s.game!.scenes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.game!.scenes[1]!.effects).toHaveLength(1);
    s = run(s, { type: 'scene.rename', id: 'a', name: 'The gate' });
    expect(s.game!.scenes[0]!.name).toBe('The gate');
    s = run(s, { type: 'scene.order', ids: ['b', 'a'] });
    expect(s.game!.scenes.map((x) => x.id)).toEqual(['b', 'a']);
    expect(refused(s, { type: 'scene.order', ids: ['a'] })).toContain('changed');
    expect(refused(s, { type: 'scene.order', ids: ['a', 'a'] })).toContain('changed');
    const removed = s.game!.scenes[0]!;
    const gone = run(s, { type: 'scene.remove', id: 'b' });
    expect(gone.game!.scenes.map((x) => x.id)).toEqual(['a']);
    expect(apply(gone, { type: 'scene.remove', id: 'b' })).toEqual({ ok: true, state: gone });
    const back = run(gone, { type: 'scene.save', scene: removed, index: 0 });
    expect(back.game!.scenes.map((x) => x.id)).toEqual(['b', 'a']);
  });

  test('refusals: unknown scene, a map not in the game, the limit', () => {
    let s = twoMaps();
    expect(refused(s, { type: 'scene.apply', id: 'nope' })).toContain('gone');
    expect(refused(s, { type: 'scene.rename', id: 'nope', name: 'x' })).toContain('gone');
    expect(refused(s, { type: 'scene.save', scene: { ...snap(s, 'x'), mapId: 'elsewhere' } })).toContain('not in this game');
    s = run(s, { type: 'scene.save', scene: { ...snap(s, 'on2'), mapId: 'm2' } }, { type: 'map.remove', mapId: 'm2' });
    expect(refused(s, { type: 'scene.apply', id: 'on2' })).toContain('left the game');
    for (let i = s.game!.scenes.length; i < 24; i++) s = run(s, { type: 'scene.save', scene: snap(s, `s${i}`) });
    expect(refused(s, { type: 'scene.save', scene: snap(s, 'one-more') })).toContain('24');
    expect(apply(s, { type: 'scene.save', scene: snap(s, 's5', 'renamed') }).ok).toBe(true);
  });
});

describe('the wire and old games', () => {
  test('commands pass the schemas; a too long plate line is refused', () => {
    const s = twoMaps();
    expect(checkCommand({ type: 'curtain.set', down: true, plate: true, text: 'Next: the crypt' }).ok).toBe(true);
    expect(checkCommand({ type: 'curtain.set', down: true, text: 'x'.repeat(121) }).ok).toBe(false);
    expect(checkCommand({ type: 'scene.save', scene: snap(s, 'a'), index: 0 }).ok).toBe(true);
    expect(checkCommand({ type: 'scene.order', ids: ['a', 'b'] }).ok).toBe(true);
    expect(checkCommand({ type: 'scene.apply', id: 'a' }).ok).toBe(true);
  });

  test('a game stored before the curtain and scenes reads as curtain up, no scenes', () => {
    const g = { ...withGame().game! } as Record<string, unknown>;
    delete g.curtain;
    delete g.scenes;
    const r = check(Game, JSON.parse(JSON.stringify(g)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.curtain).toEqual({ down: false, plate: false, text: '' });
      expect(r.value.scenes).toEqual([]);
    }
  });
});
