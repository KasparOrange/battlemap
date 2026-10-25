/**
 * The log outbox: posts log batches to the server's `/log`, and keeps a batch it couldn't
 * deliver in `localStorage` (≤ `maxLines`, oldest dropped first) so an outage's lines survive a
 * reload and arrive afterwards. Plain TS (no Svelte), so it is tested under `bun test`.
 *
 * @see ./log.ts which feeds it from mwlog-ts's browser forwarder
 */

/** The bit of `Storage` the outbox uses. */
export interface StorageLike {
  /** Reads a key. */
  getItem(key: string): string | null;
  /** Writes a key (may throw when full). */
  setItem(key: string, value: string): void;
  /** Removes a key. */
  removeItem(key: string): void;
}

/** Options of {@link createOutbox}. */
export interface OutboxOptions {
  /** Where batches are POSTed (`<server>/log`). */
  endpoint: string;
  /** Where undelivered lines wait; null keeps nothing. */
  storage: StorageLike | null;
  /** The HTTP transport (default the global `fetch`). */
  fetch?: typeof fetch;
  /** Most lines kept (default 1000). */
  maxLines?: number;
  /** Storage key (default `bm.log.outbox`). */
  key?: string;
  /** How often waiting lines are retried, ms (default 30 s; 0 = only after a delivery). */
  retryMs?: number;
}

/** A running outbox. */
export interface Outbox {
  /** Delivers a batch, or keeps it. Never rejects. */
  send(lines: readonly unknown[]): Promise<void>;
  /** Tries to deliver what is waiting. Resolves true when nothing is left. */
  drain(): Promise<boolean>;
  /** Lines waiting. */
  waiting(): number;
  /** Lines dropped because the outbox was full. */
  dropped(): number;
  /** Stops the retry timer. */
  close(): void;
}

/** Whether the page is being hidden or unloaded (then a request must outlive it). */
function pageHidden(): boolean {
  return (globalThis as { document?: { visibilityState?: string } }).document?.visibilityState === 'hidden';
}

/** Lines per drain request (the server takes at most 200 lines / 64 KB per batch). */
const DRAIN_LINES = 100;

/**
 * Creates an outbox.
 *
 * @param opts - endpoint, storage, transport, limits
 * @returns the outbox
 */
export function createOutbox(opts: OutboxOptions): Outbox {
  const key = opts.key ?? 'bm.log.outbox';
  const max = opts.maxLines ?? 1000;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let draining = false;
  let droppedLines = 0;
  /** Lines `keep()` cut from the head so far — a drain in flight subtracts them (rv#25). */
  let trimmedTotal = 0;

  const load = (): unknown[] => {
    try {
      const text = opts.storage?.getItem(key);
      const parsed = text ? (JSON.parse(text) as unknown) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const save = (lines: unknown[]): void => {
    if (!opts.storage) return;
    try {
      if (lines.length === 0) opts.storage.removeItem(key);
      else opts.storage.setItem(key, JSON.stringify(lines));
    } catch {
      /* storage full: the lines are lost, as they would be without the outbox */
    }
  };

  const post = async (lines: readonly unknown[], keepalive: boolean): Promise<boolean> => {
    try {
      const r = await doFetch(opts.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lines),
        keepalive,
      });
      return r.ok || (r.status >= 400 && r.status < 500); // a refused batch is not retried
    } catch {
      return false;
    }
  };

  const keep = (lines: readonly unknown[]): void => {
    const all = [...load(), ...lines];
    const over = all.length - max;
    if (over > 0) {
      droppedLines += over;
      trimmedTotal += over;
    }
    save(over > 0 ? all.slice(over) : all);
  };

  const drain = async (): Promise<boolean> => {
    if (draining) return false;
    draining = true;
    try {
      for (;;) {
        const all = load();
        if (all.length === 0) return true;
        const batch = all.slice(0, DRAIN_LINES);
        const trimmedBefore = trimmedTotal;
        if (!(await post(batch, false))) return false;
        // `keep()` may have cut the oldest lines (this batch's) meanwhile: remove only the rest.
        const alreadyGone = trimmedTotal - trimmedBefore;
        save(load().slice(Math.max(0, batch.length - alreadyGone)));
      }
    } finally {
      draining = false;
    }
  };

  const timer = opts.retryMs === 0 ? null : setInterval(() => void drain(), opts.retryMs ?? 30_000);
  const onOnline = () => void drain();
  globalThis.addEventListener?.('online', onOnline);

  return {
    async send(lines) {
      // keepalive only while the page goes away (browsers refuse keepalive bodies over 64 KB, and
      // it is only needed to outlive the page) — rv#25.
      if (await post(lines, pageHidden())) void drain();
      else keep(lines);
    },
    drain,
    waiting: () => load().length,
    dropped: () => droppedLines,
    close() {
      if (timer) clearInterval(timer);
      globalThis.removeEventListener?.('online', onOnline);
    },
  };
}
