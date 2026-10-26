/**
 * Draws a fog-honest thumbnail in the browser (`fog-thumbs.ts` plans it): the map's picture
 * decoded small (`createImageBitmap` with a resize, at most {@link MAX_DECODE_SIDE} px — the box
 * decodes off the main thread and the bitmap is closed at once), the crop scaled onto a
 * {@link THUMB_W} × {@link THUMB_H} canvas, and the fog over it as a one-pixel-per-square mask
 * drawn smoothed (the soft rim the table shows). Encoded as WebP (JPEG where WebP can't be
 * written). One small canvas, nothing kept.
 */
import { THUMB_H, THUMB_W, type ThumbPlan } from './fog-thumbs.ts';

/** Longest side the picture is decoded at for a thumbnail. */
export const MAX_DECODE_SIDE = 1600;

/** The table's ground colour (`--bg`): fog and the space beside a map. */
const GROUND = '#0e0c0a';

/**
 * Draws one thumbnail.
 *
 * @param plan - what to draw (map, crop in squares, fog bytes or null for no fog)
 * @param picture - the map's picture or its table copy (same proportions)
 * @returns a data URL
 * @throws when the picture can't be decoded
 */
export async function drawFogThumb(plan: Extract<ThumbPlan, { kind: 'draw' }>, picture: Blob): Promise<string> {
  const g = plan.map.grid;
  const crop = plan.crop;
  const cropPx = crop.width * g.cellW;
  const s = Math.min(1, (THUMB_W * 1.25) / cropPx, MAX_DECODE_SIDE / Math.max(g.pictureW, g.pictureH));
  const bw = Math.max(1, Math.round(g.pictureW * s));
  const bh = Math.max(1, Math.round(g.pictureH * s));
  const bitmap = await createImageBitmap(picture, { resizeWidth: bw, resizeHeight: bh, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const c = canvas.getContext('2d')!;
  c.fillStyle = GROUND;
  c.fillRect(0, 0, THUMB_W, THUMB_H);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  // squares → bitmap px: (g.x + col · cellW) · s
  c.drawImage(bitmap, (g.x + crop.x * g.cellW) * s, (g.y + crop.y * g.cellH) * s, crop.width * g.cellW * s, crop.height * g.cellH * s, 0, 0, THUMB_W, THUMB_H);
  bitmap.close();
  if (plan.fog) {
    const { cols, rows } = g;
    const fog = document.createElement('canvas');
    fog.width = cols;
    fog.height = rows;
    const fc = fog.getContext('2d')!;
    const img = fc.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      const open = plan.fog[i >> 3]! & (1 << (i & 7));
      img.data[i * 4] = 14;
      img.data[i * 4 + 1] = 12;
      img.data[i * 4 + 2] = 10;
      img.data[i * 4 + 3] = open ? 0 : 255;
    }
    fc.putImageData(img, 0, 0);
    c.drawImage(fog, crop.x, crop.y, crop.width, crop.height, 0, 0, THUMB_W, THUMB_H);
    fog.width = fog.height = 0;
  }
  let url = canvas.toDataURL('image/webp', 0.8);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.82);
  canvas.width = canvas.height = 0;
  return url;
}
