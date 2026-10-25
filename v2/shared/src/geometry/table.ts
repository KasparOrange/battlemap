/**
 * The table view: one map square = one physical inch on the TV, a centred window of whole
 * squares, big maps panned in whole squares (port of `lib/model/table_fit.dart`, same tests).
 * All lengths are the TV's CSS pixels unless they say squares or inches.
 *
 * @see ../../../docs/architecture.md "table view maths"
 */
import type { Point } from '../model/basics.ts';
import { MAX_OVERSCAN_PERCENT, type CalibrationPivot } from '../model/table.ts';
import { roundHalfAway, type Rect } from './rect.ts';

/** Length of the calibration pattern's measuring bar, in inches (shorter where there's no room). */
export const MEASURING_BAR_INCHES = 10;

/** How many whole one-inch squares a TV screen holds, and where they sit. */
export interface TableGrid {
  /** Screen width in px. */
  readonly width: number;
  /** Screen height in px. */
  readonly height: number;
  /** Physical width of the whole picture in inches (what the bar calibrates). */
  readonly widthInches: number;
  /** Percent cut off each edge by the TV set (clamped). */
  readonly overscanPercent: number;
  /** Screen px per inch — and per map square on the table. */
  readonly ppi: number;
  /** Whole squares across what the TV shows. */
  readonly cols: number;
  /** Whole squares down what the TV shows. */
  readonly rows: number;
  /** The part of the screen the TV set shows (the screen minus the overscan). */
  readonly visible: Rect;
  /** The window of `cols × rows` squares, centred on the screen. */
  readonly window: Rect;
}

/**
 * The table of a screen.
 *
 * @param screen - the TV's viewport in px
 * @param widthInches - physical width of its picture
 * @param overscanPercent - percent the set cuts off each edge (clamped to 0–12)
 * @returns the grid, or null for an empty screen or a non-positive width
 */
export function tableGrid(screen: { width: number; height: number }, widthInches: number, overscanPercent = 0): TableGrid | null {
  const { width, height } = screen;
  if (!(width > 0) || !(height > 0) || !(widthInches > 0)) return null;
  const o = Math.min(Math.max(overscanPercent, 0), MAX_OVERSCAN_PERCENT);
  const ppi = width / widthInches;
  const shown = 1 - (2 * o) / 100;
  // A hair of tolerance so 34.0 inches of picture still count 34 squares.
  const cols = Math.max(1, Math.floor((width * shown) / ppi + 1e-6));
  const rows = Math.max(1, Math.floor((height * shown) / ppi + 1e-6));
  const dx = (width * o) / 100;
  const dy = (height * o) / 100;
  const w = cols * ppi;
  const h = rows * ppi;
  return {
    width,
    height,
    widthInches,
    overscanPercent: o,
    ppi,
    cols,
    rows,
    visible: { x: dx, y: dy, width: width - 2 * dx, height: height - 2 * dy },
    window: { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h },
  };
}

/**
 * Leftover inches on the left and on the right of what the TV shows (each side).
 *
 * @param grid - the table
 * @returns inches per side
 */
export function marginXInches(grid: TableGrid): number {
  return (grid.visible.width / grid.ppi - grid.cols) / 2;
}

/**
 * Leftover inches at the top and at the bottom of what the TV shows (each side).
 *
 * @param grid - the table
 * @returns inches per side
 */
export function marginYInches(grid: TableGrid): number {
  return (grid.visible.height / grid.ppi - grid.rows) / 2;
}

/**
 * How far a corner pivot sits from both edges of what the TV shows: 8 % of its shorter side.
 *
 * @param grid - the table
 * @returns the inset in px
 */
export function pivotInset(grid: TableGrid): number {
  return 0.08 * Math.min(grid.visible.width, grid.visible.height);
}

/**
 * Where the measuring bar's zero sits — fixed in screen px whatever the width calibration
 * (it depends on the screen and the overscan only), always inside what the TV shows.
 *
 * @param grid - the table
 * @param pivot - the chosen pivot
 * @returns the point in px
 */
export function pivotPoint(grid: TableGrid, pivot: CalibrationPivot): Point {
  const i = pivotInset(grid);
  const v = grid.visible;
  switch (pivot) {
    case 'bottomLeft': return { x: v.x + i, y: v.y + v.height - i };
    case 'bottomRight': return { x: v.x + v.width - i, y: v.y + v.height - i };
    case 'topLeft': return { x: v.x + i, y: v.y + i };
    case 'topRight': return { x: v.x + v.width - i, y: v.y + i };
    case 'center': return { x: v.x + v.width / 2, y: v.y + v.height / 2 };
  }
}

/**
 * Whether the bar runs from the pivot to the right (left corners and the centre).
 *
 * @param pivot - the pivot
 * @returns true for rightwards
 */
export function barRunsRight(pivot: CalibrationPivot): boolean {
  return pivot !== 'bottomRight' && pivot !== 'topRight';
}

/**
 * The measuring bar's length in whole inches: up to `MEASURING_BAR_INCHES`, shorter when there
 * is less room that way. Pure, so the tablet (which knows inches, not the TV's pixels) gets the
 * same bar.
 *
 * @param widthInches - picture width
 * @param heightInches - picture height
 * @param pivot - where it starts
 * @param overscanPercent - percent cut off each edge
 * @returns whole inches, at least 1
 */
export function barInches(widthInches: number, heightInches: number, pivot: CalibrationPivot, overscanPercent = 0): number {
  const shown = 1 - (2 * Math.min(Math.max(overscanPercent, 0), MAX_OVERSCAN_PERCENT)) / 100;
  const w = widthInches * shown;
  const h = heightInches * shown;
  const inset = 0.08 * Math.min(w, h);
  const room = pivot === 'center' ? w / 2 : w - inset;
  return Math.max(1, Math.min(MEASURING_BAR_INCHES, Math.floor(room - 0.1)));
}

/** The TV camera on the one-inch table for one map. */
export interface TableLayout {
  /** Screen px per square (= the table's px per inch). */
  readonly zoom: number;
  /** Camera centre, x in squares. */
  readonly centerX: number;
  /** Camera centre, y in squares. */
  readonly centerY: number;
  /** Window width along the map's x axis, in squares (the screen's rows when turned sideways). */
  readonly winCols: number;
  /** Window height along the map's y axis, in squares. */
  readonly winRows: number;
  /** First map column in the window (clamped; centred value on an axis that fits). */
  readonly col: number;
  /** First map row in the window. */
  readonly row: number;
  /** Whether the map is wider than the window. */
  readonly pansX: boolean;
  /** Whether the map is taller than the window. */
  readonly pansY: boolean;
}

/** What `tableLayout` needs. */
export interface TableLayoutInput {
  /** The table. */
  grid: TableGrid;
  /** Map width in squares. */
  mapCols: number;
  /** Map height in squares. */
  mapRows: number;
  /** Camera turn in quarter turns (odd = sideways). */
  quarterTurns?: number;
  /** Requested first column, null = centred. */
  col?: number | null;
  /** Requested first row, null = centred. */
  row?: number | null;
}

/**
 * Lays a map on the table: per axis, a map that fits is centred (the window hangs over both
 * ends evenly); a bigger one shows the window from the requested square, clamped to the map.
 *
 * @param input - table, map size, turn, requested window start
 * @returns the layout
 */
export function tableLayout(input: TableLayoutInput): TableLayout {
  const sideways = (input.quarterTurns ?? 0) % 2 !== 0;
  const winCols = sideways ? input.grid.rows : input.grid.cols;
  const winRows = sideways ? input.grid.cols : input.grid.rows;
  const x = axis(input.mapCols, winCols, input.col ?? null);
  const y = axis(input.mapRows, winRows, input.row ?? null);
  return {
    zoom: input.grid.ppi,
    centerX: x.center,
    centerY: y.center,
    winCols,
    winRows,
    col: x.start,
    row: y.start,
    pansX: x.pans,
    pansY: y.pans,
  };
}

/** One axis of the layout: window start and centre, in squares. */
function axis(mapLen: number, winLen: number, start: number | null): { start: number; center: number; pans: boolean } {
  if (mapLen <= winLen) {
    return { start: roundHalfAway((mapLen - winLen) / 2), center: mapLen / 2, pans: false };
  }
  const wanted = start ?? roundHalfAway((mapLen - winLen) / 2);
  const s = Math.min(Math.max(wanted, 0), mapLen - winLen);
  return { start: s, center: s + winLen / 2, pans: true };
}

/**
 * Whether the TV has anything to pan.
 *
 * @param layout - the layout
 * @returns true when the map exceeds the window on an axis
 */
export function layoutPans(layout: TableLayout): boolean {
  return layout.pansX || layout.pansY;
}

/**
 * The window in map squares (may reach past the map where it fits).
 *
 * @param layout - the layout
 * @returns the rectangle in squares
 */
export function windowSquares(layout: TableLayout): Rect {
  return {
    x: layout.centerX - layout.winCols / 2,
    y: layout.centerY - layout.winRows / 2,
    width: layout.winCols,
    height: layout.winRows,
  };
}

/**
 * The window start that centres the window on a point, in whole squares (clamping happens in
 * `tableLayout`).
 *
 * @param layout - the current layout (for the window size)
 * @param center - the wanted centre in squares
 * @returns first column and row
 */
export function startFor(layout: TableLayout, center: Point): { col: number; row: number } {
  return {
    col: roundHalfAway(center.x - layout.winCols / 2),
    row: roundHalfAway(center.y - layout.winRows / 2),
  };
}
