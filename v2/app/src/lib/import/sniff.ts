/**
 * Picture headers: what kind of picture some bytes are (by their magic numbers, not the file
 * name) and how big it is, read from the header without decoding. Used to validate a file
 * before the expensive decode, to name the stored file's extension, and to size a `.dd2vtt`'s
 * picture whose pixels are never decoded at full size (the 17100 × 9600 castle).
 */

/** Picture kinds the importer takes (the stored file's extension). */
export type PictureExt = 'png' | 'jpg' | 'webp';

/** A picture's kind and size from its header. */
export interface PictureHeader {
  /** Its kind. */
  ext: PictureExt;
  /** Width in pixels (before any EXIF rotation). */
  width: number;
  /** Height in pixels. */
  height: number;
}

/**
 * The picture kind of some bytes by their magic numbers.
 *
 * @param b - the first bytes (16 are enough)
 * @returns the kind, or null for anything else
 */
export function pictureKind(b: Uint8Array): PictureExt | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

/**
 * Whether some bytes start like a PDF (`%PDF`, possibly after a little junk, as the spec allows
 * within the first 1024 bytes).
 *
 * @param b - the first bytes (1 KB are enough)
 * @returns true for a PDF
 */
export function looksLikePdf(b: Uint8Array): boolean {
  const n = Math.min(b.length - 4, 1024);
  for (let i = 0; i <= n; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true;
  }
  return false;
}

/**
 * Reads a picture's kind and size from its header.
 *
 * @param b - the bytes (a JPEG's size can sit far in, after its EXIF block — pass them all)
 * @returns the header, or null when the bytes are no PNG/JPEG/WebP or the header is damaged
 */
export function readPictureHeader(b: Uint8Array): PictureHeader | null {
  const ext = pictureKind(b);
  if (ext === 'png') return pngSize(b);
  if (ext === 'jpg') return jpegSize(b);
  if (ext === 'webp') return webpSize(b);
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
  return (b[at]! << 8) | b[at + 1]!;
}

function u16le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}

function sized(ext: PictureExt, width: number, height: number): PictureHeader | null {
  return width > 0 && height > 0 ? { ext, width, height } : null;
}

/** PNG: the IHDR chunk right after the signature. */
function pngSize(b: Uint8Array): PictureHeader | null {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return sized('png', u32be(b, 16), u32be(b, 20));
}

/** JPEG: walk the segments to the first start-of-frame marker. */
function jpegSize(b: Uint8Array): PictureHeader | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    const len = u16be(b, i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return sized('jpg', u16be(b, i + 7), u16be(b, i + 5));
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** WebP: lossy (VP8), lossless (VP8L) or extended (VP8X) header. */
function webpSize(b: Uint8Array): PictureHeader | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    return sized('webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return sized('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') {
    const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return sized('webp', w, h);
  }
  return null;
}
