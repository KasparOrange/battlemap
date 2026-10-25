/**
 * The last log lines of this page, kept in memory for the developer screen (parity LG-06): a
 * ring of the newest `size` lines (default 500) and listeners told of each new one. Fed by the
 * logger with every line it ships — the same lines MwLog gets, including the global error
 * catchers' and the summary `count` lines — so they arrive in the logger's batches (≤ 3 s).
 * Plain TS, tested under `bun test`.
 *
 * Usage: `logRing.lines()` for what is there, `logRing.subscribe((line) => …)` (returns the
 * unsubscribe), `logRing.clear()`.
 *
 * @see ./log.ts which feeds it
 */

/** One log line as the developer screen shows it. */
export interface LogEntry {
  /** ISO time the line was made. */
  ts: string;
  /** `debug`, `info`, `warn`, `error`. */
  level: string;
  /** The module area (`net`, `sync`, `tv`, …). */
  area: string;
  /** The message. */
  msg: string;
  /** Everything else on the line (props and context). */
  props: Record<string, unknown>;
}

/** A ring of recent log lines with listeners. */
export class LogRing {
  private readonly buf: LogEntry[] = [];
  private readonly listeners = new Set<(line: LogEntry) => void>();

  /** @param size - how many lines are kept (the oldest go first) */
  constructor(readonly size = 500) {}

  /**
   * Adds lines as the logger ships them (`{ts, level, area, msg, …props}`).
   *
   * @param lines - the batch
   */
  push(lines: readonly unknown[]): void {
    for (const raw of lines) {
      if (!raw || typeof raw !== 'object') continue;
      const { ts, level, area, msg, ...props } = raw as Record<string, unknown>;
      const line: LogEntry = { ts: String(ts ?? ''), level: String(level ?? 'info'), area: String(area ?? ''), msg: String(msg ?? ''), props };
      this.buf.push(line);
      if (this.buf.length > this.size) this.buf.splice(0, this.buf.length - this.size);
      for (const fn of this.listeners) {
        try {
          fn(line);
        } catch {
          // a broken listener must not break logging
        }
      }
    }
  }

  /**
   * The kept lines, oldest first (a copy).
   *
   * @returns the lines
   */
  lines(): LogEntry[] {
    return this.buf.slice();
  }

  /**
   * Calls `fn` for every new line.
   *
   * @param fn - the listener
   * @returns a function that removes it
   */
  subscribe(fn: (line: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Forgets the kept lines (the listeners stay). */
  clear(): void {
    this.buf.length = 0;
  }
}
