/**
 * The reveal areas' logic: state from the fog (the preview counts as not shown yet), the outline
 * of a square set, outline → squares, centres, names, editing and list helpers.
 */
import { describe, expect, test } from 'bun:test';
import { emptyMask, maskFromCells, type FogState, type RevealArea } from '@battlemap/shared';
import {
  areaStates,
  areaSummary,
  areaCentre, areaIndex, areaLabel, areaState, boundaryLoops, closesOutline, editCells,
  insidePolygon, loopsToPath, nextValue, polygonCells, snapCorner,
} from './logic.ts';

const COLS = 6;
const ROWS = 4;
const N = COLS * ROWS;

function area(cells: number[], name = ''): RevealArea {
  return { id: 'a1', name, cells: maskFromCells(N, cells) };
}

function fog(revealed: number[], staged?: { reveal?: number[]; hide?: number[] }): FogState {
  return {
    on: true,
    revealed: maskFromCells(N, revealed),
    staged: staged ? { reveal: maskFromCells(N, staged.reveal ?? []), hide: maskFromCells(N, staged.hide ?? []) } : null,
    live: null,
  };
}

describe('areaState', () => {
  test('hidden, partly, revealed, empty', () => {
    const a = area([0, 1, 2]);
    expect(areaState(a, fog([]), N)).toEqual({ state: 'hidden', total: 3, shown: 0, waiting: 0 });
    expect(areaState(a, fog([1, 9]), N)).toEqual({ state: 'partly', total: 3, shown: 1, waiting: 0 });
    expect(areaState(a, fog([0, 1, 2, 3]), N).state).toBe('revealed');
    expect(areaState({ ...a, cells: emptyMask(N) }, fog([]), N).state).toBe('empty');
  });

  test('a staged reveal is not shown yet, only waiting', () => {
    const s = areaState(area([0, 1, 2]), fog([], { reveal: [0, 1, 2] }), N);
    expect(s.state).toBe('hidden');
    expect(s.waiting).toBe(3);
  });

  test('a staged hide over shown squares waits; staged reveal of shown squares does not', () => {
    const s = areaState(area([0, 1]), fog([0, 1], { hide: [0], reveal: [1] }), N);
    expect(s.state).toBe('revealed');
    expect(s.waiting).toBe(1);
  });
});

describe('boundaryLoops', () => {
  test('one square is a 4-corner loop', () => {
    const loops = boundaryLoops([0], COLS);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(new Set(loops[0]!.map((p) => `${p.x},${p.y}`))).toEqual(new Set(['0,0', '1,0', '1,1', '0,1']));
  });

  test('a 2 × 2 block merges straight runs into 4 corners', () => {
    const loops = boundaryLoops([0, 1, COLS, COLS + 1], COLS);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
  });

  test('an L has 6 corners', () => {
    const loops = boundaryLoops([0, COLS, COLS + 1], COLS);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  test('a ring gives an outer loop and a hole', () => {
    const ring: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 1 && c === 1)) ring.push(r * COLS + c);
    const loops = boundaryLoops(ring, COLS);
    expect(loops).toHaveLength(2);
    expect(loops.map((l) => l.length).sort()).toEqual([4, 4]);
  });

  test('two separate squares are two loops; none for no squares', () => {
    expect(boundaryLoops([0, 5], COLS)).toHaveLength(2);
    expect(boundaryLoops([], COLS)).toEqual([]);
  });

  test('squares touching at a corner still close their loops', () => {
    const loops = boundaryLoops([0, COLS + 1], COLS);
    const corners = loops.reduce((n, l) => n + l.length, 0);
    expect(loops.length).toBeGreaterThanOrEqual(1);
    expect(corners).toBe(8);
  });

  test('a square at the right rim does not wrap into the next row', () => {
    const loops = boundaryLoops([COLS - 1, COLS], COLS);
    expect(loops).toHaveLength(2);
  });

  test('loopsToPath writes closed sub-paths', () => {
    expect(loopsToPath([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]])).toBe('M0 0L1 0L1 1Z');
    expect(loopsToPath([])).toBe('');
  });
});

describe('polygon → squares', () => {
  test('a rectangle on square corners takes the squares inside', () => {
    const poly = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }];
    expect(polygonCells(poly, COLS, ROWS)).toEqual([COLS + 1, COLS + 2, 2 * COLS + 1, 2 * COLS + 2]);
  });

  test('a triangle takes squares whose centres are inside', () => {
    const poly = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    const cells = polygonCells(poly, COLS, ROWS);
    expect(cells).toContain(0);
    expect(cells).not.toContain(3 * COLS + 3);
    expect(cells).not.toContain(COLS + 3); // centre (3.5, 1.5): x + y = 5 > 4
  });

  test('outside the map is clipped, fewer than 3 corners take nothing', () => {
    const big = [{ x: -5, y: -5 }, { x: 50, y: -5 }, { x: 50, y: 50 }, { x: -5, y: 50 }];
    expect(polygonCells(big, COLS, ROWS)).toHaveLength(N);
    expect(polygonCells([{ x: 0, y: 0 }, { x: 2, y: 2 }], COLS, ROWS)).toEqual([]);
  });

  test('even-odd: insidePolygon', () => {
    const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    expect(insidePolygon({ x: 1, y: 1 }, sq)).toBe(true);
    expect(insidePolygon({ x: 3, y: 1 }, sq)).toBe(false);
  });

  test('snapCorner rounds to a square corner on the map; closesOutline near the first corner', () => {
    expect(snapCorner({ x: 1.4, y: 2.6 }, COLS, ROWS)).toEqual({ x: 1, y: 3 });
    expect(snapCorner({ x: -2, y: 9 }, COLS, ROWS)).toEqual({ x: 0, y: ROWS });
    const poly = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }];
    expect(closesOutline(poly, { x: 0.3, y: 0.2 })).toBe(true);
    expect(closesOutline(poly, { x: 1, y: 1 })).toBe(false);
    expect(closesOutline(poly.slice(0, 2), { x: 0, y: 0 })).toBe(false);
  });
});

describe('centre, names, editing, list', () => {
  test('centre of a block is its middle; an L puts it on one of its squares', () => {
    expect(areaCentre([0, 1, COLS, COLS + 1], COLS)).toEqual({ x: 1, y: 1 });
    const ring: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 1 && c === 1)) ring.push(r * COLS + c);
    const c = areaCentre(ring, COLS)!;
    expect(ring).toContain(Math.floor(c.y) * COLS + Math.floor(c.x));
    expect(areaCentre([], COLS)).toBeNull();
  });

  test('labels fall back to Area n', () => {
    expect(areaLabel({ name: 'The crypt' }, 0)).toBe('The crypt');
    expect(areaLabel({ name: '  ' }, 2)).toBe('Area 3');
  });

  test('editCells adds and removes, same set when nothing changed', () => {
    const a = new Set([1, 2]);
    const b = editCells(a, [2, 3], true);
    expect([...b].sort()).toEqual([1, 2, 3]);
    expect(editCells(b, [9], false)).toBe(b);
    expect([...editCells(b, [1], false)].sort()).toEqual([2, 3]);
  });

  test('areaIndex and nextValue', () => {
    const list = [area([0]), { ...area([1]), id: 'a2' }];
    expect(areaIndex(list, 'a2')).toBe(1);
    expect(areaIndex(list, 'x')).toBe(-1);
    expect(nextValue('revealed')).toBe('hide');
    expect(nextValue('partly')).toBe('reveal');
    expect(nextValue('hidden')).toBe('reveal');
  });
});

describe('list words', () => {
  test('areaStates reads every area at once; areaSummary words', () => {
    const fog: FogState = { on: true, revealed: maskFromCells(16, [0, 1]), staged: null, live: null } as unknown as FogState;
    const a = { id: 'a', name: '', cells: maskFromCells(16, [0, 1, 2]) };
    const b = { id: 'b', name: '', cells: maskFromCells(16, [0]) };
    const [sa, sb] = areaStates([a, b], fog, 16);
    expect(sa!.state).toBe('partly');
    expect(sb!.state).toBe('revealed');
    expect(areaSummary(sa!)).toBe('3 squares · 2 shown');
    expect(areaSummary(sb!)).toBe('1 square · shown');
    expect(areaSummary({ state: 'hidden', total: 4, shown: 0, waiting: 4 })).toBe('4 squares · hidden · 4 waiting');
  });
});
