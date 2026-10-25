/**
 * Starts the server: one Bun.serve for HTTP and the relay's WebSocket at `/ws`, the stores in
 * the data folder (files, shared library, game backups), the temp cleanup, and a watch on the
 * built app's `build.json` that tells every client when a new build is served.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerConfig } from './config.ts';
import type { ServerLog } from './log.ts';
import { route } from './http/routes.ts';
import { Relay, type Conn } from './relay/relay.ts';
import { FileStore } from './files/store.ts';
import { Library } from './library/library.ts';
import { Backups } from './games/backups.ts';
import { makeDownloader, type Downloader } from './fetch/download.ts';
import { cleanup } from './cleanup.ts';
import { isPublicAddress } from './fetch/guard.ts';

/**
 * The client's address. Behind the HTTPS proxy (Caddy, on a private Docker address) the socket's
 * peer is the proxy, so the last `X-Forwarded-For` entry — the one the proxy added — is used;
 * a public peer's header is ignored (anyone can send one).
 *
 * @param req - the request
 * @param peer - the socket's peer address
 * @returns the address to log and limit by
 */
export function clientIp(req: Request, peer: string): string {
  const bare = peer.replace(/^::ffff:/, '');
  if (isPublicAddress(bare)) return bare;
  const forwarded = req.headers.get('x-forwarded-for');
  const last = forwarded?.split(',').pop()?.trim();
  return last || bare;
}

/** What each socket carries. */
interface SocketData {
  /** Unique per socket. */
  id: number;
  /** The client's address. */
  ip: string;
  /** The relay's handle for it, made when the socket opens. */
  conn: Conn | null;
}

/** A running server. */
export interface RunningServer {
  /** The port it listens on. */
  readonly port: number;
  /** The relay. */
  readonly relay: Relay;
  /** Stops listening and closes every socket. */
  stop(): Promise<void>;
}

/**
 * Reads the build id from the app's `build.json`.
 *
 * @param appDir - the built app's folder
 * @returns the build, or null without a build
 */
export async function readBuild(appDir: string): Promise<string | null> {
  try {
    const parsed = (await Bun.file(join(appDir, 'build.json')).json()) as { build?: unknown };
    return typeof parsed.build === 'string' ? parsed.build : null;
  } catch {
    return null;
  }
}

/**
 * Starts the server.
 *
 * @param config - port, folders, timings, limits
 * @param log - the logger
 * @param download - the link fetch's downloader (tests pass a fake; default: the real one,
 *   public addresses only)
 * @returns the running server
 */
export async function startServer(config: ServerConfig, log: ServerLog, download?: Downloader): Promise<RunningServer> {
  const startedAt = Date.now();
  let build = await readBuild(config.appDir);
  const relay = new Relay(log, () => build, config.helloTimeoutMs, config.relay);
  let nextConn = 1;

  for (const sub of ['files', 'games', 'uploads', 'trash']) await mkdir(join(config.dataDir, sub), { recursive: true });
  const files = new FileStore(config.dataDir);
  const library = new Library(config.dataDir, files);
  const backups = new Backups(config.dataDir, files, library, config.gameVersions);
  const ctx = {
    log, relay, appDir: config.appDir, build: () => build, startedAt, dataDir: config.dataDir, files, library, backups,
    download: download ?? makeDownloader({ maxBytes: config.maxUploadBytes, timeoutMs: config.fetchTimeoutMs }),
    maxUploadBytes: config.maxUploadBytes, maxGameBytes: config.maxGameBytes, slowMs: config.slowMs,
  };
  const clean = () => cleanup(config.dataDir, { uploadDays: config.uploadMaxAgeDays, trashDays: config.trashMaxAgeDays }, log).catch((e) => log.error('cleanup', 'Cleanup failed', { error: String(e) }));
  void clean();
  const cleaner = config.cleanupEveryMs > 0 ? setInterval(clean, config.cleanupEveryMs) : null;

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req, srv) {
      const ip = clientIp(req, srv.requestIP(req)?.address ?? '?');
      if (new URL(req.url).pathname === '/ws') {
        if (srv.upgrade(req, { data: { id: nextConn++, ip, conn: null } })) return undefined;
        return new Response('WebSocket upgrade expected', { status: 426 });
      }
      try {
        return await route(req, ip, ctx);
      } catch (e) {
        log.error('http', 'Request failed', { path: new URL(req.url).pathname, error: String(e) });
        return new Response('server error', { status: 500 });
      }
    },
    websocket: {
      data: {} as SocketData,
      idleTimeout: 60,
      maxPayloadLength: config.relay.maxFrameBytes,
      open(ws) {
        const conn: Conn = {
          id: ws.data.id,
          ip: ws.data.ip,
          send: (text) => void ws.send(text),
          close: (code, reason) => ws.close(code, reason),
          buffered: () => ws.getBufferedAmount(),
        };
        ws.data.conn = conn;
        relay.open(conn);
      },
      message(ws, message) {
        if (ws.data.conn) relay.message(ws.data.conn, typeof message === 'string' ? message : new TextDecoder().decode(message));
      },
      close(ws, code) {
        if (ws.data.conn) relay.close(ws.data.conn, code);
      },
    },
  });

  const poll = config.buildPollMs > 0
    ? setInterval(async () => {
      const now = await readBuild(config.appDir);
      if (now && now !== build) {
        log.info('lifecycle', 'New app build', { from: build, to: now });
        build = now;
        relay.broadcastAll({ type: 'server.build', build: now });
      }
    }, config.buildPollMs)
    : null;

  const port = server.port ?? config.port;
  log.info('lifecycle', 'Listening', { port, host: config.host, appDir: config.appDir, dataDir: config.dataDir, build });
  return {
    port,
    relay,
    async stop() {
      if (poll) clearInterval(poll);
      if (cleaner) clearInterval(cleaner);
      relay.stop();
      await server.stop(true);
    },
  };
}
