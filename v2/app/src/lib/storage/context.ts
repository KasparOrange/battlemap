/**
 * What every store needs: the database (opened once, lazily), the logger, and a way to tell the
 * user that storage is in trouble (the app wires the kit's notice store; tests record).
 */
import type { Logger } from '../log.ts';

/** Shared by the games, settings and file stores. */
export interface StorageContext {
  /** The open database (the same promise every time). */
  db: () => Promise<IDBDatabase>;
  /** The logger. */
  log: Logger;
  /**
   * Shows a problem to the user ("Storage on this device is full…"). Called at most once per
   * {@link PROBLEM_REPEAT_MS} for the same text.
   */
  notify: (text: string, kind: 'warning' | 'error') => void;
}

/** A problem notice is not repeated within this many ms (a full disk fails every save). */
export const PROBLEM_REPEAT_MS = 60_000;

/** The notice for a full device. */
export const FULL_TEXT = 'Storage on this device is full — old map files were cleared. Free some space if it keeps happening.';

/**
 * Wraps a notifier so the same text shows at most once per {@link PROBLEM_REPEAT_MS}.
 *
 * @param notify - the real notifier
 * @param now - the clock (tests)
 * @returns the throttled notifier
 */
export function throttledNotify(
  notify: StorageContext['notify'],
  now: () => number = Date.now,
): StorageContext['notify'] {
  const last = new Map<string, number>();
  return (text, kind) => {
    const t = now();
    const prev = last.get(text);
    if (prev !== undefined && t - prev < PROBLEM_REPEAT_MS) return;
    last.set(text, t);
    notify(text, kind);
  };
}

/**
 * Opens something once and hands out the same promise; a failed open is retried on the next
 * call (a database that was blocked may open later).
 *
 * @param open - opens it
 * @returns the getter
 */
export function once<T>(open: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) p = open().catch((err: unknown) => { p = null; throw err; });
    return p;
  };
}
