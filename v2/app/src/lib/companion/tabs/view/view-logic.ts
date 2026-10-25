/**
 * The View tab's rules: what the TV shows of the map (the one-inch window or the screen's
 * outline in fit/free modes), which arrows can move it, where a tap on the overview puts the
 * window, and the sentence that explains it. Pure, tested (`view-logic.test.ts`).
 *
 * @see ../../../../../../docs/parity.md §13 (CA-01 … CA-06), §5 "TV frame and overview"
 */
import {
  startFor, tvView, windowSquares, type MapPlay, type Point, type TableState, type TvView,
} from '@battlemap/shared';

/** What the TV covers of the map, in map squares: four corners (a rotated screen in fit/free). */
export type Quad = [Point, Point, Point, Point];

/**
 * The part of the map the TV shows, as a quad in squares.
 *
 * @param view - the TV's view (`tvView`)
 * @returns the quad: the window in table mode, the visible screen otherwise
 */
export function tvQuad(view: TvView): Quad {
  if (view.layout) {
    const r = windowSquares(view.layout);
    return [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
  }
  const { camera, grid } = view;
  const hw = grid.visible.width / 2 / camera.zoom;
  const hh = grid.visible.height / 2 / camera.zoom;
  // The screen turned by quarter turns: screen x runs along the map's turned axis.
  const a = (-camera.quarterTurns * Math.PI) / 2;
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  const corner = (sx: number, sy: number): Point => ({
    x: camera.centerX + sx * cos - sy * sin,
    y: camera.centerY + sx * sin + sy * cos,
  });
  return [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
}

/** Which ways the window can move by one square. */
export interface PanReach {
  /** Left (col − 1). */
  left: boolean;
  /** Right. */
  right: boolean;
  /** Up (row − 1). */
  up: boolean;
  /** Down. */
  down: boolean;
}

/**
 * Which arrows do something (only axes that pan, dimmed at the map's edge — CA-03).
 *
 * @param view - the TV's view
 * @param map - the map on the table
 * @returns the four directions
 */
export function panReach(view: TvView | null, map: MapPlay): PanReach {
  const l = view?.layout;
  if (!l) return { left: false, right: false, up: false, down: false };
  const { cols, rows } = map.info.grid;
  return {
    left: l.pansX && l.col > 0,
    right: l.pansX && l.col < cols - l.winCols,
    up: l.pansY && l.row > 0,
    down: l.pansY && l.row < rows - l.winRows,
  };
}

/**
 * The window start that centres the window on a tapped point of the overview, clamped to the
 * map (CF-03).
 *
 * @param view - the TV's view (table mode)
 * @param map - the map
 * @param p - the tapped point in squares
 * @returns the start, or null outside table mode or when the map fits
 */
export function windowAt(view: TvView | null, map: MapPlay, p: Point): { col: number; row: number } | null {
  const l = view?.layout;
  if (!l || !(l.pansX || l.pansY)) return null;
  const s = startFor(l, p);
  const { cols, rows } = map.info.grid;
  return {
    col: l.pansX ? Math.min(Math.max(s.col, 0), cols - l.winCols) : l.col,
    row: l.pansY ? Math.min(Math.max(s.row, 0), rows - l.winRows) : l.row,
  };
}

/**
 * The sentence under "Players see" (CA-02).
 *
 * @param view - the TV's view, null before the TV reported its screen
 * @param map - the map
 * @returns the text
 */
export function viewSentence(view: TvView | null, map: MapPlay): string {
  const { cols, rows } = map.info.grid;
  if (!view) return 'The TV has not reported its screen yet.';
  const l = view.layout;
  if (l) {
    if (!l.pansX && !l.pansY) {
      return `The whole map (${cols} × ${rows} squares) fits the table (${view.grid.cols} × ${view.grid.rows}), one inch per square.`;
    }
    return `The TV shows ${Math.min(l.winCols, cols)} × ${Math.min(l.winRows, rows)} of the map's ${cols} × ${rows} squares. Drag the box or use the arrows to move it.`;
  }
  if (map.view.mode === 'fit') return 'The whole map is on the TV — squares are not one inch. Pick 1-inch table to play on it.';
  return 'The TV is zoomed freely — squares are not one inch. Pick 1-inch table to go back.';
}

/**
 * The TV's view of the map on the table.
 *
 * @param table - the TV's state
 * @param map - the map
 * @returns the view or null
 */
export function viewOf(table: TableState, map: MapPlay | null): TvView | null {
  return map ? tvView(table, map) : null;
}

/** The rotation readout: "0°", "90°", … */
export function rotationLabel(quarterTurns: number): string {
  return `${(((quarterTurns % 4) + 4) % 4) * 90}°`;
}
