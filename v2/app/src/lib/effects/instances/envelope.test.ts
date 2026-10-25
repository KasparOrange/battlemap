import { describe, expect, test } from 'bun:test';
import { fadeCover, fadePhases } from './envelope.ts';

describe('screen-fade envelope', () => {
  test('in, hold, out add up to the duration; short fades split in thirds', () => {
    const p = fadePhases(2.5);
    expect(p.fadeIn).toBe(0.6);
    expect(p.fadeOut).toBe(0.8);
    expect(p.hold).toBeCloseTo(1.1, 9);
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

describe('lightning flash (lightning-storm on the CPU)', () => {
  test('mostly dark, a few strikes that decay', async () => {
    const { lightningFlash } = await import('./envelope.ts');
    let lit = 0;
    let peak = 0;
    for (let t = 0; t < 70; t += 1 / 60) {
      const f = lightningFlash(t, 7);
      if (f > 0) lit++;
      peak = Math.max(peak, f);
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(lit / (70 * 60)).toBeLessThan(0.15); // dark most of the time: the quad is hidden then
  });
});
