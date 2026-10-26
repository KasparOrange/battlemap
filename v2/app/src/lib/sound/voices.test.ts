/**
 * One-shot bookkeeping: the voice limit steals the oldest, a double tap is dropped, and the
 * shot gate seeds on the first state, plays each new id once and skips stale shots.
 */
import { describe, expect, test } from 'bun:test';
import { admitVoice, REPEAT_MS, ShotGate, STALE_MS } from './voices.ts';

describe('the voice limit', () => {
  const voices = [
    { id: 'a', sound: 'thunder', startedAt: 100 },
    { id: 'b', sound: 'door-slam', startedAt: 50 },
    { id: 'c', sound: 'coins', startedAt: 200 },
  ];

  test('room left: nothing stolen', () => {
    expect(admitVoice(voices, 'roar', 1000, 4)).toEqual({ skip: false, steal: [] });
  });

  test('full: the oldest make room', () => {
    expect(admitVoice(voices, 'roar', 1000, 3)).toEqual({ skip: false, steal: ['b'] });
    expect(admitVoice(voices, 'roar', 1000, 2)).toEqual({ skip: false, steal: ['b', 'a'] });
  });

  test('the same sound right after itself is a double tap', () => {
    expect(admitVoice(voices, 'coins', 200 + REPEAT_MS - 1).skip).toBe(true);
    expect(admitVoice(voices, 'coins', 200 + REPEAT_MS + 1).skip).toBe(false);
  });
});

describe('the shot gate', () => {
  test('the first state only seeds; later new ids play once', () => {
    const gate = new ShotGate();
    expect(gate.take([{ id: 'old', at: 0 }], 1000)).toEqual([]);
    const next = [{ id: 'old', at: 0 }, { id: 'new', at: 990 }];
    expect(gate.take(next, 1000).map((s) => s.id)).toEqual(['new']);
    expect(gate.take(next, 1001)).toEqual([]);
  });

  test('a shot long over is skipped (stale), a slightly skewed one plays', () => {
    const gate = new ShotGate();
    gate.take([], 0);
    expect(gate.judge({ id: 'a', at: 0 }, STALE_MS + 1)).toBe('stale');
    expect(gate.judge({ id: 'b', at: 5000 }, 1000)).toBe('play'); // tablet clock ahead
    expect(gate.judge({ id: 'b', at: 5000 }, 1000)).toBe('seen');
  });

  test('remembers a bounded number of ids', () => {
    const gate = new ShotGate(2);
    gate.take([], 0);
    gate.take([{ id: 'a', at: 0 }, { id: 'b', at: 0 }, { id: 'c', at: 0 }], 0);
    expect(gate.judge({ id: 'a', at: 0 }, 0)).toBe('play'); // forgotten
  });
});
