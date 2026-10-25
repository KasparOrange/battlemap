/**
 * Picture grids: where the squares of a picture map lie on its picture, and the grid editor's
 * tools (port of `lib/model/raster_grid.dart`, same tests). Every function returns a new grid.
 *
 * @see ../model/map.ts RasterGrid
 */
import type { Point } from '../model/basics.ts';
import type { RasterGrid } from '../model/map.ts';
import type { Rect } from './rect.ts';

/** How far (a fraction of a square) an edge sliver may be and still be ignored or rounded away. */
export const EDGE_TOLERANCE = 0.15;

/** Smallest square side the editor allows, in picture px. */
export const MIN_CELL = 4;

/** Fewest squares between the top-left corner and the finger for Stretch to change that axis. */
export const MIN_LEVERAGE = 1.5;

/**
 * `cols × rows` squares stretched over the whole picture — the simple squares dialog.
 *
 * @param cols - squares across (at least 1)
 * @param rows - squares down (at least 1)
 * @param pictureW - picture width in px
 * @param pictureH - picture height in px
 * @returns the grid
 */
export function wholeGrid(cols: number, rows: number, pictureW: number, pictureH: number): RasterGrid {
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  return { x: 0, y: 0, cellW: pictureW / c, cellH: pictureH / r, cols: c, rows: r, pictureW, pictureH };
}

/** Input of `gridFromLines`. */
export interface GridLines {
  /** Any vertical grid line, in picture px. */
  lineX: number;
  /** Any horizontal grid line, in picture px. */
  lineY: number;
  /** Square width in px. */
  cellW: number;
  /** Square height in px. */
  cellH: number;
  /** Picture width. */
  pictureW: number;
  /** Picture height. */
  pictureH: number;
  /** false: whole squares only (slivers stay outside); true: edge squares reach past the picture. */
  partialEdges?: boolean;
}

/**
 * The grid through a vertical and a horizontal line with the given square size, covering the
 * picture — with whole squares only (a sliver narrower than `EDGE_TOLERANCE` of a square still
 * counts as whole) or with partial edge squares.
 *
 * @param g - lines, square size, picture size, edge rule
 * @returns the grid
 */
export function gridFromLines(g: GridLines): RasterGrid {
  const partial = g.partialEdges ?? false;
  const axis = (line: number, cell: number, length: number): [number, number] => {
    let start = line % cell; // first line at or after the edge
    if (start < 0) start += cell;
    if (start > (1 - EDGE_TOLERANCE) * cell) start -= cell; // a hair before the edge
    if (partial) {
      if (start > EDGE_TOLERANCE * cell) start -= cell;
      return [start, Math.max(1, Math.ceil((length - start) / cell - EDGE_TOLERANCE))];
    }
    return [start, Math.max(1, Math.floor((length - start) / cell + EDGE_TOLERANCE))];
  };
  const [x, cols] = axis(g.lineX, g.cellW, g.pictureW);
  const [y, rows] = axis(g.lineY, g.cellH, g.pictureH);
  return { x, y, cellW: g.cellW, cellH: g.cellH, cols, rows, pictureW: g.pictureW, pictureH: g.pictureH };
}

/**
 * The grid's rectangle in picture px — what gets mapped onto the whole map.
 *
 * @param g - the grid
 * @returns the rectangle
 */
export function gridRect(g: RasterGrid): Rect {
  return { x: g.x, y: g.y, width: g.cols * g.cellW, height: g.rows * g.cellH };
}

/**
 * Whether squares are square within 0.5 %.
 *
 * @param g - the grid
 * @returns true when square
 */
export function isSquareGrid(g: RasterGrid): boolean {
  return Math.abs(g.cellW - g.cellH) <= 0.005 * Math.max(g.cellW, g.cellH);
}

/**
 * Whether this is `wholeGrid` for its picture (within 0.01 px).
 *
 * @param g - the grid
 * @returns true when whole
 */
export function isWholeGrid(g: RasterGrid): boolean {
  return Math.abs(g.x) < 0.01 && Math.abs(g.y) < 0.01 &&
    Math.abs(g.cols * g.cellW - g.pictureW) < 0.01 && Math.abs(g.rows * g.cellH - g.pictureH) < 0.01;
}

/**
 * Whether the grid reaches past the picture by more than `EDGE_TOLERANCE` of a square on some
 * side (a line a hair outside the edge, as detection often finds, does not count).
 *
 * @param g - the grid
 * @returns true with partial edge squares
 */
export function hasPartialEdges(g: RasterGrid): boolean {
  const tx = EDGE_TOLERANCE * g.cellW;
  const ty = EDGE_TOLERANCE * g.cellH;
  return g.x < -tx || g.y < -ty || g.x + g.cols * g.cellW > g.pictureW + tx || g.y + g.rows * g.cellH > g.pictureH + ty;
}

/**
 * The same squares on a picture of another size (a PDF page rendered at another resolution).
 *
 * @param g - the grid
 * @param pictureW - the other picture's width
 * @param pictureH - its height
 * @returns the scaled grid (`g` itself when the size is the same within half a pixel)
 */
export function gridForPicture(g: RasterGrid, pictureW: number, pictureH: number): RasterGrid {
  if (Math.abs(pictureW - g.pictureW) < 0.5 && Math.abs(pictureH - g.pictureH) < 0.5) return g;
  const sx = pictureW / g.pictureW;
  const sy = pictureH / g.pictureH;
  return { x: g.x * sx, y: g.y * sy, cellW: g.cellW * sx, cellH: g.cellH * sy, cols: g.cols, rows: g.rows, pictureW, pictureH };
}

/**
 * Re-counts the squares to cover the picture (see `gridFromLines`).
 *
 * @param g - the grid
 * @param partialEdges - the edge rule
 * @returns the re-counted grid
 */
export function recountGrid(g: RasterGrid, partialEdges: boolean): RasterGrid {
  return gridFromLines({ lineX: g.x, lineY: g.y, cellW: g.cellW, cellH: g.cellH, pictureW: g.pictureW, pictureH: g.pictureH, partialEdges });
}

/**
 * The same grid with squares of `w × h` px, the top-left corner staying put (the editor's size
 * steppers). Counts are kept.
 *
 * @param g - the grid
 * @param w - new square width (at least `MIN_CELL`)
 * @param h - new square height (at least `MIN_CELL`)
 * @returns the grid
 */
export function withCell(g: RasterGrid, w: number, h: number): RasterGrid {
  return { ...g, cellW: Math.max(MIN_CELL, w), cellH: Math.max(MIN_CELL, h) };
}

/**
 * The grid stretched so the picture point that was at `from` is now at `to`, the top-left
 * corner staying put — the editor's Stretch tool. An axis whose `from` lies less than
 * `MIN_LEVERAGE` squares from the corner is left alone; with `square` both axes take the one
 * with more leverage.
 *
 * @param g - the grid
 * @param from - where the finger started, picture px
 * @param to - where it is now
 * @param square - keep squares square
 * @returns the grid
 */
export function stretched(g: RasterGrid, from: Point, to: Point, square: boolean): RasterGrid {
  const u = (from.x - g.x) / g.cellW;
  const v = (from.y - g.y) / g.cellH;
  const canX = Math.abs(u) >= MIN_LEVERAGE;
  const canY = Math.abs(v) >= MIN_LEVERAGE;
  let w = canX ? (to.x - g.x) / u : g.cellW;
  let h = canY ? (to.y - g.y) / v : g.cellH;
  if (square) {
    if (!canX && !canY) return g;
    const s = Math.abs(u) >= Math.abs(v) ? w : h;
    w = s;
    h = s;
  }
  return withCell(g, w, h);
}

/** Input of `gridFromCorners`. */
export interface GridCorners {
  /** A grid corner the DM marked, picture px. */
  a: Point;
  /** A far grid corner. */
  b: Point;
  /** Squares from `a` to `b` across (negative = left). */
  nx: number;
  /** Squares from `a` to `b` down (negative = up). */
  ny: number;
  /** One size for both axes (least squares over both distances). */
  square: boolean;
  /** The grid so far (its size is kept on an axis with a count of 0, and its picture size). */
  fallback: RasterGrid;
  /** The edge rule. */
  partialEdges?: boolean;
}

/**
 * The grid through two marked grid corners — the editor's most precise tool (each mark's error
 * is divided by the count). Lines run through `a`.
 *
 * @param c - the marks, counts and fallback
 * @returns the grid, or null when both counts are 0 or the squares come out under `MIN_CELL`
 */
export function gridFromCorners(c: GridCorners): RasterGrid | null {
  if (c.nx === 0 && c.ny === 0) return null;
  const dx = Math.abs(c.b.x - c.a.x);
  const dy = Math.abs(c.b.y - c.a.y);
  const ax = Math.abs(c.nx);
  const ay = Math.abs(c.ny);
  let w: number;
  let h: number;
  if (c.square) {
    w = h = (dx * ax + dy * ay) / (ax * ax + ay * ay);
  } else {
    w = ax > 0 ? dx / ax : c.fallback.cellW;
    h = ay > 0 ? dy / ay : c.fallback.cellH;
  }
  if (w < MIN_CELL || h < MIN_CELL) return null;
  return gridFromLines({
    lineX: c.a.x, lineY: c.a.y, cellW: w, cellH: h,
    pictureW: c.fallback.pictureW, pictureH: c.fallback.pictureH, partialEdges: c.partialEdges ?? false,
  });
}

/**
 * Counts between two grid corners for the two-corner tool, signed. Free squares: each axis
 * rounded with the current size. Square squares: the pair whose two directions agree on one
 * size within 1 %, the one closest to the current size — so a wrong guess cannot give a pair
 * that contradicts itself (17 × 12, not 16 × 12). An axis shorter than half a square counts 0.
 *
 * @param g - the current grid (its size is the guess)
 * @param a - first corner
 * @param b - second corner
 * @param square - square squares
 * @returns [across, down]
 */
export function cornerCounts(g: RasterGrid, a: Point, b: Point, square: boolean): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!square) return [Math.round(dx / g.cellW), Math.round(dy / g.cellH)];
  const guess = (g.cellW + g.cellH) / 2;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 0.5 * guess || ay < 0.5 * guess) return [Math.round(dx / guess), Math.round(dy / guess)];
  const long = Math.max(ax, ay);
  const short = Math.min(ax, ay);
  let bestLong = 0;
  let bestShort = 0;
  let bestScore = Infinity;
  for (let nl = 1; nl <= long / MIN_CELL; nl++) {
    const ns = Math.round((short * nl) / long);
    if (ns < 1) continue;
    const cl = long / nl;
    const cs = short / ns;
    if (Math.abs(cl - cs) / cl > 0.01) continue;
    const score = Math.abs(Math.log(cl / guess));
    if (score < bestScore) {
      bestScore = score;
      bestLong = nl;
      bestShort = ns;
    }
  }
  if (bestLong === 0) return [Math.round(dx / guess), Math.round(dy / guess)];
  const [nx, ny] = ax >= ay ? [bestLong, bestShort] : [bestShort, bestLong];
  return [dx < 0 ? -nx : nx, dy < 0 ? -ny : ny];
}

/** Input of `gridFromLength`. */
export interface GridLength {
  /** Start of the measured line, picture px. */
  a: Point;
  /** End of it. */
  b: Point;
  /** How many squares long it is (fractions allowed). */
  squares: number;
  /** Picture width. */
  pictureW: number;
  /** Picture height. */
  pictureH: number;
  /** The edge rule. */
  partialEdges?: boolean;
}

/**
 * Square squares from a known length — the Known length tool for maps with no grid drawn in:
 * a line over a door (one square), a corridor, a scale bar. Lines run through `a`.
 *
 * @param l - the line, its length in squares, the picture size
 * @returns the grid, or null when `squares` ≤ 0 or the square would be under `MIN_CELL`
 */
export function gridFromLength(l: GridLength): RasterGrid | null {
  if (!(l.squares > 0)) return null;
  const cell = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) / l.squares;
  if (cell < MIN_CELL) return null;
  return gridFromLines({ lineX: l.a.x, lineY: l.a.y, cellW: cell, cellH: cell, pictureW: l.pictureW, pictureH: l.pictureH, partialEdges: l.partialEdges ?? false });
}

/**
 * The count on the other axis that agrees with `n` squares over `distance` for square squares
 * across `otherDistance` (signed like it) — "down follows across".
 *
 * @param distance - px along the counted axis
 * @param n - its count
 * @param otherDistance - px along the other axis
 * @returns the other count
 */
export function followingCount(distance: number, n: number, otherDistance: number): number {
  if (n === 0 || Math.abs(distance) < 1e-9) return 0;
  const c = Math.round((Math.abs(otherDistance) * Math.abs(n)) / Math.abs(distance));
  return otherDistance < 0 ? -c : c;
}

/**
 * The square sizes two corners imply per axis, and whether they agree within 1 %.
 *
 * @param a - first corner
 * @param b - second corner
 * @param nx - count across
 * @param ny - count down
 * @returns sizes (null for a zero count) and agreement
 */
export function cornersAgree(a: Point, b: Point, nx: number, ny: number): { across: number | null; down: number | null; agree: boolean } {
  const across = nx === 0 ? null : Math.abs(b.x - a.x) / Math.abs(nx);
  const down = ny === 0 ? null : Math.abs(b.y - a.y) / Math.abs(ny);
  const agree = across === null || down === null || Math.abs(across - down) / Math.max(across, down) <= 0.01;
  return { across, down, agree };
}

/**
 * `n` squares across the picture's width from the left edge — the editor's "squares across"
 * stepper. Rows follow: square squares, or the old row height when not `square`.
 *
 * @param g - the grid
 * @param n - squares across
 * @param square - square squares
 * @param partialEdges - the edge rule
 * @returns the grid
 */
export function acrossWidth(g: RasterGrid, n: number, square: boolean, partialEdges = false): RasterGrid {
  const w = g.pictureW / Math.max(1, n);
  const h = square ? w : g.pictureH / Math.max(1, g.rows);
  return gridFromLines({ lineX: 0, lineY: 0, cellW: w, cellH: h, pictureW: g.pictureW, pictureH: g.pictureH, partialEdges });
}

/**
 * The picture point of grid corner (`col`, `row`); col 0 is the first column's left edge.
 *
 * @param g - the grid
 * @param col - corner column
 * @param row - corner row
 * @returns picture px
 */
export function gridCorner(g: RasterGrid, col: number, row: number): Point {
  return { x: g.x + col * g.cellW, y: g.y + row * g.cellH };
}

/**
 * Fractional square coordinates of a picture point (inverse of `gridCorner`).
 *
 * @param g - the grid
 * @param p - picture px
 * @returns squares
 */
export function pictureToSquares(g: RasterGrid, p: Point): Point {
  return { x: (p.x - g.x) / g.cellW, y: (p.y - g.y) / g.cellH };
}

/**
 * Whether two grids describe the same squares within `eps` px.
 *
 * @param a - one grid
 * @param b - the other
 * @param eps - tolerance in px
 * @returns true when close
 */
export function gridsClose(a: RasterGrid, b: RasterGrid, eps = 0.005): boolean {
  return a.cols === b.cols && a.rows === b.rows &&
    Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.cellW - b.cellW) <= eps && Math.abs(a.cellH - b.cellH) <= eps;
}
