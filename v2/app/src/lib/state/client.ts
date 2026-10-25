/**
 * The companion's side of sync: a confirmed copy of the TV's state plus its own commands still
 * in flight, folded into the prediction it shows — so a tap answers at once and a stale echo
 * can never flash an old value back. Plain TypeScript, tested under `bun test`.
 *
 * Rules (see `docs/architecture.md` "sync" and "offline policy"):
 * - a command is sent only while connected to a TV with a snapshot in hand, else refused with a
 *   notice and never queued;
 * - `sync.applied` with the next `rev` is applied to the confirmed state; a gap or a new epoch
 *   asks for a snapshot (and ignores patches until it comes);
 * - the first snapshot after a reconnect drops pending commands: those the `acks` cover were
 *   applied, the rest were lost — one notice, never resent;
 * - losing the TV (or the link) with commands in flight rolls the prediction back at once, with
 *   one notice — the TV's snapshot shows later whatever it did apply (qa#6);
 * - a command the TV hasn't echoed within `ackTimeoutMs` (a TV reloading, hung or busy) is
 *   dropped the same way: rolled back, one notice, never resent (qa#6). A late echo still lands
 *   in the confirmed state, because the TV's state is the truth;
 * - a snapshot request that isn't answered is repeated every `snapshotRetryMs` (rv#9); a new
 *   epoch drops what is pending (rv#10).
 */
import { apply, applyAll, check, ToCompanion, type Command, type RootState } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { SendFn } from './host.ts';

/** A command sent and not yet confirmed. */
interface Pending {
  /** Its number. */
  seq: number;
  /** The command. */
  cmd: Command;
  /** When it was sent (`now()`), for the ack timeout. */
  at: number;
}

/** Timer functions (injectable for tests). */
export interface ClientTimers {
  /** Like `setTimeout`. */
  set(fn: () => void, ms: number): unknown;
  /** Like `clearTimeout`. */
  clear(handle: unknown): void;
}

/** Timings and clock of a {@link SyncClient}. */
export interface SyncClientOptions {
  /** A command not echoed within this is dropped (default {@link ACK_TIMEOUT_MS}). */
  ackTimeoutMs?: number;
  /** An unanswered snapshot request is repeated after this (default {@link SNAPSHOT_RETRY_MS}). */
  snapshotRetryMs?: number;
  /** The clock, ms (default `Date.now`). */
  now?: () => number;
  /** Timers (default the global ones). */
  timers?: ClientTimers;
}

/** How long a command may wait for the TV's echo before it is dropped (qa#6). */
export const ACK_TIMEOUT_MS = 5000;
/** How long a snapshot request may stay unanswered before it is repeated (rv#9). */
export const SNAPSHOT_RETRY_MS = 3000;

const realTimers: ClientTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Why the relay could not deliver a command, in the DM's words. */
function undeliveredText(reason: string | undefined): string {
  if (reason === 'rate-limited') return 'Too fast — that change was dropped.';
  return "The TV isn't connected — that wasn't applied.";
}

/** Notice kinds the client raises (the kit's `notify` takes the same). */
export type ClientNoticeKind = 'info' | 'warning' | 'error';

/** The companion's state holder. */
export class SyncClient {
  /** The TV's state as last confirmed, or null before the first snapshot. */
  confirmed: RootState | null = null;
  /** What the companion shows: confirmed + pending. */
  view: RootState | null = null;
  /** The confirmed revision. */
  rev = 0;
  /** The TV's epoch. */
  epoch: string | null = null;

  /** Called whenever `view` changes. */
  onChange: ((view: RootState | null) => void) | null = null;
  /** Called with things to tell the DM. */
  onNotice: ((text: string, kind: ClientNoticeKind) => void) | null = null;

  private pending: Pending[] = [];
  private nextSeq = 1;
  private linkUp = false;
  private tvPresent = false;
  private freshConnection = true;
  private awaitingSnapshot = false;
  private ackTimer: unknown = null;
  private snapshotTimer: unknown = null;
  private readonly ackTimeoutMs: number;
  private readonly snapshotRetryMs: number;
  private readonly now: () => number;
  private readonly timers: ClientTimers;

  /**
   * @param send - the connection's send
   * @param clientId - this page's client id (to recognise its own echoes)
   * @param log - the logger (area `sync`)
   * @param options - timeouts, clock and timers
   */
  constructor(private readonly send: SendFn, private readonly clientId: string, private readonly log: Logger, options: SyncClientOptions = {}) {
    this.ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS;
    this.snapshotRetryMs = options.snapshotRetryMs ?? SNAPSHOT_RETRY_MS;
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? realTimers;
  }

  /**
   * The connection state changed.
   *
   * @param up - welcomed by the server
   * @param tvPresent - a TV is in the room
   */
  setLink(up: boolean, tvPresent: boolean): void {
    const wasConnected = this.linkUp && this.tvPresent;
    this.linkUp = up;
    this.tvPresent = tvPresent;
    const connected = up && tvPresent;
    if (wasConnected && !connected) {
      this.freshConnection = true; // what is in flight now may never arrive
      this.setAwaiting(false);
      this.log.info('sync', 'Lost the TV', { up, tvPresent, pending: this.pending.length });
      this.dropPending(this.pending.length, 'lost the TV');
    }
    if (connected && !wasConnected) this.requestSnapshot('connected to the TV');
  }

  /**
   * Whether commands can be sent now.
   *
   * @returns true when connected to a TV with a confirmed state
   */
  ready(): boolean {
    return this.linkUp && this.tvPresent && this.confirmed !== null && !this.awaitingSnapshot;
  }

  /**
   * Sends a command: predicts it at once, sends it to the TV.
   *
   * @param cmd - the command
   * @returns false when it was not sent (offline, refused locally) — a notice says why
   */
  dispatch(cmd: Command): boolean {
    if (!this.ready() || !this.view) {
      const why = !this.linkUp || !this.tvPresent ? "Not connected to the TV — that wasn't sent." : 'Still loading the table — try again in a moment.';
      this.log.info('sync', 'Command not sent', { type: cmd.type, linkUp: this.linkUp, tvPresent: this.tvPresent });
      this.onNotice?.(why, 'warning');
      return false;
    }
    const predicted = apply(this.view, cmd);
    if (!predicted.ok) {
      this.log.info('sync', 'Command refused here', { type: cmd.type, reason: predicted.reason });
      this.onNotice?.(predicted.reason, 'warning');
      return false;
    }
    const seq = this.nextSeq++;
    this.pending.push({ seq, cmd, at: this.now() }); // before sending: an echo may come back at once
    this.setView(predicted.state);
    if (!this.send({ type: 'sync.cmd', seq, cmd })) {
      this.pending = this.pending.filter((p) => p.seq !== seq);
      this.rebuild();
      this.onNotice?.("Not connected to the TV — that wasn't sent.", 'warning');
      return false;
    }
    this.armAckTimer();
    return true;
  }

  /**
   * A peer message for the companion, as it arrived (checked here).
   *
   * @param raw - the parsed JSON
   */
  receive(raw: unknown): void {
    const checked = check(ToCompanion, raw);
    if (!checked.ok) {
      this.log.warn('sync', 'Bad message for the companion', { error: checked.error, type: (raw as { type?: unknown }).type });
      return;
    }
    const msg = checked.value;
    switch (msg.type) {
      case 'sync.snapshot': {
        const ack = msg.acks[this.clientId] ?? 0;
        const applied = this.pending.filter((p) => p.seq <= ack).length;
        if (this.freshConnection) {
          const lost = this.pending.length - applied;
          if (lost > 0) {
            this.log.warn('sync', 'Commands lost in a reconnect', { lost, types: this.pending.filter((p) => p.seq > ack).map((p) => p.cmd.type).join(',') });
            this.onNotice?.(lost === 1 ? "One change didn't reach the TV." : `${lost} changes didn't reach the TV.`, 'warning');
          }
          this.pending = [];
        } else {
          this.pending = this.pending.filter((p) => p.seq > ack);
        }
        if (this.epoch !== null && msg.epoch !== this.epoch && this.pending.length > 0) {
          // Another game opened (rv#10): what was meant for the old one must not fold onto it.
          this.log.warn('sync', 'Commands dropped by a new epoch', { count: this.pending.length });
          this.onNotice?.(this.pending.length === 1 ? "One change didn't reach the TV." : `${this.pending.length} changes didn't reach the TV.`, 'warning');
          this.pending = [];
        }
        this.freshConnection = false;
        this.setAwaiting(false);
        this.confirmed = msg.state;
        this.rev = msg.rev;
        this.epoch = msg.epoch;
        this.log.info('sync', 'Snapshot', { rev: msg.rev, epoch: msg.epoch, gameId: msg.state.game?.id ?? null, pending: this.pending.length });
        this.rebuild();
        this.armAckTimer();
        return;
      }
      case 'sync.applied': {
        if (this.awaitingSnapshot || !this.confirmed) return;
        if (msg.epoch !== this.epoch || msg.rev !== this.rev + 1) {
          this.requestSnapshot(msg.epoch !== this.epoch ? 'new epoch' : `gap: had ${this.rev}, got ${msg.rev}`);
          return;
        }
        const result = apply(this.confirmed, msg.cmd);
        if (!result.ok) {
          this.log.error('sync', 'The TV applied a command this copy refuses', { type: msg.cmd.type, reason: result.reason, rev: msg.rev });
          this.requestSnapshot('diverged');
          return;
        }
        this.confirmed = result.state;
        this.rev = msg.rev;
        if (msg.by === this.clientId) this.pending = this.pending.filter((p) => p.seq !== msg.seq);
        this.rebuild();
        if (msg.by === this.clientId) this.armAckTimer();
        return;
      }
      case 'sync.rejected': {
        this.pending = this.pending.filter((p) => p.seq !== msg.seq);
        this.log.info('sync', 'The TV refused a command', { seq: msg.seq, reason: msg.reason });
        this.onNotice?.(msg.reason, 'warning');
        this.rebuild();
        return;
      }
      default:
        return; // library, status, notices, diagnostics: the companion mode handles them
    }
  }

  /**
   * The relay could not deliver a command (the TV left, or this page sent too fast): drop it.
   *
   * @param seq - the command's number
   * @param reason - the relay's reason (`no-tv`, `no-such-client`, `rate-limited`)
   */
  undelivered(seq: number, reason?: string): void {
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => p.seq !== seq);
    if (this.pending.length !== before) {
      this.log.info('sync', 'Command undelivered', { seq, reason: reason ?? null });
      this.onNotice?.(undeliveredText(reason), 'warning');
      this.rebuild();
    }
  }

  /** Stops the timers (the session ends). */
  stop(): void {
    if (this.ackTimer !== null) this.timers.clear(this.ackTimer);
    if (this.snapshotTimer !== null) this.timers.clear(this.snapshotTimer);
    this.ackTimer = null;
    this.snapshotTimer = null;
  }

  /** Number of commands waiting for the TV's echo. */
  get pendingCount(): number {
    return this.pending.length;
  }

  private requestSnapshot(reason: string): void {
    this.setAwaiting(true);
    this.log.info('sync', 'Asking for a snapshot', { reason });
    this.send({ type: 'sync.request' });
  }

  /** Sets `awaitingSnapshot`; while it holds, the request is repeated until a snapshot comes. */
  private setAwaiting(on: boolean): void {
    this.awaitingSnapshot = on;
    if (this.snapshotTimer !== null) this.timers.clear(this.snapshotTimer);
    this.snapshotTimer = null;
    if (!on) return;
    this.snapshotTimer = this.timers.set(() => {
      this.snapshotTimer = null;
      if (this.awaitingSnapshot && this.linkUp && this.tvPresent) this.requestSnapshot('no snapshot came (retry)');
    }, this.snapshotRetryMs);
  }

  /** Drops the oldest `count` pending commands, rolls the view back, tells the DM once. */
  private dropPending(count: number, why: string): void {
    if (count <= 0) return;
    const gone = this.pending.slice(0, count);
    this.pending = this.pending.slice(count);
    this.log.warn('sync', 'Commands dropped', { why, count, seqs: gone.map((p) => p.seq).join(','), types: gone.map((p) => p.cmd.type).join(',') });
    this.onNotice?.(count === 1 ? "That change didn't reach the TV — it was undone here." : `${count} changes didn't reach the TV — they were undone here.`, 'warning');
    this.rebuild();
  }

  /** (Re)arms the ack timer for the oldest pending command. */
  private armAckTimer(): void {
    if (this.ackTimer !== null) this.timers.clear(this.ackTimer);
    this.ackTimer = null;
    const oldest = this.pending[0];
    if (!oldest) return;
    const wait = Math.max(0, oldest.at + this.ackTimeoutMs - this.now());
    this.ackTimer = this.timers.set(() => {
      this.ackTimer = null;
      const limit = this.now() - this.ackTimeoutMs;
      let n = 0;
      while (n < this.pending.length && this.pending[n]!.at <= limit) n++;
      this.dropPending(n, `no echo within ${this.ackTimeoutMs} ms`);
      this.armAckTimer();
    }, wait);
  }

  private rebuild(): void {
    this.setView(this.confirmed ? applyAll(this.confirmed, this.pending.map((p) => p.cmd)) : null);
  }

  private setView(view: RootState | null): void {
    this.view = view;
    this.onChange?.(view);
  }
}
