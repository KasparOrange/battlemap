/**
 * The fog texture's texels — pure, no Pixi. One RGBA8 texel per map square:
 *
 * | channel | meaning |
 * |---|---|
 * | R | 255 = revealed, 0 = fog |
 * | G | reveal fade: extra fog 0–255 on a square being revealed (animated) |
 * | B | bits: 0–1 staged preview (1 = will be revealed, 2 = will be hidden); 2 = a fogged, 3 = a revealed square touches this one (8-neighbourhood, inside the map) — the shader's fast paths |
 * | A | atmospheric level: Chebyshev distance to the nearest revealed square, 0–4, × 63 |
 *
 * The renderer keeps one buffer per map, writes a new state's texels into a scratch buffer,
 * copies only the rows that changed and uploads just those (`changedRows`). The reveal animation
 * is driven by `RevealAnim` (`reveal-anim.ts`), which writes G for the squares still animating.
 *
 * @see ./fog-shader.ts for how the channels are drawn
 */
import { maskToBytes, type FogState } from '@battlemap/shared';

/** Texels per square. */
export const FOG_CHANNELS = 4;

/** Steps of the atmospheric distance stored in A (0 = revealed … 4 = deep fog). */
export const ATMOS_LEVELS = 4;

/** A stored atmospheric step's byte value. */
export const ATMOS_STEP = 63;

/**
 * Writes a fog state's R, B and A channels into `out` (G is left alone — the fade owns it).
 *
 * @param fog - the map's fog
 * @param cols - map width in squares
 * @param rows - map height in squares
 * @param out - `cols × rows × 4` bytes
 * @param scratch - `cols × rows` bytes of work space for the distance pass
 */
export function writeFogTexels(fog: FogState, cols: number, rows: number, out: Uint8Array, scratch: Uint8Array): void {
  const cells = cols * rows;
  const rev = maskToBytes(fog.revealed, cells);
  const sr = fog.staged ? maskToBytes(fog.staged.reveal, cells) : null;
  const sh = fog.staged ? maskToBytes(fog.staged.hide, cells) : null;
  for (let i = 0; i < cells; i++) {
    const byte = i >> 3;
    const bit = 1 << (i & 7);
    const o = i * 4;
    out[o] = rev[byte]! & bit ? 255 : 0;
    out[o + 2] = sr && sr[byte]! & bit ? STAGED_REVEAL : sh && sh[byte]! & bit ? STAGED_HIDE : 0;
  }
  markFogEdges(out, cols, rows);
  atmosphericLevels(out, cols, rows, scratch);
  for (let i = 0; i < cells; i++) out[i * 4 + 3] = scratch[i]! * ATMOS_STEP;
}

/** B bits: staged reveal. */
export const STAGED_REVEAL = 1;
/** B bits: staged hide. */
export const STAGED_HIDE = 2;
/** B bit: a fogged square is among the 8 neighbours. */
export const FOG_NEAR = 4;
/** B bit: a revealed square is among the 8 neighbours. */
export const REVEALED_NEAR = 8;

/**
 * Sets `FOG_NEAR` / `REVEALED_NEAR` in B on every square with a fogged / revealed square among
 * its 8 neighbours (inside the map) — the shader skips its neighbour loop without them. Reads R.
 *
 * @param texels - RGBA texels
 * @param cols - map width
 * @param rows - map height
 */
export function markFogEdges(texels: Uint8Array, cols: number, rows: number): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let fog = false;
      let open = false;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= cols || (dx === 0 && dy === 0)) continue;
          if (texels[(yy * cols + xx) * 4] === 0) fog = true;
          else open = true;
        }
      }
      const o = (y * cols + x) * 4 + 2;
      texels[o] = (texels[o]! & 3) | (fog ? FOG_NEAR : 0) | (open ? REVEALED_NEAR : 0);
    }
  }
}

/**
 * Chebyshev distance (capped at `ATMOS_LEVELS`) from every square to the nearest revealed one,
 * by two passes over the grid. Reads R from `texels`, writes the distances into `dist`.
 *
 * @param texels - RGBA texels (R = revealed)
 * @param cols - map width
 * @param rows - map height
 * @param dist - `cols × rows` bytes, overwritten
 */
export function atmosphericLevels(texels: Uint8Array, cols: number, rows: number, dist: Uint8Array): void {
  const cap = ATMOS_LEVELS;
  for (let i = 0; i < cols * rows; i++) dist[i] = texels[i * 4]! ? 0 : cap;
  // forward: from up-left, up, up-right, left
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let d = dist[i]!;
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[i - 1]! + 1);
      if (y > 0) {
        d = Math.min(d, dist[i - cols]! + 1);
        if (x > 0) d = Math.min(d, dist[i - cols - 1]! + 1);
        if (x < cols - 1) d = Math.min(d, dist[i - cols + 1]! + 1);
      }
      dist[i] = d;
    }
  }
  // backward: from down-right, down, down-left, right
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      let d = dist[i]!;
      if (d === 0) continue;
      if (x < cols - 1) d = Math.min(d, dist[i + 1]! + 1);
      if (y < rows - 1) {
        d = Math.min(d, dist[i + cols]! + 1);
        if (x < cols - 1) d = Math.min(d, dist[i + cols + 1]! + 1);
        if (x > 0) d = Math.min(d, dist[i + cols - 1]! + 1);
      }
      dist[i] = d;
    }
  }
}

/**
 * The first and last row that differ between two texel buffers.
 *
 * @param a - one buffer
 * @param b - the other, same length
 * @param cols - texels per row
 * @returns the row range, or null when equal
 */
export function changedRows(a: Uint8Array, b: Uint8Array, cols: number): { first: number; last: number } | null {
  const stride = cols * FOG_CHANNELS;
  const rows = Math.floor(a.length / stride);
  let first = -1;
  for (let y = 0; y < rows && first < 0; y++) if (!rowEqual(a, b, y * stride, stride)) first = y;
  if (first < 0) return null;
  let last = first;
  for (let y = rows - 1; y > first; y--) {
    if (!rowEqual(a, b, y * stride, stride)) {
      last = y;
      break;
    }
  }
  return { first, last };
}

function rowEqual(a: Uint8Array, b: Uint8Array, at: number, n: number): boolean {
  for (let i = at; i < at + n; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The reveal fade, now `RevealAnim` (its default style `fade` is the old plain 500 ms fade).
 * Kept under this name for older callers and tests.
 *
 * @see ./reveal-anim.ts
 */
export { FADE_MS, RevealAnim as FogFade } from './reveal-anim.ts';
