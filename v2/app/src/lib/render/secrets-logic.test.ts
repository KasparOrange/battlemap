import { describe, expect, test } from 'bun:test';
import type { MapGeometry, MapPlay, Secret } from '@battlemap/shared';
import { secretMarks, squareLeaf } from './secrets-logic.ts';

function secret(over: Partial<Secret>): Secret {
  return { id: 's1', kind: 'trap', name: '', note: 'DC 15', col: 2, row: 3, door: null, vertical: false, effect: null, found: false, ...over };
}

const GEO: MapGeometry = { walls: [], lights: [], doors: [{ a: { x: 4, y: 1 }, b: { x: 4, y: 2 } }] };

function map(secrets: Secret[], drawDoors = false): Pick<MapPlay, 'secrets' | 'info'> {
  return { secrets, info: { drawDoors } as MapPlay['info'] };
}

describe('secretMarks', () => {
  const all = [
    secret({ id: 't', kind: 'trap' }),
    secret({ id: 'm', kind: 'mark', found: true }),
    secret({ id: 'd', kind: 'door', vertical: true, found: true }),
    secret({ id: 'md', kind: 'door', door: 0, found: false }),
  ];

  test('players see only found secrets; a found drawn door is a leaf, no glyph', () => {
    const marks = secretMarks(map(all), false, GEO);
    expect(marks.map((m) => m.id)).toEqual(['m', 'd']);
    expect(marks[0]!.leaf).toBeNull();
    expect(marks[1]!.leaf).toEqual(squareLeaf({ col: 2, row: 3, vertical: true }));
  });

  test('a found map door is a leaf along the doorway, unless the map draws its doors anyway', () => {
    const found = [secret({ id: 'md', kind: 'door', door: 0, found: true })];
    expect(secretMarks(map(found), false, GEO)[0]!.leaf).toEqual({ ax: 4, ay: 1, bx: 4, by: 2 });
    expect(secretMarks(map(found, true), false, GEO)).toEqual([]);
    expect(secretMarks(map(found), false, null)).toEqual([]); // geometry still loading
  });

  test('the DM sees every secret as a glyph — a map door at the doorway middle', () => {
    const marks = secretMarks(map(all), true, GEO);
    expect(marks.map((m) => [m.id, m.found, m.leaf])).toEqual([['t', false, null], ['m', true, null], ['d', true, null], ['md', false, null]]);
    expect(marks[3]).toMatchObject({ x: 4, y: 1.5 });
    expect(marks[0]).toMatchObject({ x: 2.5, y: 3.5 });
  });

  test('no map, no secrets: nothing', () => {
    expect(secretMarks(null, true, GEO)).toEqual([]);
    expect(secretMarks(map([]), false, GEO)).toEqual([]);
  });

  test('squareLeaf runs across or down through the square middle', () => {
    expect(squareLeaf({ col: 1, row: 1, vertical: false })).toEqual({ ax: 1, ay: 1.5, bx: 2, by: 1.5 });
    expect(squareLeaf({ col: 1, row: 1, vertical: true })).toEqual({ ax: 1.5, ay: 1, bx: 1.5, by: 2 });
  });
});
