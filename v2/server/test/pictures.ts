/**
 * Test pictures made with sharp, and small HTTP helpers for the file and library tests.
 */
import sharp from 'sharp';
import { newGame, wholeGrid, type Game, type MapInfo } from '@battlemap/shared';
import type { UploadResult } from '../src/files/upload.ts';

/**
 * A picture of noise (compresses badly, like a painted map) or a flat colour (like line art).
 *
 * @param w - width
 * @param h - height
 * @param format - png, jpeg, webp, gif or tiff
 * @param look - `noise` or `flat`
 * @param alpha - with an alpha channel
 * @returns the bytes
 */
export async function picture(w: number, h: number, format: 'png' | 'jpeg' | 'webp' | 'gif' | 'tiff' = 'png', look: 'noise' | 'flat' = 'flat', alpha = false): Promise<Uint8Array> {
  const channels = alpha ? 4 : 3;
  let img;
  if (look === 'noise') {
    const raw = new Uint8Array(w * h * channels);
    let x = 2463534242;
    for (let i = 0; i < raw.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      raw[i] = (x & 0x3f) + ((i / channels) % w) / 2; // a gradient with grain, like paint
    }
    img = sharp(raw, { raw: { width: w, height: h, channels } });
  } else {
    img = sharp({ create: { width: w, height: h, channels, background: alpha ? { r: 40, g: 90, b: 160, alpha: 0.5 } : '#285aa0' } });
  }
  return new Uint8Array(await img.toFormat(format, format === 'webp' ? { quality: 50 } : {}).toBuffer());
}

/**
 * Uploads bytes to `POST /files`.
 *
 * @param base - the server
 * @param data - the bytes
 * @param query - `ext=…&format=…`
 * @returns status and body
 */
export async function upload(base: string, data: Uint8Array, query = ''): Promise<{ status: number; body: UploadResult & { error?: string } }> {
  const res = await fetch(`${base}/files${query ? '?' + query : ''}`, { method: 'POST', body: data });
  return { status: res.status, body: (await res.json()) as UploadResult & { error?: string } };
}

/**
 * A picture map on an uploaded file.
 *
 * @param id - the map id
 * @param picture - the uploaded picture
 * @returns the map
 */
export function mapOn(id: string, picture: UploadResult): MapInfo {
  return {
    id, name: `Map ${id}`, kind: 'picture', picture: { hash: picture.hash, ext: picture.ext, bytes: picture.bytes }, tableCopy: null, geometry: null,
    grid: wholeGrid(10, 8, picture.width ?? 100, picture.height ?? 80), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

/**
 * A game on one map.
 *
 * @param id - the game id
 * @param map - its map
 * @returns the game
 */
export function gameOn(id: string, map: MapInfo): Game {
  return newGame({ id, name: `Game ${id}`, createdAt: '2026-10-25T18:00:00.000Z', map });
}
