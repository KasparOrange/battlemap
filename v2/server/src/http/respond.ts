/**
 * Small helpers every route uses: the CORS headers, JSON answers, refusals with a reason the
 * app can show, and reading a request body with a size cap.
 */

/** Headers that let any origin call the server (the shell's bundle runs on its own origin). */
export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-trace',
  'access-control-max-age': '86400',
};

/**
 * A JSON answer with the CORS headers, never cached.
 *
 * @param body - what to send
 * @param status - HTTP status (default 200)
 * @returns the response
 */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS, 'cache-control': 'no-store' } });
}

/**
 * A refusal: `{error}` with a status.
 *
 * @param status - HTTP status
 * @param error - why, in words the app may show
 * @returns the response
 */
export function refuse(status: number, error: string): Response {
  return json({ error }, status);
}

/** A body that was too big (the caller answers 413). */
export class TooLarge extends Error {
  /** @param limit - the cap in bytes */
  constructor(readonly limit: number) {
    super(`over ${Math.round(limit / 1024 / 1024)} MB`);
  }
}

/**
 * Reads a request body, refusing more than `limit` bytes without reading it all.
 *
 * @param req - the request
 * @param limit - the cap in bytes
 * @returns the bytes
 * @throws {TooLarge} when the body (or its declared length) is bigger than `limit`
 */
export async function readBody(req: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > limit) throw new TooLarge(limit);
  if (!req.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge(limit);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Reads a JSON body with a size cap.
 *
 * @param req - the request
 * @param limit - the cap in bytes
 * @returns the parsed value, or an error text for a body that isn't JSON
 * @throws {TooLarge} when the body is bigger than `limit`
 */
export async function readJson(req: Request, limit: number): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const bytes = await readBody(req, limit);
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}
