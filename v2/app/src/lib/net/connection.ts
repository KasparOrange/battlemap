/**
 * The connection to the server's relay: one WebSocket, `hello` → `welcome`, heartbeat,
 * reconnect with backoff, and the lessons of the old app's relay diagnostics:
 *
 * - a message sent while not connected is **dropped, never queued** (`send` returns false, the
 *   caller shows "Not connected to the TV — that wasn't sent"); the count is logged on the next
 *   welcome;
 * - no `welcome` within 8 s of connecting, or no data for 35 s → force a reconnect;
 * - backoff 1, 2, 3, then 5 s; reconnect at once when the page becomes visible or the network
 *   comes back;
 * - `replaced` (another TV took the room) and `server.error` stop reconnecting until
 *   `takeOver()`;
 * - every message is stamped `sent` on the server's clock (estimated from pongs), so a receiver
 *   can tell a late message without trusting two device clocks; late ones are logged.
 *
 * Plain TypeScript (no Svelte), so `bun test` runs it against a real socket.
 *
 * @see ../../../../docs/architecture.md "networking"
 */
import { checkServerMessage, parseJson, PROTOCOL_VERSION, SERVER_MESSAGE_TYPES, type Peer, type Role, type ServerMessage } from '@battlemap/shared';
import type { Logger } from '../log.ts';

/** Where the connection is. */
export type ConnectionState =
  /** Not started. */
  | 'idle'
  /** Opening a socket / waiting for `welcome`. */
  | 'connecting'
  /** Welcomed — messages flow. */
  | 'open'
  /** Lost; a reconnect is scheduled. */
  | 'waiting'
  /** Another TV took this room; waits for `takeOver()`. */
  | 'replaced'
  /** The server refused us (protocol mismatch); waits for `takeOver()` or a reload. */
  | 'refused'
  /** Closed on purpose. */
  | 'closed';

/** Timings, all in ms (tests shorten them). */
export interface ConnectionTiming {
  /** Heartbeat interval. */
  pingMs: number;
  /** Silence after which the socket counts as dead. */
  silentMs: number;
  /** Longest wait for `welcome` after starting to connect. */
  welcomeMs: number;
  /** A peer message older than this on arrival is late. */
  lateMs: number;
  /** A timer this much late means the event loop stalled (or the app was paused). */
  stallMs: number;
  /** Reconnect delays, the last one repeats. */
  backoffMs: readonly number[];
}

/** The defaults (the old app's proven values). */
export const DEFAULT_TIMING: ConnectionTiming = {
  pingMs: 15_000,
  silentMs: 35_000,
  welcomeMs: 8_000,
  lateMs: 1_500,
  stallMs: 1_000, // architecture.md "logs": a timer more than 1 s late (rv#14)
  backoffMs: [1_000, 2_000, 3_000, 5_000],
};

/** Options of a {@link Connection}. */
export interface ConnectionOptions {
  /** `ws(s)://host/ws`. */
  url: string;
  /** TV or companion. */
  role: Role;
  /** The table (relay room). */
  room: string;
  /** This page's client id. */
  client: string;
  /** This device's name. */
  name: string;
  /** The app build. */
  build: string;
  /** The logger (area `net`). */
  log: Logger;
  /** Timings to override. */
  timing?: Partial<ConnectionTiming>;
  /** Makes the socket (tests may pass their own). */
  createSocket?: (url: string) => WebSocket;
}

/** A peer message as it arrived: parsed JSON, not yet checked (the state layer checks it). */
export type RawPeerMessage = Record<string, unknown> & { type: string };

/** One connection to the relay. */
export class Connection {
  /** Where the connection is. */
  state: ConnectionState = 'idle';
  /** Everyone else in the room. */
  peers: Peer[] = [];
  /** The last round trip to the server, ms. */
  rttMs: number | null = null;
  /** The app build the server serves (from `welcome` / `server.build`). */
  serverBuild: string | null = null;

  /** Called on every state change. */
  onState: ((state: ConnectionState) => void) | null = null;
  /** Called when the room's peers change. */
  onPeers: ((peers: Peer[]) => void) | null = null;
  /** Called for every peer message (relayed from the TV or a companion). */
  onPeerMessage: ((msg: RawPeerMessage) => void) | null = null;
  /** Called for every message the server sent of its own. */
  onServerMessage: ((msg: ServerMessage) => void) | null = null;

  private readonly t: ConnectionTiming;
  private readonly log: Logger;
  private socket: WebSocket | null = null;
  private attempt = 0;
  private startedAt = 0;
  private welcomedAt = 0;
  private lastDataAt = 0;
  private lostAt: number | null = null;
  private clockOffset = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private dropped: { count: number; firstAt: number; types: Set<string> } | null = null;
  private late: { count: number; maxAgeMs: number } | null = null;
  private readonly onVisible = () => this.wake('page visible');
  private readonly onOnline = () => this.wake('network back');

  /**
   * @param opts - where to connect, who we are, the logger
   */
  constructor(private readonly opts: ConnectionOptions) {
    this.t = { ...DEFAULT_TIMING, ...opts.timing };
    this.log = opts.log;
  }

  /** Starts connecting (and keeps reconnecting until `close()`). */
  connect(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    globalThis.document?.addEventListener('visibilitychange', this.onVisible);
    globalThis.addEventListener?.('online', this.onOnline);
    this.lastTick = Date.now();
    this.watchTimer ??= setInterval(() => this.watch(), 1_000);
    this.start('start');
  }

  /** Claims the room's slot back after `replaced` (or retries after `refused`). */
  takeOver(): void {
    if (this.state !== 'replaced' && this.state !== 'refused') return;
    this.log.info('net', 'Taking over', { room: this.opts.room });
    this.attempt = 0;
    this.start('take over');
  }

  /** Closes for good. */
  close(): void {
    this.setState('closed');
    this.clearTimers();
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    globalThis.document?.removeEventListener('visibilitychange', this.onVisible);
    globalThis.removeEventListener?.('online', this.onOnline);
    this.socket?.close(1000, 'closed');
    this.socket = null;
  }

  /**
   * Sends a peer message (stamped `sent`). Never queues.
   *
   * @param msg - the message (`type` and its fields)
   * @returns false when not connected — the message is dropped, the caller tells the user
   */
  send(msg: { type: string } & Record<string, unknown>): boolean {
    // A socket already closing still reads 'open' here until its onclose (rv#14).
    if (this.state !== 'open' || !this.socket || this.socket.readyState !== 1) {
      this.dropped ??= { count: 0, firstAt: Date.now(), types: new Set() };
      this.dropped.count++;
      this.dropped.types.add(msg.type);
      return false;
    }
    this.socket.send(JSON.stringify({ ...msg, sent: this.serverNow() }));
    return true;
  }

  /**
   * The server's clock as far as this page can tell (ms).
   *
   * @returns epoch ms on the server
   */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────────────────

  private start(reason: string): void {
    this.clearTimers();
    this.setState('connecting');
    this.startedAt = Date.now();
    this.log.info('net', 'Connecting', { url: this.opts.url, attempt: this.attempt, reason });
    let socket: WebSocket;
    try {
      socket = this.opts.createSocket ? this.opts.createSocket(this.opts.url) : new WebSocket(this.opts.url);
    } catch (e) {
      this.log.error('net', 'Could not open a socket', { error: String(e) });
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.welcomeTimer = setTimeout(() => this.forceReconnect('no welcome in time'), this.t.welcomeMs);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.log.debug('net', 'Socket open', { connectMs: Date.now() - this.startedAt });
      socket.send(JSON.stringify({
        type: 'hello', protocol: PROTOCOL_VERSION, role: this.opts.role, room: this.opts.room,
        client: this.opts.client, name: this.opts.name, build: this.opts.build,
      }));
    };
    socket.onmessage = (ev) => {
      if (this.socket === socket) this.receive(typeof ev.data === 'string' ? ev.data : '');
    };
    socket.onclose = (ev) => {
      if (this.socket === socket) this.lost(ev.code, ev.reason);
    };
    socket.onerror = () => {
      /* the close event follows and says more */
    };
  }

  private lost(code: number, reason: string): void {
    const wasOpen = this.state === 'open';
    this.socket = null;
    this.clearTimers();
    const now = Date.now();
    if (wasOpen) {
      this.log.warn('net', 'Connection lost', {
        closeCode: code, reason, upS: Math.round((now - this.welcomedAt) / 1000), lastDataAgoMs: now - this.lastDataAt,
      });
    }
    if (this.state === 'replaced' || this.state === 'refused' || this.state === 'closed') return;
    this.lostAt ??= now;
    if (wasOpen) {
      this.peers = [];
      this.onPeers?.(this.peers);
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const steps = this.t.backoffMs;
    const delay = steps[Math.min(this.attempt, steps.length - 1)] ?? 5_000;
    this.attempt++;
    this.setState('waiting');
    this.log.info('net', 'Reconnect scheduled', { delayS: delay / 1000, attempt: this.attempt });
    this.reconnectTimer = setTimeout(() => this.start('backoff'), delay);
  }

  private forceReconnect(reason: string): void {
    this.log.warn('net', 'Forcing reconnect', { reason });
    const socket = this.socket;
    this.socket = null;
    socket?.close(4000, reason);
    this.lost(4000, reason);
  }

  /** The page came back or the network did: don't wait for the backoff. */
  private wake(reason: string): void {
    if (reason === 'page visible' && globalThis.document?.visibilityState !== 'visible') return;
    this.log.info('net', reason === 'page visible' ? 'Page visible' : 'Network back', { state: this.state });
    if (this.state === 'waiting') {
      this.attempt = 0;
      this.start(reason);
    } else if (this.state === 'open' && Date.now() - this.lastDataAt > this.t.pingMs * 1.5) {
      this.forceReconnect(`${reason}, silent`);
    }
  }

  /** Every second: stalls, silence, nothing else. */
  private watch(): void {
    const now = Date.now();
    const gap = now - this.lastTick;
    this.lastTick = now;
    if (gap > this.t.stallMs) this.log.warn('net', 'Event loop stalled (or app paused)', { stallMs: gap });
    if (this.state === 'open' && now - this.lastDataAt > this.t.silentMs) this.forceReconnect('no data');
  }

  private clearTimers(): void {
    for (const timer of [this.reconnectTimer, this.welcomeTimer]) if (timer) clearTimeout(timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = this.welcomeTimer = this.pingTimer = null;
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.onState?.(state);
  }

  // ── messages ─────────────────────────────────────────────────────────────────────────────

  private receive(text: string): void {
    this.lastDataAt = Date.now();
    const json = parseJson(text);
    const value = json.ok ? json.value : null;
    if (!value || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') {
      this.log.warn('net', 'Unreadable message', { error: json.ok ? 'no type' : json.error, bytes: text.length });
      return;
    }
    const msg = value as RawPeerMessage;
    if (SERVER_MESSAGE_TYPES.has(msg.type)) {
      const checked = checkServerMessage(msg);
      if (!checked.ok) {
        this.log.warn('net', 'Bad server message', { type: msg.type, error: checked.error });
        return;
      }
      this.fromServer(checked.value);
      return;
    }
    this.noteLateness(msg);
    this.onPeerMessage?.(msg);
  }

  private fromServer(msg: ServerMessage): void {
    const now = Date.now();
    switch (msg.type) {
      case 'welcome': {
        if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
        this.welcomeTimer = null;
        this.welcomedAt = now;
        this.attempt = 0;
        this.clockOffset = msg.serverTime - now;
        this.peers = msg.peers;
        this.serverBuild = msg.build;
        this.log.info('net', 'Welcomed', {
          connectMs: now - this.startedAt, outageMs: this.lostAt ? now - this.lostAt : 0, peers: msg.peers.length, serverBuild: msg.build,
        });
        this.lostAt = null;
        if (this.dropped) {
          this.log.warn('net', 'Dropped while offline', { count: this.dropped.count, firstAgoMs: now - this.dropped.firstAt, types: [...this.dropped.types].join(',') });
          this.dropped = null;
        }
        this.pingTimer = setInterval(() => this.socket?.send(JSON.stringify({ type: 'ping', t: Date.now() })), this.t.pingMs);
        this.setState('open');
        this.onPeers?.(this.peers);
        break;
      }
      case 'pong': {
        const rtt = now - msg.t;
        this.rttMs = rtt;
        this.clockOffset = msg.serverTime + rtt / 2 - now;
        if (rtt > 1_000) this.log.warn('net', 'Slow round trip', { rttMs: rtt });
        else this.log.debug('net', 'Round trip', { rttMs: rtt });
        break;
      }
      case 'peer.joined':
        this.peers = [...this.peers.filter((p) => p.client !== msg.peer.client), msg.peer];
        this.log.info('net', 'Peer joined', { peer: msg.peer.client, role: msg.peer.role, name: msg.peer.name });
        this.onPeers?.(this.peers);
        break;
      case 'peer.left':
        this.peers = this.peers.filter((p) => p.client !== msg.client);
        this.log.info('net', 'Peer left', { peer: msg.client, role: msg.role });
        this.onPeers?.(this.peers);
        break;
      case 'replaced':
        this.log.warn('net', 'Replaced by another TV', { by: msg.by });
        this.setState('replaced');
        break;
      case 'server.error':
        this.log.error('net', 'Refused by the server', { reason: msg.reason });
        this.setState('refused');
        break;
      case 'relay.undelivered':
        this.log.warn('net', 'Sent while the peer was away (not delivered)', { type: msg.msgType, seq: msg.seq, reason: msg.reason });
        break;
      case 'server.build':
        this.serverBuild = msg.build;
        this.log.info('net', 'Server serves a new build', { build: msg.build });
        break;
    }
    this.onServerMessage?.(msg);
  }

  /** Logs a run of late peer messages: the first one, then a summary when they end. */
  private noteLateness(msg: RawPeerMessage): void {
    if (typeof msg.sent !== 'number') return;
    const age = this.serverNow() - msg.sent;
    if (age > this.t.lateMs) {
      if (!this.late) this.log.warn('net', 'Late message from peer', { ageMs: Math.round(age), type: msg.type });
      this.late ??= { count: 0, maxAgeMs: 0 };
      this.late.count++;
      this.late.maxAgeMs = Math.max(this.late.maxAgeMs, Math.round(age));
    } else if (this.late) {
      this.log.info('net', 'Late messages ended', { count: this.late.count, maxAgeMs: this.late.maxAgeMs });
      this.late = null;
    }
  }
}
