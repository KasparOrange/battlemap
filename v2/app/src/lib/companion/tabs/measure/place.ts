/**
 * Where the ruler and the disc appear when the DM switches them on: in the middle of what the
 * TV shows (the players must see it at once), else the map's middle. Pure, tested.
 */
import {
  placeRuler, rotateRulerClockwise, snapDiscPoint, tvView, type MapPlay, type Point, type Ruler, type TableState,
  type TemplateDisc,
} from '@battlemap/shared';

/**
 * The middle of the TV's view of a map, in squares, clamped onto the map.
 *
 * @param table - the TV's state
 * @param map - the map on the table
 * @returns the point
 */
export function tvMiddle(table: TableState, map: MapPlay): Point {
  const { cols, rows } = map.info.grid;
  const v = tvView(table, map);
  const c = v ? { x: v.camera.centerX, y: v.camera.centerY } : { x: cols / 2, y: rows / 2 };
  return { x: Math.min(Math.max(c.x, 0), cols), y: Math.min(Math.max(c.y, 0), rows) };
}

/**
 * The ruler shown or hidden; shown = centred on the TV's middle, its turn kept.
 *
 * @param table - the TV's state
 * @param map - the map
 * @param visible - on or off
 * @returns the ruler to send
 */
export function rulerShown(table: TableState, map: MapPlay, visible: boolean): Ruler {
  if (!visible) return { ...map.ruler, visible: false };
  return { ...placeRuler(map.ruler, tvMiddle(table, map), map.ruler.rotation), visible: true };
}

/**
 * The ruler turned a quarter clockwise around its middle.
 *
 * @param r - the ruler
 * @returns the turned ruler
 */
export function rulerTurned(r: Ruler): Ruler {
  return rotateRulerClockwise(r);
}

/**
 * The disc moved to the TV's middle (snapped as the disc says).
 *
 * @param table - the TV's state
 * @param map - the map
 * @param disc - the disc (its look)
 * @returns the disc there, visible
 */
export function discToMiddle(table: TableState, map: MapPlay, disc: TemplateDisc): TemplateDisc {
  const p = snapDiscPoint(disc, tvMiddle(table, map));
  return { ...disc, x: p.x, y: p.y, visible: true };
}
