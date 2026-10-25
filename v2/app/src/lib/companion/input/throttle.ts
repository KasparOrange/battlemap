/**
 * Rate limits for what a drag sends (architecture.md "input"): the disc, ruler, measure line and
 * live stroke go out at most 30 times a second, the table window every 80 ms. The newest value
 * always wins and the last one is never lost (`flush` on release). Tested under `bun test`.
 */

/** Disc, ruler, measure and live stroke: at most this many sends per second. */
export const LIVE_PER_SECOND = 30;

/** A rate-limited sender. */
export interface Throttle<T> {
  /** Offers a value: sent now if the interval has passed, else kept as the trailing value. */
  push(value: T): void;
  /** Sends the kept value at once (end of a drag). */
  flush(): void;
  /** Drops the kept value and any timer (cancelled drag). */
  cancel(): void;
}

/** Clock and timer hooks, replaceable in tests. */
export interface ThrottleClock {
  /** Milliseconds now. */
  now(): number;
  /** Schedules a call. */
  later(fn: () => void, ms: number): unknown;
  /** Cancels a scheduled call. */
  clear(handle: unknown): void;
}

const realClock: ThrottleClock = {
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * A sender that passes at most one value per `intervalMs`, the newest one, with a trailing send.
 *
 * @param intervalMs - least time between two sends
 * @param send - receives the values
 * @param clock - clock hooks (tests)
 * @returns the throttle
 */
export function throttle<T>(intervalMs: number, send: (value: T) => void, clock: ThrottleClock = realClock): Throttle<T> {
  let lastSent = -Infinity;
  let kept: { value: T } | null = null;
  let timer: unknown = null;

  const fire = () => {
    timer = null;
    if (!kept) return;
    const { value } = kept;
    kept = null;
    lastSent = clock.now();
    send(value);
  };

  return {
    push(value) {
      kept = { value };
      const wait = lastSent + intervalMs - clock.now();
      if (wait <= 0) {
        if (timer !== null) clock.clear(timer);
        fire();
      } else if (timer === null) {
        timer = clock.later(fire, wait);
      }
    },
    flush() {
      if (timer !== null) clock.clear(timer);
      fire();
    },
    cancel() {
      if (timer !== null) clock.clear(timer);
      timer = null;
      kept = null;
    },
  };
}
