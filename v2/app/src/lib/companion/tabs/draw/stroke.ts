/**
 * Stroke building and erasing for the Draw tab: points thinned to a minimum step, a length cap
 * (the protocol's 20 000 numbers), and which strokes an eraser touch hits. Pure, tested under
 * `bun test`.
 */
import type { Point, Stroke } from '@battlemap/shared';

/** Smallest step between two stored points, in squares. */
export const MIN_STEP = 0.06;
/** Most numbers in a stroke's `points` (x, y pairs). */
export const MAX_NUMBERS = 20_000;

/** Collects the points of one stroke. */
export class StrokeBuilder {
  /** Flat x, y pairs in squares. */
  readonly points: number[] = [];

  /** @param start - the first point */
  constructor(start: Point) {
    this.points.push(round(start.x), round(start.y));
  }

  /**
   * Adds a point when it is far enough from the last one.
   *
   * @param p - the finger in squares
   * @returns true when the stroke grew
   */
  add(p: Point): boolean {
    const n = this.points.length;
    if (n + 2 > MAX_NUMBERS) return false;
    const dx = p.x - this.points[n - 2]!;
    const dy = p.y - this.points[n - 1]!;
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return false;
    this.points.push(round(p.x), round(p.y));
    return true;
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Distance from a point to a segment. */
function segmentDistance(p: Point, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

/**
 * The strokes an eraser at a point touches.
 *
 * @param strokes - the map's strokes
 * @param at - the eraser in squares
 * @param reach - its radius in squares
 * @returns ids of the strokes hit
 */
export function strokesHit(strokes: readonly Stroke[], at: Point, reach: number): string[] {
  const out: string[] = [];
  for (const s of strokes) {
    const p = s.points;
    const r = reach + s.width / 2;
    let hit = p.length === 2 && Math.hypot(at.x - p[0]!, at.y - p[1]!) <= r;
    for (let i = 0; !hit && i + 3 < p.length; i += 2) hit = segmentDistance(at, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!) <= r;
    if (hit) out.push(s.id);
  }
  return out;
}
