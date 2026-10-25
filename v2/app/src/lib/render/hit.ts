/**
 * Hit testing — pure, no Pixi. What lies under a point of the map, in the order the companion's
 * input gives it priority (`docs/architecture.md` "input"): the template disc's knob, the disc
 * (its middle or the band along its edge), the ruler, a token, a door, the players' frame.
 * Grab room never drops below about 22 screen px, however far out the zoom.
 */
import { knobLocal, discToMap, rimRadius, RULER_ARM_SQUARES, type Door, type MapPlay, type Point, type Rect, type Token } from '@battlemap/shared';

/** Something under a point. */
export type Hit =
  | { kind: 'disc'; part: 'knob' | 'move' }
  | { kind: 'ruler' }
  | { kind: 'token'; id: string }
  | { kind: 'door'; index: number }
  | { kind: 'frame' };

/** Token circle radius in squares. */
export const TOKEN_RADIUS = 0.4;

/** Ruler arm width in squares. */
export const RULER_ARM_WIDTH = 0.6;

/** Disc knob radius in squares. */
export const KNOB_RADIUS = 0.32;

/** Least grab room in screen px. */
export const GRAB_PX = 22;

/** What a hit test looks at. */
export interface HitInput {
  /** The map on the table. */
  map: MapPlay;
  /** Its doors (from the geometry file), empty while not loaded. */
  doors: readonly Door[];
  /** Whether hidden tokens count (the DM sees them). */
  dm: boolean;
  /** Screen px per square at the moment (for the grab room). */
  zoom: number;
  /** The players' window in squares (DM only), or null. */
  frame: Rect | null;
}

/**
 * Everything under a point, highest priority first.
 *
 * @param input - map, doors, profile, zoom, frame
 * @param p - the point in squares
 * @returns the hits (empty when nothing)
 */
export function hitsAt(input: HitInput, p: Point): Hit[] {
  const out: Hit[] = [];
  const { map, zoom } = input;
  const pad = Math.max(0.35, GRAB_PX / Math.max(zoom, 1e-4));

  const disc = map.disc;
  if (disc.visible) {
    if (input.dm && dist(p, discToMap(disc, knobLocal(disc))) <= KNOB_RADIUS + pad) out.push({ kind: 'disc', part: 'knob' });
    const fromMiddle = dist(p, disc);
    if (fromMiddle <= 0.5 + pad * 0.5 || Math.abs(fromMiddle - rimRadius(disc)) <= pad) out.push({ kind: 'disc', part: 'move' });
  }

  if (map.ruler.visible && onRuler(map.ruler.x, map.ruler.y, map.ruler.rotation, p, Math.max(0.15, GRAB_PX / 2 / Math.max(zoom, 1e-4)))) {
    out.push({ kind: 'ruler' });
  }

  const token = tokenAt(map.tokens, p, input.dm, Math.max(TOKEN_RADIUS, Math.min(0.5, GRAB_PX / zoom)));
  if (token) out.push({ kind: 'token', id: token.id });

  const door = doorAt(input.doors, p, Math.max(0.25, GRAB_PX / 2 / Math.max(zoom, 1e-4)));
  if (door >= 0) out.push({ kind: 'door', index: door });

  if (input.frame && onFrame(input.frame, p, pad)) out.push({ kind: 'frame' });
  return out;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Whether a point lies on the L-ruler (its arms plus `pad`).
 *
 * @param x - the ruler's corner, squares
 * @param y - the ruler's corner, squares
 * @param rotation - degrees clockwise
 * @param p - the point
 * @param pad - extra room in squares
 * @returns true when on an arm
 */
export function onRuler(x: number, y: number, rotation: number, p: Point, pad: number): boolean {
  const a = (-rotation * Math.PI) / 180;
  const dx = p.x - x;
  const dy = p.y - y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const len = RULER_ARM_SQUARES;
  const w = RULER_ARM_WIDTH;
  const horizontal = lx >= -pad && lx <= len + pad && ly >= -w - pad && ly <= pad;
  const vertical = lx >= -w - pad && lx <= pad && ly >= -len - pad && ly <= pad;
  return horizontal || vertical;
}

/**
 * The topmost placed token under a point (the last drawn wins), hidden ones only for the DM.
 *
 * @param tokens - the map's tokens
 * @param p - the point
 * @param dm - whether hidden tokens count
 * @param radius - grab radius in squares
 * @returns the token, or null
 */
export function tokenAt(tokens: readonly Token[], p: Point, dm: boolean, radius: number): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (!t.placed || (t.hidden && !dm)) continue;
    if (Math.hypot(p.x - (t.col + 0.5), p.y - (t.row + 0.5)) <= radius) return t;
  }
  return null;
}

/**
 * The door under a point: its segment's box plus `pad` on each side.
 *
 * @param doors - the doors
 * @param p - the point
 * @param pad - room in squares
 * @returns the door's index, or −1
 */
export function doorAt(doors: readonly Door[], p: Point, pad: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i]!;
    const x0 = Math.min(d.a.x, d.b.x) - pad;
    const x1 = Math.max(d.a.x, d.b.x) + pad;
    const y0 = Math.min(d.a.y, d.b.y) - pad;
    const y1 = Math.max(d.a.y, d.b.y) + pad;
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const dd = Math.hypot(p.x - (d.a.x + d.b.x) / 2, p.y - (d.a.y + d.b.y) / 2);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  return best;
}

/**
 * Whether a point lies on the players' frame outline (within `pad` of an edge).
 *
 * @param r - the window in squares
 * @param p - the point
 * @param pad - room in squares
 * @returns true when on the outline
 */
export function onFrame(r: Rect, p: Point, pad: number): boolean {
  const inOuter = p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad;
  const inInner = p.x > r.x + pad && p.x < r.x + r.width - pad && p.y > r.y + pad && p.y < r.y + r.height - pad;
  return inOuter && !inInner;
}
