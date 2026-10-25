/**
 * What a finger touches on the map, in the companion's hit priority (architecture.md "input"):
 * template disc knob, disc or ruler (draggable in every tab), a token (Tokens behaviour), a
 * door (tap), then the tab's tool. Pure, in squares, tested under `bun test`.
 */
import { knobLocal, discToMap, rimRadius, RULER_ARM_SQUARES, type MapGeometry, type MapPlay, type Point, type Ruler, type TemplateDisc, type Token } from '@battlemap/shared';

/** How far from a thing a touch still counts, in CSS px (a fingertip). */
export const TOUCH_SLOP_PX = 22;

/** What a press landed on. */
export type MapHit =
  | { kind: 'discKnob' }
  | { kind: 'disc' }
  | { kind: 'ruler' }
  | { kind: 'token'; token: Token }
  | { kind: 'door'; index: number }
  | null;

/**
 * The placed token standing on the square under a point (the newest on top wins).
 *
 * @param tokens - the map's tokens
 * @param at - a point in squares
 * @returns the token or null
 */
export function tokenAt(tokens: readonly Token[], at: Point): Token | null {
  const col = Math.floor(at.x);
  const row = Math.floor(at.y);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.placed && t.col === col && t.row === row) return t;
  }
  return null;
}

/** Distance from a point to a segment. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The door nearest a point, if one is within reach.
 *
 * @param geometry - the map's walls and doors (null: no doors)
 * @param at - a point in squares
 * @param reach - how far in squares still counts
 * @returns the door's index or null
 */
export function doorAt(geometry: MapGeometry | null, at: Point, reach: number): number | null {
  if (!geometry) return null;
  let best: number | null = null;
  let bestD = reach;
  geometry.doors.forEach((door, index) => {
    const d = segmentDistance(at, door.a, door.b);
    if (d <= bestD) {
      bestD = d;
      best = index;
    }
  });
  return best;
}

/**
 * Whether a point is on the template disc, and where.
 *
 * @param disc - the disc
 * @param at - a point in squares
 * @param reach - touch slop in squares
 * @returns `knob` (turns it), `body` (moves it) or null
 */
export function discHit(disc: TemplateDisc, at: Point, reach: number): 'knob' | 'body' | null {
  if (!disc.visible) return null;
  const knob = discToMap(disc, knobLocal(disc));
  if (Math.hypot(at.x - knob.x, at.y - knob.y) <= Math.max(reach, 0.5)) return 'knob';
  if (Math.hypot(at.x - disc.x, at.y - disc.y) <= rimRadius(disc)) return 'body';
  return null;
}

/**
 * Whether a point is on the L-ruler (either arm, one square wide, plus slop).
 *
 * @param ruler - the ruler
 * @param at - a point in squares
 * @param reach - touch slop in squares
 * @returns true when on it
 */
export function rulerHit(ruler: Ruler, at: Point, reach: number): boolean {
  if (!ruler.visible) return false;
  const a = (ruler.rotation * Math.PI) / 180;
  const corner = { x: ruler.x, y: ruler.y };
  const arm1 = { x: ruler.x + RULER_ARM_SQUARES * Math.cos(a), y: ruler.y + RULER_ARM_SQUARES * Math.sin(a) };
  const arm2 = { x: ruler.x + RULER_ARM_SQUARES * Math.sin(a), y: ruler.y - RULER_ARM_SQUARES * Math.cos(a) };
  const width = 0.5 + reach;
  return segmentDistance(at, corner, arm1) <= width || segmentDistance(at, corner, arm2) <= width;
}

/** Which things a tab lets a press hit. */
export interface HitOptions {
  /** Tokens are grabbed (Tokens behaviour). */
  tokens: boolean;
  /** Doors toggle on a tap. */
  doors: boolean;
}

/**
 * The hit for a press, in priority order: disc knob, disc, ruler, token, door.
 *
 * @param map - the map on the table
 * @param geometry - its walls and doors (null: none)
 * @param at - the press in squares
 * @param reach - touch slop in squares (TOUCH_SLOP_PX / zoom)
 * @param options - what this tab lets a press hit
 * @returns the hit or null
 */
export function hitAt(map: MapPlay, geometry: MapGeometry | null, at: Point, reach: number, options: HitOptions): MapHit {
  const disc = discHit(map.disc, at, reach);
  if (disc === 'knob') return { kind: 'discKnob' };
  if (disc === 'body') return { kind: 'disc' };
  if (rulerHit(map.ruler, at, reach)) return { kind: 'ruler' };
  if (options.tokens) {
    const token = tokenAt(map.tokens, at);
    if (token) return { kind: 'token', token };
  }
  if (options.doors) {
    const door = doorAt(geometry, at, Math.max(reach, 0.35));
    if (door !== null) return { kind: 'door', index: door };
  }
  return null;
}
