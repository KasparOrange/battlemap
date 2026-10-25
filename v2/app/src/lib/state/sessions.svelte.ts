/**
 * The two modes' live sessions as Svelte runes: a connection plus the sync host (TV) or the
 * sync client (companion), with their state exposed as reactive fields for the screens.
 * The logic lives in the plain-TS `host.ts`, `client.ts` and `net/connection.ts`; this file
 * only wires them together and makes them reactive. States are `$state.raw` — immutable trees
 * replaced whole, never deep proxies (cheap, and the renderer compares references).
 */
import { check, initialRoot, ToCompanion, type Command, type Peer, type RootState } from '@battlemap/shared';
import type { AppConfig } from '../config.ts';
import { attachSession } from '../debug-hook.ts';
import { log } from '../log.ts';
import { Connection, type ConnectionState } from '../net/connection.ts';
import { notify } from '../ui/notice.svelte.ts';
import { SyncClient } from './client.ts';
import { SyncHost, type TvRequest } from './host.ts';

/** The TV's session: the authority for its room. */
export class TvSession {
  /** The current state. */
  state = $state.raw<RootState>(initialRoot());
  /** Its revision. */
  rev = $state(0);
  /** The connection's state. */
  connection = $state<ConnectionState>('idle');
  /** Who else is in the room. */
  peers = $state.raw<Peer[]>([]);

  /** The sync host (send it local commands with `host.applyLocal`). */
  readonly host: SyncHost;
  /** The connection. */
  readonly conn: Connection;

  /**
   * @param config - the page's configuration (mode tv, its table id)
   * @param onRequest - answers requests that need storage (open a game, list games, …)
   * @param initial - the state to start from (the game reopened from storage)
   */
  constructor(config: AppConfig, onRequest: (req: TvRequest, from: string, session: TvSession) => void, initial: RootState = initialRoot()) {
    this.conn = new Connection({
      url: config.wsUrl, role: 'tv', room: config.tableId ?? 'table', client: config.clientId,
      name: config.deviceName, build: config.build, log,
    });
    // Broadcasts while offline are skipped quietly: a companion that (re)joins gets a snapshot.
    this.host = new SyncHost(initial, (msg) => this.conn.state === 'open' && this.conn.send(msg), config.clientId, log);
    this.state = initial;
    this.host.onChange = (state) => {
      this.state = state;
      this.rev = this.host.rev;
    };
    this.host.onRequest = (req, from) => onRequest(req, from, this);
    this.conn.onState = (s) => (this.connection = s);
    this.conn.onPeers = (peers) => (this.peers = peers);
    this.conn.onPeerMessage = (msg) => this.host.receive(msg);
    attachSession({
      mode: 'tv', client: config.clientId,
      connection: () => this.connection, state: () => this.state, rev: () => this.rev,
      epoch: () => this.host.epoch, request: (msg) => this.send(msg),
    });
  }

  /** Connects to the room. */
  start(): void {
    this.conn.connect();
  }

  /** Disconnects. */
  stop(): void {
    this.conn.close();
  }

  /**
   * Sends a message to one companion or all (answers to requests).
   *
   * @param msg - the message
   * @returns false when not connected
   */
  send(msg: { type: string } & Record<string, unknown>): boolean {
    return this.conn.send(msg);
  }
}

/** A companion's session: a prediction of the TV's state. */
export class CompanionSession {
  /** What the companion shows (confirmed + pending), null before the first snapshot. */
  view = $state.raw<RootState | null>(null);
  /** The confirmed revision. */
  rev = $state(0);
  /** The connection's state. */
  connection = $state<ConnectionState>('idle');
  /** Who else is in the room. */
  peers = $state.raw<Peer[]>([]);
  /** Whether the room has a TV. */
  tvOnline = $derived(this.peers.some((p) => p.role === 'tv'));
  /** Whether commands can be sent (connected, TV there, snapshot in hand). */
  ready = $state(false);
  /** The last peer message that isn't sync (library listing, TV status, …), for the screens. */
  lastMessage = $state.raw<Record<string, unknown> | null>(null);

  /** The sync client. */
  readonly client: SyncClient;
  /** The connection. */
  readonly conn: Connection;

  /**
   * @param config - the page's configuration (mode companion, the chosen table)
   * @param tableId - the table to join
   */
  constructor(config: AppConfig, tableId: string) {
    this.conn = new Connection({
      url: config.wsUrl, role: 'companion', room: tableId, client: config.clientId,
      name: config.deviceName, build: config.build, log,
    });
    this.client = new SyncClient((msg) => this.conn.send(msg), config.clientId, log);
    this.client.onChange = (view) => {
      this.view = view;
      this.rev = this.client.rev;
      this.ready = this.client.ready();
    };
    this.client.onNotice = (text, kind) => notify(text, { kind });
    const link = () => {
      this.client.setLink(this.conn.state === 'open', this.conn.peers.some((p) => p.role === 'tv'));
      this.ready = this.client.ready();
    };
    this.conn.onState = (s) => {
      this.connection = s;
      link();
    };
    this.conn.onPeers = (peers) => {
      this.peers = peers;
      link();
    };
    this.conn.onPeerMessage = (msg) => {
      if (msg.type.startsWith('sync.')) {
        this.client.receive(msg); // checks it itself
        return;
      }
      // Every receiver parses with the shared schemas (rv#11): the screens get checked messages.
      const checked = check(ToCompanion, msg);
      if (!checked.ok) {
        log.warn('sync', 'Bad message for the companion', { type: msg.type, error: checked.error });
        return;
      }
      this.lastMessage = checked.value as Record<string, unknown>;
    };
    this.conn.onServerMessage = (msg) => {
      if (msg.type === 'relay.undelivered' && msg.seq !== undefined) this.client.undelivered(msg.seq, msg.reason);
    };
    attachSession({
      mode: 'companion', client: config.clientId,
      connection: () => this.connection, state: () => this.view, rev: () => this.rev,
      epoch: () => this.client.epoch, pending: () => this.client.pendingCount,
      dispatch: (cmd) => this.dispatch(cmd), request: (msg) => this.request(msg),
    });
  }

  /**
   * Sends a command (predicted at once).
   *
   * @param cmd - the command
   * @returns false when it wasn't sent (a notice says why)
   */
  dispatch(cmd: Command): boolean {
    return this.client.dispatch(cmd);
  }

  /**
   * Sends a request to the TV (not a command).
   *
   * @param msg - the request
   * @returns false when not connected
   */
  request(msg: { type: string } & Record<string, unknown>): boolean {
    const sent = this.conn.send(msg);
    if (!sent) notify("Not connected to the TV — that wasn't sent.", { kind: 'warning' });
    return sent;
  }

  /** Connects to the room. */
  start(): void {
    this.conn.connect();
  }

  /** Disconnects. */
  stop(): void {
    this.client.stop();
    this.conn.close();
  }
}
