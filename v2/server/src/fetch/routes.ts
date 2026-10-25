/**
 * `GET /api/fetch?url=<link>` → `Fetched` (`{url, name, bytes, kind, ext}`; the app then
 * downloads `url` from the server and imports it), or 422 `{error}` with a reason the app shows
 * ("Couldn't get the map: <error>").
 */
import { join } from 'node:path';
import { json, refuse } from '../http/respond.ts';
import type { ServerLog } from '../log.ts';
import type { Downloader } from './download.ts';
import { Refused } from './guard.ts';
import { fetchLink } from './link.ts';

/** What the fetch route needs. */
export interface FetchContext {
  /** The downloader (public addresses only). */
  download: Downloader;
  /** The data folder (`uploads/` is in it). */
  dataDir: string;
  /** The logger. */
  log: ServerLog;
}

/**
 * Answers a link fetch.
 *
 * @param req - the request
 * @param url - its parsed URL
 * @param ctx - downloader, data folder, logger
 * @returns the response, or null when the path isn't `/api/fetch`
 */
export async function fetchRoutes(req: Request, url: URL, ctx: FetchContext): Promise<Response | null> {
  if (url.pathname !== '/api/fetch') return null;
  if (req.method !== 'GET') return refuse(405, 'GET');
  const link = url.searchParams.get('url') ?? '';
  const t0 = performance.now();
  let host = '';
  try {
    host = new URL(link.trim()).hostname;
  } catch {
    /* refused below */
  }
  try {
    const got = await fetchLink(link, ctx.download, join(ctx.dataDir, 'uploads'));
    ctx.log.info('fetch', 'Link fetched', { host, kind: got.kind, ext: got.ext, bytes: got.bytes, name: got.name, ms: Math.round(performance.now() - t0) });
    return json(got);
  } catch (e) {
    const reason = e instanceof Refused ? e.message : `the download failed: ${e instanceof Error ? e.message : String(e)}`;
    ctx.log.warn('fetch', 'Link refused', { host, reason, ms: Math.round(performance.now() - t0) });
    return refuse(422, reason);
  }
}
