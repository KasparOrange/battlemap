/**
 * The server's HTTP routes (the WebSocket upgrade at `/ws` is in `server.ts`):
 *
 * | Route | What |
 * |---|---|
 * | `GET /health` | uptime, build, rooms, sockets, the log shipper's counters |
 * | `POST /log` | log batches from the app (mwlog-ts browser forwarder) → MwLog |
 * | `GET /api/tables` | the rooms with a TV online (the companion's table picker) |
 * | `GET /` | → `/app/` |
 * | `GET /app/…` | the built app |
 *
 * `/log` and `/api/…` answer any origin (the shell's bundle runs on its own origin).
 */
import type { ServerLog } from '../log.ts';
import type { Relay } from '../relay/relay.ts';
import { serveApp } from './static.ts';

/** What the routes need. */
export interface RouteContext {
  /** The logger. */
  log: ServerLog;
  /** The relay (tables, stats). */
  relay: Relay;
  /** The built app's folder. */
  appDir: string;
  /** The build it holds, or null. */
  build: () => string | null;
  /** When the server started (epoch ms). */
  startedAt: number;
}

/** Headers that let any origin call the API. */
export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-trace',
  'access-control-max-age': '86400',
};

/** A JSON answer with the CORS headers. */
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

/**
 * Answers one HTTP request.
 *
 * @param req - the request
 * @param ip - the client's address
 * @param ctx - logger, relay, app folder
 * @returns the response
 */
export async function route(req: Request, ip: string, ctx: RouteContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const t0 = performance.now();

  if (req.method === 'OPTIONS' && (path === '/log' || path.startsWith('/api/'))) return new Response(null, { status: 204, headers: CORS });

  if (path === '/log' && req.method === 'POST') {
    const res = await ctx.log.handleBrowserLog(req, { ip });
    ctx.log.count('http', 'Log batches', {}, { ms: performance.now() - t0 });
    return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...CORS } });
  }

  if (path.startsWith('/app/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const res = await serveApp(ctx.appDir, path);
    ctx.log.count('http', 'App files', { status: res.status }, { ms: performance.now() - t0 });
    return res;
  }

  let res: Response;
  if (path === '/' || path === '/app') res = Response.redirect(new URL('/app/', url).toString(), 302);
  else if (path === '/health') {
    res = json({ ok: true, uptimeS: Math.round((Date.now() - ctx.startedAt) / 1000), build: ctx.build(), ...ctx.relay.stats(), mwlog: ctx.log.health() });
  } else if (path === '/api/tables' && req.method === 'GET') res = json({ tables: ctx.relay.tables() });
  else res = json({ error: 'not found' }, 404);

  ctx.log.info('http', 'Request', { method: req.method, path, status: res.status, ms: Math.round((performance.now() - t0) * 10) / 10, ip });
  return res;
}
