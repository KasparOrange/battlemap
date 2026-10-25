import { describe, expect, test } from 'bun:test';
import { fadeCover, fadePhases } from './envelope.ts';

describe('screen-fade envelope', () => {
  test('in, hold, out add up to the duration; short fades split in thirds', () => {
    expect(fadePhases(2.5)).toEqual({ fadeIn: 0.6, hold: 2.5 - 1.4, fadeOut: 0.8 });
    const short = fadePhases(0.9);
    expect(short.fadeIn).toBeCloseTo(0.3);
    expect(short.fadeOut).toBeCloseTo(0.3);
    expect(short.hold).toBeCloseTo(0.3);
  });

  test('covers from 0 to 1, holds, and goes back to 0', () => {
    const p = fadePhases(2.5);
    expect(fadeCover(0, p)).toBe(0);
    expect(fadeCover(0.3, p)).toBeCloseTo(0.5);
    expect(fadeCover(1, p)).toBe(1);
    expect(fadeCover(2.5 - 0.4, p)).toBeCloseTo(0.5);
    expect(fadeCover(2.6, p)).toBe(0);
  });
});
