/**
 * The template disc's geometry (port of `lib/model/template_disc.dart`, same tests). Shapes are
 * in the disc's own frame, in squares: origin on the middle, x east, y south, before rotation.
 * Unrotated it looks like the photo: ring labels on top, cones opening west.
 */
import type { Point } from '../model/basics.ts';
import { FEET_PER_SQUARE, type DiscShapeSet, type TemplateDisc } from '../model/disc.ts';

/** Gap between the farthest outline and the disc's edge, in squares. */
export const RIM_MARGIN = 0.06;

/**
 * Feet → squares.
 *
 * @param feet - a length in feet
 * @returns squares
 */
export function feetToSquares(feet: number): number {
  return feet / FEET_PER_SQUARE;
}

/**
 * The largest size of a family in feet, 0 when it has none.
 *
 * @param set - the family
 * @returns feet
 */
export function largestSize(set: DiscShapeSet): number {
  return set.sizes.length ? set.sizes[set.sizes.length - 1]! : 0;
}

/**
 * Whether anything of a family is drawn.
 *
 * @param set - the family
 * @returns true when visible with sizes
 */
export function shows(set: DiscShapeSet): boolean {
  return set.visible && set.sizes.length > 0;
}

/**
 * A family with its sizes made canonical: positive, unique, ascending.
 *
 * @param set - the family
 * @returns the cleaned family
 */
export function normalizeShapeSet(set: DiscShapeSet): DiscShapeSet {
  const sizes = [...new Set(set.sizes.filter((s) => s > 0))].sort((a, b) => a - b);
  return { ...set, sizes };
}

/**
 * A disc made canonical: rotation in [0, 360), family sizes sorted and unique.
 *
 * @param disc - the disc
 * @returns the cleaned disc
 */
export function normalizeDisc(disc: TemplateDisc): TemplateDisc {
  return {
    ...disc,
    rotation: ((disc.rotation % 360) + 360) % 360,
    rings: normalizeShapeSet(disc.rings),
    cubes: normalizeShapeSet(disc.cubes),
    cones: normalizeShapeSet(disc.cones),
  };
}

/**
 * Distance in squares from the middle to the tip of a cone `lengthFeet` long, along x.
 *
 * @param disc - the disc
 * @param lengthFeet - the cone's length
 * @returns squares (cones open toward −x)
 */
export function coneTipX(disc: TemplateDisc, lengthFeet: number): number {
  if (disc.coneAnchor === 'center') return 0;
  const largest = largestSize(disc.cones);
  return feetToSquares(largest / 2 - largest + lengthFeet);
}

/**
 * A cone as a triangle in the disc frame: tip, base end north, base end south.
 *
 * @param disc - the disc
 * @param lengthFeet - the cone's length
 * @returns three points in squares
 */
export function coneTriangle(disc: TemplateDisc, lengthFeet: number): [Point, Point, Point] {
  const tip = coneTipX(disc, lengthFeet);
  const len = feetToSquares(lengthFeet);
  const half = len * Math.tan((disc.coneDegrees * Math.PI) / 360);
  const baseX = tip - len;
  return [{ x: tip, y: 0 }, { x: baseX, y: -half }, { x: baseX, y: half }];
}

/**
 * Radius in squares of the farthest point any drawn outline reaches.
 *
 * @param disc - the disc
 * @returns squares
 */
export function discReach(disc: TemplateDisc): number {
  let r = 0;
  if (shows(disc.rings)) r = Math.max(r, feetToSquares(largestSize(disc.rings)));
  if (shows(disc.cubes)) r = Math.max(r, (feetToSquares(largestSize(disc.cubes)) / 2) * Math.SQRT2);
  if (shows(disc.cones)) {
    for (const size of disc.cones.sizes) {
      for (const p of coneTriangle(disc, size)) r = Math.max(r, Math.hypot(p.x, p.y));
    }
  }
  if (disc.centerMark) r = Math.max(r, 0.5);
  return r;
}

/**
 * Radius in squares of the disc's edge: the reach plus `RIM_MARGIN`, at least one square.
 *
 * @param disc - the disc
 * @returns squares
 */
export function rimRadius(disc: TemplateDisc): number {
  return Math.max(1, discReach(disc) + RIM_MARGIN);
}

/**
 * Radius the compass marks sit on: midway between the two largest rings, else just inside the
 * edge.
 *
 * @param disc - the disc
 * @returns squares
 */
export function markerRadius(disc: TemplateDisc): number {
  const s = shows(disc.rings) ? disc.rings.sizes : [];
  if (s.length >= 2) return feetToSquares((s[s.length - 1]! + s[s.length - 2]!) / 2);
  return rimRadius(disc) * 0.88;
}

/**
 * Angles of the compass marks (radians, 0 = east, clockwise on screen): evenly spaced from
 * east, leaving out any within 14° of the top while the ring labels sit there.
 *
 * @param disc - the disc
 * @returns radians
 */
export function markerAngles(disc: TemplateDisc): number[] {
  if (disc.markers <= 0) return [];
  const labelsOnTop = shows(disc.rings) && disc.rings.labels;
  const out: number[] = [];
  for (let i = 0; i < disc.markers; i++) {
    const a = (2 * Math.PI * i) / disc.markers;
    const fromTop = (((a + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (labelsOnTop && Math.min(fromTop, 2 * Math.PI - fromTop) < (14 * Math.PI) / 180) continue;
    out.push(a);
  }
  return out;
}

/**
 * A point moved to what the disc's snap asks for.
 *
 * @param disc - the disc
 * @param p - a point in squares
 * @returns the snapped point
 */
export function snapDiscPoint(disc: TemplateDisc, p: Point): Point {
  switch (disc.snap) {
    case 'none': return p;
    case 'squareCenters': return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
    case 'squareCorners': return { x: Math.round(p.x), y: Math.round(p.y) };
  }
}

/**
 * Turns a point of the disc frame into map squares.
 *
 * @param disc - the disc
 * @param local - a point in the disc frame
 * @returns the point on the map
 */
export function discToMap(disc: TemplateDisc, local: Point): Point {
  const a = (disc.rotation * Math.PI) / 180;
  return {
    x: disc.x + local.x * Math.cos(a) - local.y * Math.sin(a),
    y: disc.y + local.x * Math.sin(a) + local.y * Math.cos(a),
  };
}

/**
 * Where the turning knob sits in the disc frame: on the edge, on the side the cones open to.
 *
 * @param disc - the disc
 * @returns the point in the disc frame
 */
export function knobLocal(disc: TemplateDisc): Point {
  return { x: -rimRadius(disc), y: 0 };
}
