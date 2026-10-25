/**
 * Squares from a map's file name, for pictures with no grid drawn in. Port of the old app's
 * `gridCountsFromName` (`lib/model/grid_detect.dart`), same rules and test cases.
 *
 * @see ./grid-detect.ts, tried first (a drawn grid wins)
 */
import { MIN_CELL_PX } from './grid-detect.ts';

/** Squares across and down. */
export interface SquareCounts {
  /** Squares across. */
  cols: number;
  /** Squares down. */
  rows: number;
}

/**
 * The squares a map's file name states. Map makers name gridless exports by their size:
 * `Tavern_30x40.jpg`, `cave [22 x 30] gridless.png`, `Ruins 24×36.webp`. Reads every
 * `<a> x <b>` (x, X or ×) and returns the first one that fits the picture: both counts 1..200,
 * squares of at least 20 px (a pixel size like `1920x1080` gives ~1 px squares and is skipped),
 * and square within 3 % — read as columns × rows, or the other way round when only that fits.
 *
 * @param fileName - the file's name
 * @param pictureW - picture width in px (0 or less = unknown)
 * @param pictureH - picture height in px
 * @returns the counts, or null when none fits or the picture size is unknown
 */
export function gridCountsFromName(fileName: string, pictureW: number, pictureH: number): SquareCounts | null {
  if (!(pictureW > 0) || !(pictureH > 0)) return null;
  const re = /(?<!\d)(\d{1,3})\s*[xX×]\s*(\d{1,3})(?!\d)/g;
  const fits = (c: number, r: number): boolean => {
    if (c < 1 || r < 1 || c > 200 || r > 200) return false;
    const w = pictureW / c;
    const h = pictureH / r;
    return w >= MIN_CELL_PX && Math.abs(h / w - 1) <= 0.03;
  };
  for (const m of fileName.matchAll(re)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (fits(a, b)) return { cols: a, rows: b };
    if (fits(b, a)) return { cols: b, rows: a };
  }
  return null;
}
