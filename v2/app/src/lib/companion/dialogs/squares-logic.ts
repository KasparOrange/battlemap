/**
 * The squares dialog's rules (parity UP-06 … UP-09): the grid for the counts the DM set (the
 * found or fitted grid is kept while its counts stay), the sentence about what was found, the
 * square size line and the off-square warning. Pure, tested (`dialogs-logic.test.ts`).
 */
import { gridsClose, isWholeGrid, wholeGrid, type RasterGrid } from '@battlemap/shared';
import type { GridFinding } from '../library/services.ts';

/**
 * The grid for counts: the given grid while its counts are unchanged (a detected grid that
 * starts inside the picture, or one fitted in the editor), else the counts stretched over the
 * whole picture.
 *
 * @param base - the grid found or fitted so far
 * @param cols - squares across
 * @param rows - squares down
 * @returns the grid
 */
export function gridForCounts(base: RasterGrid, cols: number, rows: number): RasterGrid {
  if (base.cols === cols && base.rows === rows) return base;
  return wholeGrid(cols, rows, base.pictureW, base.pictureH);
}

/** Rounds to 2 places for reading. */
const n2 = (v: number) => Number(v.toFixed(2));

/**
 * What the badge on the picture says about the squares.
 *
 * @param f - what the importer found
 * @returns the text and its tone
 */
export function findingText(f: GridFinding): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  switch (f.source) {
    case 'drawn': {
      const inset = f.offsetX > 0.5 || f.offsetY > 0.5 ? `, starting ${Math.round(f.offsetX)} px in, ${Math.round(f.offsetY)} px down` : '';
      return { text: `Found a drawn grid: ${f.cols} × ${f.rows} squares of ${n2(f.cellPx)} px${inset}`, tone: 'ok' };
    }
    case 'fileName':
      return { text: `The file name says ${f.cols} × ${f.rows} squares`, tone: 'ok' };
    case 'file':
      return { text: `The map file says ${f.cols} × ${f.rows} squares`, tone: 'ok' };
    case 'none':
      return { text: 'No grid found — measure a door or a scale bar', tone: 'warn' };
  }
}

/**
 * "One square = 32 px of the picture" (or "32 × 30 px" when not square).
 *
 * @param g - the grid
 * @returns the text
 */
export function squareSizeText(g: RasterGrid): string {
  const same = Math.abs(g.cellW - g.cellH) <= 0.005 * Math.max(g.cellW, g.cellH);
  return same ? `One square = ${n2(g.cellW)} px of the picture` : `One square = ${n2(g.cellW)} × ${n2(g.cellH)} px of the picture`;
}

/**
 * The warning when the counts make squares more than 3 % off square.
 *
 * @param g - the grid
 * @returns the warning or null
 */
export function offSquareWarning(g: RasterGrid): string | null {
  const skew = Math.abs(g.cellW - g.cellH) / Math.max(g.cellW, g.cellH);
  return skew > 0.03 ? `These counts make squares ${(skew * 100).toFixed(0)} % off square — check the rows.` : null;
}

/**
 * Whether the dialog's grid differs from where it started (the editor's "changed").
 *
 * @param a - one grid
 * @param b - the other
 * @returns true when different
 */
export function gridChanged(a: RasterGrid, b: RasterGrid): boolean {
  return !gridsClose(a, b, 1e-6);
}

/**
 * Whether a grid is worth keeping as the map's picture grid (not just the whole picture).
 *
 * @param g - the grid
 * @returns true when it says more than the counts
 */
export function isFitted(g: RasterGrid): boolean {
  return !isWholeGrid(g);
}
