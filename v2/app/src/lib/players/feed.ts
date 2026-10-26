/**
 * The TV's side of the players' view (roadmap S12): sends the players' pages in the room the
 * players' state (`playersView` — never the full state) in `players.state`. Only while at least
 * one players' page is there; after a change at most every `intervalMs` (the last change always
 * goes out); at once to a page that joins or asks (`players.request`). The server delivers
 * `players.*` to players' pages only.
 *
 * @see ../../../../shared/src/model/players-view.ts
 * @see ../../../../docs/features.md "Players' view"
 */
import { playersView, type Peer, type RootState } from '@battlemap/shared';
import type { Logger } from '../log.ts';

/** The clock the feed waits on (tests pass a fake). */
export interface FeedTimers {
  /** Like `setTimeout`. */
  set(fn: () => void, ms: number): unknown;
  /** Like `clearTimeout`. */
  clear(handle: unknown): void;
}

/** Options of a {@link PlayersFeed}. */
export interface PlayersFeedOptions {
  /** Sends a peer message (false when offline). */
  send: (msg: { type: string } & Record<string, unknown>) => boolean;
  /** The logger. */
  log: Logger;
  /** Shortest time between two sends after changes, ms (default 150). */
  intervalMs?: number;
  /** The clock (default the real one). */
  timers?: FeedTimers;
}

const REAL_TIMERS: FeedTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** The TV's feed to the players' pages. */
export class PlayersFeed {
  private state: RootState | null = null;
  private rev = 0;
  private players = new Set<string>();
  private timer: unknown = null;
  private lastSentAt = -Infinity;
  private sentState: RootState | null = null;
  private readonly intervalMs: number;
  private readonly timers: FeedTimers;
  private readonly now: () => number = () => performance.now();

  /**
   * @param o - send, logger, interval, clock
   */
  constructor(private readonly o: PlayersFeedOptions) {
    this.intervalMs = o.intervalMs ?? 150;
    this.timers = o.timers ?? REAL_TIMERS;
  }

  /** Players' pages in the room now. */
  get count(): number {
    return this.players.size;
  }

  /**
   * The room's peers changed: a new players' page gets the view at once.
   *
   * @param peers - everyone else in the room
   */
  peers(peers: readonly Peer[]): void {
    const now = new Set(peers.filter((p) => p.role === 'players').map((p) => p.client));
    const joined = [...now].filter((c) => !this.players.has(c));
    const left = [...this.players].filter((c) => !now.has(c));
    this.players = now;
    if (joined.length || left.length) this.o.log.info('players', 'Players\' views in the room', { count: now.size, joined, left });
    for (const c of joined) this.sendTo(c);
    if (now.size === 0 && this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  /**
   * The TV's state changed.
   *
   * @param state - the full state
   * @param rev - its revision
   */
  changed(state: RootState, rev: number): void {
    this.state = state;
    this.rev = rev;
    if (this.players.size === 0 || this.timer !== null) return;
    const wait = this.lastSentAt + this.intervalMs - this.now();
    if (wait <= 0) this.sendAll();
    else this.timer = this.timers.set(() => {
      this.timer = null;
      this.sendAll();
    }, wait);
  }

  /**
   * A players' page asked (`players.request`).
   *
   * @param from - its client id
   */
  request(from: string): void {
    this.o.log.info('players', 'Players\' state asked for', { from });
    this.sendTo(from);
  }

  /** Stops the pending send. */
  stop(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private message(): { type: string } & Record<string, unknown> {
    return { type: 'players.state', rev: this.rev, state: playersView(this.state!) };
  }

  private sendTo(client: string): void {
    if (!this.state) return;
    this.o.send({ ...this.message(), to: client });
  }

  private sendAll(): void {
    if (!this.state || this.players.size === 0 || this.sentState === this.state) return;
    if (this.o.send(this.message())) {
      this.sentState = this.state;
      this.lastSentAt = this.now();
    }
  }
}
