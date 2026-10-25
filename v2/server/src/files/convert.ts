/**
 * "Store as": re-encoding an uploaded picture with sharp, by the old dev server's measured
 * rules (`tools/dev_server.py` `convert_picture`). The pixels keep their size, so a picture
 * grid (pixel positions) stays valid:
 *
 * - **webp**: lossy quality 90 (looks the same, 41–42 dB on painted maps), or lossless when that
 *   is no more than 1.5 × the lossy size (line art: a third of the PNG; tried up to 50 MP); a
 *   picture over 16383 px a side becomes JPEG (WebP's limit); when the result isn't smaller than
 *   a PNG/JPEG/WebP original, the original stays ("already smaller as it was").
 * - **jpeg**: quality 90, transparency flattened onto black (the TV's background).
 * - **png**: lossless, maximum compression.
 *
 * A picture with an EXIF orientation is turned upright first, so the stored pixels are what the
 * browser showed when the DM fitted the grid.
 *
 * @see ../../../docs/parity.md SV-04
 */
import sharp from 'sharp';

/** The formats a picture can be stored as (`?format=`); `asis` keeps the upload's bytes. */
export type StoreFormat = 'webp' | 'jpeg' | 'png' | 'asis';

/** The `?format=` values the server takes. */
export const STORE_FORMATS: ReadonlySet<string> = new Set(['webp', 'jpeg', 'png', 'asis']);

/** WebP's largest side. */
export const WEBP_MAX_SIDE = 16383;
/** Above this many pixels only lossy WebP is tried (lossless takes too long). */
export const WEBP_LOSSLESS_MAX_PIXELS = 50_000_000;
/** sharp's pixel cap: big battle maps are fine, the byte limit is the upload cap. */
export const MAX_INPUT_PIXELS = 1_000_000_000;

/** A converted picture. */
export interface Converted {
  /** The bytes to store. */
  bytes: Uint8Array;
  /** Their kind. */
  ext: 'png' | 'jpg' | 'webp';
  /** What happened ("lossless", "over 16383 px, stored as JPEG", …), or null. */
  note: string | null;
}

/** Facts about a picture. */
export interface PictureInfo {
  /** Width in pixels (upright). */
  width: number;
  /** Height in pixels (upright). */
  height: number;
  /** sharp's name of its format (`png`, `jpeg`, `webp`, `gif`, `tiff`, `heif`, …). */
  format: string;
  /** Whether it has an alpha channel. */
  alpha: boolean;
}

/**
 * Opens bytes with sharp.
 *
 * @param data - the bytes
 * @returns a sharp pipeline (pages: the first only)
 */
function open(data: Uint8Array) {
  return sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'none' });
}

/**
 * Reads a picture's size and format.
 *
 * @param data - the bytes
 * @returns its facts, or null when sharp can't read it as a picture
 */
export async function pictureInfo(data: Uint8Array): Promise<PictureInfo | null> {
  try {
    const m = await open(data).metadata();
    if (!m.width || !m.height || !m.format) return null;
    const turned = (m.orientation ?? 1) >= 5;
    return { width: turned ? m.height : m.width, height: turned ? m.width : m.height, format: m.format, alpha: m.hasAlpha ?? false };
  } catch {
    return null;
  }
}

/**
 * Re-encodes a picture.
 *
 * @param data - the picture as uploaded
 * @param format - what to store it as (not `asis`)
 * @param originalExt - its sniffed kind when it is a PNG/JPEG/WebP (they may stay as they are),
 *   else null (GIF, TIFF, … are always converted)
 * @returns the bytes to store, their kind and a note
 * @throws {Error} when the bytes are no picture sharp can read
 */
export async function convertPicture(data: Uint8Array, format: Exclude<StoreFormat, 'asis'>, originalExt: 'png' | 'jpg' | 'webp' | null): Promise<Converted> {
  const info = await pictureInfo(data);
  if (!info) throw new Error('not a picture');
  let target = format;
  let note: string | null = null;
  if (target === 'webp' && Math.max(info.width, info.height) > WEBP_MAX_SIDE) {
    target = 'jpeg';
    note = `over ${WEBP_MAX_SIDE} px, stored as JPEG`;
  }
  const upright = () => open(data).rotate();
  if (target === 'png') {
    return { bytes: await upright().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(), ext: 'png', note };
  }
  if (target === 'jpeg') {
    const bytes = await upright().flatten({ background: '#000000' }).jpeg({ quality: 90 }).toBuffer();
    return { bytes, ext: 'jpg', note };
  }
  let best: Uint8Array = await upright().webp({ quality: 90, effort: 4 }).toBuffer();
  if (info.width * info.height <= WEBP_LOSSLESS_MAX_PIXELS) {
    const lossless = await upright().webp({ lossless: true, effort: 4 }).toBuffer();
    if (lossless.byteLength <= best.byteLength * 1.5) {
      best = lossless;
      note = 'lossless';
    }
  }
  if (best.byteLength >= data.byteLength && originalExt) return { bytes: data, ext: originalExt, note: 'already smaller as it was' };
  return { bytes: best, ext: 'webp', note };
}

/**
 * A small picture for lists: at most `side` pixels on its long side, WebP.
 *
 * @param data - the picture
 * @param side - the long side (default 288, the old thumbnails' size)
 * @returns the thumbnail's bytes
 * @throws {Error} when the bytes are no picture
 */
export async function makeThumbnail(data: Uint8Array, side = 288): Promise<Uint8Array> {
  return open(data).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
}

/**
 * A copy at table density: at most `maxPx` picture pixels per square (the TV loads this one).
 *
 * @param data - the picture
 * @param cellPx - pixels per square of the original
 * @param maxPx - pixels per square of the copy (default 72)
 * @returns the copy as WebP, or null when the original is already at or below that density
 * @throws {Error} when the bytes are no picture
 */
export async function makeTableCopy(data: Uint8Array, cellPx: number, maxPx = 72): Promise<Uint8Array | null> {
  if (cellPx <= maxPx) return null;
  const info = await pictureInfo(data);
  if (!info) throw new Error('not a picture');
  const scale = maxPx / cellPx;
  const width = Math.max(1, Math.round(info.width * scale));
  const height = Math.max(1, Math.round(info.height * scale));
  return open(data).rotate().resize({ width, height, fit: 'fill' }).webp({ quality: 90, effort: 4 }).toBuffer();
}
