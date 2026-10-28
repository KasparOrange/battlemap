import { describe, expect, test } from 'bun:test';
import type { FileRef, RasterGrid, TileManifest } from '@battlemap/shared';
import {
  isTileManifest, loadRect, NO_PAN, panDirection, planWindow, shouldStream, tileBytes, tileGeometry, tileLevel, tileRange, tileRect, tileSquares,
} from './tile-window.ts';

const ref = (n: number): FileRef => ({ hash: n.toString(16).padStart(64, '0'), ext: 'webp', bytes: 100 });

/** A manifest like the server's for a picture of `w × h` at `level`. */
function manifest(w: number, h: number, level = 0): TileManifest {
  const width = Math.ceil(w / 2 ** level);
  const height = Math.ceil(h / 2 ** level);
  const cols = Math.ceil(width / 512);
  const rows = Math.ceil(height / 512);
  return {
    v: 1, source: { hash: 'a'.repeat(64), ext: 'jpg', bytes: 1 }, sourceW: w, sourceH: h, level, width, height, tile: 512, apron: 1, cols, rows,
    tiles: Array.from({ length: cols * rows }, (_, i) => ref(i + 1)), preview: ref(0),
  };
}

/** The 4 × 4-screen outdoor map: 136 × 76 squares at 56 px. */
const BIG: RasterGrid = { x: 0, y: 0, cellW: 56, cellH: 56, cols: 136, rows: 76, pictureW: 7616, pictureH: 4256 };

describe('when a map streams', () => {
  test('the 136 × 76 map at the TV density streams, one screen does not', () => {
    expect(shouldStream(BIG, 55.7, 64 * 2 ** 20)).toBe(true);
    expect(shouldStream({ ...BIG, cols: 34, rows: 19, pictureW: 1904, pictureH: 1064 }, 55.7, 64 * 2 ** 20)).toBe(false);
  });

  test('a sharp export is judged at the TV density, not its own', () => {
    // the castle: 17100 × 9600 at 256 px per square = 67 × 37.5 squares → ~31 MB at 56 px
    const castle: RasterGrid = { x: 0, y: 0, cellW: 256, cellH: 256, cols: 67, rows: 38, pictureW: 17100, pictureH: 9600 };
    expect(shouldStream(castle, 56, 64 * 2 ** 20)).toBe(false);
  });

  test('levels keep at least the wanted density', () => {
    expect(tileLevel(56, 56)).toBe(0);
    expect(tileLevel(100, 56)).toBe(0);
    expect(tileLevel(120, 56)).toBe(1);
    expect(tileLevel(256, 56)).toBe(2);
    expect(tileLevel(5000, 56)).toBe(4);
  });

  test('manifests are checked', () => {
    expect(isTileManifest(manifest(7616, 4256))).toBe(true);
    expect(isTileManifest({ ...manifest(7616, 4256), tiles: [] })).toBe(false);
    expect(isTileManifest(null)).toBe(false);
  });
});

describe('tile geometry', () => {
  test('tile rects match the server (core clipped, apron only toward neighbours)', () => {
    const m = manifest(1100, 600);
    expect(tileRect(m, 0, 0)).toMatchObject({ fx: 0, fy: 0, fw: 513, fh: 513, cx: 0, cw: 512 });
    expect(tileRect(m, 1, 0)).toMatchObject({ fx: 511, fw: 514, cx: 512, cw: 512 });
    expect(tileRect(m, 2, 1)).toMatchObject({ index: 5, fx: 1023, fy: 511, fw: 77, fh: 89, cx: 1024, cy: 512, cw: 76, ch: 88 });
  });

  test('tiles lie on the squares through the grid, at any level', () => {
    const m0 = manifest(7616, 4256, 0);
    const g0 = tileGeometry(m0, BIG);
    expect(g0.pxPerSquare).toBeCloseTo(56);
    const s = tileSquares(g0, tileRect(m0, 1, 0));
    expect(s.x0).toBeCloseTo(512 / 56);
    expect(s.x1).toBeCloseTo(1024 / 56);
    const m1 = manifest(7616, 4256, 1);
    const g1 = tileGeometry(m1, BIG);
    expect(g1.pxPerSquare).toBeCloseTo(28);
    expect(tileSquares(g1, tileRect(m1, 0, 0)).x1).toBeCloseTo(1024 / 56);
    // the last tile ends on the map's edge
    expect(tileSquares(g0, tileRect(m0, m0.cols - 1, m0.rows - 1)).x1).toBeCloseTo(136);
    expect(tileSquares(g0, tileRect(m0, m0.cols - 1, m0.rows - 1)).y1).toBeCloseTo(76);
  });

  test('a grid that starts inside the picture shifts the tiles by its origin', () => {
    const grid = { ...BIG, x: 28, y: 14, pictureW: 7644, pictureH: 4270 };
    const m = manifest(7644, 4270);
    const g = tileGeometry(m, grid);
    expect(tileSquares(g, tileRect(m, 0, 0)).x0).toBeCloseTo(-0.5);
    expect(tileSquares(g, tileRect(m, 0, 0)).y0).toBeCloseTo(-0.25);
  });

  test('ranges: a rect ending on a tile edge does not touch the next tile; off-picture is null', () => {
    const m = manifest(7616, 4256);
    const g = tileGeometry(m, BIG);
    expect(tileRange(m, g, { x0: 0, y0: 0, x1: 34, y1: 19 })).toEqual({ i0: 0, i1: 3, j0: 0, j1: 2 });
    expect(tileRange(m, g, { x0: 0, y0: 0, x1: 512 / 56, y1: 512 / 56 })).toEqual({ i0: 0, i1: 0, j0: 0, j1: 0 });
    expect(tileRange(m, g, { x0: -40, y0: -40, x1: -1, y1: -1 })).toBeNull();
    expect(tileRange(m, g, { x0: -10, y0: -10, x1: 500, y1: 500 })).toEqual({ i0: 0, i1: m.cols - 1, j0: 0, j1: m.rows - 1 });
  });
});

describe('the window', () => {
  const m = manifest(7616, 4256);
  const g = tileGeometry(m, BIG);
  const screen = (sx: number, sy: number) => ({ x0: sx * 34, y0: sy * 19, x1: sx * 34 + 34, y1: sy * 19 + 19 });

  test('pan directions follow the centre and stay while still', () => {
    expect(panDirection(null, screen(1, 1))).toEqual(NO_PAN);
    expect(panDirection(screen(1, 1), screen(2, 1))).toEqual({ dx: 1, dy: 0 });
    expect(panDirection(screen(1, 1), screen(1, 0))).toEqual({ dx: 0, dy: -1 });
    expect(panDirection(screen(1, 1), screen(1, 1), { dx: 1, dy: 0 })).toEqual({ dx: 1, dy: 0 });
  });

  test('the load rect is the view plus half a screen, leaning into the pan', () => {
    expect(loadRect(screen(1, 1), NO_PAN)).toEqual({ x0: 17, y0: 9.5, x1: 85, y1: 47.5 });
    expect(loadRect(screen(1, 1), { dx: 1, dy: 0 })).toEqual({ x0: 25.5, y0: 9.5, x1: 93.5, y1: 47.5 });
  });

  test('visible tiles load first, then nearest the centre; keep holds the load set', () => {
    const p = planWindow(m, g, screen(1, 1), NO_PAN);
    const vis = [...p.visible];
    expect(vis.length).toBe(5 * 3); // squares 34–68 × 19–38 = px 1904–3808 × 1064–2128
    expect(new Set(p.load.slice(0, vis.length))).toEqual(new Set(vis));
    for (const i of p.load) expect(p.keep.has(i)).toBe(true);
    expect(p.keep.size).toBeGreaterThanOrEqual(p.load.length);
  });

  test('every square of the next screen to the right is in the window before the pan', () => {
    const before = planWindow(m, g, screen(1, 1), { dx: 1, dy: 0 });
    const after = planWindow(m, g, screen(2, 1), { dx: 1, dy: 0 });
    const loadSet = new Set(before.load);
    const missing = [...after.visible].filter((i) => !loadSet.has(i));
    // half a screen + a quarter lean covers most of the next screen; the rest loads during the pan
    expect(missing.length).toBeLessThan(after.visible.size / 2);
  });

  test('memory stays near window + ring (≈ 4 screens), far under the 128 MB budget', () => {
    for (const dir of [NO_PAN, { dx: 1 as const, dy: 0 as const }, { dx: -1 as const, dy: 1 as const }]) {
      const p = planWindow(m, g, screen(1, 1), dir);
      const bytes = p.load.reduce((n, i) => n + tileBytes(tileRect(m, i % m.cols, Math.floor(i / m.cols)), 55.7 / 56), 0);
      expect(bytes / 2 ** 20).toBeLessThan(60);
      expect(bytes / 2 ** 20).toBeGreaterThan(30);
    }
  });

  test('a corner view loads only what exists', () => {
    const p = planWindow(m, g, screen(0, 0), NO_PAN);
    for (const i of p.load) expect(i).toBeLessThan(m.tiles.length);
    expect(p.visible.has(0)).toBe(true);
  });
});
