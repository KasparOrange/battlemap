/**
 * Table moments: the spotlight (square, token, clamped, out), the timer's maths across a TV
 * reload (server clock, pause, resume, run out, clocks behind), handouts (save, replace, order,
 * show, delete takes them off the TV), DM notes (add, edit, move as one undo step, delete +
 * undo, never in the players' state), the wire and old games without the fields.
 */
import { describe, expect, test } from 'bun:test';
import {
  apply, check, checkCommand, formatTimer, Game, newTimer, pauseTimer, resetTimer, RootState as RootSchema, sideTurn, startTimer,
  timerEndsAt, timerLeft, timerPhase, withoutDmNotes, type Handout, type RootState,
} from '../src/index.ts';
import { active, FILE, pictureMap, refused, run, withGame } from './fixtures.ts';

const token = { id: 't1', label: '1', name: 'Goblin', color: '#e05050', col: 4, row: 5, placed: true, hidden: false };

describe('spotlight', () => {
  test('on a square (clamped onto the map), on a token, moved, out; no undo step', () => {
    let s = withGame(pictureMap('m1', 20, 15));
    expect(active(s).spotlight).toBeNull();
    s = run(s, { type: 'spotlight.set', spotlight: { target: { kind: 'square', col: 40, row: 3 }, dim: 0.3 } });
    expect(active(s).spotlight).toEqual({ target: { kind: 'square', col: 19, row: 3 }, dim: 0.3 });
    s = run(s, { type: 'token.add', token }, { type: 'spotlight.set', spotlight: { target: { kind: 'token', tokenId: 't1' }, dim: 0.5 } });
    expect(active(s).spotlight?.target).toEqual({ kind: 'token', tokenId: 't1' });
    const same = apply(s, { type: 'spotlight.set', spotlight: { target: { kind: 'token', tokenId: 't1' }, dim: 0.5 } });
    expect(same).toEqual({ ok: true, state: s });
    s = run(s, { type: 'spotlight.set', spotlight: null });
    expect(active(s).spotlight).toBeNull();
    expect(s.history.undo.every((e) => e.kind === 'token')).toBe(true);
  });

  test('refused for a token of another map, without a game; too much dim fails the schema', () => {
    expect(refused(withGame(), { type: 'spotlight.set', spotlight: { target: { kind: 'token', tokenId: 'nope' }, dim: 0.3 } })).toMatch(/token/);
    const empty = { ...withGame(), game: null };
    expect(refused(empty, { type: 'spotlight.set', spotlight: null })).toMatch(/No game/);
    expect(checkCommand({ type: 'spotlight.set', spotlight: { target: { kind: 'square', col: 1, row: 1 }, dim: 0.9 } }).ok).toBe(false);
  });

  test('each map keeps its own spotlight', () => {
    let s = run(withGame(pictureMap('m1')), { type: 'map.add', map: pictureMap('m2'), activate: false });
    s = run(s, { type: 'spotlight.set', spotlight: { target: { kind: 'square', col: 2, row: 2 }, dim: 0.3 } }, { type: 'map.switch', mapId: 'm2' });
    expect(active(s).spotlight).toBeNull();
    s = run(s, { type: 'map.switch', mapId: 'm1' });
    expect(active(s).spotlight?.target).toEqual({ kind: 'square', col: 2, row: 2 });
  });
});

describe('timer maths', () => {
  const T0 = 1_761_400_000_000; // the server's clock when the DM pressed Start

  test('a minute counts down on the server clock; the TV reloading mid-way gets the same answer', () => {
    const t = startTimer(newTimer(60_000), T0);
    expect(timerLeft(t, T0)).toBe(60_000);
    expect(timerLeft(t, T0 + 15_500)).toBe(44_500);
    expect(timerEndsAt(t)).toBe(T0 + 60_000);
    // a reload: the game is stored as JSON and read back, then asked again later
    const stored = check(Game, JSON.parse(JSON.stringify({ ...withGame().game!, timer: t })));
    expect(stored.ok).toBe(true);
    const back = stored.ok ? stored.value.timer! : t;
    expect(timerLeft(back, T0 + 42_000)).toBe(18_000);
    expect(formatTimer(timerLeft(back, T0 + 42_000))).toBe('0:18');
    expect(timerPhase(back, T0 + 42_000)).toBe('running');
    expect(timerPhase(back, T0 + 60_000)).toBe('done');
    expect(timerLeft(back, T0 + 3_600_000)).toBe(0);
  });

  test('pause keeps what is left (also across a reload), resume counts on from there', () => {
    let t = startTimer(newTimer(5 * 60_000), T0);
    t = pauseTimer(t, T0 + 70_000);
    expect(t).toEqual({ durationMs: 300_000, remainingMs: 230_000, startedAt: null, endEffect: 'glow' });
    expect(timerLeft(t, T0 + 999_999)).toBe(230_000); // paused: time doesn't run
    expect(timerPhase(t, T0)).toBe('paused');
    t = startTimer(t, T0 + 100_000);
    expect(timerLeft(t, T0 + 130_000)).toBe(200_000);
    expect(startTimer(t, T0 + 140_000)).toBe(t); // already running
    expect(resetTimer(t)).toEqual({ durationMs: 300_000, remainingMs: 300_000, startedAt: null, endEffect: 'glow' });
    expect(timerPhase(resetTimer(t), T0)).toBe('ready');
  });

  test('a run-out timer starts over; a screen whose clock is behind never adds time', () => {
    const done = startTimer(newTimer(30_000), T0);
    const again = startTimer(done, T0 + 45_000);
    expect(again.remainingMs).toBe(30_000);
    expect(again.startedAt).toBe(T0 + 45_000);
    expect(timerLeft(done, T0 - 5000)).toBe(30_000);
  });

  test('formatting rounds up to whole seconds; lengths are clamped', () => {
    expect(formatTimer(60_000)).toBe('1:00');
    expect(formatTimer(59_001)).toBe('1:00');
    expect(formatTimer(59_000)).toBe('0:59');
    expect(formatTimer(1)).toBe('0:01');
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(-50)).toBe('0:00');
    expect(newTimer(10).durationMs).toBe(1000);
    expect(newTimer(1e9).durationMs).toBe(5_999_000);
  });

  test('timer.set stores the whole value, null takes it off; game-wide, no undo step', () => {
    let s = withGame();
    const t = startTimer(newTimer(60_000, 'flash'), T0);
    s = run(s, { type: 'timer.set', timer: t });
    expect(s.game!.timer).toEqual(t);
    s = run(s, { type: 'map.add', map: pictureMap('m2'), activate: true });
    expect(s.game!.timer).toEqual(t);
    s = run(s, { type: 'timer.set', timer: null });
    expect(s.game!.timer).toBeNull();
    expect(apply(s, { type: 'timer.set', timer: null })).toEqual({ ok: true, state: s });
    expect(s.history.undo).toEqual([]);
    expect(checkCommand({ type: 'timer.set', timer: { ...t, durationMs: 500 } }).ok).toBe(false);
  });
});

describe('handouts', () => {
  const letter: Handout = { id: 'h1', name: 'A letter from the baron', kind: 'letter', file: null, text: 'Come alone.' };
  const map: Handout = { id: 'h2', name: 'Treasure map', kind: 'picture', file: FILE, text: '' };

  test('save, replace in place, insert at an index; show and back to the map', () => {
    let s = run(withGame(), { type: 'handout.save', handout: letter }, { type: 'handout.save', handout: map });
    expect(s.game!.handouts.map((h) => h.id)).toEqual(['h1', 'h2']);
    s = run(s, { type: 'handout.save', handout: { ...letter, text: 'Come alone. Tonight.' } });
    expect(s.game!.handouts.map((h) => h.text)).toEqual(['Come alone. Tonight.', '']);
    s = run(s, { type: 'handout.save', handout: map, index: 0 });
    expect(s.game!.handouts.map((h) => h.id)).toEqual(['h2', 'h1']);
    s = run(s, { type: 'handout.show', shown: { id: 'h2', place: 'full', side: 'top' } });
    expect(s.game!.handoutShown).toEqual({ id: 'h2', place: 'full', side: 'top' });
    s = run(s, { type: 'handout.show', shown: null });
    expect(s.game!.handoutShown).toBeNull();
  });

  test('deleting the shown handout takes it off the TV; Undo saves it back at its index', () => {
    let s = run(withGame(), { type: 'handout.save', handout: letter }, { type: 'handout.save', handout: map },
      { type: 'handout.show', shown: { id: 'h1', place: 'edge', side: 'bottom' } });
    s = run(s, { type: 'handout.remove', id: 'h1' });
    expect(s.game!.handouts.map((h) => h.id)).toEqual(['h2']);
    expect(s.game!.handoutShown).toBeNull();
    s = run(s, { type: 'handout.save', handout: letter, index: 0 });
    expect(s.game!.handouts.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  test('refusals: an unknown handout, a picture without its picture, more than 32', () => {
    expect(refused(withGame(), { type: 'handout.show', shown: { id: 'gone', place: 'edge', side: 'left' } })).toMatch(/gone/);
    expect(refused(withGame(), { type: 'handout.save', handout: { ...map, file: null } })).toMatch(/picture/);
    let s = withGame();
    for (let i = 0; i < 32; i++) s = run(s, { type: 'handout.save', handout: { ...letter, id: `x${i}` } });
    expect(refused(s, { type: 'handout.save', handout: { ...letter, id: 'one-more' } })).toMatch(/32/);
  });

  test('sides turn the handout upright for the people sitting there', () => {
    expect([sideTurn('bottom'), sideTurn('left'), sideTurn('top'), sideTurn('right')]).toEqual([0, 90, 180, -90]);
  });
});

describe('DM notes', () => {
  const note = { id: 'n1', x: 3.5, y: 4.25, text: 'Trap here' };

  test('add, edit, move as one gesture (one undo step), delete, undo and redo', () => {
    let s = run(withGame(pictureMap('m1', 20, 15)), { type: 'note.set', note });
    expect(active(s).notes).toEqual([note]);
    s = run(s, { type: 'note.set', note: { ...note, text: 'Trap here — DC 15' } });
    s = run(s, { type: 'note.set', note: { ...note, text: 'Trap here — DC 15', x: 4 }, gesture: 'g1' },
      { type: 'note.set', note: { ...note, text: 'Trap here — DC 15', x: 5, y: 99 }, gesture: 'g1' });
    expect(active(s).notes[0]).toEqual({ id: 'n1', x: 5, y: 15, text: 'Trap here — DC 15' }); // clamped onto the map
    expect(s.history.undo.length).toBe(3); // add, edit, the drag
    s = run(s, { type: 'history.undo' });
    expect(active(s).notes[0]!.x).toBe(3.5);
    s = run(s, { type: 'note.remove', id: 'n1' });
    expect(active(s).notes).toEqual([]);
    s = run(s, { type: 'history.undo' });
    expect(active(s).notes[0]!.text).toBe('Trap here — DC 15');
    s = run(s, { type: 'history.redo' });
    expect(active(s).notes).toEqual([]);
    expect(apply(s, { type: 'note.remove', id: 'n1' })).toEqual({ ok: true, state: s });
  });

  test('notes stay with their map', () => {
    let s = run(withGame(pictureMap('m1')), { type: 'map.add', map: pictureMap('m2'), activate: false }, { type: 'note.set', note });
    s = run(s, { type: 'map.switch', mapId: 'm2' });
    expect(active(s).notes).toEqual([]);
    expect(s.game!.maps.m1!.notes).toEqual([note]);
  });

  test('never in the players’ state: notes and their undo steps are taken out', () => {
    let s = run(withGame(pictureMap('m1')), { type: 'map.add', map: pictureMap('m2'), activate: false },
      { type: 'note.set', note }, { type: 'fog.all', value: 'reveal' }, { type: 'map.switch', mapId: 'm2' },
      { type: 'note.set', note: { id: 'n2', x: 1, y: 1, text: 'DC 15 lock' } }, { type: 'history.undo' });
    expect(JSON.stringify(s)).toContain('DC 15 lock'); // in the redo stack
    const players = withoutDmNotes(s);
    const text = JSON.stringify(players);
    expect(text).not.toContain('Trap here');
    expect(text).not.toContain('DC 15 lock');
    expect(Object.values(players.game!.maps).every((m) => m.notes.length === 0)).toBe(true);
    expect(players.history.undo.map((e) => e.kind)).toEqual(['fog']);
    expect(players.game!.maps.m1!.fog).toBe(s.game!.maps.m1!.fog); // everything else is the same
    expect(check(RootSchema, JSON.parse(text)).ok).toBe(true);
    const clean = withGame();
    expect(withoutDmNotes(clean)).toBe(clean);
  });

  test('refusals and the wire: empty text, too long, a map full of notes', () => {
    expect(checkCommand({ type: 'note.set', note: { ...note, text: '' } }).ok).toBe(false);
    expect(checkCommand({ type: 'note.set', note: { ...note, text: 'x'.repeat(201) } }).ok).toBe(false);
    expect(checkCommand({ type: 'note.remove', id: 'n1' }).ok).toBe(true);
    let s: RootState = withGame();
    const notes = Array.from({ length: 200 }, (_, i) => ({ ...note, id: `n${i}` }));
    s = { ...s, game: { ...s.game!, maps: { m1: { ...active(s), notes } } } };
    expect(refused(s, { type: 'note.set', note: { ...note, id: 'n-new' } })).toMatch(/200/);
  });
});

describe('old games', () => {
  test('a game stored before table moments reads as no timer, no handouts, no notes, no spotlight', () => {
    const g = JSON.parse(JSON.stringify(withGame().game!)) as Record<string, unknown> & { maps: Record<string, Record<string, unknown>> };
    delete g.timer;
    delete g.handouts;
    delete g.handoutShown;
    for (const m of Object.values(g.maps)) {
      delete m.notes;
      delete m.spotlight;
    }
    const r = check(Game, g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.timer).toBeNull();
    expect(r.value.handouts).toEqual([]);
    expect(r.value.handoutShown).toBeNull();
    expect(r.value.maps.m1!.notes).toEqual([]);
    expect(r.value.maps.m1!.spotlight).toBeNull();
  });
});
