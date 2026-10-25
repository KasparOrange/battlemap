/**
 * The TV's camera as a pure function of the state. The TV renders with it; the companion
 * draws the players' frame from the same numbers, so no camera has to be broadcast.
 */
import type { MapPlay } from '../model/game.ts';
import type { TableState } from '../model/table.ts';
import { clamp } from './rect.ts';
import { tableGrid, tableLayout, type TableGrid, type TableLayout } from './table.ts';

/** Where the TV looks. */
export interface Camera {
  /** Centre, x in squares. */
  readonly centerX: number;
  /** Centre, y in squares. */
  readonly centerY: number;
  /** Screen px per square. */
  readonly zoom: number;
  /** Quarter turns clockwise (0–3). */
  readonly quarterTurns: number;
}

/** The TV's camera and, in table mode, the window it shows. */
export interface TvView {
  /** The camera. */
  readonly camera: Camera;
  /** The table (squares on the screen). */
  readonly grid: TableGrid;
  /** The one-inch window, in `table` mode only. */
  readonly layout: TableLayout | null;
}

/** How far a free camera may zoom in, as a multiple of the table's one inch per square. */
export const MAX_FREE_ZOOM_INCHES = 4;

/**
 * The zoom (px per square) that shows the whole map, turned, inside what the TV shows.
 *
 * @param grid - the table (for the visible area)
 * @param mapCols - squares across
 * @param mapRows - squares down
 * @param quarterTurns - camera turn
 * @returns px per square
 */
export function fitZoom(grid: TableGrid, mapCols: number, mapRows: number, quarterTurns: number): number {
  const sideways = quarterTurns % 2 !== 0;
  const w = sideways ? mapRows : mapCols;
  const h = sideways ? mapCols : mapRows;
  return Math.min(grid.visible.width / w, grid.visible.height / h);
}

/**
 * The TV's view of a map.
 *
 * @param table - the TV's calibration and viewport
 * @param map - the map on the table
 * @returns the view, or null while the TV has not reported a viewport
 */
export function tvView(table: TableState, map: MapPlay): TvView | null {
  if (!table.viewport) return null;
  const grid = tableGrid(table.viewport, table.widthInches, table.overscanPercent);
  if (!grid) return null;
  const { cols, rows } = map.info.grid;
  const turns = map.view.quarterTurns;
  const fit = fitZoom(grid, cols, rows, turns);
  switch (map.view.mode) {
    case 'table': {
      const layout = tableLayout({ grid, mapCols: cols, mapRows: rows, quarterTurns: turns, col: map.view.col, row: map.view.row });
      return { grid, layout, camera: { centerX: layout.centerX, centerY: layout.centerY, zoom: layout.zoom, quarterTurns: turns } };
    }
    case 'fit':
      return { grid, layout: null, camera: { centerX: cols / 2, centerY: rows / 2, zoom: fit, quarterTurns: turns } };
    case 'free': {
      const free = map.view.free;
      const zoom = free ? clamp(free.zoom, fit * 0.5, grid.ppi * MAX_FREE_ZOOM_INCHES) : fit;
      return {
        grid,
        layout: null,
        camera: { centerX: free ? free.x : cols / 2, centerY: free ? free.y : rows / 2, zoom, quarterTurns: turns },
      };
    }
  }
}
