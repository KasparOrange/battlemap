/**
 * The L-ruler's geometry: its arms run `RULER_ARM_SQUARES` from the corner along +x and −y,
 * turned by its rotation; it turns around the middle of the L so it stays where the DM put it.
 */
import type { Point } from '../model/basics.ts';
import type { Ruler } from '../model/pieces.ts';

/** Length of each arm in squares. */
export const RULER_ARM_SQUARES = 10;

/** Rounds to 1e-9 so quarter turns land on exact grid values. */
function tidy(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

/**
 * Vector from the ruler's corner to the middle of its L (half an arm along +x and half along
 * −y), turned by `rotation` degrees.
 *
 * @param rotation - degrees (a multiple of 90)
 * @returns the vector in squares
 */
export function rulerCornerToCenter(rotation: number): Point {
  const a = (rotation * Math.PI) / 180;
  const h = RULER_ARM_SQUARES / 2;
  return { x: tidy(h * (Math.cos(a) + Math.sin(a))), y: tidy(h * (Math.sin(a) - Math.cos(a))) };
}

/**
 * The middle of the ruler's L, in squares.
 *
 * @param ruler - the ruler
 * @returns the point
 */
export function rulerCenter(ruler: Ruler): Point {
  const d = rulerCornerToCenter(ruler.rotation);
  return { x: ruler.x + d.x, y: ruler.y + d.y };
}

/**
 * The ruler with its L centred on a point at a rotation (normalised to 0–270) — showing it in
 * the middle of the TV's view, and turning it.
 *
 * @param ruler - the ruler (its visibility is kept)
 * @param center - where the middle of the L goes, in squares
 * @param rotation - degrees, any multiple of 90
 * @returns the placed ruler
 */
export function placeRuler(ruler: Ruler, center: Point, rotation: number): Ruler {
  const r = ((((Math.round(rotation / 90) * 90) % 360) + 360) % 360) as Ruler['rotation'];
  const d = rulerCornerToCenter(r);
  return { ...ruler, rotation: r, x: center.x - d.x, y: center.y - d.y };
}

/**
 * The ruler turned 90° clockwise around the middle of its L.
 *
 * @param ruler - the ruler
 * @returns the turned ruler
 */
export function rotateRulerClockwise(ruler: Ruler): Ruler {
  return placeRuler(ruler, rulerCenter(ruler), ruler.rotation + 90);
}
