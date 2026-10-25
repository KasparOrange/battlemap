/**
 * The server's HTTP routes (the WebSocket upgrade at `/ws` is in `server.ts`):
 *
 * | Route | What | Where |
 * |---|---|---|
 * | `GET /health` | ok, builds, uptime, rooms, sockets, library and backup counts, the log shipper | here |
 * | `POST /log` | log batches from the app (mwlog-ts browser forwarder) → MwLog | here |
 * | `GET /api/tables` | the rooms with a TV online (the companion's table picker) | here |
 * | `POST /files`, `GET /files/…`, `GET /uploads/…` | the file store | `files/routes.ts` |
 * | `/api/library…` | the shared map library | `library/routes.ts` |
 * | `/api/games…` | game backups | `games/routes.ts` |
 * | `GET /api/fetch?url=` | a link's map file | `fetch/routes.ts` |
 * | `GET /` → `/app/`, `GET /app/…` | the built app | `static.ts` |
 *
 * Every answer carries the CORS headers (the shell's bundle runs on its own origin). Every
 * request's outcome is logged: one line per API call (warn for 4xx/5xx, plus "slow" over a
 * second), app files and file downloads as 10-second summaries with failures on their own line.
 *
 * @see ../../../docs/server.md
 */
import type { ServerLog } from '../log.ts';
import type { Relay } from '../relay/relay.ts';
import type { FileStore } from '../files/store.ts';
import type { Library } from '../library/library.ts';
import type { Backups } from '../games/backups.ts';
import type { Downloader } from '../fetch/download.ts';
import { fileRoutes } from '../files/routes.ts';
import { libraryRoutes } from '../library/routes.ts';
import { gameRoutes } from '../games/routes.ts';
import { fetchRoutes } from '../fetch/routes.ts';
import { CORS, json, refuse } from './respond.ts';
import { serveApp } from './static.ts';

export { CORS } from './respond.ts';

/** What the routes need. */
export interface RouteContext {
  /** The logger. */
  log: ServerLog;
  /** The relay (tables, stats). */
  relay: Relay;
  /** The built app's folder. */
  appDir: string;
  /** The app build it holds, or null. */
  build: () => string | null;
  /** When the server started (epoch ms). */
  startedAt: number;
  /** The data folder. */
  dataDir: string;
  /** The file store. */
  files: FileStore;
  /** The shared library. */
  library: Library;
  /** Game backups. */
  backups: Backups;
  /** The link fetch's downloader. */
  download: Downloader;
  /** Largest upload, bytes. */
  maxUploadBytes: number;
  /** Largest game backup, bytes. */
  maxGameBytes: number;
  /** A request slower than this is logged as slow, ms. */
  slowMs: number;
}

/** The server bundle's own build (set by the deploy), for `/health`. */
export const SERVER_BUILD = process.env.BATTLEMAP_SERVER_BUILD ?? 'dev';

/**
 * Answers one HTTP request and logs its outcome.
 *
 * @param req - the request
 * @param ip - the client's address
 * @param ctx - logger, relay, stores
 * @returns the response
 */
export async function route(req: Request, ip: string, ctx: RouteContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const t0 = performance.now();
  const res = await answer(req, url, ip, ctx);
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  const quiet = path.startsWith('/app/') || ((req.method === 'GET' || req.method === 'HEAD') && (path.startsWith('/files/') || path === '/health')) || path === '/log';
  if (quiet && res.status < 400) {
    ctx.log.count('http', quiet && path.startsWith('/files/') ? 'File downloads' : path === '/log' ? 'Log batches' : path === '/health' ? 'Health checks' : 'App files', { status: res.status }, { ms });
  } else {
    const props = { method: req.method, path: path.length > 120 ? path.slice(0, 120) + '…' : path, status: res.status, ms, ip };
    if (res.status >= 500) ctx.log.error('http', 'Request failed', props);
    else if (res.status >= 400) ctx.log.warn('http', 'Request refused', props);
    else ctx.log.info('http', 'Request', props);
  }
  if (ms > ctx.slowMs) ctx.log.warn('http', 'Slow request', { method: req.method, path: path.slice(0, 120), status: res.status, ms });
  return res;
}

/** The response, without logging. */
async function answer(req: Request, url: URL, ip: string, ctx: RouteContext): Promise<Response> {
  const path = url.pathname;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (path === '/log' && req.method === 'POST') {
      const res = await ctx.log.handleBrowserLog(req, { ip });
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...CORS } });
    }
    if (path.startsWith('/app/') && (req.method === 'GET' || req.method === 'HEAD')) return await serveApp(ctx.appDir, path);
    if (path === '/' || path === '/app') return Response.redirect(new URL('/app/', url).toString(), 302);
    if (path === '/health') return json(await health(ctx));
    if (path === '/api/tables' && req.method === 'GET') return json({ tables: ctx.relay.tables() });
    return (
      (await fileRoutes(req, url, ctx)) ??
      (await libraryRoutes(req, url, ctx)) ??
      (await gameRoutes(req, url, ctx)) ??
      (await fetchRoutes(req, url, ctx)) ??
      refuse(404, 'not found')
    );
  } catch (e) {
    ctx.log.error('http', 'Request threw', { method: req.method, path: path.slice(0, 120), error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), stack: e instanceof Error ? e.stack?.slice(0, 1500) : undefined });
    return refuse(500, 'server error');
  }
}

/** The `/health` body. */
async function health(ctx: RouteContext): Promise<Record<string, unknown>> {
  const [entries, games] = await Promise.all([ctx.library.list().catch(() => null), ctx.backups.list().catch(() => null)]);
  return {
    ok: entries !== null && games !== null,
    build: ctx.build(),
    serverBuild: SERVER_BUILD,
    uptimeS: Math.round((Date.now() - ctx.startedAt) / 1000),
    startedAt: new Date(ctx.startedAt).toISOString(),
    ...ctx.relay.stats(),
    library: entries?.length ?? null,
    games: games?.length ?? null,
    mwlog: ctx.log.health(),
  };
}
