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
 *   applied, the rest were lost — one notice, never resent.
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

  /**
   * @param send - the connection's send
   * @param clientId - this page's client id (to recognise its own echoes)
   * @param log - the logger (area `sync`)
   */
  constructor(private readonly send: SendFn, private readonly clientId: string, private readonly log: Logger) {}

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
      this.awaitingSnapshot = false;
      this.log.info('sync', 'Lost the TV', { up, tvPresent, pending: this.pending.length });
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
    this.pending.push({ seq, cmd }); // before sending: an echo may come back at once
    this.setView(predicted.state);
    if (!this.send({ type: 'sync.cmd', seq, cmd })) {
      this.pending = this.pending.filter((p) => p.seq !== seq);
      this.rebuild();
      this.onNotice?.("Not connected to the TV — that wasn't sent.", 'warning');
      return false;
    }
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
        this.freshConnection = false;
        this.awaitingSnapshot = false;
        this.confirmed = msg.state;
        this.rev = msg.rev;
        this.epoch = msg.epoch;
        this.log.info('sync', 'Snapshot', { rev: msg.rev, epoch: msg.epoch, gameId: msg.state.game?.id ?? null, pending: this.pending.length });
        this.rebuild();
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
   * The relay could not deliver a command (the TV left): drop it.
   *
   * @param seq - the command's number
   */
  undelivered(seq: number): void {
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => p.seq !== seq);
    if (this.pending.length !== before) {
      this.onNotice?.("The TV isn't connected — that wasn't applied.", 'warning');
      this.rebuild();
    }
  }

  /** Number of commands waiting for the TV's echo. */
  get pendingCount(): number {
    return this.pending.length;
  }

  private requestSnapshot(reason: string): void {
    this.awaitingSnapshot = true;
    this.log.info('sync', 'Asking for a snapshot', { reason });
    this.send({ type: 'sync.request' });
  }

  private rebuild(): void {
    this.setView(this.confirmed ? applyAll(this.confirmed, this.pending.map((p) => p.cmd)) : null);
  }

  private setView(view: RootState | null): void {
    this.view = view;
    this.onChange?.(view);
  }
}
