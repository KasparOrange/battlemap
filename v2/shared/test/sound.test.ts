/**
 * Sound (roadmap S1): the soundscape (`sound.set` — kept fields, beds as a whole list, no undo),
 * one-shot sounds in the live state (`sound.play`), the wire (limits, duplicates), old games and
 * old live states without the fields, and the scene round trip (a scene saved while beds play
 * carries them; one saved in silence leaves the sound alone).
 */
import { describe, expect, test } from 'bun:test';
import {
  apply, captureScene, check, checkCommand, Game, LiveState, MAX_SOUND_SHOTS, sceneShown, type RootState, type Scene,
} from '../src/index.ts';
import { pictureMap, refused, run, withGame } from './fixtures.ts';

const rain = { sound: 'rain', volume: 0.8 };
const drips = { sound: 'dungeon-drips', volume: 0.5 };
const tavern = { sound: 'tavern', volume: 0.6 };

/** A scene of the table now. */
function snap(s: RootState, id: string): Scene {
  const scene = captureScene(s.game!, id, id);
  if (!scene) throw new Error('no map');
  return scene;
}

describe('the soundscape', () => {
  test('a new game is silent with the default volumes', () => {
    expect(withGame().game!.sound).toEqual({ on: false, master: 0.7, shots: 0.8, beds: [], fxSounds: false });
  });

  test('sound.set changes what it names and keeps the rest; same values = same state; no undo', () => {
    let s = run(withGame(), { type: 'sound.set', on: true, beds: [rain, drips] });
    expect(s.game!.sound).toEqual({ on: true, master: 0.7, shots: 0.8, beds: [rain, drips], fxSounds: false });
    s = run(s, { type: 'sound.set', master: 0.4 });
    expect(s.game!.sound.beds).toEqual([rain, drips]);
    expect(s.game!.sound.master).toBe(0.4);
    s = run(s, { type: 'sound.set', beds: [{ ...rain, volume: 0.2 }] });
    expect(s.game!.sound.beds).toEqual([{ sound: 'rain', volume: 0.2 }]);
    expect(apply(s, { type: 'sound.set', beds: [{ sound: 'rain', volume: 0.2 }], on: true })).toEqual({ ok: true, state: s });
    s = run(s, { type: 'sound.set', on: false });
    expect(s.game!.sound.on).toBe(false);
    expect(s.game!.sound.beds).toHaveLength(1); // stop keeps the beds
    expect(s.history.undo).toEqual([]);
  });

  test('refused without a game', () => {
    const s = { ...withGame(), game: null };
    expect(refused(s, { type: 'sound.set', on: true })).toContain('No game');
    expect(refused(s, { type: 'sound.play', shot: { id: 'a', sound: 'thunder', volume: 1, at: 1 } })).toContain('No game');
  });

  test('the wire: at most three beds, each once, volumes 0–1, library ids only', () => {
    expect(checkCommand({ type: 'sound.set', beds: [rain, drips, tavern] }).ok).toBe(true);
    expect(checkCommand({ type: 'sound.set', beds: [rain, drips, tavern, { sound: 'ocean', volume: 1 }] }).ok).toBe(false);
    expect(refused(withGame(), { type: 'sound.set', beds: [rain, { ...rain, volume: 0.1 }] })).toContain('twice');
    expect(checkCommand({ type: 'sound.set', master: 1.2 }).ok).toBe(false);
    expect(checkCommand({ type: 'sound.set', beds: [{ sound: '../etc', volume: 1 }] }).ok).toBe(false);
    expect(checkCommand({ type: 'sound.play', shot: { id: 's1', sound: 'door-slam', at: 1 } }).ok).toBe(true);
  });
});

describe('one-shot sounds', () => {
  test('kept in the live state, the newest last, the last eight only, a repeated id moves to the end', () => {
    let s = withGame();
    for (let i = 0; i < 10; i++) s = run(s, { type: 'sound.play', shot: { id: `s${i}`, sound: 'thunder', volume: 1, at: i } });
    expect(s.live.sounds.map((x) => x.id)).toEqual(['s2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']);
    expect(s.live.sounds).toHaveLength(MAX_SOUND_SHOTS);
    s = run(s, { type: 'sound.play', shot: { id: 's4', sound: 'thunder', volume: 1, at: 11 } });
    expect(s.live.sounds.at(-1)!.id).toBe('s4');
    expect(s.game!.sound.on).toBe(false); // kept while off; the TV decides not to play
  });
});

describe('old data', () => {
  test('a game stored before sound reads as silent; a live state without sounds as none', () => {
    const g = { ...withGame().game! } as Record<string, unknown>;
    delete g.sound;
    const r = check(Game, JSON.parse(JSON.stringify(g)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sound).toEqual({ on: false, master: 0.7, shots: 0.8, beds: [], fxSounds: false });
    const l = check(LiveState, { measure: null, stroke: null, shots: [] });
    expect(l.ok && l.value.sounds).toEqual([]);
  });
});

describe('scenes with sound', () => {
  test('saved while beds play: the scene carries them; applying starts them (round trip through the wire)', () => {
    let s = run(withGame(pictureMap('m1', 30, 20)), { type: 'sound.set', on: true, beds: [rain, drips] });
    const storm = snap(s, 'storm');
    expect(storm.sound).toEqual({ beds: [rain, drips] });
    const wire = checkCommand(JSON.parse(JSON.stringify({ type: 'scene.save', scene: storm })));
    expect(wire.ok).toBe(true);
    if (!wire.ok) return;
    s = run(s, wire.value, { type: 'sound.set', on: false, beds: [tavern] });
    expect(sceneShown(s.game!, storm)).toBe(false);
    s = run(s, { type: 'scene.apply', id: 'storm' });
    expect(s.game!.sound).toMatchObject({ on: true, beds: [rain, drips] });
    expect(sceneShown(s.game!, storm)).toBe(true);
  });

  test('saved in silence: no sound in the scene, applying leaves the mix alone, still "On the table"', () => {
    let s = withGame(pictureMap('m1', 30, 20));
    const quiet = snap(s, 'quiet');
    expect(quiet.sound).toBeUndefined();
    s = run(s, { type: 'scene.save', scene: quiet }, { type: 'sound.set', on: true, beds: [tavern], master: 0.5 });
    s = run(s, { type: 'scene.apply', id: 'quiet' });
    expect(s.game!.sound).toMatchObject({ on: true, beds: [tavern], master: 0.5 });
    expect(sceneShown(s.game!, quiet)).toBe(true);
  });

  test('applying keeps the master and one-shot volumes', () => {
    let s = run(withGame(pictureMap('m1', 30, 20)), { type: 'sound.set', on: true, beds: [rain] });
    s = run(s, { type: 'scene.save', scene: snap(s, 'a') }, { type: 'sound.set', master: 0.3, shots: 0.5, on: false });
    s = run(s, { type: 'scene.apply', id: 'a' });
    expect(s.game!.sound).toEqual({ on: true, master: 0.3, shots: 0.5, beds: [rain], fxSounds: false });
  });
});
