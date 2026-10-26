/// <reference types="bun" />
/**
 * Tests of the moments layer's pure parts: the spotlight's centre (square, token, hidden on the
 * TV), the countdown's face across a reload (server clock), when it next changes, the end effect
 * played only right after the end, the rings' places on both long edges, and note hits.
 */
import { describe, expect, test } from 'bun:test';
import { newGame, newTimer, pauseTimer, startTimer, wholeGrid, type MapInfo, type MapPlay } from '@battlemap/shared';
import { END_EFFECT_MS, endEffectDue, noteAt, noteLabel, ringPlaces, spotlightCenter, timerFace } from './moments-logic.ts';

const info: MapInfo = {
  id: 'm1', name: 'Crypt', kind: 'picture', picture: { hash: '0123456789abcdef', ext: 'png', bytes: 10 }, tableCopy: null, geometry: null,
  grid: wholeGrid(20, 15, 2000, 1500), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
};

function mapWith(patch: Partial<MapPlay>): MapPlay {
  const game = newGame({ id: 'g', name: 'G', createdAt: '2026-10-25T20:00:00.000Z', map: info });
  return { ...game.maps.m1!, ...patch };
}

const goblin = { id: 't1', label: '1', name: 'Goblin', color: '#e05050', col: 6, row: 2, placed: true, hidden: false };

describe('spotlight', () => {
  test('a square: its centre; a token: where it stands', () => {
    expect(spotlightCenter({ target: { kind: 'square', col: 3, row: 4 }, dim: 0.3 }, mapWith({}), false)).toEqual({ x: 3.5, y: 4.5 });
    const m = mapWith({ tokens: [goblin] });
    expect(spotlightCenter({ target: { kind: 'token', tokenId: 't1' }, dim: 0.3 }, m, false)).toEqual({ x: 6.5, y: 2.5 });
  });

  test('nothing for no spotlight, a gone or waiting token, a hidden token on the TV (the DM still sees it)', () => {
    const spot = { target: { kind: 'token' as const, tokenId: 't1' }, dim: 0.3 };
    expect(spotlightCenter(null, mapWith({}), false)).toBeNull();
    expect(spotlightCenter(spot, mapWith({}), false)).toBeNull();
    expect(spotlightCenter(spot, mapWith({ tokens: [{ ...goblin, placed: false }] }), true)).toBeNull();
    const hidden = mapWith({ tokens: [{ ...goblin, hidden: true }] });
    expect(spotlightCenter(spot, hidden, false)).toBeNull();
    expect(spotlightCenter(spot, hidden, true)).toEqual({ x: 6.5, y: 2.5 });
  });
});

describe('countdown face', () => {
  const T0 = 1_761_400_000_000;

  test('running: digits, ring share, next change at the next whole second, pulse in the last ten', () => {
    const t = startTimer(newTimer(60_000), T0);
    const f = timerFace(t, T0 + 15_300);
    expect(f).toMatchObject({ text: '0:45', phase: 'running', pulse: false, nextChangeMs: 700 });
    expect(f.fraction).toBeCloseTo(44_700 / 60_000, 6);
    expect(timerFace(t, T0 + 16_000).nextChangeMs).toBe(1000);
    expect(timerFace(t, T0 + 51_000)).toMatchObject({ text: '0:09', pulse: true });
  });

  test('a TV reloading mid-countdown shows the same as one that never left (the state is all it needs)', () => {
    const t = startTimer(newTimer(5 * 60_000), T0);
    const stored = JSON.parse(JSON.stringify(t)) as typeof t;
    expect(timerFace(stored, T0 + 123_456)).toEqual(timerFace(t, T0 + 123_456));
    expect(timerFace(stored, T0 + 123_456).text).toBe('2:57');
  });

  test('paused and ready: no ticking, no pulse', () => {
    const paused = pauseTimer(startTimer(newTimer(30_000), T0), T0 + 25_000);
    expect(timerFace(paused, T0 + 99_000)).toMatchObject({ text: '0:05', phase: 'paused', pulse: false, nextChangeMs: null });
    expect(timerFace(newTimer(30_000), T0)).toMatchObject({ text: '0:30', phase: 'ready', fraction: 1, nextChangeMs: null });
  });

  test('the end effect plays right after the end, not for a TV that comes back long after', () => {
    const t = startTimer(newTimer(30_000, 'flash'), T0);
    const end = timerFace(t, T0 + 30_000);
    expect(end).toMatchObject({ text: '0:00', phase: 'done', fraction: 0, sinceEndMs: 0, nextChangeMs: null });
    expect(endEffectDue(end)).toBe(true);
    expect(endEffectDue(timerFace(t, T0 + 30_000 + END_EFFECT_MS - 1))).toBe(true);
    expect(endEffectDue(timerFace(t, T0 + 30_000 + END_EFFECT_MS + 5000))).toBe(false);
    expect(endEffectDue(timerFace(newTimer(30_000), T0))).toBe(false);
  });
});

describe('rings and notes', () => {
  test('two rings at the middle of the long edges, each upright for its side', () => {
    const [bottom, top] = ringPlaces({ width: 1920, height: 1080 });
    expect(bottom!.x).toBe(960);
    expect(top!.x).toBe(960);
    expect(bottom!.y).toBeGreaterThan(900);
    expect(top!.y).toBeLessThan(180);
    expect(bottom!.y + top!.y).toBeCloseTo(1080, 6);
    expect([bottom!.rotation, top!.rotation]).toEqual([0, Math.PI]);
    expect(bottom!.r).toBeCloseTo(63, 0); // about 1.1 in on a 34.5 in TV
    const [left, right] = ringPlaces({ width: 1080, height: 1920 });
    expect([left!.rotation, right!.rotation]).toEqual([Math.PI / 2, -Math.PI / 2]);
  });

  test('the nearest note under a finger; labels are the first line, cut', () => {
    const notes = [{ id: 'a', x: 2, y: 2, text: 'Trap here' }, { id: 'b', x: 2.4, y: 2, text: 'DC 15 lock\nkey in the well' }];
    expect(noteAt(notes, { x: 2.3, y: 2.05 }, 0.5)?.id).toBe('b');
    expect(noteAt(notes, { x: 5, y: 5 }, 0.5)).toBeNull();
    expect(noteLabel('DC 15 lock\nkey in the well')).toBe('DC 15 lock');
    expect(noteLabel('A very long note that goes on and on and on')).toBe('A very long note that goes…');
  });
});
