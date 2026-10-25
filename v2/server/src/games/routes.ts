/**
 * The game backup routes:
 *
 * | Route | What |
 * |---|---|
 * | `GET /api/games` | `{games: GameSummary[]}` (`where: "server"`), newest save first |
 * | `PUT /api/games/<id>` | body: the `Game` → its `GameSummary`; the previous latest becomes a version |
 * | `GET /api/games/<id>[?at=<savedAt>]` | the `Game` (latest, or that version); header `x-saved-at` |
 * | `GET /api/games/<id>/versions` | `{versions: [{savedAt, bytes, latest}]}`, newest first |
 * | `DELETE /api/games/<id>` | moved to the trash (30 days) → 204 |
 */
import { CORS, json, readJson, refuse, TooLarge } from '../http/respond.ts';
import type { ServerLog } from '../log.ts';
import { BadBackup, GAME_ID, type Backups } from './backups.ts';

/** What the game routes need. */
export interface GamesContext {
  /** The backups. */
  backups: Backups;
  /** Largest game, bytes. */
  maxGameBytes: number;
  /** The logger. */
  log: ServerLog;
}

/**
 * Answers a game backup request.
 *
 * @param req - the request
 * @param url - its parsed URL
 * @param ctx - backups, limit, logger
 * @returns the response, or null when the path isn't a game route
 */
export async function gameRoutes(req: Request, url: URL, ctx: GamesContext): Promise<Response | null> {
  const path = url.pathname;
  if (path === '/api/games') {
    if (req.method !== 'GET') return refuse(405, 'GET');
    return json({ games: await ctx.backups.list() });
  }
  if (!path.startsWith('/api/games/')) return null;
  const [rawId, sub, ...more] = path.slice('/api/games/'.length).split('/');
  const id = decodeURIComponent(rawId ?? '');
  if (!GAME_ID.test(id) || more.length > 0) return refuse(400, 'game ids are 1–64 letters, digits, _ or -');

  if (sub === 'versions') {
    if (req.method !== 'GET') return refuse(405, 'GET');
    const versions = await ctx.backups.versions(id);
    return versions.length ? json({ versions }) : refuse(404, 'no backup of that game');
  }
  if (sub !== undefined) return refuse(404, 'not found');

  if (req.method === 'PUT') {
    const t0 = performance.now();
    let body;
    try {
      body = await readJson(req, ctx.maxGameBytes);
    } catch (e) {
      if (e instanceof TooLarge) return refuse(413, `the game is ${e.message}`);
      throw e;
    }
    if (!body.ok) return refuse(400, body.error);
    try {
      const summary = await ctx.backups.put(id, body.value);
      ctx.log.info('games', 'Backed up', { id, name: summary.name, maps: summary.mapNames.length, bytes: Number(req.headers.get('content-length') ?? 0), ms: Math.round(performance.now() - t0) });
      return json(summary);
    } catch (e) {
      if (e instanceof BadBackup) {
        ctx.log.warn('games', 'Backup refused', { id, reason: e.message });
        return refuse(400, e.message);
      }
      throw e;
    }
  }
  if (req.method === 'GET') {
    const stored = await ctx.backups.get(id, url.searchParams.get('at'));
    if (!stored) return refuse(404, 'no backup of that game');
    return new Response(JSON.stringify(stored.game), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store', 'x-saved-at': stored.savedAt, 'access-control-expose-headers': 'x-saved-at' } });
  }
  if (req.method === 'DELETE') {
    if (!(await ctx.backups.remove(id))) return refuse(404, 'no backup of that game');
    ctx.log.info('games', 'Backup deleted', { id });
    return new Response(null, { status: 204, headers: CORS });
  }
  return refuse(405, 'GET, PUT or DELETE');
}
