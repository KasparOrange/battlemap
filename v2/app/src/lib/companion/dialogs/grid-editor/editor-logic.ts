/**
 * The grid editor's plain parts: its undo history, the view (picture ↔ screen, zoom about a
 * point, jumps to the picture's corners), the tools' results and the readout texts. The
 * geometry itself is `@battlemap/shared` `geometry/raster-grid.ts`. Pure, tested
 * (`editor-logic.test.ts`).
 *
 * @see ../../../../../../docs/parity.md §18 (GE-01 … GE-14)
 */
import {
  cornerCounts, cornersAgree, FEET_PER_SQUARE, gridFromCorners, gridFromLength, gridsClose, isSquareGrid,
  type Point, type RasterGrid,
} from '@battlemap/shared';

/** The editor's tools. `look` only moves the view. */
export type EditorTool = 'look' | 'move' | 'stretch' | 'corners' | 'length';

/** Most undo steps kept (GE-01). */
export const MAX_STEPS = 200;

/** An undo history of grids: one step per gesture. */
export class GridHistory {
  private past: RasterGrid[] = [];
  private future: RasterGrid[] = [];

  /** @param current - the grid the editor starts with */
  constructor(public current: RasterGrid) {}

  /**
   * Makes `next` the current grid as one step (ignored when it equals the current one).
   *
   * @param next - the new grid
   * @returns true when a step was made
   */
  push(next: RasterGrid): boolean {
    if (gridsClose(next, this.current, 1e-6)) return false;
    this.past.push(this.current);
    if (this.past.length > MAX_STEPS) this.past.shift();
    this.future = [];
    this.current = next;
    return true;
  }

  /** Whether there is a step to undo. */
  get canUndo(): boolean {
    return this.past.length > 0;
  }

  /** Whether there is a step to redo. */
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Goes one step back; returns the current grid. */
  undo(): RasterGrid {
    const g = this.past.pop();
    if (g) {
      this.future.push(this.current);
      this.current = g;
    }
    return this.current;
  }

  /** Goes one step forward; returns the current grid. */
  redo(): RasterGrid {
    const g = this.future.pop();
    if (g) {
      this.past.push(this.current);
      this.current = g;
    }
    return this.current;
  }
}

/** How the picture lies on the editor's canvas: screen = picture × scale + offset. */
export interface EditorView {
  /** Screen px per picture px. */
  scale: number;
  /** Screen x of picture x 0. */
  ox: number;
  /** Screen y of picture y 0. */
  oy: number;
}

/** Zoom limits (GE-04). */
export const MIN_SCALE = 0.02;
/** Largest zoom. */
export const MAX_SCALE = 60;

/**
 * The view that shows the whole picture at 94 % of the canvas, centred (GE-02).
 *
 * @param pw - picture width
 * @param ph - picture height
 * @param cw - canvas width
 * @param ch - canvas height
 * @returns the view
 */
export function fitView(pw: number, ph: number, cw: number, ch: number): EditorView {
  const scale = Math.min((cw * 0.94) / pw, (ch * 0.94) / ph);
  return { scale, ox: (cw - pw * scale) / 2, oy: (ch - ph * scale) / 2 };
}

/**
 * A screen point in picture px.
 *
 * @param v - the view
 * @param p - screen point (canvas px)
 * @returns picture point
 */
export function toPicture(v: EditorView, p: Point): Point {
  return { x: (p.x - v.ox) / v.scale, y: (p.y - v.oy) / v.scale };
}

/**
 * A picture point on the screen.
 *
 * @param v - the view
 * @param p - picture point
 * @returns screen point
 */
export function toScreen(v: EditorView, p: Point): Point {
  return { x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy };
}

/**
 * Zooms by `factor` keeping the picture point under `at` in place.
 *
 * @param v - the view
 * @param factor - multiplier
 * @param at - screen point that stays put
 * @returns the new view
 */
export function zoomAt(v: EditorView, factor: number, at: Point): EditorView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const k = scale / v.scale;
  return { scale, ox: at.x - (at.x - v.ox) * k, oy: at.y - (at.y - v.oy) * k };
}

/** Where "Check the fit" jumps (GE-11). */
export type Jump = 'topLeft' | 'topRight' | 'center' | 'bottomLeft' | 'bottomRight' | 'whole';

/**
 * The view that shows about six squares on the canvas's short side around a corner of the
 * grid (the corner square's outer lines), or the whole picture.
 *
 * @param g - the grid
 * @param jump - where to look
 * @param cw - canvas width
 * @param ch - canvas height
 * @returns the view
 */
export function jumpView(g: RasterGrid, jump: Jump, cw: number, ch: number): EditorView {
  if (jump === 'whole') return fitView(g.pictureW, g.pictureH, cw, ch);
  const scale = Math.min(MAX_SCALE, Math.min(cw, ch) / (6 * Math.max(g.cellW, g.cellH)));
  const right = g.x + g.cols * g.cellW;
  const bottom = g.y + g.rows * g.cellH;
  const at: Record<Exclude<Jump, 'whole'>, Point> = {
    topLeft: { x: g.x + 2 * g.cellW, y: g.y + 2 * g.cellH },
    topRight: { x: right - 2 * g.cellW, y: g.y + 2 * g.cellH },
    center: { x: (g.x + right) / 2, y: (g.y + bottom) / 2 },
    bottomLeft: { x: g.x + 2 * g.cellW, y: bottom - 2 * g.cellH },
    bottomRight: { x: right - 2 * g.cellW, y: bottom - 2 * g.cellH },
  };
  const p = at[jump];
  return { scale, ox: cw / 2 - p.x * scale, oy: ch / 2 - p.y * scale };
}

/**
 * The grid slid by a drag (Move).
 *
 * @param g - the grid at the drag's start
 * @param dx - picture px
 * @param dy - picture px
 * @returns the moved grid
 */
export function moved(g: RasterGrid, dx: number, dy: number): RasterGrid {
  return { ...g, x: g.x + dx, y: g.y + dy };
}

/** Rounds to 2 places for display. */
const n2 = (v: number) => Number(v.toFixed(2));

/** The two-corner tool's result and its sentence (GE-07). */
export interface CornersResult {
  /** The grid through both marks, or null. */
  grid: RasterGrid | null;
  /** Squares across between the marks. */
  across: number;
  /** Squares down. */
  down: number;
  /** What to say. */
  text: string;
  /** Whether the text is a warning. */
  warn: boolean;
}

/**
 * The grid through two marked corners, counts guessed from the current size.
 *
 * @param g - the current grid
 * @param a - first mark
 * @param b - second mark
 * @param square - square squares
 * @param partialEdges - the edge rule
 * @returns grid, counts, text
 */
export function fromCorners(g: RasterGrid, a: Point, b: Point, square: boolean, partialEdges: boolean): CornersResult {
  const [nx, ny] = cornerCounts(g, a, b, square);
  if (Math.abs(nx) < 1 && Math.abs(ny) < 1) {
    return { grid: null, across: 0, down: 0, text: 'Put the two corners at least one square apart.', warn: true };
  }
  const grid = gridFromCorners({ a, b, nx, ny, square, fallback: g, partialEdges });
  const agree = cornersAgree(a, b, nx, ny);
  let text: string;
  let warn = false;
  if (!grid) {
    text = 'Those squares would be too small — put the corners farther apart.';
    warn = true;
  } else if (square || agree.agree) {
    text = `${Math.abs(nx)} × ${Math.abs(ny)} squares between the marks. Gives squares of ${n2(grid.cellW)} px.`;
  } else {
    text = `Across gives ${n2(agree.across ?? 0)} px, down gives ${n2(agree.down ?? 0)} px — more than 1 % apart.`;
    warn = true;
  }
  return { grid, across: Math.abs(nx), down: Math.abs(ny), text, warn };
}

/** Squares or feet for the Known length tool. */
export type LengthUnitKind = 'squares' | 'feet';

/**
 * The Known length tool's grid and sentence (GE-08).
 *
 * @param a - start of the line, picture px
 * @param b - end
 * @param amount - how long it is, in `unit`
 * @param unit - squares or feet (5 per square)
 * @param pictureW - picture width
 * @param pictureH - picture height
 * @param table - squares the table holds (for "fits the TV"), or null
 * @param partialEdges - the edge rule
 * @returns the grid (null when unusable) and the text
 */
export function fromLength(
  a: Point, b: Point, amount: number, unit: LengthUnitKind, pictureW: number, pictureH: number,
  table: { cols: number; rows: number } | null, partialEdges: boolean,
): { grid: RasterGrid | null; text: string; warn: boolean } {
  const squares = unit === 'feet' ? amount / FEET_PER_SQUARE : amount;
  const grid = gridFromLength({ a, b, squares, pictureW, pictureH, partialEdges });
  if (!grid || grid.cols > 1000 || grid.rows > 1000) {
    return { grid: null, text: 'Squares that small make no map — draw the line over something bigger.', warn: true };
  }
  return { grid, text: `Gives squares of ${n2(grid.cellW)} px: the map is ${grid.cols} × ${grid.rows} squares, ${fitText(grid, table)}.`, warn: false };
}

/**
 * How a map of this grid sits on the table.
 *
 * @param g - the grid
 * @param table - the table's squares, or null when unknown
 * @returns "fits the TV", "fits turned 90°", "bigger than the TV (it pans)"
 */
export function fitText(g: { cols: number; rows: number }, table: { cols: number; rows: number } | null): string {
  if (!table) return 'one inch per square';
  if (g.cols <= table.cols && g.rows <= table.rows) return `fits the TV (${table.cols} × ${table.rows})`;
  if (g.rows <= table.cols && g.cols <= table.rows) return 'fits the TV turned 90°';
  return 'bigger than the TV — it pans';
}

/**
 * The readout lines (GE-14).
 *
 * @param g - the grid
 * @param table - the table's squares or null
 * @returns lines and an optional skew warning
 */
export function readout(g: RasterGrid, table: { cols: number; rows: number } | null): { squares: string; size: string; table: string; skew: string | null } {
  const square = isSquareGrid(g);
  const skew = Math.abs(g.cellW - g.cellH) / Math.max(g.cellW, g.cellH);
  return {
    squares: `${g.cols} × ${g.rows} squares`,
    size: square ? `Square ${n2(g.cellW)} px` : `Square ${n2(g.cellW)} × ${n2(g.cellH)} px`,
    table: `On the table: ${g.cols} × ${g.rows} in, ${fitText(g, table)}`,
    skew: skew > 0.005 ? `Squares are ${(skew * 100).toFixed(1)} % off square — the table shows them square.` : null,
  };
}

/**
 * The text a nudge readout shows: "x 12.25 · y −3.5".
 *
 * @param g - the grid
 * @returns the text
 */
export function positionText(g: RasterGrid): string {
  return `x ${n2(g.x)} · y ${n2(g.y)}`;
}

/** One sentence per tool, under the tool tiles and in the canvas's label. */
export const TOOL_HINTS: Record<EditorTool, string> = {
  look: 'Drag to move the view, pinch or scroll to zoom. Nothing changes.',
  move: 'Drag anywhere to slide the grid over the picture.',
  stretch: 'The top-left corner stays. Grab a line far from it and drag it onto the picture’s line.',
  corners: 'Tap a grid corner, then one far away. The counts between them are guessed — check them.',
  length: 'Drag a line over something of known size: a door is one square, or a scale bar.',
};
