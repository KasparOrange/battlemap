/**
 * The tablet's timer readouts tick with this: one call per printed second while the countdown
 * runs (a plain timeout at the next whole second — no frame loop), none while it is stopped.
 */
import type { Timer } from '@battlemap/shared';
import { readoutNextMs } from './moments-logic.ts';

/**
 * Calls `onTick` with the server's clock now, then at every change of the printed seconds while
 * the timer runs.
 *
 * @param t - the timer
 * @param serverNow - the server's clock
 * @param onTick - gets the clock at each tick
 * @param timers - the timeout functions (tests pass their own)
 * @returns a function that stops the ticking
 */
export function followTimer(
  t: Timer,
  serverNow: () => number,
  onTick: (now: number) => void,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): () => void {
  let handle: unknown = null;
  const tick = () => {
    handle = null;
    const now = serverNow();
    onTick(now);
    const ms = readoutNextMs(t, now);
    if (ms !== null) handle = timers.set(tick, ms);
  };
  tick();
  return () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
  };
}
