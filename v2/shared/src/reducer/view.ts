/**
 * The TV's view of the map on the table (mode, table window, turn, free camera, grid lines)
 * and the table's own commands (calibration, overscan, pattern, viewport).
 */
import type { MapPlay } from '../model/game.ts';
import type { RootState } from '../model/root.ts';
import { DEFAULT_WIDTH_INCHES, MAX_OVERSCAN_PERCENT, MAX_WIDTH_INCHES, MIN_WIDTH_INCHES } from '../model/table.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { clamp } from '../geometry/rect.ts';
import { startFor, tableGrid, tableLayout, type TableGrid } from '../geometry/table.ts';
import { ok, onActiveMap, type ApplyResult } from './result.ts';

/** The table grid if the TV has reported a viewport, else null. */
function gridOf(root: RootState): TableGrid | null {
  const { viewport, widthInches, overscanPercent } = root.table;
  return viewport ? tableGrid(viewport, widthInches, overscanPercent) : null;
}

/**
 * The map with its window start set the way the layout will use it: clamped, and null on an
 * axis that fits (the window is centred there). Without a table grid the values are stored as
 * asked and clamped later by the layout.
 */
function withWindow(map: MapPlay, grid: TableGrid | null, col: number | null, row: number | null, quarterTurns = map.view.quarterTurns): MapPlay {
  if (!grid) return { ...map, view: { ...map.view, col, row, quarterTurns } };
  const layout = tableLayout({ grid, mapCols: map.info.grid.cols, mapRows: map.info.grid.rows, quarterTurns, col, row });
  return {
    ...map,
    view: { ...map.view, quarterTurns, col: layout.pansX ? layout.col : null, row: layout.pansY ? layout.row : null },
  };
}

/**
 * `view.mode`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewMode(root: RootState, cmd: CommandOf<'view.mode'>): ApplyResult {
  return onActiveMap(root, (map) => (map.view.mode === cmd.mode ? { map } : { map: { ...map, view: { ...map.view, mode: cmd.mode } } }));
}

/**
 * `view.window`: the table window's first square.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewWindow(root: RootState, cmd: CommandOf<'view.window'>): ApplyResult {
  const grid = gridOf(root);
  return onActiveMap(root, (map) => ({ map: withWindow(map, grid, cmd.col, cmd.row) }));
}

/**
 * `view.pan`: the window moves by whole squares.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewPan(root: RootState, cmd: CommandOf<'view.pan'>): ApplyResult {
  const grid = gridOf(root);
  if (!grid) return { ok: false, reason: 'The TV has not reported its screen yet.' };
  return onActiveMap(root, (map) => {
    const layout = tableLayout({ grid, mapCols: map.info.grid.cols, mapRows: map.info.grid.rows, quarterTurns: map.view.quarterTurns, col: map.view.col, row: map.view.row });
    return { map: withWindow(map, grid, layout.col + cmd.dx, layout.row + cmd.dy) };
  });
}

/**
 * `view.rotate`: the TV's view turns; in the table view the window keeps its centre.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewRotate(root: RootState, cmd: CommandOf<'view.rotate'>): ApplyResult {
  const grid = gridOf(root);
  return onActiveMap(root, (map) => {
    if (map.view.quarterTurns === cmd.quarterTurns) return { map };
    if (!grid) return { map: { ...map, view: { ...map.view, quarterTurns: cmd.quarterTurns } } };
    const { cols, rows } = map.info.grid;
    const before = tableLayout({ grid, mapCols: cols, mapRows: rows, quarterTurns: map.view.quarterTurns, col: map.view.col, row: map.view.row });
    const after = tableLayout({ grid, mapCols: cols, mapRows: rows, quarterTurns: cmd.quarterTurns });
    const start = startFor(after, { x: before.centerX, y: before.centerY });
    return { map: withWindow(map, grid, start.col, start.row, cmd.quarterTurns) };
  });
}

/**
 * `view.free`: a camera of its own (leaves the table view).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewFree(root: RootState, cmd: CommandOf<'view.free'>): ApplyResult {
  return onActiveMap(root, (map) => ({ map: { ...map, view: { ...map.view, mode: 'free', free: { x: cmd.x, y: cmd.y, zoom: cmd.zoom } } } }));
}

/**
 * `view.grid`: battlemap's grid lines on or off.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function viewGrid(root: RootState, cmd: CommandOf<'view.grid'>): ApplyResult {
  return onActiveMap(root, (map) => (map.showGrid === cmd.on ? { map } : { map: { ...map, showGrid: cmd.on } }));
}

/**
 * `table.calibrate`: the picture's width (clamped to the plausible range).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tableCalibrate(root: RootState, cmd: CommandOf<'table.calibrate'>): ApplyResult {
  const widthInches = clamp(cmd.widthInches, MIN_WIDTH_INCHES, MAX_WIDTH_INCHES);
  return ok({ ...root, table: { ...root.table, widthInches } });
}

/**
 * `table.overscan`: the edges the TV set cuts off (clamped to 0–12 %).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tableOverscan(root: RootState, cmd: CommandOf<'table.overscan'>): ApplyResult {
  return ok({ ...root, table: { ...root.table, overscanPercent: clamp(cmd.percent, 0, MAX_OVERSCAN_PERCENT) } });
}

/**
 * `table.reset`: back to auto (34.5 in, no overscan).
 *
 * @param root - the state
 * @returns the result
 */
export function tableReset(root: RootState): ApplyResult {
  return ok({ ...root, table: { ...root.table, widthInches: DEFAULT_WIDTH_INCHES, overscanPercent: 0 } });
}

/**
 * `table.pattern`: the calibration pattern on or off, and its pivot.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tablePattern(root: RootState, cmd: CommandOf<'table.pattern'>): ApplyResult {
  return ok({ ...root, table: { ...root.table, pattern: { on: cmd.on, pivot: cmd.pivot ?? root.table.pattern.pivot } } });
}

/**
 * `table.viewport`: the TV's screen size.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tableViewport(root: RootState, cmd: CommandOf<'table.viewport'>): ApplyResult {
  const v = root.table.viewport;
  if (v && v.width === cmd.width && v.height === cmd.height) return ok(root);
  return ok({ ...root, table: { ...root.table, viewport: { width: cmd.width, height: cmd.height } } });
}
