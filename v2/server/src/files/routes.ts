/**
 * The file routes:
 *
 * | Route | What |
 * |---|---|
 * | `POST /files?ext=&format=` | store an upload → `UploadResult` (a `FileRef` plus size, thumbnail, conversion) |
 * | `GET /files/<hash>.<ext>` | a stored file, cached forever (`immutable`) |
 * | `GET /uploads/<name>` | a link fetch's file (temporary, 7 days) |
 */
import { FileExt, check, type FileExt as Ext } from '@battlemap/shared';
import { CORS, json, readBody, refuse, TooLarge } from '../http/respond.ts';
import type { ServerLog } from '../log.ts';
import { STORE_FORMATS, type StoreFormat } from './convert.ts';
import { FILE_NAME, type FileStore } from './store.ts';
import { BadUpload, storeUpload } from './upload.ts';
import { join } from 'node:path';

/** Content types by extension. */
export const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  json: 'application/json',
  pdf: 'application/pdf',
  dd2vtt: 'application/json',
  uvtt: 'application/json',
};

/** Names of link-fetch files in `uploads/`. */
const UPLOAD_NAME = /^[0-9a-f]{12}\.(png|jpg|webp|pdf|dd2vtt|uvtt)$/;

/** What the file routes need. */
export interface FilesContext {
  /** The file store. */
  files: FileStore;
  /** The data folder (`uploads/` is in it). */
  dataDir: string;
  /** Largest upload, bytes. */
  maxUploadBytes: number;
  /** The logger. */
  log: ServerLog;
}

/**
 * Answers a file request.
 *
 * @param req - the request
 * @param url - its parsed URL
 * @param ctx - store, limits, logger
 * @returns the response, or null when the path isn't a file route
 */
export async function fileRoutes(req: Request, url: URL, ctx: FilesContext): Promise<Response | null> {
  const path = url.pathname;
  if (path === '/files' && req.method === 'POST') return upload(req, url, ctx);
  if (path.startsWith('/files/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const m = FILE_NAME.exec(path.slice('/files/'.length));
    if (!m) return refuse(404, 'no such file');
    return serve(ctx.files.path(m[1]!, m[2] as Ext), m[2]!, 'public, max-age=31536000, immutable');
  }
  if (path.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const name = path.slice('/uploads/'.length);
    if (!UPLOAD_NAME.test(name)) return refuse(404, 'no such file');
    return serve(join(ctx.dataDir, 'uploads', name), name.split('.').pop()!, 'private, max-age=3600');
  }
  return null;
}

/** A file from disk, or a 404. */
async function serve(path: string, ext: string, cache: string): Promise<Response> {
  const file = Bun.file(path);
  if (!(await file.exists())) return refuse(404, 'no such file');
  return new Response(file, { headers: { ...CORS, 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream', 'cache-control': cache } });
}

/** `POST /files?ext=&format=`. */
async function upload(req: Request, url: URL, ctx: FilesContext): Promise<Response> {
  const extParam = url.searchParams.get('ext');
  let ext: Ext | null = null;
  if (extParam) {
    const normal = extParam.toLowerCase() === 'jpeg' ? 'jpg' : extParam.toLowerCase();
    const c = check(FileExt, normal);
    if (!c.ok) return refuse(400, `ext must be png, jpg, webp, json or pdf (got ${extParam})`);
    ext = c.value;
  }
  const format = (url.searchParams.get('format') ?? 'asis').toLowerCase();
  if (!STORE_FORMATS.has(format)) return refuse(400, `format must be webp, jpeg, png or asis (got ${format})`);
  let data: Uint8Array;
  try {
    data = await readBody(req, ctx.maxUploadBytes);
  } catch (e) {
    if (e instanceof TooLarge) return refuse(413, `the file is ${e.message}`);
    throw e;
  }
  try {
    const result = await storeUpload(ctx.files, data, ext, format as StoreFormat, ctx.log);
    ctx.log.info('files', 'Stored', { hash: result.hash.slice(0, 12), ext: result.ext, bytes: result.bytes, asked: ext, format, originalBytes: result.originalBytes, note: result.note, width: result.width, height: result.height, thumb: result.thumb !== null });
    return json(result, 201);
  } catch (e) {
    if (e instanceof BadUpload) {
      ctx.log.warn('files', 'Upload refused', { bytes: data.byteLength, asked: ext, format, reason: e.message });
      return refuse(400, e.message);
    }
    throw e;
  }
}
