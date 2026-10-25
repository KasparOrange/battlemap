/**
 * Test helpers for the app's plain-TS cores: a logger that records, and a fake relay link
 * between one SyncHost and several SyncClients (no sockets).
 */
import type { Logger } from '../src/lib/log.ts';
import { SyncClient } from '../src/lib/state/client.ts';
import { SyncHost } from '../src/lib/state/host.ts';
import { initialRoot } from '@battlemap/shared';

/** A logged line. */
export interface Line { level: string; area: string; msg: string; props?: Record<string, unknown> }

/** A logger that keeps its lines. */
export function recordingLog(): Logger & { lines: Line[]; has(msg: string): boolean } {
  const lines: Line[] = [];
  const add = (level: string) => (area: string, msg: string, props?: Record<string, unknown>) => void lines.push({ level, area, msg, props });
  return { lines, debug: add('debug'), info: add('info'), warn: add('warn'), error: add('error'), has: (msg) => lines.some((l) => l.msg === msg) };
}

/** A TV and companions joined by an in-memory relay that can be cut. */
export class FakeRoom {
  readonly log = recordingLog();
  readonly host: SyncHost;
  readonly clients = new Map<string, SyncClient>();
  readonly notices: { client: string; text: string }[] = [];
  /** While false, nothing is delivered either way (a dropped connection). */
  up = true;
  /** Messages held back (to simulate latency), delivered by `flush()`. */
  private queue: (() => void)[] = [];
  /** Deliver at once (false = hold until `flush()`). */
  instant = true;

  constructor() {
    this.host = new SyncHost(initialRoot(), (msg) => {
      if (!this.up) return false;
      for (const [id, c] of this.clients) {
        if (msg.to && msg.to !== id) continue;
        const copy = JSON.parse(JSON.stringify({ ...msg, from: 'tv' })) as unknown;
        this.deliver(() => c.receive(copy));
      }
      return true;
    }, 'tv', this.log);
  }

  /** Adds a companion (connected, with a TV present). */
  join(id: string): SyncClient {
    const client = new SyncClient((msg) => {
      if (!this.up) return false;
      const copy = JSON.parse(JSON.stringify({ ...msg, from: id })) as unknown;
      this.deliver(() => this.host.receive(copy));
      return true;
    }, id, this.log);
    client.onNotice = (text) => this.notices.push({ client: id, text });
    this.clients.set(id, client);
    client.setLink(true, true);
    return client;
  }

  /** Runs held deliveries in order. */
  flush(): void {
    while (this.queue.length) this.queue.shift()!();
  }

  private deliver(f: () => void): void {
    if (this.instant) f();
    else this.queue.push(f);
  }
}
