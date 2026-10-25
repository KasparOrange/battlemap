/**
 * Which squares a fog tool touches (parity FG-04 … FG-08): the round brush along a drag, the
 * Room flood fill and the Circle stopped by walls and closed doors. Pure, tested under `bun test`.
 * The squares are computed here on the tablet and sent explicitly in `fog.apply` (v1 lesson L20:
 * every tool's squares must travel to the TV).
 */
import { buildWallGrid, circleCells, floodFill, floodFillWithin, openWallGrid, type MapGeometry, type MapPlay, type Point, type WallGrid } from '@battlemap/shared';

/** Brush radius choices (0 = one square, 1 = a 3-wide plus, …), v1 default 1. */
export const BRUSH_RADII = [0, 1, 2, 3, 4] as const;
/** Circle radius limits (v1: 1–30, default 4). */
export const CIRCLE_MIN = 1;
/** Largest circle radius. */
export const CIRCLE_MAX = 30;
/** Circle radius a new tablet starts with. */
export const CIRCLE_DEFAULT = 4;

/**
 * The square under a point, or null off the map.
 *
 * @param at - a point in squares
 * @param cols - squares across
 * @param rows - squares down
 * @returns the cell index or null
 */
export function cellUnder(at: Point, cols: number, rows: number): number | null {
  const col = Math.floor(at.x);
  const row = Math.floor(at.y);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return row * cols + col;
}

/**
 * The square centres a drag passes from `a` to `b` (inclusive of `b`'s square), so a fast
 * finger that skips squares between two pointer events still paints a closed line.
 *
 * @param a - previous point in squares
 * @param b - current point in squares
 * @returns the squares as [col, row] pairs, without `a`'s own square
 */
export function squaresBetween(a: Point, b: Point): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2);
  let lastC = Math.floor(a.x);
  let lastR = Math.floor(a.y);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const c = Math.floor(a.x + (b.x - a.x) * t);
    const r = Math.floor(a.y + (b.y - a.y) * t);
    if (c === lastC && r === lastR) continue;
    out.push([c, r]);
    lastC = c;
    lastR = r;
  }
  return out;
}

/**
 * Tracks one brush stroke: each square the brush enters adds the stamp's squares not sent yet.
 */
export class BrushStroke {
  private readonly sent = new Set<number>();
  private last: Point;

  /**
   * @param start - where the stroke starts, in squares
   * @param radius - brush radius in squares
   * @param cols - squares across
   * @param rows - squares down
   */
  constructor(start: Point, private readonly radius: number, private readonly cols: number, private readonly rows: number) {
    this.last = start;
  }

  /**
   * The squares of the stamp at the start (call once).
   *
   * @returns new cells to send
   */
  first(): number[] {
    return this.fresh(circleCells(Math.floor(this.last.x), Math.floor(this.last.y), this.radius, this.cols, this.rows));
  }

  /**
   * The finger moved: stamps every square passed.
   *
   * @param at - the new point in squares
   * @returns new cells to send (empty when nothing new)
   */
  moveTo(at: Point): number[] {
    const out: number[] = [];
    for (const [c, r] of squaresBetween(this.last, at)) {
      out.push(...this.fresh(circleCells(c, r, this.radius, this.cols, this.rows)));
    }
    this.last = at;
    return out;
  }

  /** Every cell this stroke touched. */
  get touched(): number {
    return this.sent.size;
  }

  private fresh(cells: number[]): number[] {
    const out: number[] = [];
    for (const c of cells) {
      if (this.sent.has(c)) continue;
      this.sent.add(c);
      out.push(c);
    }
    return out;
  }
}

/** One wall grid kept per map + doors, rebuilt only when they change. */
let cached: { geometry: MapGeometry | null; doors: readonly number[]; cols: number; rows: number; grid: WallGrid } | null = null;

/**
 * The map's walls as blocked edges (open grid for picture maps), cached.
 *
 * @param map - the map on the table
 * @param geometry - its walls and doors, or null
 * @returns the wall grid
 */
export function wallsOf(map: MapPlay, geometry: MapGeometry | null): WallGrid {
  const { cols, rows } = map.info.grid;
  if (cached && cached.geometry === geometry && cached.doors === map.doorsOpen && cached.cols === cols && cached.rows === rows) return cached.grid;
  const grid = geometry ? buildWallGrid(cols, rows, geometry, map.doorsOpen) : openWallGrid(cols, rows);
  cached = { geometry, doors: map.doorsOpen, cols, rows, grid };
  return grid;
}

/**
 * The Room reveal: every square reachable from the tapped one without crossing a wall or closed
 * door; the whole map when it has no walls.
 *
 * @param map - the map on the table
 * @param geometry - its walls and doors, or null
 * @param at - the tap in squares
 * @returns cell indices (empty off the map)
 */
export function roomCells(map: MapPlay, geometry: MapGeometry | null, at: Point): number[] {
  const { cols, rows } = map.info.grid;
  const start = cellUnder(at, cols, rows);
  if (start === null) return [];
  return floodFill(wallsOf(map, geometry), start);
}

/**
 * The Circle reveal: squares within `radius` of the tapped one, stopped by walls and closed
 * doors (a plain circle on a map without walls).
 *
 * @param map - the map on the table
 * @param geometry - its walls and doors, or null
 * @param cell - the centre square's index
 * @param radius - radius in squares
 * @returns cell indices
 */
export function circleRevealCells(map: MapPlay, geometry: MapGeometry | null, cell: number, radius: number): number[] {
  return floodFillWithin(wallsOf(map, geometry), cell, radius);
}
