/**
 * `newGame` with several maps (S16: several pages of one PDF start one game) and `game.new` on the wire.
 */
import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { GameNew, newGame } from '../src/index.ts';
import { pictureMap } from './fixtures.ts';

describe('a new game on several maps', () => {
  test('the first map is on the table, the others follow in order, an id twice is kept once', () => {
    const g = newGame({ id: 'g', name: 'Tomb', createdAt: '2026-10-26T00:00:00.000Z', map: pictureMap('p1'), moreMaps: [pictureMap('p2'), pictureMap('p1'), pictureMap('p3')] });
    expect(g.mapOrder).toEqual(['p1', 'p2', 'p3']);
    expect(g.activeMapId).toBe('p1');
    expect(Object.keys(g.maps).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  test('without moreMaps it is the one-map game', () => {
    const g = newGame({ id: 'g', name: 'One', createdAt: '2026-10-26T00:00:00.000Z', map: pictureMap('m') });
    expect(g.mapOrder).toEqual(['m']);
  });

  test('game.new carries moreMaps (optional)', () => {
    const base = { type: 'game.new', game: { id: 'g1', name: 'x', createdAt: '2026-10-26T00:00:00.000Z', map: pictureMap('a') } };
    expect(v.safeParse(GameNew, base).success).toBe(true);
    expect(v.safeParse(GameNew, { ...base, game: { ...base.game, moreMaps: [pictureMap('b')] } }).success).toBe(true);
  });
});
