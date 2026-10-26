/**
 * A client of v1's relay (the old `tools/vtt_relay.py`, port 9090) in the `bot` role: it sits next
 * to the tablet instead of replacing it, its messages go to the TV, and it hears everything the
 * TV sends the tablet (`docs/relay-protocol.md` "bot role"). The v1 import asks the TV for its
 * library (`lib.requestList` → `lib.listing`, every game's full session JSON) and, for a map whose
 * file is nowhere on the dev server, makes the TV send it the way it sends it to a tablet on a
 * resume (`nav.goToGame` → `vtt.downloadMap` or `vtt.mapStart` / `mapChunk` / `mapEnd`).
 */
import type { V1Listing } from './v1.ts';

/** A JSON message of v1's protocol. */
type Msg = { type: string } & Record<string, unknown>;

/** What the TV sent for a map: a link to download, or the bytes themselves. */
export type TvMapTransfer = { url: string } | { bytes: Uint8Array };

/** A waiter for a message. */
interface Waiter {
  pred: (m: Msg) => boolean;
  resolve: (m: Msg) => void;
}

/** The v1 relay client in the bot role. */
export class V1Bot {
  /** Whether the TV was on the relay when the bot registered. */
  tvOnline = false;
  /** Called with one line per notable event. */
  onLog: ((line: string, fields?: Record<string, unknown>) => void) | null = null;

  private ws: WebSocket | null = null;
  private waiters: Waiter[] = [];
  private chunks: string[] | null = null;
  private chunkWaiter: ((t: TvMapTransfer) => void) | null = null;

  /**
   * @param url - the relay, `ws://72.62.88.197:9090`
   */
  constructor(private readonly url: string) {}

  /**
   * Connects and registers as `bot`.
   *
   * @param timeoutMs - how long to wait for `registered`
   * @returns whether the TV is on the relay (`paired`)
   * @throws Error when the relay can't be reached
   */
  async connect(timeoutMs = 10_000): Promise<boolean> {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer from the v1 relay at ${this.url}`)), timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`could not reach the v1 relay at ${this.url}`));
      };
    });
    ws.onmessage = (e) => this.receive(String(e.data));
    ws.onclose = () => this.onLog?.('v1 relay closed the connection');
    const reg = this.next((m) => m.type === 'registered', timeoutMs, 'registered');
    ws.send(JSON.stringify({ type: 'register', role: 'bot' }));
    const m = await reg;
    this.tvOnline = m.paired === true;
    this.onLog?.('Registered on the v1 relay as bot', { tvOnline: this.tvOnline });
    return this.tvOnline;
  }

  /**
   * Asks the TV for its maps and games.
   *
   * @param timeoutMs - how long to wait
   * @returns the listing
   * @throws Error on timeout
   */
  async listing(timeoutMs = 20_000): Promise<V1Listing> {
    const reply = this.next((m) => m.type === 'lib.listing', timeoutMs, 'lib.listing');
    this.send({ type: 'lib.requestList' });
    const m = await reply;
    return { maps: (m.maps as V1Listing['maps']) ?? [], sessions: (m.sessions as V1Listing['sessions']) ?? [] };
  }

  /**
   * Asks the TV for its status (`diag.status`): its calibration among it.
   *
   * @param timeoutMs - how long to wait
   * @returns the status, or null on timeout
   */
  async status(timeoutMs = 5_000): Promise<Record<string, unknown> | null> {
    const reply = this.next((m) => m.type === 'diag.statusResponse', timeoutMs, 'diag.statusResponse').catch(() => null);
    this.send({ type: 'diag.status' });
    return reply;
  }

  /**
   * Makes the TV open a game on a map (an existing session, or — without one — a new session it
   * starts) and catches the map it then sends the tablet.
   *
   * @param mapId - the TV library map
   * @param sessionId - a session to resume, or null to start a new one
   * @param timeoutMs - how long to wait for the whole transfer
   * @returns the link or the bytes
   * @throws Error on timeout
   */
  async mapFromTv(mapId: string, sessionId: string | null, timeoutMs = 180_000): Promise<TvMapTransfer> {
    const done = new Promise<TvMapTransfer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.chunkWaiter = null;
        reject(new Error(`the v1 TV sent no map within ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.chunkWaiter = (t) => {
        clearTimeout(timer);
        this.chunkWaiter = null;
        resolve(t);
      };
    });
    this.send({ type: 'nav.goToGame', mapId, ...(sessionId ? { sessionId } : {}) });
    return done;
  }

  /** Sends the TV back to its library. */
  goToLibrary(): void {
    this.send({ type: 'nav.goToLibrary' });
  }

  /**
   * Deletes a game on the TV (one the import started itself to get a map's file).
   *
   * @param sessionId - the game
   */
  deleteSession(sessionId: string): void {
    this.send({ type: 'lib.deleteSession', sessionId });
  }

  /** Closes the connection. */
  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Sends a message. */
  private send(m: Msg): void {
    this.ws?.send(JSON.stringify({ ...m, sent: Date.now() }));
  }

  /** Waits for a message. */
  private next(pred: (m: Msg) => boolean, timeoutMs: number, what: string): Promise<Msg> {
    return new Promise((resolve, reject) => {
      const w: Waiter = { pred, resolve: (m) => { clearTimeout(timer); resolve(m); } };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error(`no ${what} from the v1 TV within ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiters.push(w);
    });
  }

  /** Handles one frame. */
  private receive(text: string): void {
    let m: Msg;
    try {
      m = JSON.parse(text) as Msg;
    } catch {
      return;
    }
    if (m.type === 'ping') {
      this.ws?.send(JSON.stringify({ type: 'pong', ...(m.sent !== undefined ? { t: m.sent } : {}) }));
      return;
    }
    if (m.type === 'tv.error') this.onLog?.('v1 TV error', { msg: m.msg });
    if (m.type === 'vtt.downloadMap' && typeof m.url === 'string') this.chunkWaiter?.({ url: m.url });
    if (m.type === 'vtt.mapStart') this.chunks = [];
    if (m.type === 'vtt.mapChunk' && this.chunks && typeof m.i === 'number' && typeof m.d === 'string') this.chunks[m.i] = m.d;
    if (m.type === 'vtt.mapEnd' && this.chunks) {
      const b64 = this.chunks.join('');
      this.chunks = null;
      this.chunkWaiter?.({ bytes: new Uint8Array(Buffer.from(b64, 'base64')) });
    }
    for (const w of [...this.waiters]) {
      if (w.pred(m)) {
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve(m);
      }
    }
  }
}
