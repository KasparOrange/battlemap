import { describe, expect, test } from 'bun:test';
import { FADE_MS, MAX_TOTAL_MS, RevealAnim, STAGGER_MS, WISPS_MS } from './reveal-anim.ts';

/** RGBA texels for a `cols × rows` map with the given squares revealed (R = 255). */
function texels(cols: number, rows: number, revealed: number[]): Uint8Array {
  const t = new Uint8Array(cols * rows * 4);
  for (const i of revealed) t[i * 4] = 255;
  return t;
}

/** The squares `from…to` (inclusive) of row 0. */
function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

const g = (t: Uint8Array, cell: number) => t[cell * 4 + 1]!;

describe('reveal animation', () => {
  test('wisps: squares start by distance from the fog already revealed', () => {
    const cols = 10;
    const prev = texels(cols, 1, [0]);
    const next = texels(cols, 1, range(0, 5));
    const anim = new RevealAnim();
    anim.style = 'wisps';
    expect(anim.start(prev, next, 0, cols)).toBe(5);
    // at 3 stagger steps: square 1 has been dissolving for 120 ms, square 4 has not started
    anim.step(next, cols, 3 * STAGGER_MS);
    expect(g(next, 0)).toBe(0);
    expect(g(next, 1)).toBeLessThan(255);
    expect(g(next, 1)).toBeLessThan(g(next, 2));
    expect(g(next, 2)).toBeLessThan(g(next, 3));
    expect(g(next, 4)).toBe(255);
    expect(g(next, 5)).toBe(255);
  });

  test('wisps: nothing revealed before → outward from the change\'s centre', () => {
    const cols = 9;
    const prev = texels(cols, 1, []);
    const next = texels(cols, 1, range(0, 8));
    const anim = new RevealAnim();
    anim.style = 'wisps';
    anim.start(prev, next, 0, cols);
    anim.step(next, cols, 2 * STAGGER_MS);
    expect(g(next, 4)).toBeLessThan(255);
    expect(g(next, 4)).toBeLessThan(g(next, 3));
    expect(g(next, 3)).toBe(g(next, 5));
    expect(g(next, 0)).toBe(255);
  });

  test('wisps: a long reveal still ends within the cap', () => {
    const cols = 120;
    const prev = texels(cols, 1, [0]);
    const next = texels(cols, 1, range(0, 119));
    const anim = new RevealAnim();
    anim.style = 'wisps';
    anim.start(prev, next, 1000, cols);
    anim.step(next, cols, 1000 + MAX_TOTAL_MS - 50);
    expect(anim.active).toBeGreaterThan(0);
    expect(g(next, 119)).toBeGreaterThan(0);
    anim.step(next, cols, 1000 + MAX_TOTAL_MS);
    expect(anim.active).toBe(0);
    for (let i = 0; i < cols; i++) expect(g(next, i)).toBe(0);
  });

  test('wisps: one square lasts WISPS_MS, the plain fade FADE_MS with no stagger', () => {
    const cols = 4;
    const anim = new RevealAnim();
    anim.style = 'wisps';
    const a = texels(cols, 1, range(0, 1));
    anim.start(texels(cols, 1, [0]), a, 0, cols);
    anim.step(a, cols, WISPS_MS - 1);
    expect(anim.active).toBe(1);
    anim.step(a, cols, WISPS_MS);
    expect(anim.active).toBe(0);

    const fade = new RevealAnim();
    const b = texels(cols, 1, range(0, 3));
    expect(fade.start(texels(cols, 1, [0]), b, 0, cols)).toBe(3);
    fade.step(b, cols, 100);
    expect(g(b, 1)).toBe(g(b, 3));
    fade.step(b, cols, FADE_MS);
    expect(fade.active).toBe(0);
  });

  test('hiding is instant, also mid-animation', () => {
    const cols = 4;
    const anim = new RevealAnim();
    anim.style = 'wisps';
    const prev = texels(cols, 1, [0]);
    const next = texels(cols, 1, range(0, 2));
    anim.start(prev, next, 0, cols);
    anim.step(next, cols, 200);
    // the DM hides square 2 again
    const hidden = next.slice();
    hidden[2 * 4] = 0;
    expect(anim.start(next, hidden, 210, cols)).toBe(0);
    expect(g(hidden, 2)).toBe(0);
    anim.step(hidden, cols, 220);
    expect(g(hidden, 2)).toBe(0);
    expect(anim.active).toBe(1); // only square 1 still dissolving
  });

  test('a square revealed again while animating starts over and wins', () => {
    const cols = 4;
    const anim = new RevealAnim();
    anim.style = 'wisps';
    const a = texels(cols, 1, [0, 1]);
    anim.start(texels(cols, 1, [0]), a, 0, cols);
    anim.step(a, cols, 600);
    const late = g(a, 1);
    expect(late).toBeLessThan(255);
    const hidden = a.slice();
    hidden[4] = 0;
    anim.start(a, hidden, 610, cols);
    const again = hidden.slice();
    again[4] = 255;
    anim.start(hidden, again, 620, cols);
    expect(g(again, 1)).toBe(255);
    anim.step(again, cols, 700);
    expect(g(again, 1)).toBeGreaterThan(late); // the new start, not the old one
    anim.step(again, cols, 620 + WISPS_MS);
    expect(anim.active).toBe(0);
    expect(g(again, 1)).toBe(0);
  });

  test('finished → no more work, nothing written', () => {
    const cols = 2;
    const anim = new RevealAnim();
    anim.style = 'wisps';
    const t = texels(cols, 1, [0, 1]);
    anim.start(texels(cols, 1, []), t, 0, cols);
    anim.step(t, cols, 5000);
    expect(anim.active).toBe(0);
    const before = t.slice();
    expect(anim.step(t, cols, 6000)).toBe(false);
    expect(t).toEqual(before);
  });
});
