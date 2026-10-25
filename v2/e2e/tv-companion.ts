/**
 * A bare companion for the TV's end-to-end flows: a WebSocket client that joins a table
 * through the real server and sends the TV requests and commands — independent of the
 * companion UI, so the TV's flows test the TV only.
 */

/** A message as it arrived. */
export type Msg = Record<string, unknown> & { type: string };

/** The server's port (as the Playwright config). */
export const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);

/** A picture map whose file need not exist (the TV only stores and syncs it). */
export function testMap(id = 'm1test00001', name = 'Test cave') {
  return {
    id, name, kind: 'picture', picture: { hash: '0123456789abcdef', ext: 'png', bytes: 1000 }, tableCopy: null, geometry: null,
    grid: { x: 0, y: 0, cellW: 100, cellH: 100, cols: 20, rows: 12, pictureW: 2000, pictureH: 1200 },
    drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

/** A companion connected to one table. */
export class BareCompanion {
  private ws!: WebSocket;
  private seq = 0;
  /** Everything received, oldest first. */
  readonly received: Msg[] = [];
  private waiters: { match: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];

  /**
   * @param table - the table id (room)
   * @param client - this companion's client id
   */
  constructor(private readonly table: string, readonly client = `c-e2e${Math.random().toString(36).slice(2, 9)}`) {}

  /** Connects and waits for `welcome`. */
  async connect(): Promise<void> {
    this.ws = new WebSocket(`ws://localhost:${SERVER_PORT}/ws`);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      this.received.push(m);
      for (const w of [...this.waiters]) {
        if (w.match(m)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(m);
        }
      }
    };
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('socket error'));
    });
    const welcome = this.next((m) => m.type === 'welcome');
    this.send({ type: 'hello', protocol: 1, role: 'companion', room: this.table, client: this.client, name: 'e2e companion', build: 'e2e' });
    await welcome;
  }

  /**
   * Waits for a message (also one that already arrived after `since`).
   *
   * @param match - which message
   * @param ms - how long to wait
   */
  next(match: (m: Msg) => boolean, ms = 10_000): Promise<Msg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no matching message in time')), ms);
      this.waiters.push({ match, resolve: (m) => { clearTimeout(t); resolve(m); } });
    });
  }

  /** Sends a raw message. */
  send(msg: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ ...msg, sent: Date.now() }));
  }

  /** Sends a reducer command. */
  command(cmd: Record<string, unknown>): void {
    this.send({ type: 'sync.cmd', seq: ++this.seq, cmd });
  }

  /** Asks for and returns the TV's snapshot. */
  async snapshot(): Promise<Msg> {
    const snap = this.next((m) => m.type === 'sync.snapshot');
    this.send({ type: 'sync.request' });
    return snap;
  }

  /** Closes the socket. */
  close(): void {
    this.ws.close();
  }
}
