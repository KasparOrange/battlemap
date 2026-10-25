/**
 * A protocol-level client: speaks the real v2 protocol (`docs/protocol.md`) over a WebSocket,
 * without a browser. The e2e flows use it as a scripted companion (to drive a TV page and to read
 * the TV's authoritative state through `sync.request` → `sync.snapshot`), and the soak bot
 * (`tools/bot.ts`) is built on it.
 *
 * It keeps its own confirmed copy of the TV's state exactly like the app's `SyncClient`: a
 * snapshot replaces it, every `sync.applied` with the next `rev` is folded on with the shared
 * reducer, a gap or a new epoch asks for a snapshot. Comparing that copy with a fresh snapshot is
 * the convergence check.
 *
 * Runs under Node (Playwright) and Bun (the bot): only the global `WebSocket` is used.
 *
 * @see ../../app/src/lib/state/client.ts — the app's version of the same bookkeeping
 */
import { apply, newId, PROTOCOL_VERSION, type Command, type RootState } from '../../shared/src/index.ts';

/** Any JSON message with a `type`. */
export type Msg = { type: string } & Record<string, unknown>;

/** What a command came to. */
export type CmdResult = { ok: true; rev: number } | { ok: false; reason: string };

/** A snapshot as the TV sent it. */
export interface Snapshot {
  /** The TV's epoch (changes per opened game / restart). */
  epoch: string;
  /** The revision. */
  rev: number;
  /** The whole state. */
  state: RootState;
  /** Last applied `seq` per client. */
  acks: Record<string, number>;
}

/** Options of a {@link ProtoClient}. */
export interface ProtoOptions {
  /** WebSocket URL of the server's relay, e.g. `ws://localhost:6182/ws`. */
  wsUrl: string;
  /** The table (room) to join. */
  room: string;
  /** `companion` (default) or `tv`. */
  role?: 'companion' | 'tv';
  /** A name for the server's logs and the TV's peer list. */
  name?: string;
  /** The client id (default: a new one, `bot-…`). */
  client?: string;
  /** Called with one line per notable event (connects, drops, rejections). */
  log?: (line: string, fields?: Record<string, unknown>) => void;
}

/** A waiter for a message. */
interface Waiter {
  pred: (m: Msg) => boolean;
  resolve: (m: Msg) => void;
}

/** A command sent and not yet answered. */
interface InFlight {
  cmd: Command;
  resolve: (r: CmdResult) => void;
}

/**
 * One protocol client. `connect()`, then `cmd()`, `snapshot()`, `request()`; `drop()` kills the
 * socket like a network loss, `connect()` again reconnects (same client id, seq continues).
 */
export class ProtoClient {
  /** This client's id. */
  readonly client: string;
  /** The confirmed copy of the TV's state (null before the first snapshot). */
  confirmed: RootState | null = null;
  /** Its revision. */
  rev = 0;
  /** Its epoch. */
  epoch: string | null = null;
  /** Everyone else in the room, from `welcome` / `peer.*`. */
  peers: { client: string; role: string; name: string }[] = [];
  /** Counters for reports. */
  readonly stats = { sent: 0, applied: 0, rejected: 0, snapshots: 0, gaps: 0, undelivered: 0, reconnects: 0, received: 0 };
  /** Every message received, newest last (capped at 500), for debugging a failed flow. */
  readonly recent: Msg[] = [];
  /** Called for every message received (after the client's own bookkeeping). */
  onMessage: ((m: Msg) => void) | null = null;

  private ws: WebSocket | null = null;
  private seq = 0;
  private waiters: Waiter[] = [];
  private inFlight = new Map<number, InFlight>();
  private readonly opts: Required<Omit<ProtoOptions, 'log'>> & Pick<ProtoOptions, 'log'>;

  /** @param opts - where to connect and as whom */
  constructor(opts: ProtoOptions) {
    this.client = opts.client ?? `bot-${newId(8)}`;
    this.opts = { role: 'companion', name: 'e2e bot', ...opts, client: this.client };
  }

  /** Whether the socket is open. */
  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Whether the room has a TV right now. */
  get tvOnline(): boolean {
    return this.peers.some((p) => p.role === 'tv');
  }

  /**
   * Opens the socket, says hello and waits for `welcome`. A companion then asks the TV for a
   * snapshot when one is there (as the app does), without waiting for it.
   *
   * @param timeoutMs - how long to wait for `welcome`
   * @returns the welcome message
   * @throws Error when the socket fails or no welcome comes in time
   */
  async connect(timeoutMs = 8000): Promise<Msg> {
    if (this.ws) this.drop();
    const ws = new WebSocket(this.opts.wsUrl);
    this.ws = ws;
    const welcome = new Promise<Msg>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no welcome from ${this.opts.wsUrl} in ${timeoutMs} ms`)), timeoutMs);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'hello', protocol: PROTOCOL_VERSION, role: this.opts.role, room: this.opts.room,
          client: this.client, name: this.opts.name, build: 'e2e',
        }));
      });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`socket error on ${this.opts.wsUrl}`)); });
      ws.addEventListener('close', (e) => { clearTimeout(timer); reject(new Error(`socket closed before welcome (${e.code} ${e.reason})`)); });
      this.waiters.push({ pred: (m) => m.type === 'welcome' || m.type === 'server.error', resolve: (m) => {
        clearTimeout(timer);
        if (m.type === 'server.error') reject(new Error(`server refused: ${String(m.reason)}`));
        else resolve(m);
      } });
    });
    ws.addEventListener('message', (e) => this.receive(String(e.data)));
    // heartbeat like the app's: the relay closes a socket silent for 45 s as a zombie
    const heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping', t: Date.now() })), 15_000);
    (heartbeat as { unref?: () => void }).unref?.();
    ws.addEventListener('close', () => {
      clearInterval(heartbeat);
      if (this.ws !== ws) return;
      this.opts.log?.('socket closed', { client: this.client });
      this.failInFlight('connection lost');
    });
    const w = await welcome;
    this.peers = (w.peers as typeof this.peers) ?? [];
    if (this.opts.role === 'companion' && this.tvOnline) this.send({ type: 'sync.request' });
    return w;
  }

  /** Closes the socket cleanly. */
  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.failInFlight('closed');
    ws?.close(1000, 'done');
  }

  /** Kills the socket as a network loss would (in-flight commands fail with "connection lost"). */
  drop(): void {
    const ws = this.ws;
    this.ws = null;
    this.failInFlight('connection lost');
    this.stats.reconnects++;
    try { ws?.close(4000, 'dropped by the test'); } catch { /* already closed */ }
  }

  /**
   * Sends a raw message (stamped with `sent`).
   *
   * @param m - the message
   * @returns false when the socket isn't open
   */
  send(m: Msg): boolean {
    if (!this.open) return false;
    this.ws!.send(JSON.stringify({ sent: Date.now(), ...m }));
    return true;
  }

  /**
   * Sends one reducer command and waits for the TV's verdict.
   *
   * @param cmd - the command
   * @param timeoutMs - how long to wait for `sync.applied` / `sync.rejected`
   * @returns applied (with the TV's rev) or rejected (with the reason; also "not connected",
   *   "connection lost", "timeout", "undelivered: no-tv")
   */
  cmd(cmd: Command, timeoutMs = 15_000): Promise<CmdResult> {
    const seq = ++this.seq;
    if (!this.send({ type: 'sync.cmd', seq, cmd })) return Promise.resolve({ ok: false, reason: 'not connected' });
    this.stats.sent++;
    return new Promise<CmdResult>((resolve) => {
      const timer = setTimeout(() => {
        this.inFlight.delete(seq);
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs);
      this.inFlight.set(seq, { cmd, resolve: (r) => { clearTimeout(timer); resolve(r); } });
    });
  }

  /**
   * Like {@link cmd} but throws unless the TV applied it.
   *
   * @param cmd - the command
   * @returns the TV's revision after it
   * @throws Error with the TV's reason
   */
  async must(cmd: Command): Promise<number> {
    const r = await this.cmd(cmd);
    if (!r.ok) throw new Error(`${cmd.type} not applied: ${r.reason}`);
    return r.rev;
  }

  /**
   * Asks the TV for its whole state.
   *
   * @param timeoutMs - how long to wait
   * @returns the snapshot
   * @throws Error on timeout
   */
  async snapshot(timeoutMs = 15_000): Promise<Snapshot> {
    const reply = this.next((m) => m.type === 'sync.snapshot' && m.to === this.client, timeoutMs, 'sync.snapshot');
    this.send({ type: 'sync.request' });
    const m = await reply;
    return { epoch: m.epoch as string, rev: m.rev as number, state: m.state as RootState, acks: m.acks as Record<string, number> };
  }

  /**
   * Sends a request (not a command) and waits for the first reply of a type.
   *
   * @param m - the request, e.g. `{type: 'lib.list'}`
   * @param replyTypes - the reply types to wait for (`lib.listing`, `sync.snapshot`, `tv.notice`…)
   * @param timeoutMs - how long to wait
   * @returns the reply
   * @throws Error on timeout or when not connected
   */
  async request(m: Msg, replyTypes: string[], timeoutMs = 10_000): Promise<Msg> {
    const reply = this.next((r) => replyTypes.includes(r.type), timeoutMs, replyTypes.join('|'));
    if (!this.send(m)) throw new Error(`${m.type}: not connected`);
    return reply;
  }

  /**
   * Waits for the next message that matches.
   *
   * @param pred - the test
   * @param timeoutMs - how long to wait
   * @param what - for the timeout's message
   * @returns the message
   * @throws Error on timeout
   */
  next(pred: (m: Msg) => boolean, timeoutMs = 5000, what = 'message'): Promise<Msg> {
    return new Promise<Msg>((resolve, reject) => {
      const waiter: Waiter = { pred, resolve: (m) => { clearTimeout(timer); resolve(m); } };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`no ${what} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /**
   * Waits until the confirmed copy satisfies a test (polling every 50 ms).
   *
   * @param pred - the test on the confirmed state
   * @param timeoutMs - how long to wait
   * @throws Error on timeout
   */
  async until(pred: (s: RootState) => boolean, timeoutMs = 5000): Promise<RootState> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.confirmed && pred(this.confirmed)) return this.confirmed;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('state condition not reached in time');
  }

  private receive(text: string): void {
    let m: Msg;
    try { m = JSON.parse(text) as Msg; } catch { return; }
    this.stats.received++;
    this.recent.push(m);
    if (this.recent.length > 500) this.recent.shift();
    switch (m.type) {
      case 'peer.joined':
        this.peers = [...this.peers.filter((p) => p.client !== (m.peer as { client: string }).client), m.peer as (typeof this.peers)[number]];
        if (this.opts.role === 'companion' && (m.peer as { role: string }).role === 'tv') this.send({ type: 'sync.request' });
        break;
      case 'peer.left':
        this.peers = this.peers.filter((p) => p.client !== m.client);
        break;
      case 'sync.snapshot':
        if (m.to === undefined || m.to === this.client) {
          this.stats.snapshots++;
          this.confirmed = m.state as RootState;
          this.rev = m.rev as number;
          this.epoch = m.epoch as string;
        }
        break;
      case 'sync.applied':
        this.onApplied(m);
        break;
      case 'sync.rejected': {
        this.stats.rejected++;
        const f = this.inFlight.get(m.seq as number);
        this.inFlight.delete(m.seq as number);
        f?.resolve({ ok: false, reason: String(m.reason) });
        break;
      }
      case 'relay.undelivered': {
        this.stats.undelivered++;
        const f = m.seq === undefined ? undefined : this.inFlight.get(m.seq as number);
        if (f) { this.inFlight.delete(m.seq as number); f.resolve({ ok: false, reason: `undelivered: ${String(m.reason)}` }); }
        break;
      }
    }
    for (const w of [...this.waiters]) {
      if (w.pred(m)) {
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve(m);
      }
    }
    this.onMessage?.(m);
  }

  private onApplied(m: Msg): void {
    this.stats.applied++;
    if (this.confirmed && m.epoch === this.epoch && m.rev === this.rev + 1) {
      const r = apply(this.confirmed, m.cmd as Command);
      if (r.ok) {
        this.confirmed = r.state;
        this.rev = m.rev as number;
      } else {
        this.opts.log?.('TV applied a command this copy refuses', { type: (m.cmd as Command).type, reason: r.reason });
        this.stats.gaps++;
        this.send({ type: 'sync.request' });
      }
    } else if (this.confirmed) {
      this.stats.gaps++;
      this.send({ type: 'sync.request' });
    }
    if (m.by === this.client) {
      const f = this.inFlight.get(m.seq as number);
      this.inFlight.delete(m.seq as number);
      f?.resolve({ ok: true, rev: m.rev as number });
    }
  }

  private failInFlight(reason: string): void {
    for (const f of this.inFlight.values()) f.resolve({ ok: false, reason });
    this.inFlight.clear();
  }
}
