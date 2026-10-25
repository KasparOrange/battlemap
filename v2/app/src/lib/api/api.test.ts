/// <reference types="bun" />
/**
 * The API client against a fake server on a random port: uploads with progress, retries (and
 * none on 4xx), cancel, idle timeouts, downloads, library, backups, link fetch; and the XHR
 * transport against a fake XMLHttpRequest. Run: `bun test`.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import type { LibraryEntry } from '@battlemap/shared';
import { recordingLog } from '../../../test/helpers.ts';
import { gameWith, mapWith, refFor } from '../storage/testing.ts';
import { createApi } from './client.ts';
import { ApiError, describeError } from './errors.ts';
import { xhrTransport } from './transport.ts';

/** What the fake server saw. */
interface Seen { method: string; path: string; search: string; bytes: number; body: string }

const seen: Seen[] = [];
/** Per-route behaviour the tests switch. */
const plan = {
  /** Status codes to answer `/files` with before succeeding. */
  uploadFailures: [] as number[],
  /** Hold every answer this long (ms). */
  holdMs: 0,
};
const backups = new Map<string, unknown>();
const library: unknown[] = [];

const picture = refFor('pic', 5);
const entry: LibraryEntry = { map: mapWith('lib1', picture), thumb: null, addedAt: '2026-10-25T10:00:00.000Z', originalBytes: null, note: null };

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const buf = req.body ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array();
    seen.push({ method: req.method, path: url.pathname, search: url.search, bytes: buf.byteLength, body: new TextDecoder().decode(buf.slice(0, 2000)) });
    if (plan.holdMs) await Bun.sleep(plan.holdMs);
    const p = url.pathname;
    if (p === '/files' && req.method === 'POST') {
      const fail = plan.uploadFailures.shift();
      if (fail) return Response.json({ error: fail === 400 ? 'bad ext' : 'busy' }, { status: fail });
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(buf);
      return Response.json({ hash: hasher.digest('hex'), ext: url.searchParams.get('ext'), bytes: buf.byteLength });
    }
    if (p.startsWith('/files/')) {
      return new Response(new Uint8Array(5000), { headers: { 'content-length': '5000' } });
    }
    if (p === '/api/library' && req.method === 'GET') return Response.json({ entries: [...library, { broken: true }] });
    if (p === '/api/library' && req.method === 'POST') {
      const e = JSON.parse(new TextDecoder().decode(buf)) as unknown;
      library.push(e);
      return Response.json(e);
    }
    if (p.startsWith('/api/library/') && req.method === 'DELETE') return new Response(null, { status: 404 });
    if (p === '/api/games' && req.method === 'GET') {
      return Response.json([...backups.values()].map((g) => {
        const game = g as ReturnType<typeof gameWith>;
        return { id: game.id, name: game.name, createdAt: game.createdAt, savedAt: game.createdAt, mapNames: ['x'], activeMapName: 'x', thumb: null, where: 'server' };
      }));
    }
    const gm = /^\/api\/games\/(.+)$/.exec(p);
    if (gm) {
      const id = decodeURIComponent(gm[1]!);
      if (req.method === 'PUT') { backups.set(id, JSON.parse(new TextDecoder().decode(buf))); return Response.json({ ok: true }); }
      if (req.method === 'DELETE') { backups.delete(id); return Response.json({ deleted: id }); }
      const g = backups.get(id);
      return g ? Response.json({ game: g }) : Response.json({ error: 'no such game' }, { status: 404 });
    }
    if (p === '/api/fetch') {
      const link = url.searchParams.get('url') ?? '';
      if (link.includes('refuse')) return Response.json({ error: 'Only public addresses' });
      if (link.includes('stored')) return Response.json({ file: refFor('pic', 5000), name: 'Tower.png' });
      return new Response(new Uint8Array(1234), { headers: { 'content-type': 'image/webp', 'content-disposition': 'attachment; filename="Crypt map.webp"' } });
    }
    if (p === '/slow') { await Bun.sleep(5000); return new Response('late'); }
    return new Response('nope', { status: 404 });
  },
});
afterAll(() => server.stop(true));

const base = `http://localhost:${server.port}`;
const fast = { attempts: 3, backoffMs: [10, 20] };

function client(log = recordingLog(), url = base) {
  return { log, api: createApi({ serverUrl: url, log, retry: fast, timeouts: { jsonMs: 500, transferIdleMs: 500, linkMs: 500 } }) };
}

beforeEach(() => {
  seen.length = 0;
  plan.uploadFailures = [];
  plan.holdMs = 0;
});

describe('uploads', () => {
  test('sends the bytes with ext + format and reports progress to the end', async () => {
    const { api, log } = client();
    const blob = new Blob([new Uint8Array(300_000)], { type: 'image/png' });
    const progress: [number, number][] = [];
    const ref = await api.uploadFile(blob, { ext: 'png', format: 'webp' }, (l, t) => progress.push([l, t]));
    expect(ref).toMatchObject({ ext: 'png', bytes: 300_000 });
    expect(ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/files', search: '?ext=png&format=webp', bytes: 300_000 });
    expect(progress[0]).toEqual([0, 300_000]);
    expect(progress.at(-1)).toEqual([300_000, 300_000]);
    expect(progress.length).toBeGreaterThan(2);
    expect(log.lines.find((l) => l.msg === 'Upload done')?.props).toMatchObject({ bytes: 300_000 });
  });

  test('"as is" sends no format', async () => {
    const { api } = client();
    await api.uploadFile(new Blob(['{}']), { ext: 'json', format: 'asis' });
    expect(seen[0]!.search).toBe('?ext=json');
  });

  test('retries a 5xx with backoff, then succeeds', async () => {
    plan.uploadFailures = [503, 502];
    const { api, log } = client();
    const ref = await api.uploadFile(new Blob(['abc']), { ext: 'json' });
    expect(ref.bytes).toBe(3);
    expect(seen.length).toBe(3);
    expect(log.lines.filter((l) => l.msg === 'Upload failed — retrying').length).toBe(2);
  });

  test('does not retry a 4xx', async () => {
    plan.uploadFailures = [400];
    const { api, log } = client();
    const err = await api.uploadFile(new Blob(['abc']), { ext: 'json' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 400, message: 'bad ext' });
    expect(seen.length).toBe(1);
    expect(log.has('Upload failed')).toBe(true);
  });

  test('network errors are retried until the attempts run out', async () => {
    const dead = Bun.serve({ port: 0, fetch: () => new Response('') });
    const url = `http://localhost:${dead.port}`;
    dead.stop(true);
    const { api, log } = client(recordingLog(), url);
    const err = await api.uploadFile(new Blob(['abc']), { ext: 'json' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'network' });
    expect(log.lines.filter((l) => l.msg === 'Upload failed — retrying').length).toBe(2);
    expect(describeError(err)).toBe('no connection to the server');
  });

  test('cancel stops it at once, without a retry', async () => {
    plan.holdMs = 300;
    const { api, log } = client();
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const t0 = performance.now();
    const err = await api.uploadFile(new Blob(['abc']), { ext: 'json', signal: ctl.signal }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'AbortError', kind: 'aborted' });
    expect(performance.now() - t0).toBeLessThan(250);
    expect(log.has('Upload cancelled')).toBe(true);
    expect(log.has('Upload failed — retrying')).toBe(false);
  });

  test('an answer that is not a file ref is invalid, not retried', async () => {
    const odd = Bun.serve({ port: 0, fetch: () => Response.json({ hello: 1 }) });
    const { api } = client(recordingLog(), `http://localhost:${odd.port}`);
    const err = await api.uploadFile(new Blob(['abc']), { ext: 'json' }).catch((e: unknown) => e);
    odd.stop(true);
    expect(err).toMatchObject({ kind: 'invalid' });
  });
});

describe('downloads and timeouts', () => {
  test('downloads a file with progress', async () => {
    const { api } = client();
    const progress: number[] = [];
    const blob = await api.downloadFile(refFor('pic', 5000), (l, t) => { expect(t).toBe(5000); progress.push(l); });
    expect(blob.size).toBe(5000);
    expect(progress.at(-1)).toBe(5000);
    expect(api.fileUrl(refFor('pic', 5000))).toBe(`${base}/files/${refFor('pic', 5000).hash}.png`);
  });

  test('no answer within the idle time is a timeout, retried', async () => {
    const log = recordingLog();
    // The fragment makes every URL of this client land on the never-answering `/slow` route.
    const slow = createApi({ serverUrl: `${base}/slow#`, log, retry: { attempts: 2, backoffMs: [5] }, timeouts: { transferIdleMs: 80 } });
    const t0 = performance.now();
    const e2 = await slow.downloadFile(refFor('x', 1)).catch((e: unknown) => e);
    expect(e2).toMatchObject({ kind: 'timeout' });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(log.lines.filter((l) => l.msg === 'Download failed — retrying').length).toBe(1);
  });
});

describe('library and backups', () => {
  test('library: add, list (broken entries skipped), remove (missing is fine)', async () => {
    const { api, log } = client();
    const added = await api.library.add(entry);
    expect(added).toEqual(entry);
    const list = await api.library.list();
    expect(list).toEqual([entry]);
    expect(log.has('Library list: broken entry skipped')).toBe(true);
    await api.library.remove('lib1');
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/library/lib1' });
  });

  test('backups: put, list, get (wrapped), get of a missing one is null, delete', async () => {
    const { api } = client();
    const game = gameWith('b1');
    await api.backups.put(game);
    expect(seen[0]).toMatchObject({ method: 'PUT', path: '/api/games/b1' });
    expect((await api.backups.list()).map((s) => s.id)).toEqual(['b1']);
    expect(await api.backups.get('b1')).toEqual(game);
    expect(await api.backups.get('missing')).toBeNull();
    await api.backups.delete('b1');
    expect(await api.backups.get('b1')).toBeNull();
  });
});

describe('link fetch', () => {
  test('a file answer: content, name from the header, kind', async () => {
    const { api } = client();
    const got = await api.fetchLink('https://example.com/x?y=1');
    expect(got.blob.size).toBe(1234);
    expect(got.name).toBe('Crypt map.webp');
    expect(got.ext).toBe('webp');
    expect(seen[0]!.search).toBe('?url=https%3A%2F%2Fexample.com%2Fx%3Fy%3D1');
  });

  test('a stored-file answer downloads the named file', async () => {
    const { api } = client();
    const got = await api.fetchLink('https://example.com/stored');
    expect(got).toMatchObject({ name: 'Tower.png', ext: 'png' });
    expect(got.blob.size).toBe(5000);
  });

  test("the server's refusal comes back as its reason, not retried", async () => {
    const { api } = client();
    const err = await api.fetchLink('http://10.0.0.1/refuse').catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'http', message: 'Only public addresses' });
    expect(seen.length).toBe(1);
  });
});

describe('xhr transport', () => {
  /** A scripted XMLHttpRequest: `script` decides what happens after send. */
  class FakeXhr {
    static script: (x: FakeXhr) => void = () => {};
    static last: FakeXhr | null = null;
    upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
    onprogress: ((e: ProgressEvent) => void) | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    responseType = '';
    status = 0;
    response: unknown = null;
    headers: Record<string, string> = {};
    aborted = false;
    method = '';
    url = '';
    open(m: string, u: string) { this.method = m; this.url = u; }
    setRequestHeader(k: string, val: string) { this.headers[k] = val; }
    getResponseHeader(k: string) { return k === 'content-type' ? 'application/json' : null; }
    abort() { this.aborted = true; }
    send() { FakeXhr.last = this; setTimeout(() => FakeXhr.script(this), 1); }
  }
  const Xhr = FakeXhr as unknown as typeof XMLHttpRequest;
  const ev = (loaded: number, total: number) => ({ loaded, total, lengthComputable: true }) as ProgressEvent;

  test('maps upload progress and the answer', async () => {
    FakeXhr.script = (x) => {
      x.upload.onprogress?.(ev(50, 100));
      x.upload.onprogress?.(ev(100, 100));
      x.status = 200;
      x.response = new Blob(['{"ok":1}']);
      x.onload?.();
    };
    const progress: number[] = [];
    const res = await xhrTransport({ method: 'POST', url: 'http://x/files', path: '/files', body: new Blob(['a']), idleMs: 500, headers: { 'content-type': 'image/png' }, onUpload: (l) => progress.push(l) }, Xhr);
    expect(progress).toEqual([50, 100]);
    expect(res.status).toBe(200);
    expect(await res.body.text()).toBe('{"ok":1}');
    expect(FakeXhr.last!.headers['content-type']).toBe('image/png');
    expect(FakeXhr.last!.responseType).toBe('blob');
  });

  test('error → network, silence → timeout, signal → aborted', async () => {
    FakeXhr.script = (x) => x.onerror?.();
    await expect(xhrTransport({ method: 'GET', url: 'u', path: '/p', idleMs: 500 }, Xhr)).rejects.toMatchObject({ kind: 'network' });

    FakeXhr.script = () => {};
    await expect(xhrTransport({ method: 'GET', url: 'u', path: '/p', idleMs: 30 }, Xhr)).rejects.toMatchObject({ kind: 'timeout' });
    expect(FakeXhr.last!.aborted).toBe(true);

    const ctl = new AbortController();
    const p = xhrTransport({ method: 'GET', url: 'u', path: '/p', idleMs: 500, signal: ctl.signal }, Xhr);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
