/**
 * Walls as blocked square edges, and the flood fills of the Room and Circle reveals (port of
 * `lib/game/wall_grid.dart`, same rules, same tests).
 *
 * Wall polylines are cut into the edges they cross; a closed door blocks its edges like a wall,
 * an open door removes them (so a wall drawn across a doorway opens with the door). Doors are
 * processed in index order after all walls, exactly as the old app did.
 */
import type { MapGeometry } from '../model/map.ts';

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

const EPS = 1e-6;

/**
 * Calls `emit(col, row, edge)` for every square edge the segment (x0, y0)–(x1, y1) blocks, in
 * squares. Squares outside the map are skipped.
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
  if (Math.sqrt(dx * dx + dy * dy) < EPS) return;

  // Along a horizontal grid line: block the north/south edges of every column it spans.
  if (Math.abs(dy) < EPS) {
    const iy = Math.round(y0);
    if (Math.abs(y0 - iy) < EPS) {
      const colStart = Math.ceil(Math.min(x0, x1));
      const colEnd = Math.floor(Math.max(x0, x1) - EPS);
      for (let col = colStart; col <= colEnd; col++) {
        if (col < 0 || col >= cols) continue;
        add(col, iy - 1, SOUTH);
        add(col, iy, NORTH);
      }
      return;
    }
  }
  // Along a vertical grid line: block the east/west edges of every row it spans.
  if (Math.abs(dx) < EPS) {
    const ix = Math.round(x0);
    if (Math.abs(x0 - ix) < EPS) {
      const rowStart = Math.ceil(Math.min(y0, y1));
      const rowEnd = Math.floor(Math.max(y0, y1) - EPS);
      for (let row = rowStart; row <= rowEnd; row++) {
        if (row < 0 || row >= rows) continue;
        add(ix - 1, row, EAST);
        add(ix, row, WEST);
      }
      return;
    }
  }
  // Any other segment: every vertical grid line it crosses …
  {
    const xMin = Math.min(x0, x1);
    const xMax = Math.max(x0, x1);
    for (let ix = Math.ceil(xMin); ix <= Math.floor(xMax); ix++) {
      if (Math.abs(ix - xMin) < EPS || Math.abs(ix - xMax) < EPS) continue; // its own ends
      const row = Math.floor(y0 + ((ix - x0) * dy) / dx);
      if (row < 0 || row >= rows) continue;
      add(ix - 1, row, EAST);
      add(ix, row, WEST);
    }
  }
  // … and every horizontal grid line.
  {
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);
    for (let iy = Math.ceil(yMin); iy <= Math.floor(yMax); iy++) {
      if (Math.abs(iy - yMin) < EPS || Math.abs(iy - yMax) < EPS) continue;
      const col = Math.floor(x0 + ((iy - y0) * dx) / dy);
      if (col < 0 || col >= cols) continue;
      add(col, iy - 1, SOUTH);
      add(col, iy, NORTH);
    }
  }
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
    segmentEdges(door.a.x, door.a.y, door.b.x, door.b.y, cols, rows, (col, row, edge) => {
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
