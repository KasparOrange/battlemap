/**
 * The link fetch: address checks, share links, page pictures — with a fake downloader, so no
 * test goes online — and the real downloader refusing local addresses.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { makeDownloader, nameOf, type Download, type Downloader } from '../src/fetch/download.ts';
import { isPublicAddress, publicAddresses } from '../src/fetch/guard.ts';
import { pictureInPage, resolveShareLink } from '../src/fetch/link.ts';
import { testServer, type TestServer } from './helpers.ts';
import { picture } from './pictures.ts';

describe('addresses', () => {
  test('public and not', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '72.62.88.197', '2606:4700::6810:84e5', '::ffff:8.8.8.8']) expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::1', 'not-an-ip',
    ]) expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
  });

  test('a name is refused when any of its addresses is private', async () => {
    const resolve = async (host: string) => (host === 'mixed.test' ? [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }] : [{ address: '8.8.4.4', family: 4 }]);
    await expect(publicAddresses('mixed.test', resolve)).rejects.toThrow('not on the internet');
    expect(await publicAddresses('ok.test', resolve)).toEqual([{ address: '8.8.4.4', family: 4 }]);
    await expect(publicAddresses('[::1]', resolve)).rejects.toThrow('not on the internet');
    await expect(publicAddresses('gone.test', async () => { throw new Error('ENOTFOUND'); })).rejects.toThrow('unknown host');
  });

  test('the real downloader never connects to a local address', async () => {
    const local = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('secret') });
    const download = makeDownloader({ maxBytes: 1024, timeoutMs: 2000 });
    await expect(download(`http://127.0.0.1:${local.port}/`)).rejects.toThrow('not on the internet');
    await expect(download(`http://localhost:${local.port}/`)).rejects.toThrow('not on the internet');
    const rebinding = makeDownloader({ maxBytes: 1024, timeoutMs: 2000, resolve: async () => [{ address: '127.0.0.1', family: 4 }] });
    await expect(rebinding(`http://evil.test:${local.port}/`)).rejects.toThrow('not on the internet');
    await expect(download('ftp://example.com/x')).rejects.toThrow('only http');
    await expect(download('http://user:pw@example.com/')).rejects.toThrow('password');
    await expect(download('not a link')).rejects.toThrow('not a link');
    local.stop(true);
  });
});

describe('links and pages', () => {
  test('Drive and Dropbox shares become downloads', () => {
    expect(resolveShareLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing')).toBe('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn');
    expect(resolveShareLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMn')).toBe('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn');
    expect(resolveShareLink('https://www.dropbox.com/s/abc/map.png?dl=0')).toBe('https://www.dropbox.com/s/abc/map.png?dl=1');
    expect(resolveShareLink(' https://example.com/a.png ')).toBe('https://example.com/a.png');
  });

  test("a page's main picture: og:image, then image_src, then the first img; Drive's confirm form", () => {
    expect(pictureInPage('<meta property="og:image" content="/big.jpg"><img src="small.png">', 'https://x.test/p/')).toBe('https://x.test/big.jpg');
    expect(pictureInPage('<meta content="https://cdn.test/a.webp" name="twitter:image">', 'https://x.test/')).toBe('https://cdn.test/a.webp');
    expect(pictureInPage('<link rel="image_src" href="a.png">', 'https://x.test/d/')).toBe('https://x.test/d/a.png');
    expect(pictureInPage('<p>hi</p><img alt="" src="maps/m.jpg?a=1&amp;b=2">', 'https://x.test/')).toBe('https://x.test/maps/m.jpg?a=1&b=2');
    expect(pictureInPage('<p>nothing</p>', 'https://x.test/')).toBe(null);
    const drive = '<form id="download-form" action="https://drive.usercontent.google.com/download" method="get"><input type="hidden" name="id" value="1Ab"><input type="hidden" name="confirm" value="t"></form>';
    expect(pictureInPage(drive, 'https://drive.google.com/')).toBe('https://drive.usercontent.google.com/download?id=1Ab&confirm=t');
  });

  test('file names from Content-Disposition or the path', () => {
    expect(nameOf("attachment; filename*=UTF-8''Tower%20map.dd2vtt", 'https://x.test/dl')).toBe('Tower map.dd2vtt');
    expect(nameOf('attachment; filename="cave.png"', 'https://x.test/dl')).toBe('cave.png');
    expect(nameOf('', 'https://x.test/maps/keep%201.jpg')).toBe('keep 1.jpg');
  });
});

describe('GET /api/fetch', () => {
  let srv: TestServer;
  const asked: string[] = [];
  let pages: Record<string, Partial<Download>> = {};
  const fake: Downloader = async (url) => {
    asked.push(url);
    const page = pages[url];
    if (!page) throw new Error('404');
    return { bytes: new Uint8Array(0), contentType: '', name: '', finalUrl: url, ...page };
  };
  beforeAll(async () => (srv = await testServer(8_000, { download: fake })));
  afterAll(async () => srv.stop());

  /** Asks the server to fetch a link. */
  async function get(link: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${srv.base}/api/fetch?url=${encodeURIComponent(link)}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  test('a picture link: stored in uploads/, served from there', async () => {
    const png = await picture(40, 30);
    pages = { 'https://maps.test/cave.png': { bytes: png, contentType: 'image/png', name: 'cave.png' } };
    const { status, body } = await get('https://maps.test/cave.png');
    expect(status).toBe(200);
    expect(body).toMatchObject({ name: 'cave.png', kind: 'picture', ext: 'png', bytes: png.byteLength });
    const file = await fetch(`${srv.base}${body.url}`);
    expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from(png))).toBe(true);
  });

  test('a Drive share is downloaded through its direct link; a .dd2vtt keeps its kind', async () => {
    const vtt = new TextEncoder().encode('{"format":0.3,"resolution":{"map_origin":{"x":0,"y":0}},"image":""}');
    pages = { 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn': { bytes: vtt, contentType: 'application/octet-stream', name: 'Tower.dd2vtt' } };
    const { body } = await get('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view');
    expect(body).toMatchObject({ kind: 'uvtt', ext: 'dd2vtt', name: 'Tower.dd2vtt' });
  });

  test("a web page gives its main picture; a GIF becomes PNG", async () => {
    pages = {
      'https://blog.test/post': { bytes: new TextEncoder().encode('<html><head><meta property="og:image" content="/map.gif"></head></html>'), contentType: 'text/html' },
      'https://blog.test/map.gif': { bytes: await picture(20, 20, 'gif'), contentType: 'image/gif', name: 'map.gif' },
    };
    const { body } = await get('https://blog.test/post');
    expect(body).toMatchObject({ kind: 'picture', ext: 'png', name: 'map.png' });
  });

  test('refusals come back as 422 with the reason', async () => {
    pages = {
      'https://blog.test/empty': { bytes: new TextEncoder().encode('<html><body>no pictures</body></html>'), contentType: 'text/html' },
      'https://x.test/data.bin': { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'application/octet-stream' },
    };
    expect(await get('https://blog.test/empty')).toEqual({ status: 422, body: { error: 'no picture found on that page' } });
    expect((await get('https://x.test/data.bin')).body.error).toContain('not a map file');
    expect((await get('')).body.error).toContain('link first');
    expect((await get('https://gone.test/')).status).toBe(422);
  });
});
