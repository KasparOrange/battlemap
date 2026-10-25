/**
 * Grid helpers of the squares dialog (the importer finds the squares: `$lib/import`).
 */


/**
 * Rows that keep squares square for a count across.
 *
 * @param cols - squares across
 * @param pictureW - picture width
 * @param pictureH - picture height
 * @returns rows (at least 1)
 */
export function followingRows(cols: number, pictureW: number, pictureH: number): number {
  return Math.max(1, Math.round((pictureH * cols) / pictureW));
}
