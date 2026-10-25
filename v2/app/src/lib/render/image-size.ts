/**
 * Reads a picture's pixel size from its first bytes (PNG, JPEG, WebP) without decoding it, so
 * the renderer can plan a crop-and-resize decode (`tiles.ts`) before paying for the decode.
 * Pure: bytes in, size out.
 */

/** A picture's size in px. */
export interface ImageSize {
  /** Width in px. */
  width: number;
  /** Height in px. */
  height: number;
}

/** How many leading bytes `imageSize` needs at most for usual files (JPEG may need more). */
export const IMAGE_HEAD_BYTES = 256 * 1024;

/**
 * The size of a PNG, JPEG or WebP picture from its leading bytes.
 *
 * @param b - the file's first bytes (whole file is fine)
 * @returns the size, or null when the format is unknown or the header is cut off
 */
export function imageSize(b: Uint8Array): ImageSize | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return png(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webp(b);
  return null;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + i] ?? 0);
  return s;
}

function u32be(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
}

function u16be(b: Uint8Array, at: number): number {
  return (b[at]! << 8) + b[at + 1]!;
}

function u16le(b: Uint8Array, at: number): number {
  return b[at]! + (b[at + 1]! << 8);
}

function u24le(b: Uint8Array, at: number): number {
  return b[at]! + (b[at + 1]! << 8) + (b[at + 2]! << 16);
}

/** PNG: the IHDR chunk follows the 8-byte signature. */
function png(b: Uint8Array): ImageSize | null {
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** JPEG: walk the segments to the first start-of-frame marker. */
function jpeg(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + len;
  }
  return null;
}

/** WebP: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webp(b: Uint8Array): ImageSize | null {
  const kind = ascii(b, 12, 4);
  if (kind === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (kind === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (kind === 'VP8L') {
    const b0 = b[21]!, b1 = b[22]!, b2 = b[23]!, b3 = b[24]!;
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  return null;
}
