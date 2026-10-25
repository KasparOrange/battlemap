/**
 * A tiny PNG writer for test pictures (no dependency: `node:zlib` only). Draws a map-like
 * picture: a floor colour per room quadrant, dark grid lines every square, so a screenshot shows
 * whether the map is visible and where its squares lie.
 */
import { deflateSync } from 'node:zlib';

/** CRC-32 table for PNG chunks. */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Encodes an RGB picture as PNG.
 *
 * @param width - pixels
 * @param height - pixels
 * @param pixel - colour of a pixel as `[r, g, b]` (called once per pixel, row by row)
 * @returns the PNG file
 */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number]): Uint8Array {
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Floor colours of the four room quadrants. */
const FLOORS: readonly (readonly [number, number, number])[] = [[150, 120, 90], [110, 130, 100], [100, 110, 140], [140, 100, 120]];

/**
 * A map-like picture: `cols × rows` squares of `px` pixels, four tinted quadrants, grid lines.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param px - pixels per square
 * @param gridLines - whether to draw grid lines into the picture (an "own grid" map)
 * @returns the PNG file
 */
export function mapPicture(cols: number, rows: number, px: number, gridLines = true): Uint8Array {
  const halfX = Math.ceil(cols / 2) * px;
  const halfY = Math.ceil(rows / 2) * px;
  return encodePng(cols * px, rows * px, (x, y) => {
    if (gridLines && (x % px === 0 || y % px === 0)) return [30, 30, 30];
    return FLOORS[(x >= halfX ? 1 : 0) + (y >= halfY ? 2 : 0)]!;
  });
}
