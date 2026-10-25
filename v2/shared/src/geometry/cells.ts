/**
 * Squares as cell indices (`row * cols + col`) and the round shapes the fog tools paint.
 */
import type { Point } from '../model/basics.ts';

/**
 * The cell index of a square.
 *
 * @param col - column
 * @param row - row
 * @param cols - squares across the map
 * @returns `row * cols + col` (no bounds check)
 */
export function cellIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/**
 * The square under a point, or null outside the map.
 *
 * @param p - the point in squares
 * @param cols - squares across
 * @param rows - squares down
 * @returns the cell index or null
 */
export function cellAt(p: Point, cols: number, rows: number): number | null {
  const col = Math.floor(p.x);
  const row = Math.floor(p.y);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return row * cols + col;
}

/**
 * Whether the offset (`dc`, `dr`) squares from a centre lies inside a circle of `radius`
 * squares — the fog brush's round shape, `dc² + dr² ≤ r² + r` (0 is the square itself, 1 the
 * 3 × 3 block, 2 a 5 × 5 block without its corners).
 *
 * @param dc - column offset
 * @param dr - row offset
 * @param radius - radius in squares
 * @returns true when inside
 */
export function inCircle(dc: number, dr: number, radius: number): boolean {
  return dc * dc + dr * dr <= radius * radius + radius;
}

/**
 * The squares of a circle around (`col`, `row`), clipped to the map, ignoring walls — the fog
 * brush (any radius ≥ 0) and the circle reveal on maps without walls.
 *
 * @param col - centre column
 * @param row - centre row
 * @param radius - radius in squares
 * @param cols - squares across
 * @param rows - squares down
 * @returns cell indices, row by row
 * @see floodFillWithin in `walls.ts` for the same circle stopped by walls
 */
export function circleCells(col: number, row: number, radius: number, cols: number, rows: number): number[] {
  const out: number[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (!inCircle(dc, dr, radius)) continue;
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      out.push(r * cols + c);
    }
  }
  return out;
}
