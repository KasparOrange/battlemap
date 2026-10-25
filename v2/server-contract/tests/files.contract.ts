/**
 * The file store over HTTP: uploads, "Store as" conversions and their rules, thumbnails,
 * immutable downloads, link-fetch files in `uploads/`.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { BASE, DATA_DIR, MAIN, download, inspect, picture, sha256, upload } from '../lib.ts';

const text = (s: string) => new TextEncoder().encode(s);

describe('POST /files as is', () => {
  test('a PNG: stored by its SHA-256, size and thumbnail answered; the same bytes again = the same ref', async () => {
    const png = await picture(600, 400);
    const a = await upload(png, 'ext=png');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ ext: 'png', bytes: png.byteLength, width: 600, height: 400, originalBytes: null, note: null });
    expect(a.body.hash).toBe(sha256(png));
    expect(a.body.thumb?.ext).toBe('webp');
    const thumb = await inspect(await download(a.body.thumb!));
    expect(thumb).toEqual({ width: 288, height: 192, format: 'webp' });
    const b = await upload(png);
    expect(b.body.hash).toBe(a.body.hash);
    expect(b.body.thumb).toEqual(a.body.thumb);
  });

  test('a small picture keeps its size in the thumbnail (never enlarged)', async () => {
    const { body } = await upload(await picture(30, 20));
    expect(await inspect(await download(body.thumb!))).toEqual({ width: 30, height: 20, format: 'webp' });
  });

  test('ext=jpeg means jpg; a JPEG and a WebP stay as they are', async () => {
    const jpg = await picture(40, 30, 'jpeg', 'noise');
    const a = await upload(jpg, 'ext=jpeg');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ ext: 'jpg', hash: sha256(jpg), width: 40, height: 30 });
    const webp = await picture(40, 30, 'webp');
    expect((await upload(webp)).body).toMatchObject({ ext: 'webp', hash: sha256(webp) });
  });

  test('GET /files/<hash>.<ext>: the bytes, immutable, CORS, content type; HEAD too; unknown or bad names 404', async () => {
    const png = await picture(30, 21);
    const { body } = await upload(png);
    const res = await fetch(`${BASE}/files/${body.hash}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(png))).toBe(true);
    expect((await fetch(`${BASE}/files/${body.hash}.png`, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(`${BASE}/files/${'0'.repeat(64)}.png`)).status).toBe(404);
    expect((await fetch(`${BASE}/files/${body.hash}.gif`)).status).toBe(404);
    expect((await fetch(`${BASE}/files/../library.json`)).status).toBe(404);
    expect((await fetch(`${BASE}/files/abc.png`)).status).toBe(404);
    expect((await fetch(`${BASE}/files/${body.hash.toUpperCase()}.png`)).status).toBe(404);
  });
});

describe('Store as', () => {
  test('format=webp: a painted map becomes lossy WebP with the original size noted', async () => {
    const png = await picture(300, 200, 'png', 'noise');
    const { status, body } = await upload(png, 'ext=png&format=webp');
    expect(status).toBe(201);
    expect(body).toMatchObject({ ext: 'webp', width: 300, height: 200, originalBytes: png.byteLength, note: null });
    expect(body.bytes).toBeLessThan(png.byteLength);
    expect(await inspect(await download(body))).toEqual({ width: 300, height: 200, format: 'webp' });
  });

  test('format=webp: line art becomes lossless WebP', async () => {
    const { body } = await upload(await picture(400, 300, 'png', 'flat'), 'format=webp');
    expect(body).toMatchObject({ ext: 'webp', note: 'lossless' });
    const px = await sharp(await download(body)).raw().toBuffer();
    expect([px[0], px[1], px[2]]).toEqual([0x28, 0x5a, 0xa0]);
  });

  test('format=webp twice: the conversion is remembered (same ref, same note)', async () => {
    const png = await picture(120, 90, 'png', 'noise');
    const a = await upload(png, 'format=webp');
    const b = await upload(png, 'format=webp');
    expect(b.body).toEqual(a.body);
  });

  test('format=webp wider than 16383 px: JPEG instead, with the note', async () => {
    const { status, body } = await upload(await picture(16400, 8), 'format=webp');
    expect(status).toBe(201);
    expect(body).toMatchObject({ ext: 'jpg', note: 'over 16383 px, stored as JPEG', width: 16400, height: 8 });
  });

  test('format=webp on a WebP that would only grow: kept as it was', async () => {
    const small = await picture(200, 200, 'webp', 'noise');
    const { body } = await upload(small, 'format=webp');
    expect(body).toMatchObject({ ext: 'webp', hash: sha256(small), bytes: small.byteLength, note: 'already smaller as it was', originalBytes: small.byteLength });
  });

  test('format=jpeg flattens transparency onto black; format=png is lossless PNG', async () => {
    const withAlpha = await picture(64, 64, 'png', 'flat', true);
    const jpg = await upload(withAlpha, 'format=jpeg');
    expect(jpg.body.ext).toBe('jpg');
    const px = await sharp(await download(jpg.body)).raw().toBuffer();
    expect(px[0]).toBeLessThan(40); // 50 % blue-ish over black, red channel ≈ 20
    expect(px[2]).toBeGreaterThan(60);
    expect(px[2]).toBeLessThan(100);
    const noisy = await picture(64, 64, 'jpeg', 'noise');
    const png = await upload(noisy, 'format=png');
    expect(png.body).toMatchObject({ ext: 'png', width: 64, height: 64, originalBytes: noisy.byteLength });
    const a = await sharp(noisy).raw().toBuffer();
    const b = await sharp(await download(png.body)).removeAlpha().raw().toBuffer();
    expect(b.length).toBe(a.length);
    // JPEG decoders differ by a step here and there (IDCT, chroma upsampling): "the same
    // pixels" means within one or two levels on average.
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    expect(diff / a.length).toBeLessThan(2);
  });

  test('a GIF or TIFF is always converted: to PNG without a format, else as asked', async () => {
    const gif = await upload(await picture(50, 40, 'gif'));
    expect(gif.status).toBe(201);
    expect(gif.body).toMatchObject({ ext: 'png', width: 50, height: 40 });
    expect(gif.body.originalBytes).toBeGreaterThan(0);
    expect(gif.body.thumb?.ext).toBe('webp');
    const tif = await upload(await picture(50, 40, 'tiff'), 'format=webp');
    expect(tif.status).toBe(201);
    expect(tif.body.ext).toBe('webp');
  });

  test('an EXIF orientation is applied: sizes are upright, a conversion stores upright pixels', async () => {
    const turned = new Uint8Array(await sharp(await picture(60, 40, 'jpeg', 'noise')).withMetadata({ orientation: 6 }).jpeg().toBuffer());
    const asIs = await upload(turned);
    expect(asIs.body).toMatchObject({ ext: 'jpg', hash: sha256(turned), width: 40, height: 60 });
    expect(await inspect(await download(asIs.body.thumb!))).toMatchObject({ width: 40, height: 60 });
    const png = await upload(turned, 'format=png');
    expect(await inspect(await download(png.body))).toEqual({ width: 40, height: 60, format: 'png' });
  });
});

describe('JSON and PDF', () => {
  test('stored as they are and checked; found by their bytes without ext', async () => {
    const geo = text(JSON.stringify({ walls: [], doors: [], lights: [] }));
    const j = await upload(geo, 'ext=json');
    expect(j.status).toBe(201);
    expect(j.body).toMatchObject({ ext: 'json', hash: sha256(geo), bytes: geo.byteLength, thumb: null, width: null, height: null, originalBytes: null, note: null });
    expect((await fetch(`${BASE}/files/${j.body.hash}.json`)).headers.get('content-type')).toBe('application/json');
    expect((await upload(text('[1,2,3]'))).body.ext).toBe('json');
    expect((await upload(text('{"format":0.3,"resolution":{},"image":""}'))).body.ext).toBe('json');
    expect((await upload(text('{nope'), 'ext=json')).status).toBe(400);
    expect((await upload(text('%PDF-1.4'), 'ext=json')).status).toBe(400);
    const pdf = await upload(text('%PDF-1.4\n%fake'), 'ext=pdf');
    expect(pdf.body).toMatchObject({ ext: 'pdf', thumb: null });
    expect((await fetch(`${BASE}/files/${pdf.body.hash}.pdf`)).headers.get('content-type')).toBe('application/pdf');
    expect((await upload(text('%PDF-1.7 no ext'))).body.ext).toBe('pdf');
    expect((await upload(text('hello'), 'ext=pdf')).status).toBe(400);
  });
});

describe('refusals', () => {
  test('empty, not a picture, a .dd2vtt or a page as a picture, bad ext / format, too big', async () => {
    const empty = await upload(new Uint8Array(0));
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain('empty');
    const junk = await upload(text('just some text'), 'ext=png');
    expect(junk.status).toBe(400);
    expect(junk.body.error).toContain('not a picture');
    expect((await upload(text('GIF89a'))).status).toBe(400);
    const vtt = await upload(text('{"format":0.3,"resolution":{},"image":""}'), 'ext=png');
    expect(vtt.status).toBe(400);
    expect(vtt.body.error).toContain('.dd2vtt');
    const page = await upload(text('<!doctype html><html><body>hi</body></html>'), 'ext=webp');
    expect(page.status).toBe(400);
    expect(page.body.error).toContain('not a picture');
    const gifExt = await upload(await picture(10, 10), 'ext=gif');
    expect(gifExt.status).toBe(400);
    expect(gifExt.body.error).toContain('ext must be');
    const avif = await upload(await picture(10, 10), 'format=avif');
    expect(avif.status).toBe(400);
    expect(avif.body.error).toContain('format must be');
    const big = await upload(new Uint8Array(MAIN.maxUploadBytes + 1024 * 1024));
    expect(big.status).toBe(413);
    expect(big.body.error).toContain('MB');
  });
});

describe.skipIf(!DATA_DIR)('GET /uploads/<name>', () => {
  test('serves link fetches with their content type; other names 404', async () => {
    mkdirSync(join(DATA_DIR, 'uploads'), { recursive: true });
    writeFileSync(join(DATA_DIR, 'uploads', 'abcdef012345.dd2vtt'), '{}');
    writeFileSync(join(DATA_DIR, 'uploads', 'abcdef012346.webp'), 'RIFF');
    const res = await fetch(`${BASE}/uploads/abcdef012345.dd2vtt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.text()).toBe('{}');
    expect((await fetch(`${BASE}/uploads/abcdef012346.webp`)).headers.get('content-type')).toBe('image/webp');
    expect((await fetch(`${BASE}/uploads/x.dd2vtt`)).status).toBe(404);
    expect((await fetch(`${BASE}/uploads/abcdef012399.png`)).status).toBe(404);
    expect((await fetch(`${BASE}/uploads/abcdef012345.exe`)).status).toBe(404);
  });
});
