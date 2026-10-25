/**
 * One HTTP request with progress, an idle timeout and cancellation — the only place that
 * touches `fetch` / `XMLHttpRequest`.
 *
 * - **Downloads** use `fetch` and read the body as a stream, counting bytes.
 * - **Uploads with progress** use `XMLHttpRequest` in browsers: `fetch` can't report upload
 *   progress (stream bodies need HTTP/2 in Chrome and don't exist in Safari). Where there is no
 *   XHR (Bun, tests, workers) the body is sent as a counting stream instead.
 * - **Timeout** is an idle timeout: the request fails when no byte moved for `idleMs`, so a
 *   30 MB map on slow Wi-Fi is fine as long as it keeps moving.
 *
 * Errors are {@link ApiError}s: `network`, `timeout`, `aborted`; an error status is NOT thrown
 * here (the client decides what a status means).
 */
import { ApiError } from './errors.ts';

/** Progress: bytes so far, the total (0 when unknown). */
export type Progress = (loaded: number, total: number) => void;

/** A request. */
export interface HttpRequest {
  /** The method. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** The full URL. */
  url: string;
  /** The path, for errors and logs. */
  path: string;
  /** The body. */
  body?: Blob | string | null | undefined;
  /** Extra headers. */
  headers?: Record<string, string> | undefined;
  /** Cancels the request. */
  signal?: AbortSignal | undefined;
  /** Fail when no byte moved for this long (ms). */
  idleMs: number;
  /** Upload progress (makes uploads go through XHR in browsers). */
  onUpload?: Progress | undefined;
  /** Download progress. */
  onDownload?: Progress | undefined;
  /** The size to report when the server sends no `content-length`. */
  expectedBytes?: number | undefined;
}

/** An answer (any status). */
export interface HttpResponse {
  /** The HTTP status. */
  status: number;
  /** A response header, lowercase name. */
  header(name: string): string | null;
  /** The body. */
  body: Blob;
}

/** Sends one request. */
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

/** An idle timer that aborts a controller; `kick()` on every progress. */
function idleTimer(ms: number, onIdle: () => void): { kick(): void; stop(): void } {
  let t: ReturnType<typeof setTimeout> | null = setTimeout(onIdle, ms);
  return {
    kick() {
      if (t === null) return;
      clearTimeout(t);
      t = setTimeout(onIdle, ms);
    },
    stop() {
      if (t !== null) clearTimeout(t);
      t = null;
    },
  };
}

/** A body as a stream that reports how much was read from it. */
function countingStream(blob: Blob, onRead: (n: number) => void): ReadableStream<Uint8Array> {
  const reader = blob.stream().getReader();
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      const { done, value } = await reader.read();
      if (done) {
        ctl.close();
        return;
      }
      sent += value.byteLength;
      onRead(sent);
      ctl.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * The `fetch` transport (downloads everywhere; uploads where there is no XHR).
 *
 * @param req - the request
 * @returns the answer
 * @throws {ApiError} `network`, `timeout` or `aborted`
 */
export async function fetchTransport(req: HttpRequest): Promise<HttpResponse> {
  if (req.signal?.aborted) throw new ApiError('aborted', 'Cancelled', req.path);
  const ctl = new AbortController();
  let why: 'timeout' | 'aborted' | null = null;
  const timer = idleTimer(req.idleMs, () => { why = 'timeout'; ctl.abort(); });
  const onAbort = () => { why = 'aborted'; ctl.abort(); };
  req.signal?.addEventListener('abort', onAbort, { once: true });
  const fail = (err: unknown): never => {
    if (why === 'timeout') throw new ApiError('timeout', `No progress for ${Math.round(req.idleMs / 1000)} s`, req.path);
    if (why === 'aborted') throw new ApiError('aborted', 'Cancelled', req.path);
    if (err instanceof ApiError) throw err;
    throw new ApiError('network', err instanceof Error ? err.message : String(err), req.path);
  };
  try {
    let body: BodyInit | null = req.body ?? null;
    const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers: req.headers, signal: ctl.signal };
    if (req.body instanceof Blob && req.onUpload) {
      const total = req.body.size;
      const onUpload = req.onUpload;
      onUpload(0, total);
      body = countingStream(req.body, (n) => { timer.kick(); onUpload(n, total); });
      init.duplex = 'half';
    }
    init.body = body;
    let res: Response;
    try {
      res = await fetch(req.url, init);
    } catch (err) {
      return fail(err);
    }
    timer.kick();
    const total = Number(res.headers.get('content-length')) || req.expectedBytes || 0;
    let blob: Blob;
    try {
      if (!req.onDownload || !res.body) blob = await res.blob();
      else {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        req.onDownload(0, total);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          timer.kick();
          req.onDownload(loaded, total);
        }
        blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? '' });
      }
    } catch (err) {
      return fail(err);
    }
    return { status: res.status, header: (n) => res.headers.get(n), body: blob };
  } finally {
    timer.stop();
    req.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * The `XMLHttpRequest` transport (uploads with progress in browsers).
 *
 * @param req - the request
 * @param Xhr - the XHR class (tests pass a fake)
 * @returns the answer
 * @throws {ApiError} `network`, `timeout` or `aborted`
 */
export function xhrTransport(req: HttpRequest, Xhr: typeof XMLHttpRequest = XMLHttpRequest): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    if (req.signal?.aborted) {
      reject(new ApiError('aborted', 'Cancelled', req.path));
      return;
    }
    const xhr = new Xhr();
    let settled = false;
    const finish = (f: () => void) => {
      if (settled) return;
      settled = true;
      timer.stop();
      req.signal?.removeEventListener('abort', onAbort);
      f();
    };
    const timer = idleTimer(req.idleMs, () => {
      finish(() => reject(new ApiError('timeout', `No progress for ${Math.round(req.idleMs / 1000)} s`, req.path)));
      xhr.abort();
    });
    const onAbort = () => {
      finish(() => reject(new ApiError('aborted', 'Cancelled', req.path)));
      xhr.abort();
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });
    xhr.open(req.method, req.url);
    xhr.responseType = 'blob';
    for (const [k, val] of Object.entries(req.headers ?? {})) xhr.setRequestHeader(k, val);
    if (req.onUpload) {
      const onUpload = req.onUpload;
      xhr.upload.onprogress = (e) => { timer.kick(); onUpload(e.loaded, e.lengthComputable ? e.total : 0); };
    }
    xhr.onprogress = (e) => {
      timer.kick();
      req.onDownload?.(e.loaded, e.lengthComputable ? e.total : req.expectedBytes ?? 0);
    };
    xhr.onerror = () => finish(() => reject(new ApiError('network', 'Network error', req.path)));
    xhr.onload = () => finish(() => resolve({
      status: xhr.status,
      header: (n) => xhr.getResponseHeader(n),
      body: xhr.response instanceof Blob ? xhr.response : new Blob([xhr.response ?? '']),
    }));
    xhr.send(req.body ?? null);
  });
}

/**
 * The transport this environment wants: XHR for uploads with progress where it exists, `fetch`
 * for the rest.
 *
 * @param req - the request
 * @returns the answer
 */
export const defaultTransport: Transport = (req) =>
  req.onUpload && typeof XMLHttpRequest !== 'undefined' ? xhrTransport(req) : fetchTransport(req);
