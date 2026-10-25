/**
 * Ported from the old app's `test/raster_grid_test.dart` (the picture grid and the grid
 * editor's tools).
 */
import { describe, expect, test } from 'bun:test';
import {
  acrossWidth, cornerCounts, cornersAgree, followingCount, gridForPicture, gridFromCorners, gridFromLength, gridFromLines,
  gridRect, gridsClose, hasPartialEdges, isWholeGrid, MIN_CELL, stretched, wholeGrid, withCell,
} from '../src/index.ts';

const grid60 = (x = 23, y = 23, w = 60, h = 60) => gridFromLines({ lineX: x, lineY: y, cellW: w, cellH: h, pictureW: 1000, pictureH: 800 });

describe('picture grid', () => {
  test('whole stretches the counts over the picture', () => {
    const g = wholeGrid(40, 30, 1280, 960);
    expect([g.cellW, g.cellH]).toEqual([32, 32]);
    expect(isWholeGrid(g)).toBe(true);
    expect(hasPartialEdges(g)).toBe(false);
    expect(gridRect(g)).toEqual({ x: 0, y: 0, width: 1280, height: 960 });
  });

  test('fromLines: whole squares only leave the slivers off', () => {
    const g = grid60();
    expect(g.x).toBeCloseTo(23, 9);
    expect([g.cols, g.rows]).toEqual([16, 13]);
    expect(isWholeGrid(g)).toBe(false);
  });

  test('fromLines: partial edges cover the whole picture', () => {
    const g = gridFromLines({ lineX: 23, lineY: 23, cellW: 60, cellH: 60, pictureW: 1000, pictureH: 800, partialEdges: true });
    expect(g.x).toBeCloseTo(-37, 9);
    expect(g.cols).toBe(18);
    expect(hasPartialEdges(g)).toBe(true);
  });

  test('a line a hair inside the edge counts as the edge', () => {
    const g = gridFromLines({ lineX: 2, lineY: 59, cellW: 60, cellH: 60, pictureW: 1200, pictureH: 600 });
    expect(g.x).toBe(2);
    expect(g.y).toBeCloseTo(-1, 9);
    expect([g.cols, g.rows]).toEqual([20, 10]);
  });

  test('any line of the grid gives the same grid', () => {
    expect(gridsClose(grid60(23), grid60(23 + 7 * 60), 1e-6)).toBe(true);
  });

  test('forPicture scales to another rendering of the same page', () => {
    const g = gridForPicture(grid60(), 2000, 1600);
    expect(g.x).toBeCloseTo(46, 9);
    expect(g.cellW).toBeCloseTo(120, 9);
    expect(g.cols).toBe(16);
    const same = grid60();
    expect(gridForPicture(same, 1000, 800)).toBe(same);
  });

  test('withCell keeps the top-left corner and the minimum size', () => {
    const g = withCell(grid60(), 61.5, 59);
    expect(g.x).toBeCloseTo(23, 9);
    expect([g.cellW, g.cellH]).toEqual([61.5, 59]);
    expect(withCell(grid60(), 1, 1).cellW).toBe(MIN_CELL);
  });

  test('stretched: the line under the finger follows it, the corner stays', () => {
    const g = grid60(0, 0);
    const s = stretched(g, { x: 600, y: 300 }, { x: 610, y: 300 }, true);
    expect(s.cellW).toBeCloseTo(61, 9);
    expect(s.cellH).toBeCloseTo(61, 9);
    const free = stretched(g, { x: 600, y: 300 }, { x: 610, y: 295 }, false);
    expect(free.cellW).toBeCloseTo(61, 9);
    expect(free.cellH).toBeCloseTo(59, 9);
  });

  test('stretched ignores an axis too close to the corner', () => {
    const g = grid60(0, 0);
    const s = stretched(g, { x: 600, y: 30 }, { x: 610, y: 40 }, false);
    expect(s.cellW).toBeCloseTo(61, 9);
    expect(s.cellH).toBe(60);
    expect(gridsClose(stretched(g, { x: 30, y: 30 }, { x: 90, y: 90 }, true), g)).toBe(true);
  });

  test('fromCorners: two marks and the count set the squares exactly', () => {
    const g = gridFromCorners({ a: { x: 23.4, y: 23.4 }, b: { x: 23.4 + 15 * 60.2, y: 23.4 + 12 * 60.2 }, nx: 15, ny: 12, square: true, fallback: grid60() })!;
    expect(g.cellW).toBeCloseTo(60.2, 9);
    expect(g.x).toBeCloseTo(23.4, 9);
  });

  test('fromCorners: free squares per axis, zero count keeps the fallback', () => {
    const g = gridFromCorners({ a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, nx: 10, ny: 0, square: false, fallback: grid60(23, 23, 55, 52) })!;
    expect([g.cellW, g.cellH]).toEqual([60, 52]);
    expect(gridFromCorners({ a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, nx: 0, ny: 0, square: true, fallback: grid60() })).toBeNull();
  });

  test('fromCorners: marks right-to-left work the same', () => {
    const g = gridFromCorners({ a: { x: 623, y: 623 }, b: { x: 23, y: 23 }, nx: -10, ny: -10, square: true, fallback: grid60(23, 23, 50, 50) })!;
    expect(g.cellW).toBeCloseTo(60, 9);
    expect(g.x).toBeCloseTo(23, 9);
  });

  test('cornerCounts picks counts both directions agree on', () => {
    const g = grid60(23, 23, 75, 75); // vampire lair: 72 px squares, the guess 75
    expect(cornerCounts(g, { x: 10, y: 10 }, { x: 10 + 17 * 72, y: 10 + 12 * 72 }, true)).toEqual([17, 12]);
    expect(cornerCounts(g, { x: 10 + 17 * 72, y: 10 + 12 * 72 }, { x: 10, y: 10 }, true)).toEqual([-17, -12]);
    expect(cornerCounts(g, { x: 0, y: 0 }, { x: 720, y: 5 }, true)[1]).toBe(0);
    expect(cornerCounts(grid60(), { x: 0, y: 0 }, { x: 605, y: 290 }, false)).toEqual([10, 5]);
  });

  test('followingCount and cornersAgree', () => {
    expect(followingCount(1400, 14, 1600)).toBe(16);
    expect(followingCount(1400, 14, -1600)).toBe(-16);
    expect(followingCount(1400, 0, 1600)).toBe(0);
    const good = cornersAgree({ x: 0, y: 0 }, { x: 1400, y: 1600 }, 14, 16);
    expect(good.across).toBe(100);
    expect(good.agree).toBe(true);
    const bad = cornersAgree({ x: 0, y: 0 }, { x: 1224, y: 864 }, 16, 12);
    expect(bad.across).toBeCloseTo(76.5, 9);
    expect(bad.down).toBe(72);
    expect(bad.agree).toBe(false);
  });

  test('a line a hair outside the edge is not a partial edge', () => {
    const g = gridFromLines({ lineX: 0, lineY: 71.51, cellW: 72, cellH: 72, pictureW: 1368, pictureH: 1008 });
    expect(g.y).toBeLessThan(0);
    expect(hasPartialEdges(g)).toBe(false);
  });

  test('acrossWidth fills the width from the left edge', () => {
    const g = acrossWidth(grid60(), 25, true);
    expect([g.cellW, g.x, g.cols, g.rows]).toEqual([40, 0, 25, 20]);
  });
});

describe('known length', () => {
  test('sets square squares, lines through its start', () => {
    const g = gridFromLength({ a: { x: 105, y: 47 }, b: { x: 405, y: 47 }, squares: 6, pictureW: 1000, pictureH: 700 })!;
    expect([g.cellW, g.cellH]).toEqual([50, 50]);
    expect(((g.x % 50) + 50) % 50).toBeCloseTo(5, 9);
    expect(((g.y % 50) + 50) % 50).toBeCloseTo(47, 9);
    expect([g.cols, g.rows]).toEqual([20, 14]);
  });

  test('a diagonal line counts its length', () => {
    expect(gridFromLength({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 }, squares: 10, pictureW: 1000, pictureH: 1000 })!.cellW).toBeCloseTo(50, 9);
  });

  test('no squares or too small squares give null', () => {
    expect(gridFromLength({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, squares: 0, pictureW: 1000, pictureH: 700 })).toBeNull();
    expect(gridFromLength({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, squares: 5, pictureW: 1000, pictureH: 700 })).toBeNull();
  });
});
