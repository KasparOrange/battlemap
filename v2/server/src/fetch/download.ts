/**
 * Downloading one link for the link fetch: http(s) only, public addresses only (checked in the
 * socket's own DNS lookup and on every redirect), a size cap read as it streams, and a timeout
 * on every socket operation.
 */
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { guardedLookup, publicAddresses, Refused, systemResolve, type Resolve } from './guard.ts';

/** A downloaded link. */
export interface Download {
  /** The bytes. */
  bytes: Uint8Array;
  /** The content type without parameters (`text/html`), or ''. */
  contentType: string;
  /** The file name from Content-Disposition or the last path segment, or ''. */
  name: string;
  /** The URL after redirects. */
  finalUrl: string;
}

/** Downloads one URL (tests pass a fake). */
export type Downloader = (url: string) => Promise<Download>;

/** Settings of the real downloader. */
export interface DownloadOptions {
  /** Largest body, bytes. */
  maxBytes: number;
  /** Time allowed per socket operation, ms. */
  timeoutMs: number;
  /** Redirects followed at most. */
  maxRedirects?: number;
  /** The resolver (tests pass their own). */
  resolve?: Resolve;
}

/**
 * The file name a response names.
 *
 * @param disposition - the Content-Disposition header, or ''
 * @param url - the URL it came from
 * @returns the name, or ''
 */
export function nameOf(disposition: string, url: string): string {
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  const plain = /filename="?([^";]+)"?/.exec(disposition);
  const raw = star?.[1] ?? plain?.[1] ?? new URL(url).pathname.split('/').pop() ?? '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Makes the real downloader.
 *
 * @param opts - limits and the resolver
 * @returns a function that downloads a URL
 */
export function makeDownloader(opts: DownloadOptions): Downloader {
  const resolve = opts.resolve ?? systemResolve;
  const lookup = guardedLookup(resolve);
  const maxRedirects = opts.maxRedirects ?? 5;

  /** One request, no redirects followed. */
  const once = (url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; bytes: Uint8Array }> =>
    new Promise((done, fail) => {
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(url, { method: 'GET', lookup: lookup as never, timeout: opts.timeoutMs, headers: { 'user-agent': 'Mozilla/5.0 battlemap', accept: '*/*' } }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          done({ status, headers: res.headers, bytes: new Uint8Array(0) });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? NaN);
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          res.destroy();
          fail(new Refused(`over ${Math.round(opts.maxBytes / 1024 / 1024)} MB`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.byteLength;
          if (total > opts.maxBytes) {
            res.destroy();
            fail(new Refused(`over ${Math.round(opts.maxBytes / 1024 / 1024)} MB`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => done({ status, headers: res.headers, bytes: new Uint8Array(Buffer.concat(chunks)) }));
        res.on('error', fail);
      });
      req.on('timeout', () => req.destroy(new Refused(`no answer within ${Math.round(opts.timeoutMs / 1000)} s`)));
      req.on('error', (e) => fail(e instanceof Refused ? e : new Refused(e.message)));
      req.end();
    });

  return async (start) => {
    let url: URL;
    try {
      url = new URL(start);
    } catch {
      throw new Refused('that is not a link');
    }
    for (let hop = 0; ; hop++) {
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Refused('only http and https links');
      if (url.username || url.password) throw new Refused('links with a password are not fetched');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host)) await publicAddresses(host, resolve);
      const res = await once(url);
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (hop >= maxRedirects) throw new Refused('too many redirects');
        url = new URL(res.headers.location, url);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new Refused(`the link answered ${res.status}`);
      const ctype = String(res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      return { bytes: res.bytes, contentType: ctype, name: nameOf(String(res.headers['content-disposition'] ?? ''), url.toString()), finalUrl: url.toString() };
    }
  };
}
