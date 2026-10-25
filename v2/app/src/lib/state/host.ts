/**
 * The TV's side of sync: the authority. It applies every command with the shared reducer,
 * numbers the result (`rev`), broadcasts the command as the patch (`sync.applied`) or tells the
 * sender why not (`sync.rejected`), and answers `sync.request` with a snapshot. Opening another
 * game replaces the state under a new `epoch`. Plain TypeScript, tested under `bun test`.
 *
 * Requests that need IO (open or start a game, list games, diagnostics) are handed to
 * `onRequest`; the TV mode (`lib/tv/`) answers them with storage.
 *
 * @see ../../../../docs/architecture.md "sync"
 */
import { apply, check, newId, ToTv, type Command, type RootState } from '@battlemap/shared';
import type { Logger } from '../log.ts';

/** How the host talks to the room — the connection's `send` (false = not delivered). */
export type SendFn = (msg: { type: string } & Record<string, unknown>) => boolean;

/** A request for the TV that is not a reducer command. */
export type TvRequest = Exclude<ToTv, { type: 'sync.cmd' } | { type: 'sync.request' }>;

/** The authoritative state holder on the TV. */
export class SyncHost {
  /** The current state. */
  state: RootState;
  /** The revision: +1 per command applied. */
  rev = 0;
  /** Changes when another game is opened or the app restarts. */
  epoch = newId(8);

  /** Called after every change: the new state and the command (null for a replace). */
  onChange: ((state: RootState, cmd: Command | null) => void) | null = null;
  /** Called with requests that need the TV's storage or screens. */
  onRequest: ((req: TvRequest, from: string) => void) | null = null;

  private readonly acks = new Map<string, number>();
  private ownSeq = 0;

  /**
   * @param initial - the state to start from (the reopened game, or the initial root)
   * @param send - the connection's send
   * @param clientId - the TV's own client id (the `by` of its own commands)
   * @param log - the logger (area `sync`)
   */
  constructor(initial: RootState, private readonly send: SendFn, private readonly clientId: string, private readonly log: Logger) {
    this.state = initial;
  }

  /**
   * A command the TV makes itself (its viewport, a remote key).
   *
   * @param cmd - the command
   * @returns whether it was applied
   */
  applyLocal(cmd: Command): boolean {
    return this.applyFrom(this.clientId, ++this.ownSeq, cmd);
  }

  /**
   * A peer message for the TV, as it arrived (checked here).
   *
   * @param raw - the parsed JSON
   */
  receive(raw: unknown): void {
    const checked = check(ToTv, raw);
    if (!checked.ok) {
      const seq = (raw as { seq?: unknown }).seq;
      const from = (raw as { from?: unknown }).from;
      this.log.warn('sync', 'Bad message for the TV', { error: checked.error, type: (raw as { type?: unknown }).type });
      if (typeof seq === 'number' && typeof from === 'string') this.send({ type: 'sync.rejected', to: from, seq, reason: 'The TV could not read that command.' });
      return;
    }
    const msg = checked.value;
    const from = msg.from ?? 'unknown';
    switch (msg.type) {
      case 'sync.cmd':
        if (msg.seq <= (this.acks.get(from) ?? 0)) {
          this.log.debug('sync', 'Duplicate command ignored', { from, seq: msg.seq, type: msg.cmd.type });
          return;
        }
        this.applyFrom(from, msg.seq, msg.cmd);
        return;
      case 'sync.request':
        this.sendSnapshot(from);
        return;
      default:
        this.onRequest?.(msg, from);
    }
  }

  /**
   * Replaces the whole state (another game opened, a game closed) under a new epoch and sends
   * every companion the snapshot.
   *
   * @param state - the new state
   * @param reason - for the log
   */
  replace(state: RootState, reason: string): void {
    this.state = state;
    this.epoch = newId(8);
    this.rev = 0;
    this.acks.clear();
    this.log.info('sync', 'State replaced', { reason, epoch: this.epoch, gameId: state.game?.id ?? null });
    this.onChange?.(state, null);
    this.sendSnapshot();
  }

  /**
   * Sends the snapshot to one companion, or to all.
   *
   * @param to - a client id, or undefined for everyone
   */
  sendSnapshot(to?: string): void {
    const msg: { type: string } & Record<string, unknown> = {
      type: 'sync.snapshot', epoch: this.epoch, rev: this.rev, state: this.state, acks: Object.fromEntries(this.acks),
    };
    if (to) msg.to = to;
    const t0 = performance.now();
    this.send(msg);
    this.log.debug('sync', 'Snapshot sent', { to: to ?? 'all', rev: this.rev, ms: Math.round(performance.now() - t0) });
  }

  private applyFrom(from: string, seq: number, cmd: Command): boolean {
    const t0 = performance.now();
    const result = apply(this.state, cmd);
    const ms = performance.now() - t0;
    this.acks.set(from, seq);
    if (!result.ok) {
      this.log.info('sync', 'Command refused', { from, seq, type: cmd.type, reason: result.reason });
      if (from !== this.clientId) this.send({ type: 'sync.rejected', to: from, seq, reason: result.reason });
      return false;
    }
    this.state = result.state;
    this.rev++;
    if (ms > 5) this.log.warn('sync', 'Slow command', { type: cmd.type, ms: Math.round(ms) });
    this.log.count?.('sync', 'Commands applied', { type: cmd.type }, { ms });
    this.send({ type: 'sync.applied', epoch: this.epoch, rev: this.rev, by: from, seq, cmd });
    this.onChange?.(this.state, cmd);
    return true;
  }
}
