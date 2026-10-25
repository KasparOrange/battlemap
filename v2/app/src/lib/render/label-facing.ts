/**
 * Which way a token's label faces on the TV. The TV lies flat with players on every side, so a
 * label upright on screen is upside down for half the table. Each label turns toward the table
 * edge nearest to its token — the people sitting there are the ones closest to it. The DM's view
 * keeps every label upright.
 */
import type { Point } from '@battlemap/shared';
import type { Size } from './camera.ts';

/**
 * The turn (radians, clockwise on screen as Pixi counts it) that makes text upright for someone
 * sitting at the screen edge nearest to `p`: bottom 0, left +½π, top π, right −½π. Ties go to
 * the long sides (bottom, then top), where most players sit.
 *
 * @param p - the point on screen (CSS px)
 * @param size - the screen's size (CSS px)
 * @returns the label's turn in radians
 */
export function edgeFacing(p: Point, size: Size): number {
  const bottom = size.height - p.y;
  const top = p.y;
  const left = p.x;
  const right = size.width - p.x;
  const nearest = Math.min(bottom, top, left, right);
  if (bottom === nearest) return 0;
  if (top === nearest) return Math.PI;
  if (left === nearest) return Math.PI / 2;
  return -Math.PI / 2;
}
