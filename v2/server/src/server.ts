/**
 * Starts the server: one Bun.serve for HTTP and the relay's WebSocket at `/ws`, and a watch on
 * the built app's `build.json` that tells every client when a new build is served.
 */
import { join } from 'node:path';
import type { ServerConfig } from './config.ts';
import type { ServerLog } from './log.ts';
import { route } from './http/routes.ts';
import { Relay, type Conn } from './relay/relay.ts';

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
 * @param config - port, folders, timings
 * @param log - the logger
 * @returns the running server
 */
export async function startServer(config: ServerConfig, log: ServerLog): Promise<RunningServer> {
  const startedAt = Date.now();
  let build = await readBuild(config.appDir);
  const relay = new Relay(log, () => build, config.helloTimeoutMs);
  let nextConn = 1;

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req, srv) {
      const ip = srv.requestIP(req)?.address ?? '?';
      if (new URL(req.url).pathname === '/ws') {
        if (srv.upgrade(req, { data: { id: nextConn++, ip, conn: null } })) return undefined;
        return new Response('WebSocket upgrade expected', { status: 426 });
      }
      try {
        return await route(req, ip, { log, relay, appDir: config.appDir, build: () => build, startedAt });
      } catch (e) {
        log.error('http', 'Request failed', { path: new URL(req.url).pathname, error: String(e) });
        return new Response('server error', { status: 500 });
      }
    },
    websocket: {
      data: {} as SocketData,
      idleTimeout: 60,
      maxPayloadLength: 16 * 1024 * 1024,
      open(ws) {
        const conn: Conn = { id: ws.data.id, ip: ws.data.ip, send: (text) => void ws.send(text), close: (code, reason) => ws.close(code, reason) };
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
  log.info('lifecycle', 'Listening', { port, host: config.host, appDir: config.appDir, build });
  return {
    port,
    relay,
    async stop() {
      if (poll) clearInterval(poll);
      await server.stop(true);
    },
  };
}
