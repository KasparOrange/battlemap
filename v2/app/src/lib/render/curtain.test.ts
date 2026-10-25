/**
 * The curtain's clock: falls and holds the old state, covers, waits for the map before it
 * rises, finishes a fall before a quick lift, snaps for a new game — and never lets a change
 * made behind it show before the lift.
 */
import { describe, expect, test } from 'bun:test';
import { CurtainClock, type CurtainTimings } from './curtain-clock.ts';

const T: CurtainTimings = { fallMs: 100, riseMs: 200, dwellMs: 50, readyWaitMs: 1000 };

/** Steps the clock in 10 ms frames until `until` and returns the last frame. */
function run(c: CurtainClock, from: number, until: number, ready = true) {
  let f = c.step(from, ready);
  for (let t = from + 10; t <= until; t += 10) f = c.step(t, ready);
  return f;
}

describe('the curtain clock', () => {
  test('down: falls (holding the old state), then covers and stops animating', () => {
    const c = new CurtainClock(T);
    expect(c.want(true, 0)).toBe(true);
    const mid = run(c, 0, 50);
    expect(mid).toMatchObject({ phase: 'falling', hold: true, animating: true });
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    const down = run(c, 60, 120);
    expect(down).toMatchObject({ phase: 'down', alpha: 1, hold: false, animating: false });
  });

  test('up: waits for the map behind, then rises in one fade', () => {
    const c = new CurtainClock(T);
    c.want(true, 0);
    run(c, 0, 200);
    expect(c.want(false, 200)).toBe(false);
    expect(run(c, 200, 400, false)).toMatchObject({ phase: 'down', alpha: 1, animating: true }); // the map still loads
    expect(c.step(410, true).phase).toBe('rising');
    expect(run(c, 420, 700)).toMatchObject({ phase: 'up', alpha: 0, animating: false });
  });

  test('a map that never gets ready rises after the longest wait', () => {
    const c = new CurtainClock(T);
    c.want(true, 0);
    run(c, 0, 200);
    c.want(false, 200);
    expect(run(c, 200, 1150, false).phase).toBe('down');
    expect(run(c, 1160, 1250, false).phase).toBe('rising');
  });

  test('a quick lift while falling: the fall finishes, the curtain dwells, nothing half-done shows', () => {
    const c = new CurtainClock(T);
    c.want(true, 0);
    run(c, 0, 30);
    expect(c.want(false, 30)).toBe(true); // still falling: still holding
    let sawDown = false;
    let lastAlpha = 0;
    for (let t = 40; t <= 600; t += 10) {
      const f = c.step(t, true);
      if (f.phase === 'down') sawDown = true;
      // until fully down the old state is held; the alpha never drops before it was 1
      if (!sawDown) expect(f.hold).toBe(true);
      if (!sawDown) expect(f.alpha).toBeGreaterThanOrEqual(lastAlpha);
      lastAlpha = f.alpha;
    }
    expect(sawDown).toBe(true);
    expect(c.current).toBe('up');
  });

  test('down again while rising falls back from where it was, holding what shows', () => {
    const c = new CurtainClock(T);
    c.want(true, 0);
    run(c, 0, 200);
    c.want(false, 200);
    const rising = run(c, 200, 300);
    expect(rising.phase).toBe('rising');
    expect(c.want(true, 300)).toBe(true);
    const f = c.step(310, true);
    expect(f.phase).toBe('falling');
    expect(f.alpha).toBeGreaterThan(0.3);
  });

  test('snap: a new game behind the curtain shows it down at once, no hold', () => {
    const c = new CurtainClock(T);
    expect(c.want(true, 0, true)).toBe(false);
    expect(c.step(0, true)).toMatchObject({ phase: 'down', alpha: 1, hold: false, animating: false });
    expect(c.want(false, 10, true)).toBe(false);
    expect(c.step(10, true)).toMatchObject({ phase: 'up', alpha: 0 });
  });
});
