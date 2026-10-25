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

/** A map's walls and doors as extracted from a real `.dd2vtt` of the test set (`test/maps/`). */
interface MapFixture {
  source: string;
  cols: number;
  rows: number;
  walls: [number, number][][];
  doors: [number, number, number, number][];
}

async function realMap(name: string): Promise<{ m: MapFixture; g: MapGeometry }> {
  const m = (await Bun.file(new URL(`./maps/${name}.json`, import.meta.url)).json()) as MapFixture;
  return { m, g: geo(m.walls.map((l) => l.map(([x, y]) => P(x, y))), m.doors) };
}

/** Cell indices of the rectangle cols c0..c1 × rows r0..r1 (inclusive). */
function rect(cols: number, c0: number, r0: number, c1: number, r1: number): Set<number> {
  const out = new Set<number>();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.add(r * cols + c);
  return out;
}

describe('walls off the grid lines (qa#2, Dungeondraft walls sit mid-square)', () => {
  test('a horizontal wall inside a row blocks the steps across it', () => {
    const g = buildWallGrid(3, 3, geo([[P(0, 1.4), P(3, 1.4)]]), []);
    // Centres of row 0 (y = 0.5) and row 1 (1.5) lie on opposite sides of y = 1.4.
    expect(new Set(floodFill(g, 0))).toEqual(new Set([0, 1, 2]));
  });

  test('a box drawn off the grid holds exactly the squares whose centres are inside', () => {
    const g = buildWallGrid(6, 6, geo([[P(0.7, 0.7), P(4.2, 0.7), P(4.2, 3.9), P(0.7, 3.9), P(0.7, 0.7)]]), []);
    expect(new Set(floodFill(g, 2 * 6 + 2))).toEqual(rect(6, 1, 1, 3, 3));
  });

  test('a short door still opens (stretched to a square)', () => {
    const m = geo([[P(0, 1.3), P(1.2, 1.3)], [P(1.8, 1.3), P(3, 1.3)]], [[1.2, 1.3, 1.8, 1.3]]);
    expect(floodFill(buildWallGrid(3, 3, m, []), 0).length).toBe(3);
    expect(floodFill(buildWallGrid(3, 3, m, [0]), 0).length).toBe(9);
  });

  test('vampire lair: each room reveals itself only', async () => {
    const { m, g } = await realMap('vampire-lair');
    const at = (c: number, r: number) => r * m.cols + c;
    const shut = buildWallGrid(m.cols, m.rows, g, []);
    const top = rect(m.cols, 4, 1, 9, 6); // x 3.71–10.03, y 0.67–6.99
    const side = rect(m.cols, 1, 2, 3, 4); // x 0.55–3.71, y 1.73–4.88
    const hallWest = rect(m.cols, 2, 7, 11, 12); // x 1.6–12.13, y 6.99–13.31
    const hallEast = rect(m.cols, 12, 7, 17, 12); // x 12.13–18.45
    expect(new Set(floodFill(shut, at(7, 3)))).toEqual(top);
    expect(new Set(floodFill(shut, at(2, 3)))).toEqual(side);
    expect(new Set(floodFill(shut, at(5, 9)))).toEqual(hallWest);
    expect(new Set(floodFill(shut, at(15, 9)))).toEqual(hallEast);
    // Door 0 joins the side room to the top room; doors 2 + 3 (the double door) the top room to
    // the hall; door 4 the hall's two halves.
    expect(new Set(floodFill(buildWallGrid(m.cols, m.rows, g, [0]), at(7, 3)))).toEqual(new Set([...top, ...side]));
    expect(new Set(floodFill(buildWallGrid(m.cols, m.rows, g, [3]), at(7, 3)))).toEqual(new Set([...top, ...hallWest]));
    expect(new Set(floodFill(buildWallGrid(m.cols, m.rows, g, [4]), at(5, 9)))).toEqual(new Set([...hallWest, ...hallEast]));
  });

  test('vampire lair: the Circle stays inside the top room', async () => {
    const { m, g } = await realMap('vampire-lair');
    const top = rect(m.cols, 4, 1, 9, 6);
    const cells = floodFillWithin(buildWallGrid(m.cols, m.rows, g, []), 3 * m.cols + 8, 6);
    expect(cells.length).toBeGreaterThan(20);
    for (const c of cells) expect(top.has(c)).toBe(true);
  });

  test('castle (114 × 64, 2142 walls): rooms stay closed, and it is fast', async () => {
    const { m, g } = await realMap('castle');
    const t0 = performance.now();
    const grid = buildWallGrid(m.cols, m.rows, g, []);
    const outside = floodFill(grid, 0);
    const t = performance.now() - t0;
    expect(t).toBeLessThan(16);
    const room = floodFill(grid, 20 * m.cols + 60);
    expect(room.length).toBeGreaterThan(4);
    expect(room.length).toBeLessThan(200);
    const out = new Set(outside);
    for (const c of room) expect(out.has(c)).toBe(false);
  });
});
