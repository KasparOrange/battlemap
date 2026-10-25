/**
 * The review's server fixes (docs/review.md #5, #7, #26) that the Rust server makes and the Bun
 * server doesn't: checked only with `CONTRACT_FIXES=1` (run.ts sets it for `--target rust`).
 */
import { describe, expect, test } from 'bun:test';
import { BASE, FIXES, MAIN, upload } from '../lib.ts';

/** A PNG that is only a header claiming `w × h` pixels (a decompression bomb's first bytes). */
function pngHeader(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe.skipIf(!FIXES)('review fixes', () => {
  test('#5 a picture claiming more than 150 megapixels is refused before anything decodes it', async () => {
    for (const query of ['', 'format=webp', 'format=png']) {
      const t0 = Date.now();
      const { status, body } = await upload(pngHeader(20_000, 10_000), query);
      expect([query, status]).toEqual([query, 400]);
      expect(body.error).toContain('megapixels');
      expect(Date.now() - t0).toBeLessThan(1_000);
    }
  });

  test('#7 the upload limit is the documented one, refused with {error} (413) — not a bare proxy error', async () => {
    const res = await fetch(`${BASE}/files`, { method: 'POST', body: new Uint8Array(MAIN.maxUploadBytes + 1) });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain('over 2 MB');
  });
});
