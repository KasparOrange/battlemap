/**
 * Starts a private battlemap server for one test (or the bot): a free port, its own temp
 * `DATA_DIR`, stopped and cleaned up afterwards. The shared server of a Playwright run is started
 * by `playwright.config.ts`; this is for tests that must not share state (games, library, files)
 * or that stop the server on purpose (relay outage).
 *
 * Pages reach a private server with `?server=<url>` (the app's config reads it), so the app's
 * Vite dev server keeps proxying to the shared one undisturbed.
 *
 * `BATTLEMAP_E2E_SERVER=rust` runs every server of the run — the shared one and the private ones —
 * on the Rust binary instead of Bun. `playwright.config.ts` builds `server-rs` once per run and
 * copies the binary to {@link rustServerBin} (so another helper's rebuild can't swap it mid-run).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The v2 root (this file is `v2/e2e/support/server.ts`). */
export const V2_DIR = resolve(import.meta.dirname, '..', '..');

/** Which server the run uses: `'bun'` (default) or `'rust'` (`BATTLEMAP_E2E_SERVER=rust`). */
export const E2E_SERVER: 'bun' | 'rust' = process.env.BATTLEMAP_E2E_SERVER === 'rust' ? 'rust' : 'bun';

/**
 * Where this run's Rust server binary lives: a private copy per shared server port
 * (`$TMPDIR/claude-v2-e2e-rs-<port>/battlemap-server`), or `BATTLEMAP_E2E_RS_BIN` when set.
 *
 * @param serverPort - the run's shared server port (default: `BATTLEMAP_SERVER_PORT`, else 5929)
 * @returns the binary's absolute path
 */
export function rustServerBin(serverPort = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929)): string {
  return process.env.BATTLEMAP_E2E_RS_BIN ?? join(tmpdir(), `claude-v2-e2e-rs-${serverPort}`, 'battlemap-server');
}

/**
 * The command that starts a server of the chosen kind: `[program, args, working folder]`.
 *
 * @returns Bun on `server/src/main.ts`, or the Rust binary (working folder `server-rs/`)
 */
function serverCommand(): [string, string[], string] {
  return E2E_SERVER === 'rust'
    ? [rustServerBin(), [], join(V2_DIR, 'server-rs')]
    : ['bun', [join(V2_DIR, 'server', 'src', 'main.ts')], join(V2_DIR, 'server')];
}

/** A running private server. */
export interface TestServer {
  /** `http://127.0.0.1:<port>`. */
  url: string;
  /** `ws://127.0.0.1:<port>/ws`. */
  wsUrl: string;
  /** Its port. */
  port: number;
  /** Its data folder (removed by `stop`, unless `keepData`). */
  dataDir: string;
  /** Stops the process (SIGTERM, then SIGKILL after 3 s). Data stays for a `restart`. */
  kill(): Promise<void>;
  /** Starts it again on the same port and data (after `kill`) — a relay outage. */
  restart(): Promise<void>;
  /** Stops it and removes its data folder. */
  stop(): Promise<void>;
  /** The server's output so far (stdout + stderr, last 200 lines), for a failing test. */
  output(): string;
}

/**
 * Finds a free TCP port on 127.0.0.1.
 *
 * @returns the port
 */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
}

/**
 * Waits until `GET <url>/health` answers 200.
 *
 * @param url - the server's base URL
 * @param timeoutMs - how long to wait
 * @throws Error on timeout
 */
export async function waitHealthy(url: string, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server ${url} not healthy within ${timeoutMs} ms`);
}

/**
 * Starts a private server — Bun, or the Rust binary under `BATTLEMAP_E2E_SERVER=rust`.
 *
 * @param opts.port - a fixed port (default: a free one)
 * @param opts.dataDir - an existing data folder to use (default: a new temp folder)
 * @param opts.env - extra environment (e.g. MWLOG_* to ship logs)
 * @returns the running server
 * @throws Error when it doesn't come up
 */
export async function startTestServer(opts: { port?: number; dataDir?: string; env?: Record<string, string> } = {}): Promise<TestServer> {
  const port = opts.port ?? (await freePort());
  const ownData = !opts.dataDir;
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'claude-v2-e2e-data-'));
  const url = `http://127.0.0.1:${port}`;
  const lines: string[] = [];
  let child: ChildProcess | null = null;

  const launch = async () => {
    const [program, args, cwd] = serverCommand();
    child = spawn(program, args, {
      cwd,
      // BATTLEMAP_LOG_STDERR: the Rust server's log lines go to stderr too, for `output()`.
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, BATTLEMAP_LOG_STDERR: '1', ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const keep = (b: Buffer) => {
      lines.push(...b.toString().split('\n').filter(Boolean));
      if (lines.length > 200) lines.splice(0, lines.length - 200);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    await waitHealthy(url);
  };

  const kill = async () => {
    const c = child;
    child = null;
    if (!c || c.exitCode !== null) return;
    await new Promise<void>((done) => {
      const t = setTimeout(() => c.kill('SIGKILL'), 3000);
      c.once('exit', () => { clearTimeout(t); done(); });
      c.kill('SIGTERM');
    });
  };

  await launch();
  return {
    url, wsUrl: `ws://127.0.0.1:${port}/ws`, port, dataDir,
    kill,
    restart: launch,
    stop: async () => {
      await kill();
      if (ownData) rmSync(dataDir, { recursive: true, force: true });
    },
    output: () => lines.join('\n'),
  };
}
