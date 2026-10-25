/**
 * Small helpers TV mode shares: injectable timers, a timeout for promises, error text.
 */

/** Timer functions (tests pass fake ones). */
export interface Timers {
  /** Like `setTimeout`. */
  set(fn: () => void, ms: number): unknown;
  /** Like `clearTimeout`. */
  clear(handle: unknown): void;
}

/** The global timers. */
export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * The text of an error for logs and notices.
 *
 * @param e - anything thrown
 * @returns its message
 */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * `p`, or a rejection after `ms`.
 *
 * @param p - the promise
 * @param ms - the limit
 * @param timers - the timers
 * @returns what `p` resolves to
 * @throws Error when `ms` passes first
 */
export function withTimeout<T>(p: Promise<T>, ms: number, timers: Timers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = timers.set(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { timers.clear(h); resolve(v); }, (e: unknown) => { timers.clear(h); reject(e); });
  });
}
