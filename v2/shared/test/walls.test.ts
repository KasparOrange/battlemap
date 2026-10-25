/**
 * Ported from the old app's `test/wall_grid_test.dart` (same maps, same expectations).
 */
import { describe, expect, test } from 'bun:test';
import { buildWallGrid, circleCells, floodFill, floodFillWithin, inCircle, type MapGeometry, type Point } from '../src/index.ts';

const P = (x: number, y: number): Point => ({ x, y });
const geo = (walls: Point[][] = [], doors: [number, number, number, number][] = []): MapGeometry => ({
  walls,
  doors: doors.map(([x0, y0, x1, y1]) => ({ a: P(x0, y0), b: P(x1, y1) })),
  lights: [],
});
const idx = (cols: number) => (c: number, r: number) => r * cols + c;

describe('floodFill', () => {
  test('no walls: every square', () => {
    expect(floodFill(buildWallGrid(4, 3, geo(), []), 0).length).toBe(12);
  });

  test('a box room gives its four inner squares only', () => {
    const g = buildWallGrid(5, 5, geo([[P(1, 1), P(3, 1)], [P(1, 3), P(3, 3)], [P(1, 1), P(1, 3)], [P(3, 1), P(3, 3)]]), []);
    const i = idx(5);
    const room = new Set(floodFill(g, i(1, 1)));
    expect(room).toEqual(new Set([i(1, 1), i(2, 1), i(1, 2), i(2, 2)]));
  });

  const twoRooms = geo(
    [[P(0, 0), P(4, 0)], [P(0, 1), P(4, 1)], [P(0, 0), P(0, 1)], [P(4, 0), P(4, 1)], [P(2, 0), P(2, 1)]],
    [[2, 0, 2, 1]],
  );

  test('a closed door stops the fill', () => {
    const g = buildWallGrid(4, 1, twoRooms, []);
    expect(new Set(floodFill(g, 0))).toEqual(new Set([0, 1]));
    expect(new Set(floodFill(g, 2))).toEqual(new Set([2, 3]));
  });

  test('an open door lets it through, even across the wall drawn in the doorway', () => {
    expect(floodFill(buildWallGrid(4, 1, twoRooms, [0]), 0).length).toBe(4);
  });

  test('a diagonal wall blocks something', () => {
    const g = buildWallGrid(3, 3, geo([[P(0, 0), P(3, 3)]]), []);
    expect(floodFill(g, 0).length < 9 || floodFill(g, 8).length < 9).toBe(true);
  });

  test('off the map gives nothing; one square gives itself', () => {
    const g = buildWallGrid(3, 3, geo(), []);
    expect(floodFill(g, -1)).toEqual([]);
    expect(floodFill(g, 9)).toEqual([]);
    expect(floodFill(buildWallGrid(1, 1, geo(), []), 0)).toEqual([0]);
  });

  test('a horizontal wall splits top from bottom, a vertical one left from right', () => {
    const h = buildWallGrid(3, 2, geo([[P(0, 1), P(3, 1)]]), []);
    expect(new Set(floodFill(h, 0))).toEqual(new Set([0, 1, 2]));
    const v = buildWallGrid(3, 3, geo([[P(1, 0), P(1, 3)]]), []);
    expect(new Set(floodFill(v, 0))).toEqual(new Set([0, 3, 6]));
  });

  test('three rooms, two doors', () => {
    const walls = [[P(0, 0), P(6, 0)], [P(0, 1), P(6, 1)], [P(0, 0), P(0, 1)], [P(6, 0), P(6, 1)], [P(2, 0), P(2, 1)], [P(4, 0), P(4, 1)]];
    const m = geo(walls, [[2, 0, 2, 1], [4, 0, 4, 1]]);
    expect(floodFill(buildWallGrid(6, 1, m, [0, 1]), 0).length).toBe(6);
    expect(floodFill(buildWallGrid(6, 1, m, [0]), 0).length).toBe(4);
    expect(floodFill(buildWallGrid(6, 1, m, [1]), 0).length).toBe(2);
    expect(floodFill(buildWallGrid(6, 1, m, [1]), 2).length).toBe(4);
    expect(floodFill(buildWallGrid(6, 1, m, []), 0).length).toBe(2);
  });

  test('an L-shaped room', () => {
    const i = idx(3);
    const g = buildWallGrid(3, 3, geo([
      [P(0, 0), P(2, 0)], [P(2, 0), P(2, 1)], [P(1, 1), P(2, 1)], [P(1, 1), P(1, 3)], [P(0, 3), P(1, 3)], [P(0, 0), P(0, 3)],
    ]), []);
    const room = new Set(floodFill(g, i(0, 0)));
    expect(room).toEqual(new Set([i(0, 0), i(1, 0), i(0, 1), i(0, 2)]));
  });
});

describe('floodFillWithin (Circle reveal)', () => {
  test('without walls it is the brush-shaped circle', () => {
    const g = buildWallGrid(11, 11, geo(), []);
    const centre = 5 * 11 + 5;
    expect(new Set(floodFillWithin(g, centre, 4))).toEqual(new Set(circleCells(5, 5, 4, 11, 11)));
    expect(floodFillWithin(g, centre, 1).length).toBe(9);
    expect(floodFillWithin(g, centre, 0)).toEqual([centre]);
  });

  test('a wall stops the circle — the next room stays fogged', () => {
    const g = buildWallGrid(11, 11, geo([[P(6, 0), P(6, 11)]]), []);
    const cells = floodFillWithin(g, 5 * 11 + 4, 4);
    for (const c of cells) expect(c % 11).toBeLessThan(6);
    expect(cells).toContain(5 * 11 + 0);
    expect(cells).toContain(5 * 11 + 5);
  });

  test('a closed door blocks, an open door lets the circle through', () => {
    const m = geo([[P(6, 0), P(6, 5)], [P(6, 6), P(6, 11)]], [[6, 5, 6, 6]]);
    const start = 5 * 11 + 4;
    expect(floodFillWithin(buildWallGrid(11, 11, m, []), start, 4).some((c) => c % 11 >= 6)).toBe(false);
    expect(floodFillWithin(buildWallGrid(11, 11, m, [0]), start, 4)).toContain(5 * 11 + 7);
  });

  test('the brush shape: r² + r', () => {
    expect(inCircle(1, 0, 1)).toBe(true);
    expect(inCircle(1, 1, 1)).toBe(true);
    expect(inCircle(2, 0, 1)).toBe(false);
    expect(inCircle(2, 3, 4)).toBe(true);
    expect(circleCells(2, 2, 1, 5, 5).length).toBe(9);
    expect(circleCells(2, 2, 0, 5, 5)).toEqual([12]);
  });

  test('circleCells clips at the map edge', () => {
    const cells = circleCells(0, 0, 2, 5, 5);
    expect(cells.every((c) => c >= 0 && c < 25)).toBe(true);
    expect(cells).toContain(0);
    expect(cells).toContain(2);
  });
});
