/**
 * How much of its frame a sheet's art fills at its largest — pure, tested under `bun test`.
 *
 * A fireball's frames are 8 squares wide, but the fire inside reaches ~5 of them at its peak;
 * fitted by the frame, the burst looks smaller than the area it hits (W3-D). A region placement
 * divides by this coverage so the art's widest moment spans the area.
 */

/** A frame's rectangle on the (scaled) atlas, px. */
export interface FrameRect {
  /** Left. */
  readonly x: number;
  /** Top. */
  readonly y: number;
  /** Width. */
  readonly w: number;
  /** Height. */
  readonly h: number;
}

/** Below this the art is taken as empty when filled (0.6). */
export const MIN_COVERAGE = 0.6;

/**
 * The art's largest reach from the frame centre, as a share of half the frame (1 = touches the
 * frame's edge), over all frames.
 *
 * @param alpha - one alpha byte per pixel of the atlas image, row by row
 * @param width - atlas image width in px
 * @param frames - the frames' rectangles on that image
 * @param threshold - alpha (0–255) that counts as drawn (default 40)
 * @returns coverage in [MIN_COVERAGE, 1] (1 when nothing is drawn)
 */
export function artCoverage(alpha: Uint8Array | Uint8ClampedArray, width: number, frames: readonly FrameRect[], threshold = 40): number {
  let best = 0;
  for (const f of frames) {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const x0 = Math.max(0, Math.floor(f.x));
    const y0 = Math.max(0, Math.floor(f.y));
    const x1 = Math.floor(f.x + f.w);
    const y1 = Math.floor(f.y + f.h);
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) {
        if (alpha[row + x]! < threshold) continue;
        // the pixel's far edge: a pixel touching the frame edge reaches 1
        const r = Math.max((Math.abs(x + 0.5 - cx) + 0.5) / (f.w / 2), (Math.abs(y + 0.5 - cy) + 0.5) / (f.h / 2));
        if (r > best) best = r;
      }
    }
  }
  if (best === 0) return 1;
  return Math.min(1, Math.max(MIN_COVERAGE, best));
}
