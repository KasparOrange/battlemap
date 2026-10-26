/**
 * Pure logic of the prepared reveal areas (roadmap S7, docs/features.md "Prepared reveal areas"):
 * an area's state read from the fog, the outline of a square set, an outline polygon turned into
 * squares, an area's centre, default names and list helpers. No DOM, tested under `bun test`
 * (`areas-logic.test.ts`).
 */
import { bitIsSet, maskCells, maskToBytes, type FogState, type Point, type RevealArea } from '@battlemap/shared';

/** What the players see of an area: all of it, some, none (or it has no squares). */
export type AreaReveal = 'revealed' | 'partly' | 'hidden' | 'empty';

/** An area's state read from the fog. */
export interface AreaState {
  /** All, some or none of its squares are shown to the players. */
  state: AreaReveal;
  /** Its squares. */
  total: number;
  /** Its squares the players see now (the preview is not shown yet, so it doesn't count). */
  shown: number;
  /** Its squares waiting in the preview (to be revealed or hidden on Apply). */
  waiting: number;
}

/**
 * Reads an area's state from the fog. A square staged in the preview is not yet shown — it
 * counts as it is for the players now, and as `waiting`.
 *
 * @param area - the area
 * @param fog - the map's fog
 * @param cells - squares of the map (cols × rows)
 * @returns its state and counts
 */
export function areaState(area: RevealArea, fog: FogState, cells: number): AreaState {
  return areaStates([area], fog, cells)[0]!;
}

/**
 * Every area's state at once — the fog's masks are decoded once, not per area (the Fog panel's
 * list re-reads them on every fog change).
 *
 * @param areas - the map's areas
 * @param fog - the map's fog
 * @param cells - squares of the map (cols × rows)
 * @returns one state per area, in order
 */
export function areaStates(areas: readonly RevealArea[], fog: FogState, cells: number): AreaState[] {
  if (areas.length === 0) return [];
  const revealed = maskToBytes(fog.revealed, cells);
  const reveal = fog.staged ? maskToBytes(fog.staged.reveal, cells) : null;
  const hide = fog.staged ? maskToBytes(fog.staged.hide, cells) : null;
  return areas.map((area) => {
    let shown = 0;
    let waiting = 0;
    const own = maskCells(area.cells, cells);
    for (const c of own) {
      const on = bitIsSet(revealed, c);
      if (on) shown++;
      if ((reveal && !on && bitIsSet(reveal, c)) || (hide && on && bitIsSet(hide, c))) waiting++;
    }
    const total = own.length;
    const state: AreaReveal = total === 0 ? 'empty' : shown === total ? 'revealed' : shown === 0 ? 'hidden' : 'partly';
    return { state, total, shown, waiting };
  });
}

/**
 * The words under an area's name in the list: its size and what the players see.
 *
 * @param s - its state
 * @returns e.g. "12 squares · partly shown (5)"
 */
export function areaSummary(s: AreaState): string {
  const size = s.total === 1 ? '1 square' : `${s.total} squares`;
  const seen = s.state === 'revealed' ? 'shown' : s.state === 'hidden' ? 'hidden' : s.state === 'partly' ? `${s.shown} shown` : 'empty';
  return s.waiting > 0 ? `${size} · ${seen} · ${s.waiting} waiting` : `${size} · ${seen}`;
}

/**
 * The outline of a set of squares: every edge between a square in the set and one outside it
 * (or the map's rim), joined into closed loops, straight runs merged into one segment. Loops run
 * clockwise around the set (on screen, y down) and the other way round a hole, so an even-odd
 * fill fills exactly the squares.
 *
 * @param cells - the squares (cell indices)
 * @param cols - squares across
 * @returns closed loops of corner points in squares (the last point joins the first)
 */
export function boundaryLoops(cells: Iterable<number>, cols: number): Point[][] {
  const set = cells instanceof Set ? (cells as Set<number>) : new Set(cells);
  const inSet = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && set.has(r * cols + c);
  // directed edges keyed by their start corner, as "x,y" → list of end corners
  const out = new Map<string, Point[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = `${ax},${ay}`;
    const list = out.get(k);
    if (list) list.push({ x: bx, y: by });
    else out.set(k, [{ x: bx, y: by }]);
  };
  for (const cell of set) {
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    if (!inSet(c, r - 1)) add(c, r, c + 1, r);
    if (!inSet(c + 1, r)) add(c + 1, r, c + 1, r + 1);
    if (!inSet(c, r + 1)) add(c + 1, r + 1, c, r + 1);
    if (!inSet(c - 1, r)) add(c, r + 1, c, r);
  }
  const loops: Point[][] = [];
  for (const [startKey, ends] of out) {
    while (ends.length > 0) {
      const [sx, sy] = startKey.split(',').map(Number) as [number, number];
      const loop: Point[] = [{ x: sx, y: sy }];
      let next = ends.pop()!;
      while (!(next.x === sx && next.y === sy)) {
        loop.push(next);
        const list = out.get(`${next.x},${next.y}`);
        if (!list || list.length === 0) break; // cannot happen for a closed boundary
        next = list.pop()!;
      }
      loops.push(mergeStraight(loop));
    }
  }
  return loops;
}

/** Drops corners that sit on a straight run (closed loop). */
function mergeStraight(loop: Point[]): Point[] {
  if (loop.length < 4) return loop;
  const keep: Point[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n]!;
    const b = loop[i]!;
    const c = loop[(i + 1) % n]!;
    const straight = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!straight) keep.push(b);
  }
  return keep;
}

/**
 * An SVG path of closed loops (in whatever units the points are in).
 *
 * @param loops - closed loops, e.g. from {@link boundaryLoops}
 * @returns the `d` attribute ('' for none)
 */
export function loopsToPath(loops: readonly Point[][]): string {
  let d = '';
  for (const loop of loops) {
    if (loop.length === 0) continue;
    d += `M${loop[0]!.x} ${loop[0]!.y}`;
    for (let i = 1; i < loop.length; i++) d += `L${loop[i]!.x} ${loop[i]!.y}`;
    d += 'Z';
  }
  return d;
}

/**
 * Whether a point lies inside a polygon (even-odd, ray casting to the right).
 *
 * @param p - the point
 * @param poly - the polygon's corners (closed implicitly)
 * @returns true when inside
 */
export function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The squares whose centres fall inside an outline (even-odd, so a crossing outline leaves a
 * hole where it overlaps itself).
 *
 * @param poly - the outline's corners in squares (at least 3, else none)
 * @param cols - squares across
 * @param rows - squares down
 * @returns cell indices, ascending
 */
export function polygonCells(poly: readonly Point[], cols: number, rows: number): number[] {
  if (poly.length < 3) return [];
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const c0 = Math.max(0, Math.floor(Math.min(...xs)));
  const c1 = Math.min(cols - 1, Math.ceil(Math.max(...xs)));
  const r0 = Math.max(0, Math.floor(Math.min(...ys)));
  const r1 = Math.min(rows - 1, Math.ceil(Math.max(...ys)));
  const out: number[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) if (insidePolygon({ x: c + 0.5, y: r + 0.5 }, poly)) out.push(r * cols + c);
  }
  return out;
}

/**
 * The square corner nearest to a point, kept on the map. Outline corners snap to it: the outline
 * then runs along the grid lines the DM sees, so which squares end up inside is predictable
 * (a square is in when its centre is) and a shaky finger can't miss a corner by a hair.
 *
 * @param at - a point in squares
 * @param cols - squares across
 * @param rows - squares down
 * @returns the corner
 */
export function snapCorner(at: Point, cols: number, rows: number): Point {
  return { x: Math.min(cols, Math.max(0, Math.round(at.x))), y: Math.min(rows, Math.max(0, Math.round(at.y))) };
}

/** How near (in squares) to the first corner a tap closes the outline. */
export const CLOSE_RADIUS = 0.6;

/**
 * Whether a tap at `at` closes an outline in progress (near its first corner, 3 corners down).
 *
 * @param poly - the corners so far
 * @param at - the tap, in squares
 * @returns true when it closes it
 */
export function closesOutline(poly: readonly Point[], at: Point): boolean {
  if (poly.length < 3) return false;
  const f = poly[0]!;
  return Math.hypot(at.x - f.x, at.y - f.y) <= CLOSE_RADIUS;
}

/**
 * Where an area's name and the camera jump go: the centre of its square centres, or — when that
 * lies outside the area (an L or a ring) — the centre of its square nearest to it.
 *
 * @param cells - the squares
 * @param cols - squares across
 * @returns a point in squares, or null for no squares
 */
export function areaCentre(cells: Iterable<number>, cols: number): Point | null {
  const list = [...cells];
  if (list.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const c of list) {
    sx += (c % cols) + 0.5;
    sy += Math.floor(c / cols) + 0.5;
  }
  const m = { x: sx / list.length, y: sy / list.length };
  const set = new Set(list);
  if (set.has(Math.floor(m.y) * cols + Math.floor(m.x)) && m.x >= 0 && m.x < cols) return m;
  let best = list[0]!;
  let bestD = Infinity;
  for (const c of list) {
    const d = ((c % cols) + 0.5 - m.x) ** 2 + (Math.floor(c / cols) + 0.5 - m.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: (best % cols) + 0.5, y: Math.floor(best / cols) + 0.5 };
}

/**
 * The name an area shows: its own, else "Area n" by its place in the list.
 *
 * @param area - the area
 * @param index - its place in the list (0-based)
 * @returns the label
 */
export function areaLabel(area: Pick<RevealArea, 'name'>, index: number): string {
  return area.name.trim() || `Area ${index + 1}`;
}

/**
 * Adds or removes squares from an edited set (a new set when something changed).
 *
 * @param set - the squares so far
 * @param cells - the squares touched
 * @param add - add (true) or remove (false)
 * @returns the new set, or the same one when nothing changed
 */
export function editCells(set: ReadonlySet<number>, cells: readonly number[], add: boolean): ReadonlySet<number> {
  let next: Set<number> | null = null;
  for (const c of cells) {
    if (set.has(c) === add) continue;
    next ??= new Set(set);
    if (add) next.add(c);
    else next.delete(c);
  }
  return next ?? set;
}

/**
 * Where an area sits in the list — the index a deleted area is saved back at by Undo.
 *
 * @param areas - the map's areas
 * @param id - the area
 * @returns its index, or -1
 */
export function areaIndex(areas: readonly RevealArea[], id: string): number {
  return areas.findIndex((a) => a.id === id);
}

/**
 * What the row's one button does: reveal an area that is hidden or partly shown, hide one that
 * is fully shown.
 *
 * @param state - the area's state
 * @returns the fog value to send
 */
export function nextValue(state: AreaReveal): 'reveal' | 'hide' {
  return state === 'revealed' ? 'hide' : 'reveal';
}
