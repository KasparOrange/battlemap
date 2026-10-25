import { describe, expect, test } from 'bun:test';
import { BASE_ALPHA, flicker, lightLook } from './light-look.ts';

describe('map lights (RD-120)', () => {
  test('a file light becomes a pool: position and radius in world units, colour, alpha by intensity', () => {
    const l = lightLook({ x: 3.5, y: 2, range: 4, intensity: 1, color: '#ffa040' }, 64, 0)!;
    expect(l).toMatchObject({ x: 224, y: 128, radius: 256, tint: 0xffa040, alpha: BASE_ALPHA });
    expect(l.flicker).toBeGreaterThan(0.1); // warm: flickers like a flame
    const cold = lightLook({ x: 0, y: 0, range: 2, intensity: 0.5, color: '#4080ff' }, 64, 1)!;
    expect(cold.flicker).toBeLessThan(0.1);
    expect(cold.alpha).toBeLessThan(BASE_ALPHA);
  });

  test('lights without range or intensity give none; intensity over 1 is capped', () => {
    expect(lightLook({ x: 0, y: 0, range: 0, intensity: 1, color: '#ffffff' }, 64, 0)).toBeNull();
    expect(lightLook({ x: 0, y: 0, range: 3, intensity: 0, color: '#ffffff' }, 64, 0)).toBeNull();
    expect(lightLook({ x: 0, y: 0, range: 3, intensity: 7, color: '#ffffff' }, 64, 0)!.alpha).toBe(BASE_ALPHA);
  });

  test('flicker stays within 1 ± strength and moves', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 10; t += 0.033) {
      const f = flicker(t, 1.2, 0.16);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
    expect(lo).toBeGreaterThanOrEqual(0.84 - 1e-9);
    expect(hi).toBeLessThanOrEqual(1.16 + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.1);
  });
});
