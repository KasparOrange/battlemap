/// <reference types="bun" />
/**
 * The Moments tab: the spotlight's tap rule (token first, square else, the lit one again = out),
 * board names, the panel's words, the timer buttons across start / pause / end on the server's
 * clock, the readout's once-a-second ticking, handout names, note order — and the tool on a fake
 * game screen (tap → spotlight.set, tap on a pin → its dialog, drag a pin → one gesture, long
 * press → a new note, not in Draw / Fog, never outside the map).
 */
import '../../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { newTimer, type Command, type DmNote, type Handout, type Token } from '@battlemap/shared';
import { fakeContext } from '../../game/fake-context.ts';
import type { GameContext } from '../../game/tabs.ts';
import { momentsLocal } from './local.svelte.ts';
import {
  dimOption, handoutSub, letterName, notesInOrder, pictureName, presetTimer, readoutNextMs, spotlightAfterTap, spotlightText,
  squareName, timerAction, timerStatus, timerToggled, timerWithLength,
} from './moments-logic.ts';
import { followTimer } from './timer-clock.ts';
import { holdNote, momentsTool } from './tool.ts';

const goblin: Token = { id: 't1', label: '1', name: 'Goblin', color: '#e05050', col: 6, row: 2, placed: true, hidden: false };

describe('spotlight', () => {
  test('a tap lights the token under the finger, else the square; the lit one again puts it out', () => {
    const onToken = spotlightAfterTap(null, 't1', { col: 6, row: 2 }, 0.3);
    expect(onToken).toEqual({ target: { kind: 'token', tokenId: 't1' }, dim: 0.3 });
    expect(spotlightAfterTap(onToken, 't1', { col: 6, row: 2 }, 0.3)).toBeNull();
    const onSquare = spotlightAfterTap(onToken, null, { col: 3, row: 4 }, 0.5);
    expect(onSquare).toEqual({ target: { kind: 'square', col: 3, row: 4 }, dim: 0.5 });
    expect(spotlightAfterTap(onSquare, null, { col: 3, row: 4 }, 0.5)).toBeNull();
    expect(spotlightAfterTap(onSquare, null, { col: 3, row: 5 }, 0.5)?.target).toEqual({ kind: 'square', col: 3, row: 5 });
  });

  test('board names and the panel line', () => {
    expect(squareName(0, 0)).toBe('A1');
    expect(squareName(2, 3)).toBe('C4');
    expect(squareName(25, 0)).toBe('Z1');
    expect(squareName(26, 9)).toBe('AA10');
    const ctx = fakeContext();
    const map = ctx.map;
    expect(spotlightText(map)).toBe('Off');
    expect(spotlightText({ ...map, spotlight: { target: { kind: 'square', col: 2, row: 3 }, dim: 0.3 } })).toBe('On square C4');
    const lit = { ...map, tokens: [goblin], spotlight: { target: { kind: 'token' as const, tokenId: 't1' }, dim: 0.3 } };
    expect(spotlightText(lit)).toBe('On Goblin (G3)');
    expect(spotlightText({ ...lit, tokens: [{ ...goblin, hidden: true }] })).toBe('On Goblin (G3) · hidden from the players');
    expect(spotlightText({ ...lit, tokens: [] })).toBe('Its token left the map');
    expect(dimOption(0)).toBe('none');
    expect(dimOption(0.32)).toBe('little');
    expect(dimOption(0.6)).toBe('more');
  });
});

describe('timer', () => {
  const T0 = 1_800_000_000_000;

  test('a preset runs at once; the button pauses, resumes, starts over once it ran out', () => {
    const t = presetTimer(30_000, 'glow', T0);
    expect(t).toEqual({ durationMs: 30_000, remainingMs: 30_000, startedAt: T0, endEffect: 'glow' });
    expect(timerAction(t, T0 + 1000)).toBe('pause');
    expect(timerStatus(t, T0 + 1000)).toBe('Running · of 0:30');
    const paused = timerToggled(t, T0 + 12_000);
    expect(paused).toEqual({ ...t, remainingMs: 18_000, startedAt: null });
    expect(timerAction(paused, T0 + 50_000)).toBe('resume');
    expect(timerStatus(paused, T0 + 50_000)).toBe('Paused · of 0:30');
    const again = timerToggled(paused, T0 + 60_000);
    expect(again.startedAt).toBe(T0 + 60_000);
    expect(timerAction(again, T0 + 60_000 + 18_000)).toBe('again');
    expect(timerStatus(again, T0 + 60_000 + 18_000)).toBe('Ran out');
    expect(timerToggled(again, T0 + 100_000)).toEqual({ ...t, startedAt: T0 + 100_000 });
  });

  test('a new length resets the timer, clamped; a stopped one says ready', () => {
    const t = timerWithLength(presetTimer(30_000, 'none', T0), 90_000, 'glow');
    expect(t).toEqual({ durationMs: 90_000, remainingMs: 90_000, startedAt: null, endEffect: 'none' });
    expect(timerAction(t, T0)).toBe('start');
    expect(timerStatus(t, T0)).toBe('Ready · 1:30');
    expect(timerWithLength(null, 10, 'flash')).toEqual(newTimer(1000, 'flash'));
  });

  test('the readout ticks at each printed second while running, never while stopped', () => {
    const t = presetTimer(10_000, 'glow', T0);
    expect(readoutNextMs(t, T0)).toBe(1008);
    expect(readoutNextMs(t, T0 + 250)).toBe(758);
    expect(readoutNextMs({ ...t, startedAt: null }, T0)).toBeNull();
    expect(readoutNextMs(t, T0 + 20_000)).toBeNull();

    let clock = T0 + 9_500;
    const due: Array<() => void> = [];
    const seen: number[] = [];
    const stop = followTimer(t, () => clock, (n) => seen.push(n), { set: (fn) => due.push(fn), clear: () => due.splice(0) });
    expect(seen).toEqual([T0 + 9_500]);
    expect(due.length).toBe(1);
    clock = T0 + 10_008;
    due.shift()!();
    expect(seen.length).toBe(2);
    expect(due.length).toBe(0); // ran out: nothing more to draw
    stop();
  });
});

describe('handouts and notes', () => {
  test('names and lines', () => {
    const letter: Handout = { id: 'h1', name: 'L', kind: 'letter', file: null, text: 'Meet me at the old mill at dusk.' };
    expect(handoutSub(letter)).toBe('Letter · 8 words');
    expect(handoutSub({ ...letter, text: 'One' })).toBe('Letter · 1 word');
    expect(handoutSub({ ...letter, kind: 'picture', text: '' })).toBe('Picture');
    expect(handoutSub({ ...letter, kind: 'picture', text: 'From the crypt' })).toBe('Picture · with a caption');
    expect(letterName('  ', 'Dear Elrin,\nthe vault opens at moonrise')).toBe('Dear Elrin,');
    expect(letterName('', '')).toBe('Letter');
    expect(letterName('The vow', 'x')).toBe('The vow');
    expect(letterName('', 'a'.repeat(60))).toHaveLength(40);
    expect(pictureName('map_of-the crypt.webp')).toBe('map of the crypt');
    expect(pictureName('.png')).toBe('Picture');
  });

  test('notes list top to bottom, then left to right', () => {
    const n = (id: string, x: number, y: number): DmNote => ({ id, x, y, text: id });
    expect(notesInOrder([n('c', 3, 5.5), n('a', 7, 0.2), n('b', 2, 5.1)]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('the Moments tool', () => {
  /** A fake game screen with a goblin at (6, 2) and a note at (10.5, 4.5); the camera fits the map. */
  function screen() {
    const ctx = fakeContext();
    ctx.dispatch({ type: 'token.add', token: goblin });
    ctx.dispatch({ type: 'note.set', note: { id: 'n1', x: 10.5, y: 4.5, text: 'Trap here' } });
    ctx.sent.length = 0;
    momentsLocal.draft = null;
    momentsLocal.dim = 0.3;
    return ctx;
  }
  const spot = (cmds: Command[]) => cmds.filter((c) => c.type === 'spotlight.set');

  test('tap: the token, a square, the same again = out; outside the map nothing', () => {
    const ctx = screen();
    const tool = momentsTool(ctx);
    tool.tap!({ x: 6.5, y: 2.5 });
    expect(ctx.map.spotlight).toEqual({ target: { kind: 'token', tokenId: 't1' }, dim: 0.3 });
    tool.tap!({ x: 6.4, y: 2.6 });
    expect(ctx.map.spotlight).toBeNull();
    tool.tap!({ x: 3.2, y: 8.9 });
    expect(ctx.map.spotlight?.target).toEqual({ kind: 'square', col: 3, row: 8 });
    tool.tap!({ x: -1, y: 2 });
    expect(spot(ctx.sent)).toHaveLength(3);
  });

  test('a pin: claimed, a tap opens its dialog, a drag moves it in one gesture', () => {
    const ctx = screen();
    const tool = momentsTool(ctx);
    expect(tool.claims!({ x: 10.5, y: 4.5 })).toBe(true);
    expect(tool.claims!({ x: 2, y: 2 })).toBe(false);
    tool.tap!({ x: 10.52, y: 4.48 });
    expect(momentsLocal.draft).toEqual({ note: ctx.map.notes[0]!, isNew: false });
    expect(spot(ctx.sent)).toHaveLength(0);
    expect(tool.begin!({ x: 3, y: 3 }, { x: 4, y: 3 })).toBeNull();
    const drag = tool.begin!({ x: 10.5, y: 4.5 }, { x: 11, y: 4.5 })!;
    drag.move({ x: 12, y: 5 });
    drag.end({ x: 13.5, y: 6.5 });
    expect(ctx.map.notes[0]).toEqual({ id: 'n1', x: 13.5, y: 6.5, text: 'Trap here' });
    const moves = ctx.sent.filter((c) => c.type === 'note.set');
    expect(moves.length).toBeGreaterThan(0);
    expect(new Set(moves.map((c) => (c as { gesture?: string }).gesture)).size).toBe(1);
  });

  test('long press: a new note there (or the pin under it), not in Draw / Fog, not off the map', () => {
    const ctx = screen();
    const c = ctx as unknown as { tab: string } & GameContext;
    c.tab = 'tokens';
    expect(holdNote(ctx, { x: 4.2, y: 7.7 })).toBe(true);
    expect(momentsLocal.draft?.isNew).toBe(true);
    expect(momentsLocal.draft?.note).toMatchObject({ x: 4.2, y: 7.7, text: '' });
    expect(holdNote(ctx, { x: 10.5, y: 4.5 })).toBe(true);
    expect(momentsLocal.draft).toEqual({ note: ctx.map.notes[0]!, isNew: false });
    momentsLocal.draft = null;
    expect(holdNote(ctx, { x: -2, y: 3 })).toBe(false);
    for (const tab of ['draw', 'fog']) {
      c.tab = tab;
      expect(holdNote(ctx, { x: 4, y: 4 })).toBe(false);
    }
    expect(momentsLocal.draft).toBeNull();
  });
});
