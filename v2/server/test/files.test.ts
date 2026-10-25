/**
 * The file store over HTTP: uploads, "Store as" conversions, thumbnails, immutable downloads.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { convertPicture } from '../src/files/convert.ts';
import { sniff } from '../src/files/sniff.ts';
import { testServer, type TestServer } from './helpers.ts';
import { picture, upload } from './pictures.ts';

let srv: TestServer;
beforeAll(async () => (srv = await testServer(8_000, { config: { maxUploadBytes: 2 * 1024 * 1024 } })));
afterAll(async () => srv.stop());

describe('POST /files', () => {
  test('a PNG as is: stored by its SHA-256, size and thumbnail answered, same bytes twice = same ref', async () => {
    const png = await picture(600, 400);
    const a = await upload(srv.base, png, 'ext=png');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ ext: 'png', bytes: png.byteLength, width: 600, height: 400, originalBytes: null, note: null });
    expect(a.body.hash).toBe(new Bun.CryptoHasher('sha256').update(png).digest('hex'));
    expect(a.body.thumb?.ext).toBe('webp');
    const thumb = await sharp(Buffer.from(await (await fetch(`${srv.base}/files/${a.body.thumb!.hash}.webp`)).arrayBuffer())).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(288);
    const b = await upload(srv.base, png);
    expect(b.body.hash).toBe(a.body.hash);
    expect(b.body.thumb).toEqual(a.body.thumb);
  });

  test('GET /files/<hash>.<ext> is immutable, with CORS and the content type; unknown → 404', async () => {
    const png = await picture(30, 20);
    const { body } = await upload(srv.base, png);
    const res = await fetch(`${srv.base}/files/${body.hash}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(png))).toBe(true);
    expect((await fetch(`${srv.base}/files/${'0'.repeat(64)}.png`)).status).toBe(404);
    expect((await fetch(`${srv.base}/files/../library.json`)).status).toBe(404);
    expect((await fetch(`${srv.base}/files/abc.png`)).status).toBe(404);
  });

  test('format=webp: a painted map becomes lossy WebP with the original size noted', async () => {
    const png = await picture(300, 200, 'png', 'noise');
    const { status, body } = await upload(srv.base, png, 'ext=png&format=webp');
    expect(status).toBe(201);
    expect(body).toMatchObject({ ext: 'webp', width: 300, height: 200, originalBytes: png.byteLength });
    expect(body.bytes).toBeLessThan(png.byteLength);
  });

  test('format=webp: line art becomes lossless WebP', async () => {
    const { body } = await upload(srv.base, await picture(400, 300, 'png', 'flat'), 'format=webp');
    expect(body).toMatchObject({ ext: 'webp', note: 'lossless' });
  });

  test('format=jpeg flattens transparency onto black; format=png stays lossless', async () => {
    const withAlpha = await picture(64, 64, 'png', 'flat', true);
    const jpg = await upload(srv.base, withAlpha, 'format=jpeg');
    expect(jpg.body.ext).toBe('jpg');
    const px = await sharp(Buffer.from(await (await fetch(`${srv.base}/files/${jpg.body.hash}.jpg`)).arrayBuffer())).raw().toBuffer();
    expect(px[0]).toBeLessThan(40); // 50 % blue-ish over black, red channel ≈ 20
    const png = await upload(srv.base, await picture(64, 64, 'jpeg', 'noise'), 'format=png');
    expect(png.body.ext).toBe('png');
  });

  test('a GIF or TIFF is converted to PNG when no format was asked for', async () => {
    const gif = await upload(srv.base, await picture(50, 40, 'gif'));
    expect(gif.status).toBe(201);
    expect(gif.body).toMatchObject({ ext: 'png', width: 50, height: 40 });
    const tif = await upload(srv.base, await picture(50, 40, 'tiff'), 'format=webp');
    expect(tif.body.ext).toBe('webp');
  });

  test('JSON and PDF are stored as they are, and checked', async () => {
    const geo = new TextEncoder().encode(JSON.stringify({ walls: [], doors: [], lights: [] }));
    const j = await upload(srv.base, geo, 'ext=json');
    expect(j.status).toBe(201);
    expect(j.body).toMatchObject({ ext: 'json', thumb: null, width: null });
    expect((await fetch(`${srv.base}/files/${j.body.hash}.json`)).headers.get('content-type')).toBe('application/json');
    expect((await upload(srv.base, new TextEncoder().encode('{nope'), 'ext=json')).status).toBe(400);
    const pdf = await upload(srv.base, new TextEncoder().encode('%PDF-1.4\n%fake'), 'ext=pdf');
    expect(pdf.body.ext).toBe('pdf');
    expect((await upload(srv.base, new TextEncoder().encode('hello'), 'ext=pdf')).status).toBe(400);
  });

  test('refusals: empty, not a picture, a .dd2vtt, bad ext / format, too big', async () => {
    expect((await upload(srv.base, new Uint8Array(0))).status).toBe(400);
    const junk = await upload(srv.base, new TextEncoder().encode('just some text'), 'ext=png');
    expect(junk.status).toBe(400);
    expect(junk.body.error).toContain('not a picture');
    const vtt = await upload(srv.base, new TextEncoder().encode('{"format":0.3,"resolution":{},"image":""}'), 'ext=png');
    expect(vtt.body.error).toContain('.dd2vtt');
    expect((await upload(srv.base, await picture(10, 10), 'ext=gif')).status).toBe(400);
    expect((await upload(srv.base, await picture(10, 10), 'format=avif')).status).toBe(400);
    const big = await upload(srv.base, new Uint8Array(3 * 1024 * 1024));
    expect(big.status).toBe(413);
  });

  test('GET /uploads/<name> serves link fetches; other names 404', async () => {
    mkdirSync(join(srv.dataDir, 'uploads'), { recursive: true });
    writeFileSync(join(srv.dataDir, 'uploads', 'abcdef012345.dd2vtt'), '{}');
    const res = await fetch(`${srv.base}/uploads/abcdef012345.dd2vtt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect((await fetch(`${srv.base}/uploads/x.dd2vtt`)).status).toBe(404);
  });
});

describe('conversion rules', () => {
  test('wider than 16383 px: JPEG instead of WebP', async () => {
    const wide = await picture(16400, 8, 'png');
    const c = await convertPicture(wide, 'webp', 'png');
    expect(c).toMatchObject({ ext: 'jpg', note: 'over 16383 px, stored as JPEG' });
  });

  test('a WebP that would only grow stays as it was', async () => {
    const small = await picture(200, 200, 'webp', 'noise');
    const c = await convertPicture(small, 'webp', 'webp');
    expect(c.note).toBe('already smaller as it was');
    expect(c.bytes).toBe(small);
  });

  test('sniffing goes by the bytes', async () => {
    expect(sniff(await picture(4, 4, 'png'))).toBe('png');
    expect(sniff(await picture(4, 4, 'jpeg'))).toBe('jpg');
    expect(sniff(await picture(4, 4, 'webp'))).toBe('webp');
    expect(sniff(new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(sniff(new TextEncoder().encode('{"format":0.3,"resolution":{"map_origin":{}}}'))).toBe('uvtt');
    expect(sniff(new TextEncoder().encode('{"walls":[]}'))).toBe('json');
    expect(sniff(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBe('html');
    expect(sniff(new TextEncoder().encode('GIF89a'))).toBe(null);
  });
});
