/**
 * Test helpers: a server on a free port with a temporary app folder, and a WebSocket client
 * that waits for messages by type.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from 'mwlog';
import { PROTOCOL_VERSION } from '@battlemap/shared';
import { readConfig } from '../src/config.ts';
import { startServer, type RunningServer } from '../src/server.ts';

process.env.MWLOG_DISABLE = '1';

/** A server for one test file, with its temp folder. */
export interface TestServer {
  /** The running server. */
  server: RunningServer;
  /** `http://127.0.0.1:<port>`. */
  base: string;
  /** Its app folder. */
  appDir: string;
  /** Stops it and removes the folder. */
  stop(): Promise<void>;
}

/**
 * Starts a server on a free port with a tiny built app.
 *
 * @param helloTimeoutMs - how long sockets may wait before hello
 * @returns the server
 */
export async function testServer(helloTimeoutMs = 8_000): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'claude-v2-server-'));
  const appDir = join(dir, 'dist');
  mkdirSync(join(appDir, 'assets'), { recursive: true });
  writeFileSync(join(appDir, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(appDir, 'assets', 'a-123.js'), 'console.info(1)');
  writeFileSync(join(appDir, 'build.json'), JSON.stringify({ build: 'test-build' }));
  const config = { ...readConfig({ PORT: '0', HOST: '127.0.0.1' }), appDir, dataDir: join(dir, 'data'), helloTimeoutMs, buildPollMs: 0 };
  const log = init({ app: 'battlemap-v2-test', tenant: 'battlemap', console: false, hooks: false, stateDir: join(dir, 'state') });
  const server = await startServer(config, log);
  return {
    server,
    base: `http://127.0.0.1:${server.port}`,
    appDir,
    async stop() {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A message as JSON. */
export type Msg = Record<string, unknown> & { type: string };

/** A WebSocket client for tests. */
export class TestClient {
  /** Everything received, in order. */
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
   * @param hello - fields of the hello, or null to send nothing
   * @returns the client
   */
  static async open(base: string, hello: Partial<Msg> | null): Promise<TestClient> {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
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

  /** Sends a message. */
  send(msg: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * The next message of a type (one already received counts).
   *
   * @param type - the message type
   * @param ms - how long to wait
   * @returns the message
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
   */
  async closed(ms = 2_000): Promise<number> {
    const until = Date.now() + ms;
    while (this.closedWith === null && Date.now() < until) await Bun.sleep(10);
    if (this.closedWith === null) throw new Error('not closed');
    return this.closedWith;
  }

  /** Closes the socket. */
  close(): void {
    this.ws.close();
  }
}
