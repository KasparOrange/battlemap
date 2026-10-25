/**
 * The link fetch (`GET /api/fetch?url=`) against a mock upstream on 127.0.0.1:`MOCK_PORT`.
 *
 * The server under test runs with `BATTLEMAP_FETCH_TEST_ADDR=127.0.0.1`: names under `.test`
 * (reserved, never in public DNS) resolve to the mock — the only way past the address guard.
 * Everything else meets the real guard, so the SSRF checks are real: a literal loopback or
 * private address, `localhost` (refused after its DNS answer), and redirects to either never
 * reach the mock's `/secret`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { BASE, MAIN, MOCK_PORT, call, picture } from '../lib.ts';

const P = MOCK_PORT;
const hits: Record<string, number> = {};
let server: ReturnType<typeof Bun.serve> | null = null;
const files: Record<string, Uint8Array> = {};

const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const bytes = (data: Uint8Array, type: string, extra: Record<string, string> = {}) => new Response(data, { headers: { 'content-type': type, ...extra } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

/** The mock upstream's answer for a path. */
function answer(url: URL): Response | Promise<Response> {
  const p = url.pathname;
  if (p === '/secret') return new Response('secret');
  if (p === '/cave.png') return bytes(files.png!, 'image/png');
  if (p === '/maps/keep%201.jpg') return bytes(files.jpg!, 'image/jpeg');
  if (p === '/maps/m.jpg') return url.search === '?a=1&b=2' ? bytes(files.jpg!, 'image/jpeg') : new Response('wrong query', { status: 400 });
  if (p === '/dl/tower') return bytes(files.vtt!, 'application/octet-stream', { 'content-disposition': "attachment; filename*=UTF-8''Tower%20map.dd2vtt" });
  if (p === '/dl/cave') return bytes(files.png!, 'application/octet-stream', { 'content-disposition': 'attachment; filename="cave dl.png"' });
  if (p === '/scene.uvtt') return bytes(files.vtt!, 'application/json');
  if (p === '/book.pdf') return bytes(new TextEncoder().encode('%PDF-1.7 fake'), 'application/pdf');
  if (p === '/pic.webp') return bytes(files.webp!, 'image/webp');
  if (p === '/scan.tiff') return bytes(files.tiff!, 'image/tiff');
  if (p === '/map.gif') return bytes(files.gif!, 'image/gif');
  if (p === '/post') return html('<html><head><meta property="og:image" content="/map.gif"></head><body><img src="/cave.png"></body></html>');
  if (p === '/twitter') return html(`<meta content="http://cdn.test:${P}/pic.webp" name="twitter:image">`);
  if (p === '/d/imgsrc') return html('<link rel="image_src" href="../cave.png">');
  if (p === '/first-img') return html('<p>hi</p><img alt="" src="maps/m.jpg?a=1&amp;b=2">');
  if (p === '/empty') return html('<html><body>no pictures</body></html>');
  if (p === '/data.bin') return bytes(new Uint8Array([1, 2, 3, 4]), 'application/octet-stream');
  if (p === '/drive') {
    return html(`<html><body>Google Drive can't scan this file for viruses.<form id="download-form" action="http://files.test:${P}/download" method="get"><input type="hidden" name="id" value="1Ab"><input type="hidden" name="confirm" value="t"></form></body></html>`);
  }
  if (p === '/download') return url.search === '?id=1Ab&confirm=t' ? bytes(files.png!, 'image/png') : new Response('bad confirm', { status: 400 });
  const hop = /^\/hop\/(\d+)$/.exec(p);
  if (hop) return Number(hop[1]) === 0 ? bytes(files.png!, 'image/png') : redirect(`/hop/${Number(hop[1]) - 1}`);
  if (p === '/relative') return redirect('cave.png');
  if (p === '/to-loopback') return redirect(`http://127.0.0.1:${P}/secret`);
  if (p === '/to-localhost') return redirect(`http://localhost:${P}/secret`);
  if (p === '/to-private') return redirect('http://10.11.12.13/secret');
  if (p === '/to-ftp') return redirect('ftp://maps.test/x');
  if (p === '/gone') return new Response('nope', { status: 404 });
  if (p === '/big-declared') return new Response(new Uint8Array(MAIN.maxUploadBytes + 1024), { headers: { 'content-type': 'image/png' } });
  if (p === '/big-stream') {
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024);
    return new Response(
      new ReadableStream({
        pull(ctl) {
          if (sent > MAIN.maxUploadBytes + 512 * 1024) return ctl.close();
          sent += chunk.byteLength;
          ctl.enqueue(chunk);
        },
      }),
      { headers: { 'content-type': 'image/png' } },
    );
  }
  if (p === '/slow') return new Promise((r) => setTimeout(() => r(bytes(files.png!, 'image/png')), MAIN.fetchTimeoutMs * 3));
  return new Response('not here', { status: 404 });
}

beforeAll(async () => {
  if (!P) return;
  files.png = await picture(40, 30);
  files.jpg = await picture(32, 24, 'jpeg', 'noise');
  files.webp = await picture(20, 20, 'webp');
  files.gif = await picture(20, 20, 'gif');
  files.tiff = await picture(20, 10, 'tiff');
  files.vtt = new TextEncoder().encode('{"format":0.3,"resolution":{"map_origin":{"x":0,"y":0}},"image":""}');
  server = Bun.serve({
    port: P,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url);
      hits[url.pathname] = (hits[url.pathname] ?? 0) + 1;
      return answer(url);
    },
  });
});
afterAll(() => server?.stop(true));

/** Asks the server to fetch a link. */
async function get(link: string): Promise<{ status: number; body: Record<string, unknown> & { error?: string } }> {
  const res = await call('GET', `/api/fetch?url=${encodeURIComponent(link)}`);
  return { status: res.status, body: res.body };
}

/** A link on the mock under a `.test` name. */
const at = (path: string, host = 'maps.test') => `http://${host}:${P}${path}`;

describe.skipIf(!P)('GET /api/fetch', () => {
  test('a picture link: stored in uploads/, served from there with the same bytes', async () => {
    const { status, body } = await get(at('/cave.png'));
    expect(status).toBe(200);
    expect(body).toMatchObject({ name: 'cave.png', kind: 'picture', ext: 'png', bytes: files.png!.byteLength });
    expect(String(body.url)).toMatch(/^\/uploads\/[0-9a-f]{12}\.png$/);
    const file = await fetch(`${BASE}${body.url}`);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from(files.png!))).toBe(true);
  });

  test('names: from Content-Disposition (both forms) or the path; the kind from the bytes', async () => {
    expect((await get(at('/dl/tower'))).body).toMatchObject({ kind: 'uvtt', ext: 'dd2vtt', name: 'Tower map.dd2vtt' });
    expect((await get(at('/dl/cave'))).body).toMatchObject({ kind: 'picture', ext: 'png', name: 'cave dl.png' });
    expect((await get(at('/maps/keep%201.jpg'))).body).toMatchObject({ kind: 'picture', ext: 'jpg', name: 'keep 1.jpg' });
    expect((await get(at('/scene.uvtt'))).body).toMatchObject({ kind: 'uvtt', ext: 'uvtt', name: 'scene.uvtt' });
    expect((await get(at('/book.pdf'))).body).toMatchObject({ kind: 'pdf', ext: 'pdf', name: 'book.pdf' });
    expect((await get(at('/pic.webp'))).body).toMatchObject({ kind: 'picture', ext: 'webp' });
  });

  test('other picture kinds become PNG', async () => {
    expect((await get(at('/map.gif'))).body).toMatchObject({ kind: 'picture', ext: 'png', name: 'map.png' });
    const tiff = (await get(at('/scan.tiff'))).body;
    expect(tiff).toMatchObject({ kind: 'picture', ext: 'png', name: 'scan.png' });
    const png = new Uint8Array(await (await fetch(`${BASE}${tiff.url}`)).arrayBuffer());
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("a web page gives its main picture: og:image, twitter:image, image_src, the first img; Drive's confirm form", async () => {
    expect((await get(at('/post', 'blog.test'))).body).toMatchObject({ kind: 'picture', ext: 'png', name: 'map.png' });
    expect((await get(at('/twitter', 'blog.test'))).body).toMatchObject({ kind: 'picture', ext: 'webp', name: 'pic.webp' });
    expect((await get(at('/d/imgsrc', 'blog.test'))).body).toMatchObject({ ext: 'png', name: 'cave.png' });
    expect((await get(at('/first-img', 'blog.test'))).body).toMatchObject({ ext: 'jpg', name: 'm.jpg' });
    expect((await get(at('/drive', 'drive.test'))).body).toMatchObject({ ext: 'png', name: 'download.png' });
  });

  test('redirects: relative ones resolve, five are followed, the sixth is refused', async () => {
    expect((await get(at('/relative'))).body).toMatchObject({ name: 'cave.png', ext: 'png' });
    expect((await get(at('/hop/5'))).status).toBe(200);
    const six = await get(at('/hop/6'));
    expect(six.status).toBe(422);
    expect(six.body.error).toContain('too many redirects');
  });

  test('limits: over the size (declared or streamed), too slow, a failing upstream', async () => {
    const declared = await get(at('/big-declared'));
    expect(declared.status).toBe(422);
    expect(declared.body.error).toContain('over 2 MB');
    const streamed = await get(at('/big-stream'));
    expect(streamed.status).toBe(422);
    expect(streamed.body.error).toContain('over 2 MB');
    const t0 = Date.now();
    const slow = await get(at('/slow'));
    expect(slow.status).toBe(422);
    expect(slow.body.error).toContain('no answer within');
    expect(Date.now() - t0).toBeLessThan(MAIN.fetchTimeoutMs * 3);
    expect(await get(at('/gone'))).toEqual({ status: 422, body: { error: 'the link answered 404' } });
  });

  test('refusals come back as 422 with the reason', async () => {
    expect(await get(at('/empty', 'blog.test'))).toEqual({ status: 422, body: { error: 'no picture found on that page' } });
    expect((await get(at('/data.bin'))).body.error).toContain('not a map file');
    expect((await get('')).body.error).toContain('link first');
    expect((await get('   ')).body.error).toContain('link first');
    expect((await get('not a link')).body.error).toContain('not a link');
    expect((await get('ftp://example.com/x')).body.error).toContain('only http');
    expect((await get(at('/to-ftp'))).body.error).toContain('only http');
    expect((await get(`http://user:pw@maps.test:${P}/cave.png`)).body.error).toContain('password');
    const unknown = await get('http://nothing-here.invalid/map.png');
    expect(unknown.status).toBe(422);
    expect(unknown.body.error).toContain('unknown host');
  });

  test('the address guard: loopback, private and link-local addresses are never fetched — literal, after DNS, or by redirect', async () => {
    const refused = [
      `http://127.0.0.1:${P}/secret`,
      `http://[::1]:${P}/secret`,
      `http://localhost:${P}/secret`,
      `http://0.0.0.0:${P}/secret`,
      `http://[::ffff:127.0.0.1]:${P}/secret`,
      'http://10.11.12.13/secret',
      'http://192.168.1.1/secret',
      'http://169.254.169.254/latest/meta-data',
      at('/to-loopback'),
      at('/to-localhost'),
      at('/to-private'),
    ];
    for (const link of refused) {
      const { status, body } = await get(link);
      expect([link, status, body.error]).toEqual([link, 422, 'that address is not on the internet']);
    }
    expect(hits['/secret'] ?? 0).toBe(0);
  });
});
