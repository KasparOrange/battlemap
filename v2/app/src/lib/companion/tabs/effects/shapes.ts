/**
 * The D&D area shapes of the Effects tab, on the grid: feet → squares, where an aimed spell
 * sits (snapped like a DM would put a template), its polygon in squares (the state's `region`
 * anchor) and which squares it covers (a square counts when its centre is inside — the simple
 * table rule). Pure, no DOM; tested in `effects-logic.test.ts`.
 *
 * @see ../../../effects/anchors.ts — the runtime fits the art to these same polygons
 */
import { circleRegion, coneRegion, cubeRegion, lineRegion, type Pt } from '../../../effects/anchors.ts';

/** The area shapes a spell can take (a sphere / cylinder is a circle from above). */
export type AreaShape = 'circle' | 'cone' | 'line' | 'cube';

/** The shapes in the order the panel offers them. */
export const AREA_SHAPES: readonly AreaShape[] = ['circle', 'cone', 'line', 'cube'];

/** Feet per square (one square = 5 ft = one inch on the table). */
export const FEET_PER_SQUARE = 5;

/** An aimed area: where it sits, which way it points, how big it is. */
export interface Aim {
  /** The shape. */
  shape: AreaShape;
  /** Circle and cube: the centre. Cone: the apex. Line: the start. In squares. */
  origin: Pt;
  /** Cone and line: the direction in degrees (0 = right, 90 = down). */
  angle: number;
  /** Circle: radius. Cone and line: length. Cube: side. In feet. */
  feet: number;
  /** Line: its width in feet (default 5). */
  widthFeet: number;
}

/**
 * Feet to squares.
 *
 * @param feet - a length in feet
 * @returns squares (5 ft = 1)
 */
export function feetToSquares(feet: number): number {
  return feet / FEET_PER_SQUARE;
}

/**
 * How a shape names its size for the DM: "20 ft radius", "15 ft cone", "100 ft line", "10 ft cube".
 *
 * @param shape - the shape
 * @param feet - its size in feet
 * @returns the words
 */
export function shapeWords(shape: AreaShape, feet: number): string {
  switch (shape) {
    case 'circle': return `${feet} ft radius`;
    case 'cone': return `${feet} ft cone`;
    case 'line': return `${feet} ft line`;
    case 'cube': return `${feet} ft cube`;
  }
}

/**
 * Snaps a tap to where a template of this shape sits on the grid: a circle's centre on the
 * nearest grid corner; a cube's centre so its edges lie on grid lines (a corner for an even
 * side, a square's middle for an odd one); a cone's apex and a line's start on the nearest
 * half square (a corner, an edge's middle or a square's middle).
 *
 * @param shape - the shape
 * @param at - the tap, squares
 * @param feet - the size in feet (the cube needs it)
 * @returns the snapped origin
 */
export function snapOrigin(shape: AreaShape, at: Pt, feet: number): Pt {
  switch (shape) {
    case 'circle':
      return { x: Math.round(at.x), y: Math.round(at.y) };
    case 'cube': {
      const side = Math.max(1, Math.round(feetToSquares(feet)));
      if (side % 2 === 0) return { x: Math.round(at.x), y: Math.round(at.y) };
      return { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5 };
    }
    default:
      return { x: Math.round(at.x * 2) / 2, y: Math.round(at.y * 2) / 2 };
  }
}

/**
 * The direction from one point to another in degrees (0 = right, 90 = down), snapped to 15°
 * steps when within 4° of one (straight lines along the grid are easy to hit).
 *
 * @param from - the origin
 * @param to - where the finger is
 * @returns degrees in [0, 360)
 */
export function angleTo(from: Pt, to: Pt): number {
  let a = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  a = ((a % 360) + 360) % 360;
  const step = Math.round(a / 15) * 15;
  if (Math.abs(a - step) <= 4) a = step % 360;
  return a;
}

/**
 * The polygon of an aimed area in squares — what goes into the `region` anchor.
 *
 * @param aim - the area
 * @returns the polygon (cone: apex first; line: start edge first)
 */
export function aimRegion(aim: Aim): Pt[] {
  const size = feetToSquares(aim.feet);
  const { x, y } = aim.origin;
  switch (aim.shape) {
    case 'circle':
      return circleRegion(x, y, size, 32);
    case 'cone':
      return coneRegion(x, y, aim.angle, size, 8);
    case 'cube':
      return cubeRegion(x, y, size, 0);
    case 'line': {
      const r = (aim.angle * Math.PI) / 180;
      return lineRegion(x, y, x + Math.cos(r) * size, y + Math.sin(r) * size, feetToSquares(aim.widthFeet || FEET_PER_SQUARE));
    }
  }
}

/**
 * Whether a point lies inside a polygon (even–odd rule).
 *
 * @param p - the point
 * @param poly - the polygon
 * @returns true inside
 */
export function insidePolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Whether a point is inside an aimed area (a circle also counts its rim, so a tap on the
 * outline fires too).
 *
 * @param aim - the area
 * @param p - the point, squares
 * @returns true inside
 */
export function aimContains(aim: Aim, p: Pt): boolean {
  if (aim.shape === 'circle') return Math.hypot(p.x - aim.origin.x, p.y - aim.origin.y) <= feetToSquares(aim.feet) + 0.25;
  return insidePolygon(p, aimRegion(aim));
}

/**
 * The squares an area covers on a map: those whose centre lies inside it.
 *
 * @param aim - the area
 * @param cols - the map's columns
 * @param rows - the map's rows
 * @returns `[col, row]` pairs, row by row
 */
export function coveredSquares(aim: Aim, cols: number, rows: number): Array<[number, number]> {
  const poly = aimRegion(aim);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const out: Array<[number, number]> = [];
  const c0 = Math.max(0, Math.floor(minX));
  const c1 = Math.min(cols - 1, Math.ceil(maxX));
  const r0 = Math.max(0, Math.floor(minY));
  const r1 = Math.min(rows - 1, Math.ceil(maxY));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const centre = { x: c + 0.5, y: r + 0.5 };
      if (aim.shape === 'circle' ? Math.hypot(centre.x - aim.origin.x, centre.y - aim.origin.y) <= feetToSquares(aim.feet) : insidePolygon(centre, poly)) out.push([c, r]);
    }
  }
  return out;
}

/**
 * The shapes an effect may take: beams and lines stay lines, cones stay cones; round art can be
 * a circle or a cube.
 *
 * @param natural - the effect's own shape (the catalogue's `shape`)
 * @returns the choices, the natural one first
 */
export function shapesFor(natural: AreaShape | null): AreaShape[] {
  if (natural === 'cone') return ['cone'];
  if (natural === 'line') return ['line'];
  if (natural === 'cube') return ['cube', 'circle'];
  return ['circle', 'cube'];
}

/**
 * A new aim at a tap: snapped, pointing the way the last one did (or toward the map's middle).
 *
 * @param shape - the shape
 * @param feet - the size
 * @param widthFeet - a line's width
 * @param at - the tap, squares
 * @param lastAngle - the previous aim's direction, or null
 * @param mapMiddle - the map's centre (a first cone points at it)
 * @returns the aim
 */
export function aimAt(shape: AreaShape, feet: number, widthFeet: number, at: Pt, lastAngle: number | null, mapMiddle: Pt): Aim {
  const origin = snapOrigin(shape, at, feet);
  const angle = lastAngle ?? (Math.hypot(mapMiddle.x - origin.x, mapMiddle.y - origin.y) > 0.5 ? angleTo(origin, mapMiddle) : 0);
  return { shape, origin, angle, feet, widthFeet };
}
