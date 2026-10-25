/**
 * What every contract file uses: where the server under test is (from the environment), a
 * WebSocket client that waits for messages by type, test pictures (sharp) and small HTTP
 * helpers. The suite is black-box: it only talks HTTP + WebSocket to `SERVER_URL` and, when the
 * runner gives it, looks into the server's `DATA_DIR`.
 *
 * | Variable | What |
 * |---|---|
 * | `SERVER_URL` | the server with the main settings (`run.ts` "main") |
 * | `SERVER_TIGHT_URL` | the same server started with tiny relay limits (`run.ts` "tight"); limit tests skip without it |
 * | `DATA_DIR` | the main server's data folder; file-system checks skip without it |
 * | `MOCK_PORT` | the port the link-fetch tests' upstream listens on (`*.test` names resolve to 127.0.0.1 in the server) |
 * | `CONTRACT_FIXES` | `1` = also check the review's server fixes (pixel limit, …) that the Bun server lacks |
 */
import { PROTOCOL_VERSION, newGame, wholeGrid, type FileRef, type Game, type MapInfo } from '../shared/src/index.ts';
import sharp from 'sharp';

/** The main server. */
export const BASE = (process.env.SERVER_URL ?? '').replace(/\/$/, '');
/** The server with tiny relay limits, or '' when the runner didn't start one. */
export const TIGHT = (process.env.SERVER_TIGHT_URL ?? '').replace(/\/$/, '');
/** The main server's data folder, or ''. */
export const DATA_DIR = process.env.DATA_DIR ?? '';
/** The link-fetch upstream's port, or 0. */
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 0);
/** Whether the review's fixes are checked too. */
export const FIXES = process.env.CONTRACT_FIXES === '1';

if (!BASE) throw new Error('SERVER_URL is not set — run the suite through run.ts (docs/server-rs.md "contract")');

export { MAIN, TIGHT_LIMITS } from './lib-settings.ts';

/** Waits. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A message as JSON. */
export type Msg = Record<string, unknown> & { type: string };

/** A WebSocket client for tests. */
export class TestClient {
  /** Everything received and not yet taken by `next`, in order. */
  readonly received: Msg[] = [];
  /** The close code once closed. */
  closedWith: number | null = null;
  private readonly waiters: { type: string; resolve: (m: Msg) => void }[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Msg;
      const i = this.waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
      else this.received.push(msg);
    };
    ws.onclose = (ev) => (this.closedWith = ev.code);
  }

  /**
   * Opens a socket and (unless `hello` is null) says hello and waits for welcome.
   *
   * @param base - the server's base URL
   * @param hello - fields of the hello (defaults: companion `c1` in room `r1`), or null to send nothing
   * @returns the client
   */
  static async open(base: string, hello: Partial<Msg> | null): Promise<TestClient> {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('socket failed'));
    });
    const client = new TestClient(ws);
    if (hello) {
      client.send({ type: 'hello', protocol: PROTOCOL_VERSION, role: 'companion', room: 'r1', client: 'c1', name: 'test', build: 'test', ...hello });
      await client.next('welcome');
    }
    return client;
  }

  /** Sends a message as JSON. */
  send(msg: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * The next message of a type (one already received counts).
   *
   * @param type - the message type
   * @param ms - how long to wait
   * @returns the message
   * @throws {Error} when none arrives in time
   */
  next(type: string, ms = 2_000): Promise<Msg> {
    const i = this.received.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.received.splice(i, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const j = this.waiters.indexOf(waiter);
        if (j >= 0) {
          this.waiters.splice(j, 1);
          reject(new Error(`no ${type} within ${ms} ms (got: ${this.received.map((m) => m.type).join(', ') || 'nothing'})`));
        }
      }, ms);
    });
  }

  /**
   * Waits until the socket is closed.
   *
   * @param ms - how long to wait
   * @returns the close code
   * @throws {Error} when it stays open
   */
  async closed(ms = 2_000): Promise<number> {
    const until = Date.now() + ms;
    while (this.closedWith === null && Date.now() < until) await sleep(10);
    if (this.closedWith === null) throw new Error('not closed');
    return this.closedWith;
  }

  /** Closes the socket. */
  close(): void {
    this.ws.close();
  }
}

/** Closes clients and gives the server a moment to notice. */
export async function closeAll(...clients: TestClient[]): Promise<void> {
  for (const c of clients) c.close();
  await sleep(50);
}

/**
 * A picture of noise (compresses badly, like a painted map) or a flat colour (like line art).
 *
 * @param w - width
 * @param h - height
 * @param format - png, jpeg, webp, gif or tiff
 * @param look - `noise` or `flat`
 * @param alpha - with an alpha channel
 * @returns the bytes
 */
export async function picture(w: number, h: number, format: 'png' | 'jpeg' | 'webp' | 'gif' | 'tiff' = 'png', look: 'noise' | 'flat' = 'flat', alpha = false): Promise<Uint8Array> {
  const channels = alpha ? 4 : 3;
  let img;
  if (look === 'noise') {
    const raw = new Uint8Array(w * h * channels);
    let x = 2463534242;
    for (let i = 0; i < raw.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      raw[i] = (x & 0x3f) + ((i / channels) % w) / 2; // a gradient with grain, like paint
    }
    img = sharp(raw, { raw: { width: w, height: h, channels } });
  } else {
    img = sharp({ create: { width: w, height: h, channels, background: alpha ? { r: 40, g: 90, b: 160, alpha: 0.5 } : '#285aa0' } });
  }
  // TIFF: LZW, not sharp's default JPEG-in-TIFF (YCbCr), which the Rust server's decoder can't
  // read (docs/server-rs.md "known differences").
  const options = format === 'webp' ? { quality: 50 } : format === 'tiff' ? { compression: 'lzw' } : {};
  return new Uint8Array(await img.toFormat(format, options).toBuffer());
}

/**
 * A picture's size and format as sharp reads it.
 *
 * @param data - the bytes
 * @returns width, height, format
 */
export async function inspect(data: Uint8Array): Promise<{ width: number; height: number; format: string }> {
  const m = await sharp(data).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0, format: m.format ?? '' };
}

/** What `POST /files` answers (the fields the tests read). */
export interface Uploaded {
  hash: string;
  ext: FileRef['ext'];
  bytes: number;
  width: number | null;
  height: number | null;
  thumb: FileRef | null;
  originalBytes: number | null;
  note: string | null;
  error?: string;
}

/**
 * Uploads bytes to `POST /files`.
 *
 * @param data - the bytes
 * @param query - `ext=…&format=…`
 * @param base - the server (default the main one)
 * @returns status and body
 */
export async function upload(data: Uint8Array, query = '', base = BASE): Promise<{ status: number; body: Uploaded }> {
  const res = await fetch(`${base}/files${query ? '?' + query : ''}`, { method: 'POST', body: data });
  return { status: res.status, body: (await res.json()) as Uploaded };
}

/**
 * Downloads a stored file.
 *
 * @param ref - its hash and ext
 * @returns the bytes
 */
export async function download(ref: { hash: string; ext: string }): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/files/${ref.hash}.${ref.ext}`);
  if (res.status !== 200) throw new Error(`GET /files/${ref.hash}.${ref.ext}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The SHA-256 of bytes as hex. */
export function sha256(data: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(data).digest('hex');
}

/**
 * A picture map on an uploaded file.
 *
 * @param id - the map id
 * @param pic - the uploaded picture
 * @returns the map
 */
export function mapOn(id: string, pic: Pick<Uploaded, 'hash' | 'ext' | 'bytes' | 'width' | 'height'>): MapInfo {
  return {
    id, name: `Map ${id}`, kind: 'picture', picture: { hash: pic.hash, ext: pic.ext, bytes: pic.bytes }, tableCopy: null, geometry: null,
    grid: wholeGrid(10, 8, pic.width ?? 100, pic.height ?? 80), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

/**
 * A game on one map.
 *
 * @param id - the game id
 * @param map - its map
 * @returns the game
 */
export function gameOn(id: string, map: MapInfo): Game {
  return newGame({ id, name: `Game ${id}`, createdAt: '2026-10-25T18:00:00.000Z', map });
}

/**
 * A JSON request.
 *
 * @param method - the method
 * @param path - the path on the main server
 * @param body - sent as JSON (a string is sent as it is)
 * @returns status, headers and the parsed body (null when empty)
 */
export async function call(method: string, path: string, body?: unknown): Promise<{ status: number; headers: Headers; body: any }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, headers: res.headers, body: parsed };
}
