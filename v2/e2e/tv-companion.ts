/**
 * A bare companion for the TV's end-to-end flows: a WebSocket client that joins a table
 * through the real server and sends the TV requests and commands — independent of the
 * companion UI, so the TV's flows test the TV only.
 */

/** A message as it arrived. */
export type Msg = Record<string, unknown> & { type: string };

/** The server's port (as the Playwright config). */
export const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);

/** A file reference as the server answers an upload. */
export interface Ref { hash: string; ext: string; bytes: number }

/** A ref to no file (the TV still stores and syncs the map; the renderer reports it missing). */
export const MISSING: Ref = { hash: '0123456789abcdef', ext: 'png', bytes: 1000 };

/**
 * Draws a 2000 × 1200 test map in the page (stone floor, walls, a pool, grid lines every
 * 100 px) and uploads it to the server (`POST /files?ext=png`).
 *
 * @param page - any page of the app (same origin as the server proxy)
 * @returns the stored file's ref
 */
export async function uploadTestPicture(page: { evaluate<T>(f: () => Promise<T>): Promise<T> }): Promise<Ref> {
  return page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 2000;
    c.height = 1200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3b3530';
    g.fillRect(0, 0, 2000, 1200);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `hsl(30 8% ${18 + ((i * 37) % 14)}%)`;
      g.fillRect((i * 173) % 2000, (i * 97) % 1200, 100, 100);
    }
    g.fillStyle = '#1d4a5c';
    g.beginPath();
    g.ellipse(1400, 700, 260, 160, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#15110e';
    g.fillRect(0, 0, 2000, 100);
    g.fillRect(0, 1100, 2000, 100);
    g.fillRect(0, 0, 100, 1200);
    g.fillRect(1900, 0, 100, 1200);
    g.fillRect(900, 100, 100, 600);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x <= 2000; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1200); g.stroke(); }
    for (let y = 0; y <= 1200; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(2000, y); g.stroke(); }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const res = await fetch('/files?ext=png&format=asis', { method: 'POST', body: blob });
    const j = (await res.json()) as { hash: string; ext: string; bytes: number };
    return { hash: j.hash, ext: j.ext, bytes: j.bytes };
  });
}

/** A 20 × 12 picture map on `picture` (a test picture, or `MISSING`). */
export function testMap(picture: Ref = MISSING, id = 'm1test00001', name = 'Test cave') {
  return {
    id, name, kind: 'picture', picture, tableCopy: null, geometry: null,
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
