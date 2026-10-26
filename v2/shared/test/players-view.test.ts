/**
 * The players' view (S12): nothing DM-only survives `playersView`.
 */
import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { hiddenDoors, initialRoot, maskFromCells, newGame, playersView, PlayersStateMessage, RootState, type MapPlay, type Secret } from '../src/index.ts';
import { pictureMap } from './fixtures.ts';

const FILE = { hash: 'a'.repeat(64), ext: 'png' as const, bytes: 10 };

/** A game on two maps with every DM-only thing filled in on the first. */
function busy(): RootState {
  const root = initialRoot();
  const game = newGame({ id: 'g1', name: 'Crypt', createdAt: '2026-10-26T00:00:00.000Z', map: pictureMap('m1'), moreMaps: [pictureMap('m2')] });
  const m = game.maps['m1']!;
  const cells = 20 * 15;
  const map: MapPlay = {
    ...m,
    fog: { on: true, revealed: maskFromCells(cells, [0, 1, 2]), staged: { reveal: maskFromCells(cells, [50]), hide: maskFromCells(cells, []) }, live: null },
    tokens: [
      { id: 't1', label: 'A', name: 'Aria', color: '#e53935', col: 1, row: 1, placed: true, hidden: false },
      { id: 't2', label: 'O', name: 'Ogre in wait', color: '#333333', col: 9, row: 9, placed: true, hidden: true },
      { id: 't3', label: 'L', name: 'Lich (later)', color: '#333333', col: 0, row: 0, placed: false, hidden: false },
    ],
    layers: [{ id: 'l1', name: 'Secret notes', file: FILE, visible: true, opacity: 0.6 }],
    notes: [{ id: 'n1', col: 3, row: 3, text: 'The key is under the altar', color: '#ffcc00' } as never],
    areas: [{ id: 'a1', name: 'The bone pit', cells: maskFromCells(cells, [40, 41]) }],
    secrets: [
      secret({ id: 's1', kind: 'trap', name: 'Spike trap', note: 'DC 15 to spot', col: 4, row: 4 }),
      secret({ id: 's2', kind: 'door', name: 'Crypt door', note: 'behind the tapestry', col: 6, row: 2, door: 3 }),
      secret({ id: 's3', kind: 'mark', name: 'Lever', note: 'opens the vault', col: 2, row: 7, found: true }),
    ],
  };
  return {
    ...root,
    history: { undo: [{ kind: 'notes' } as never], redo: [] },
    game: {
      ...game,
      maps: { ...game.maps, m1: map },
      handouts: [
        { id: 'h1', name: 'Letter', kind: 'letter', file: null, text: 'Meet me at dawn' } as never,
        { id: 'h2', name: 'Treasure map', kind: 'picture', file: FILE, text: '' } as never,
      ],
      handoutShown: { id: 'h1', place: 'edge', side: 'bottom' } as never,
      scenes: [{ id: 's1' } as never],
    },
  };
}

/** A secret with defaults (unfound, no door, no effect). */
function secret(s: Partial<Secret> & Pick<Secret, 'id' | 'kind' | 'name' | 'note' | 'col' | 'row'>): Secret {
  return { door: null, vertical: false, effect: null, found: false, ...s };
}

describe('the players\' view', () => {
  test('keeps what the TV shows and drops everything DM-only', () => {
    const p = playersView(busy());
    const g = p.game!;
    expect(g.mapOrder).toEqual(['m1']);
    expect(Object.keys(g.maps)).toEqual(['m1']);
    const m = g.maps['m1']!;
    expect(m.tokens.map((t) => t.id)).toEqual(['t1']);
    expect(m.layers).toEqual([]);
    expect(m.fog.staged).toBeNull();
    expect(m.fog.revealed).toEqual(busy().game!.maps['m1']!.fog.revealed);
    expect(m.notes).toEqual([]);
    expect(g.handouts!.map((h) => h.id)).toEqual(['h1']);
    expect(g.scenes).toEqual([]);
    expect(p.history).toEqual({ undo: [], redo: [] });
    const text = JSON.stringify(p);
    for (const secret of ['Ogre in wait', 'Lich (later)', 'Secret notes', 'under the altar', 'Treasure map', 'm2', 'The bone pit', 'Spike trap', 'DC 15', 'Crypt door', 'tapestry', 'opens the vault']) expect(text).not.toContain(secret);
  });

  test('no reveal areas; unfound secrets gone, found ones without their note, unfound doors stay undrawn', () => {
    const m = playersView(busy()).game!.maps['m1']!;
    expect(m.areas).toEqual([]);
    expect(m.secrets!.filter((s) => s.found)).toEqual([secret({ id: 's3', kind: 'mark', name: 'Lever', note: '', col: 2, row: 7, found: true })]);
    // the unfound secret door is only its door index — so the players' page doesn't draw it
    expect(m.secrets!.filter((s) => !s.found)).toEqual([secret({ id: 's2', kind: 'door', name: '', note: '', col: 0, row: 0, door: 3 })]);
    expect([...hiddenDoors(m)]).toEqual([3]);
  });

  test('no handout on show keeps none; no game stays no game', () => {
    const s = busy();
    const none = playersView({ ...s, game: { ...s.game!, handoutShown: null } });
    expect(none.game!.handouts).toEqual([]);
    expect(playersView(initialRoot()).game).toBeNull();
  });

  test('the view is a valid state on the wire', () => {
    const msg = { type: 'players.state', rev: 4, state: playersView(busy()) };
    expect(v.safeParse(PlayersStateMessage, JSON.parse(JSON.stringify(msg))).success).toBe(true);
  });
});
