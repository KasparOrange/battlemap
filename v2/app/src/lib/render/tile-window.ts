/**
 * Tile streaming maths — pure, no Pixi. A big map picture is cut by the server into 512 px tiles
 * in picture space (`TileManifest`); the TV keeps only the tiles under its window plus a ring of
 * half a screen on every side (leaning a quarter screen into the pan direction), and frees the rest. This file
 * decides when a map streams, at which level, where each tile lies in squares, and which tiles
 * to load (in which order) and keep for a view.
 *
 * @see ../../../../docs/render.md "Tile streaming for big maps"
 */
import type { RasterGrid, TileManifest } from '@battlemap/shared';
import { BYTES_PER_TEXEL } from './tiles.ts';

/** A rectangle in squares (x0 ≤ x1, y0 ≤ y1). */
export interface SquareRect {
  /** Left. */
  readonly x0: number;
  /** Top. */
  readonly y0: number;
  /** Right. */
  readonly x1: number;
  /** Bottom. */
  readonly y1: number;
}

/** Highest level the server cuts (2^-4). */
export const MAX_TILE_LEVEL = 4;

/**
 * Whether a manifest from the server or the device's storage has the shape the loader needs.
 *
 * @param m - anything
 * @returns true for a version-1 manifest whose tile list matches its columns × rows
 */
export function isTileManifest(m: unknown): m is TileManifest {
  if (!m || typeof m !== 'object') return false;
  const t = m as Partial<TileManifest>;
  return t.v === 1 && Array.isArray(t.tiles) && typeof t.width === 'number' && typeof t.height === 'number'
    && typeof t.tile === 'number' && t.tile > 0 && typeof t.apron === 'number' && typeof t.cols === 'number'
    && typeof t.rows === 'number' && t.tiles.length === t.cols * t.rows && !!t.preview && !!t.source;
}

/**
 * Whether a map should stream tiles instead of being decoded whole: the part of the grid on the
 * picture, at the density the screen wants (never more than the picture has), needs more
 * texture than `aboveBytes`.
 *
 * @param grid - the map's grid on its picture
 * @param wantedPxPerSquare - the screen's px per square
 * @param aboveBytes - the threshold (TV: 64 MB)
 * @returns true when the map streams
 */
export function shouldStream(grid: RasterGrid, wantedPxPerSquare: number, aboveBytes: number): boolean {
  const w = Math.min(grid.pictureW, grid.x + grid.cols * grid.cellW) - Math.max(0, grid.x);
  const h = Math.min(grid.pictureH, grid.y + grid.rows * grid.cellH) - Math.max(0, grid.y);
  if (w <= 0 || h <= 0) return false;
  const d = Math.min(grid.cellW, wantedPxPerSquare);
  const bytes = (w / grid.cellW) * d * (h / grid.cellH) * d * (grid.cellH / grid.cellW) * BYTES_PER_TEXEL;
  return bytes > aboveBytes;
}

/**
 * The tile level for a picture: the largest k (≤ 4) whose scaled picture still has at least the
 * wanted px per square — the TV downloads no more than it shows.
 *
 * @param cellW - the picture's px per square (the grid's cell width)
 * @param wantedPxPerSquare - the screen's px per square
 * @returns k (the picture scaled by 2^-k)
 */
export function tileLevel(cellW: number, wantedPxPerSquare: number): number {
  let k = 0;
  while (k < MAX_TILE_LEVEL && cellW / 2 ** (k + 1) >= wantedPxPerSquare) k++;
  return k;
}

/** How a tile set lies on the squares. */
export interface TileGeometry {
  /** Squares per tile-space px, x. */
  readonly sqPerPxX: number;
  /** Squares per tile-space px, y. */
  readonly sqPerPxY: number;
  /** The square x of tile-space px 0. */
  readonly originX: number;
  /** The square y of tile-space px 0. */
  readonly originY: number;
  /** Tile-space px per square (x) — the set's density. */
  readonly pxPerSquare: number;
}

/**
 * The mapping of a tile set's pixels onto squares: tile-space px → original picture px (the set
 * is the picture scaled to `width × height`) → squares through the grid, exactly as the whole
 * picture is mapped (fog, grid and tokens line up the same).
 *
 * @param m - the manifest
 * @param grid - the map's grid (on the original picture)
 * @returns the geometry
 */
export function tileGeometry(m: TileManifest, grid: RasterGrid): TileGeometry {
  const kx = grid.pictureW / m.width; // original px per tile-space px
  const ky = grid.pictureH / m.height;
  return {
    sqPerPxX: kx / grid.cellW,
    sqPerPxY: ky / grid.cellH,
    originX: -grid.x / grid.cellW,
    originY: -grid.y / grid.cellH,
    pxPerSquare: grid.cellW / kx,
  };
}

/** One tile's file and core rectangles in tile-space px. */
export interface TileRect {
  /** Index in the manifest's list (row by row). */
  readonly index: number;
  /** File rectangle (apron included): left. */
  readonly fx: number;
  /** File top. */
  readonly fy: number;
  /** File width. */
  readonly fw: number;
  /** File height. */
  readonly fh: number;
  /** Core rectangle (what the tile shows): left. */
  readonly cx: number;
  /** Core top. */
  readonly cy: number;
  /** Core width. */
  readonly cw: number;
  /** Core height. */
  readonly ch: number;
}

/**
 * A tile's rectangles — the same rule as the server's `tile_rect`: the core
 * `[i·tile, (i+1)·tile)` clipped to the picture, the file grown by the apron where a neighbour is.
 *
 * @param m - the manifest
 * @param i - column
 * @param j - row
 * @returns the rectangles
 */
export function tileRect(m: TileManifest, i: number, j: number): TileRect {
  const axis = (k: number, len: number) => {
    const start = k * m.tile;
    const end = Math.min((k + 1) * m.tile, len);
    const a = Math.max(0, start - m.apron);
    const b = Math.min(len, end + m.apron);
    return { f: a, fl: b - a, c: start, cl: end - start };
  };
  const x = axis(i, m.width);
  const y = axis(j, m.height);
  return { index: j * m.cols + i, fx: x.f, fy: y.f, fw: x.fl, fh: y.fl, cx: x.c, cy: y.c, cw: x.cl, ch: y.cl };
}

/**
 * A tile's core rectangle in squares.
 *
 * @param g - the set's geometry
 * @param r - the tile
 * @returns where it lies on the map
 */
export function tileSquares(g: TileGeometry, r: TileRect): SquareRect {
  return {
    x0: g.originX + r.cx * g.sqPerPxX,
    y0: g.originY + r.cy * g.sqPerPxY,
    x1: g.originX + (r.cx + r.cw) * g.sqPerPxX,
    y1: g.originY + (r.cy + r.ch) * g.sqPerPxY,
  };
}

/** A range of tiles, inclusive, or null when the rectangle misses the picture. */
export interface TileRange {
  /** First column. */
  readonly i0: number;
  /** Last column. */
  readonly i1: number;
  /** First row. */
  readonly j0: number;
  /** Last row. */
  readonly j1: number;
}

/**
 * The tiles a rectangle of squares touches.
 *
 * @param m - the manifest
 * @param g - its geometry
 * @param r - the rectangle in squares
 * @returns the range, or null when it misses the picture
 */
export function tileRange(m: TileManifest, g: TileGeometry, r: SquareRect): TileRange | null {
  const px0 = (r.x0 - g.originX) / g.sqPerPxX;
  const px1 = (r.x1 - g.originX) / g.sqPerPxX;
  const py0 = (r.y0 - g.originY) / g.sqPerPxY;
  const py1 = (r.y1 - g.originY) / g.sqPerPxY;
  if (px1 <= 0 || py1 <= 0 || px0 >= m.width || py0 >= m.height) return null;
  const i0 = Math.max(0, Math.floor(px0 / m.tile));
  const j0 = Math.max(0, Math.floor(py0 / m.tile));
  // a rectangle ending exactly on a tile edge doesn't touch the next tile
  const i1 = Math.min(m.cols - 1, Math.ceil(px1 / m.tile) - 1);
  const j1 = Math.min(m.rows - 1, Math.ceil(py1 / m.tile) - 1);
  if (i1 < i0 || j1 < j0) return null;
  return { i0, i1, j0, j1 };
}

/** A pan direction: −1, 0 or 1 on each axis. */
export interface PanDirection {
  /** Left (−1), none (0), right (1). */
  readonly dx: -1 | 0 | 1;
  /** Up (−1), none (0), down (1). */
  readonly dy: -1 | 0 | 1;
}

/** No pan yet. */
export const NO_PAN: PanDirection = { dx: 0, dy: 0 };

/**
 * The direction from one view to the next (by their centres); a view that didn't move keeps
 * the direction it had.
 *
 * @param prev - the view before, or null
 * @param next - the view now
 * @param before - the direction so far
 * @returns the direction
 */
export function panDirection(prev: SquareRect | null, next: SquareRect, before: PanDirection = NO_PAN): PanDirection {
  if (!prev) return before;
  const ddx = (next.x0 + next.x1 - prev.x0 - prev.x1) / 2;
  const ddy = (next.y0 + next.y1 - prev.y0 - prev.y1) / 2;
  if (Math.abs(ddx) < 1e-6 && Math.abs(ddy) < 1e-6) return before;
  return { dx: Math.abs(ddx) < 1e-6 ? 0 : ddx > 0 ? 1 : -1, dy: Math.abs(ddy) < 1e-6 ? 0 : ddy > 0 ? 1 : -1 };
}

/**
 * The rectangle whose tiles are loaded for a view: the view and a ring of `ring` × its size on
 * every side, shifted by `shift` × its size toward where the table last panned (more ahead,
 * less behind — the same memory, the next screen comes sooner).
 *
 * @param view - the screen in squares
 * @param dir - the last pan direction
 * @param ring - ring per side, in views (0.5 = half a screen)
 * @param shift - how far the ring leans into the pan direction, in views (≤ ring)
 * @returns the rectangle in squares
 */
export function loadRect(view: SquareRect, dir: PanDirection, ring = 0.5, shift = 0.25): SquareRect {
  const w = view.x1 - view.x0;
  const h = view.y1 - view.y0;
  return {
    x0: view.x0 - w * (ring - dir.dx * shift),
    x1: view.x1 + w * (ring + dir.dx * shift),
    y0: view.y0 - h * (ring - dir.dy * shift),
    y1: view.y1 + h * (ring + dir.dy * shift),
  };
}

/** What a view needs of a tile set. */
export interface WindowPlan {
  /** Tiles to have, by index, in load order: visible ones first, then nearest the view's centre. */
  readonly load: readonly number[];
  /** Tiles under the view itself. */
  readonly visible: ReadonlySet<number>;
  /** Tiles that may stay loaded (the load rectangle grown by `KEEP_MARGIN` tiles); the rest are freed. */
  readonly keep: ReadonlySet<number>;
}

/**
 * How far past the load rectangle a loaded tile may stay, in tiles — a little slack so a pan of
 * a square back and forth doesn't free and reload an edge row, without holding a whole extra
 * ring after the pan direction flips.
 */
export const KEEP_MARGIN = 0.25;

/**
 * Plans the window: which tiles to load, in which order, and which may stay.
 *
 * @param m - the manifest
 * @param g - its geometry
 * @param view - the screen in squares
 * @param dir - the last pan direction
 * @returns the plan
 */
export function planWindow(m: TileManifest, g: TileGeometry, view: SquareRect, dir: PanDirection): WindowPlan {
  const visible = new Set(indices(m, tileRange(m, g, view)));
  const lr = loadRect(view, dir);
  const want = indices(m, tileRange(m, g, lr));
  const tileSqX = m.tile * g.sqPerPxX * KEEP_MARGIN;
  const tileSqY = m.tile * g.sqPerPxY * KEEP_MARGIN;
  const keep = new Set(indices(m, tileRange(m, g, { x0: lr.x0 - tileSqX, y0: lr.y0 - tileSqY, x1: lr.x1 + tileSqX, y1: lr.y1 + tileSqY })));
  const cx = (view.x0 + view.x1) / 2;
  const cy = (view.y0 + view.y1) / 2;
  const dist = (index: number): number => {
    const s = tileSquares(g, tileRect(m, index % m.cols, Math.floor(index / m.cols)));
    return Math.hypot((s.x0 + s.x1) / 2 - cx, (s.y0 + s.y1) / 2 - cy);
  };
  const load = want
    .map((index) => ({ index, vis: visible.has(index) ? 0 : 1, d: dist(index) }))
    .sort((a, b) => a.vis - b.vis || a.d - b.d)
    .map((t) => t.index);
  return { load, visible, keep };
}

/** The indices of a range, row by row. */
function indices(m: TileManifest, r: TileRange | null): number[] {
  if (!r) return [];
  const out: number[] = [];
  for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) out.push(j * m.cols + i);
  return out;
}

/**
 * Texture bytes of a tile decoded at a scale.
 *
 * @param r - the tile
 * @param scale - decoded px per tile-space px (≤ 1)
 * @returns RGBA8 bytes
 */
export function tileBytes(r: TileRect, scale: number): number {
  return Math.max(1, Math.round(r.fw * scale)) * Math.max(1, Math.round(r.fh * scale)) * BYTES_PER_TEXEL;
}
