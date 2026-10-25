/**
 * Serves the built app at `/app/`: files from `app/dist`, `index.html` for a path without an
 * extension (client-side routes), 404 for a missing file. Hashed assets are cached forever,
 * pages never (a new build must reach the next load).
 */
import { extname, resolve, sep } from 'node:path';

/**
 * Answers a request for `/app/…`.
 *
 * @param appDir - the built app's folder
 * @param pathname - the URL path (starts with `/app/`)
 * @returns the file, or a 404
 */
export async function serveApp(appDir: string, pathname: string): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice('/app/'.length));
  } catch {
    return new Response('bad path', { status: 400 });
  }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const root = resolve(appDir);
  const path = resolve(root, rel);
  if (path !== root && !path.startsWith(root + sep)) return new Response('not found', { status: 404 });
  let file = Bun.file(path);
  if (!(await file.exists())) {
    if (extname(rel) !== '') return new Response('not found', { status: 404 });
    file = Bun.file(resolve(root, 'index.html'));
    if (!(await file.exists())) return new Response('the app is not built (bun run build)', { status: 404 });
  }
  const immutable = rel.startsWith('assets/');
  return new Response(file, {
    headers: { 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' },
  });
}
