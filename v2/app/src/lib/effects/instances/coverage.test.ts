import { describe, expect, test } from 'bun:test';
import { artCoverage } from './coverage.ts';

/** An atlas of two 10 × 10 frames side by side with a filled square of half-size `r` px each. */
function atlas(r0: number, r1: number): Uint8Array {
  const a = new Uint8Array(20 * 10);
  for (const [ox, r] of [[0, r0], [10, r1]] as const) {
    for (let y = 5 - r; y < 5 + r; y++) for (let x = 5 - r; x < 5 + r; x++) a[y * 20 + ox + x] = 255;
  }
  return a;
}

describe('art coverage of a sheet', () => {
  const frames = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }];
  test('the largest frame counts', () => {
    expect(artCoverage(atlas(2, 4), 20, frames)).toBeCloseTo(0.8, 5);
  });
  test('a full frame is 1, an empty one 1, a tiny one the floor', () => {
    expect(artCoverage(atlas(5, 5), 20, frames)).toBe(1);
    expect(artCoverage(new Uint8Array(200), 20, frames)).toBe(1);
    expect(artCoverage(atlas(1, 1), 20, frames)).toBe(0.6);
  });
});
