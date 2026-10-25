/**
 * The shared library routes:
 *
 * | Route | What |
 * |---|---|
 * | `GET /api/library` | `{entries: LibraryEntry[]}`, newest first |
 * | `GET /api/library/<id>` | one entry |
 * | `POST /api/library` | body `{map, thumb?, originalBytes?, note?}` → `{entry, added}` (201 new, 200 replaced) |
 * | `DELETE /api/library/<id>` | → `{removed: entry}`; the files stay (games keep their maps) |
 */
import { json, readJson, refuse, TooLarge } from '../http/respond.ts';
import type { ServerLog } from '../log.ts';
import { BadEntry, type Library } from './library.ts';

/** What the library routes need. */
export interface LibraryContext {
  /** The library. */
  library: Library;
  /** The logger. */
  log: ServerLog;
}

/**
 * Answers a library request.
 *
 * @param req - the request
 * @param url - its parsed URL
 * @param ctx - library, logger
 * @returns the response, or null when the path isn't a library route
 */
export async function libraryRoutes(req: Request, url: URL, ctx: LibraryContext): Promise<Response | null> {
  const path = url.pathname;
  if (path === '/api/library') {
    if (req.method === 'GET') return json({ entries: await ctx.library.list() });
    if (req.method === 'POST') {
      let body;
      try {
        body = await readJson(req, 1024 * 1024);
      } catch (e) {
        if (e instanceof TooLarge) return refuse(413, `the entry is ${e.message}`);
        throw e;
      }
      if (!body.ok) return refuse(400, body.error);
      try {
        const { entry, added } = await ctx.library.put(body.value);
        ctx.log.info('library', added ? 'Map added' : 'Map updated', { id: entry.map.id, name: entry.map.name, kind: entry.map.kind, squares: `${entry.map.grid.cols}x${entry.map.grid.rows}`, bytes: entry.map.picture.bytes, thumb: entry.thumb !== null });
        return json({ entry, added }, added ? 201 : 200);
      } catch (e) {
        if (e instanceof BadEntry) {
          ctx.log.warn('library', 'Entry refused', { reason: e.message });
          return refuse(400, e.message);
        }
        throw e;
      }
    }
    return refuse(405, 'GET or POST');
  }
  if (path.startsWith('/api/library/')) {
    const id = decodeURIComponent(path.slice('/api/library/'.length));
    if (req.method === 'GET') {
      const entry = await ctx.library.get(id);
      return entry ? json(entry) : refuse(404, 'no such map in the shared library');
    }
    if (req.method === 'DELETE') {
      const removed = await ctx.library.remove(id);
      if (!removed) return refuse(404, 'no such map in the shared library');
      ctx.log.info('library', 'Map removed', { id, name: removed.map.name });
      return json({ removed });
    }
    return refuse(405, 'GET or DELETE');
  }
  return null;
}
