/**
 * Walls as blocked square edges, and the flood fills of the Room and Circle reveals (port of
 * `lib/game/wall_grid.dart`, same rules, same tests).
 *
 * Wall polylines are cut into the steps between square centres they cross (so walls off the grid
 * lines block too — qa#2); a closed door blocks its edges like a wall,
 * an open door removes them (so a wall drawn across a doorway opens with the door). Doors are
 * processed in index order after all walls, exactly as the old app did.
 */
import type { MapGeometry } from '../model/map.ts';
import type { Point } from '../model/basics.ts';

/** Edge bit: the square's top edge is blocked. */
export const NORTH = 1;
/** Edge bit: the square's bottom edge is blocked. */
export const SOUTH = 2;
/** Edge bit: the square's right edge is blocked. */
export const EAST = 4;
/** Edge bit: the square's left edge is blocked. */
export const WEST = 8;

/** Blocked edges of every square of a map. */
export interface WallGrid {
  /** Squares across. */
  readonly cols: number;
  /** Squares down. */
  readonly rows: number;
  /** Per cell index, the blocked edges as `NORTH | SOUTH | EAST | WEST` bits. */
  readonly blocked: Uint8Array;
}

/**
 * How far the lattice of square centres is nudged off the half-square lines, in squares. A wall
 * that runs exactly through square centres (or a wall corner sitting exactly on a step) would
 * otherwise be a tie; the nudge breaks every tie the same way for both sides of an edge. Far
 * below any real wall precision, far above floating-point noise on maps of a few hundred squares.
 */
const NUDGE_X = 3.1e-6;
const NUDGE_Y = 1.7e-6;

/**
 * Calls `emit(col, row, edge)` for every square edge the segment (x0, y0)–(x1, y1) blocks, in
 * squares. Squares outside the map are skipped.
 *
 * The rule: stepping from a square to its neighbour means walking from one square centre to the
 * other; the step is blocked when that walk crosses the segment. So a wall blocks wherever it
 * lies — on a grid line or in the middle of a row, as Dungeondraft draws them (`y = 4.876`) —
 * and a closed wall outline can never be left by any sequence of steps. A wall that lies on a
 * grid line blocks exactly the edges it covers, as the old app's rule did.
 *
 * The walk is a short line on the lattice of (nudged) centres, so the segment crosses each
 * vertical step line `x = col + ½` at most once and each horizontal one `y = row + ½` at most
 * once: the cost is the segment's length in squares.
 */
function segmentEdges(
  x0: number, y0: number, x1: number, y1: number, cols: number, rows: number,
  emit: (col: number, row: number, edge: number) => void,
): void {
  const add = (col: number, row: number, edge: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    emit(col, row, edge);
  };
  const dx = x1 - x0;
  const dy = y1 - y0;
  // North–south steps of column `col` run along x = col + ½ (nudged), from one row's centre to
  // the next; the segment crosses that line once, at height y.
  if (dx !== 0) {
    const xMin = Math.min(x0, x1);
    const xMax = Math.max(x0, x1);
    for (let col = Math.ceil(xMin - 0.5 - NUDGE_X); col + 0.5 + NUDGE_X <= xMax; col++) {
      const x = col + 0.5 + NUDGE_X;
      if (x < xMin) continue;
      const y = y0 + ((x - x0) * dy) / dx;
      const row = Math.floor(y - 0.5 - NUDGE_Y); // the step from `row` down to `row + 1`
      add(col, row, SOUTH);
      add(col, row + 1, NORTH);
    }
  }
  // East–west steps of row `row` run along y = row + ½ (nudged).
  if (dy !== 0) {
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);
    for (let row = Math.ceil(yMin - 0.5 - NUDGE_Y); row + 0.5 + NUDGE_Y <= yMax; row++) {
      const y = row + 0.5 + NUDGE_Y;
      if (y < yMin) continue;
      const x = x0 + ((y - y0) * dx) / dy;
      const col = Math.floor(x - 0.5 - NUDGE_X); // the step from `col` right to `col + 1`
      add(col, row, EAST);
      add(col + 1, row, WEST);
    }
  }
}

/**
 * A door's segment, stretched about its middle to at least one square long. A narrower door
 * might cross no step at all and so could never open; at one square it crosses at least one.
 */
function doorSpan(a: Point, b: Point): [number, number, number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len >= 1 || len === 0) return [a.x, a.y, b.x, b.y];
  const k = 0.5 / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return [mx - dx * k, my - dy * k, mx + dx * k, my + dy * k];
}

/**
 * Builds the blocked edges of a map from its walls and doors.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param geometry - walls and doors in squares
 * @param openDoors - indices of open doors
 * @returns the wall grid
 */
export function buildWallGrid(cols: number, rows: number, geometry: MapGeometry, openDoors: readonly number[]): WallGrid {
  const blocked = new Uint8Array(cols * rows);
  const block = (col: number, row: number, edge: number) => {
    blocked[row * cols + col]! |= edge;
  };
  for (const line of geometry.walls) {
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i]!;
      const q = line[i + 1]!;
      segmentEdges(p.x, p.y, q.x, q.y, cols, rows, block);
    }
  }
  const open = new Set(openDoors);
  geometry.doors.forEach((door, index) => {
    const isOpen = open.has(index);
    const [x0, y0, x1, y1] = doorSpan(door.a, door.b);
    segmentEdges(x0, y0, x1, y1, cols, rows, (col, row, edge) => {
      if (isOpen) blocked[row * cols + col]! &= ~edge;
      else blocked[row * cols + col]! |= edge;
    });
  });
  return { cols, rows, blocked };
}

/** A wall grid with no walls at all (picture maps). */
export function openWallGrid(cols: number, rows: number): WallGrid {
  return { cols, rows, blocked: new Uint8Array(cols * rows) };
}

/** Neighbour steps: column offset, row offset, the edge of the current square it crosses. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [-1, 0, WEST],
  [1, 0, EAST],
  [0, -1, NORTH],
  [0, 1, SOUTH],
];

/**
 * Every square reachable from `start` without crossing a blocked edge — the Room reveal.
 *
 * @param grid - the wall grid
 * @param start - the tapped square
 * @returns cell indices in the order they were reached (empty if `start` is off the map)
 */
export function floodFill(grid: WallGrid, start: number): number[] {
  return fill(grid, start, () => true);
}

/**
 * Flood fill that only steps onto squares inside a circle of `radius` squares around `start`
 * (`inCircle`) — the Circle reveal: stopped by walls and closed doors, so a square behind a
 * wall stays fogged even when it is close, unless an open door or a gap inside the circle leads
 * there. A radius of 0 gives only `start`.
 *
 * @param grid - the wall grid
 * @param start - the tapped square
 * @param radius - radius in squares
 * @returns cell indices in the order they were reached (empty if `start` is off the map)
 */
export function floodFillWithin(grid: WallGrid, start: number, radius: number): number[] {
  const c0 = start % grid.cols;
  const r0 = Math.floor(start / grid.cols);
  return fill(grid, start, (col, row) => {
    const dc = col - c0;
    const dr = row - r0;
    return dc * dc + dr * dr <= radius * radius + radius;
  });
}

/** Breadth-first fill from `start` over unblocked edges onto squares `allowed` accepts. */
function fill(grid: WallGrid, start: number, allowed: (col: number, row: number) => boolean): number[] {
  const { cols, rows, blocked } = grid;
  if (!Number.isInteger(start) || start < 0 || start >= cols * rows) return [];
  const seen = new Uint8Array(cols * rows);
  const out = [start];
  seen[start] = 1;
  for (let head = 0; head < out.length; head++) {
    const cell = out[head]!;
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const edges = blocked[cell]!;
    for (const [dc, dr, edge] of STEPS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = nr * cols + nc;
      if (seen[next] || (edges & edge) !== 0 || !allowed(nc, nr)) continue;
      seen[next] = 1;
      out.push(next);
    }
  }
  return out;
}
