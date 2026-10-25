/**
 * Reveal areas and secrets: save / replace / delete (+ Undo by saving back), area reveal and hide
 * (one fog undo step, staged with the preview), refusals, found / sprung with its effect, and the
 * players' copy of the state, which never holds an unfound secret or a note.
 */
import { describe, expect, test } from 'bun:test';
import {
  areasOf, check, checkCommand, Game, hiddenDoors, maskCells, maskFromCells, playersState, secretsOf,
  type OneShot, type RevealArea, type RootState, type Secret,
} from '../src/index.ts';
import { active, refused, run, uvttMap, withGame } from './fixtures.ts';

const N = 10 * 8; // uvttMap's squares

/** An area of the 10 × 8 test map. */
function area(id: string, cells: number[], name = id): RevealArea {
  return { id, name, cells: maskFromCells(N, cells) };
}

/** A secret of the test map. */
function secret(id: string, kind: Secret['kind'], extra: Partial<Secret> = {}): Secret {
  return { id, kind, name: '', note: '', col: 2, row: 3, door: null, vertical: false, effect: null, found: false, ...extra };
}

const shot: OneShot = { id: 'sh1', effect: 'dust-burst', anchor: { kind: 'point', x: 2.5, y: 3.5 }, params: { size: 2 }, at: 1 };

function game(): RootState {
  return withGame(uvttMap('u1', 10, 8, 2));
}

describe('reveal areas', () => {
  test('save adds, replaces by id, inserts at an index; remove deletes; Undo saves it back', () => {
    let s = run(game(), { type: 'area.save', area: area('a', [0, 1]) }, { type: 'area.save', area: area('b', [5]) });
    expect(areasOf(active(s)).map((a) => a.id)).toEqual(['a', 'b']);
    s = run(s, { type: 'area.save', area: area('a', [0, 1, 2], 'The crypt') });
    expect(areasOf(active(s))[0]).toMatchObject({ id: 'a', name: 'The crypt' });
    const removed = areasOf(active(s))[0]!;
    s = run(s, { type: 'area.remove', id: 'a' });
    expect(areasOf(active(s)).map((a) => a.id)).toEqual(['b']);
    s = run(s, { type: 'area.save', area: removed, index: 0 });
    expect(areasOf(active(s)).map((a) => a.id)).toEqual(['a', 'b']);
    expect(s.history.undo).toEqual([]); // no undo steps for the list itself
    // an unknown id: nothing changes
    expect(run(s, { type: 'area.remove', id: 'zz' })).toBe(s);
  });

  test('reveal and hide all its squares as one fog step; undo takes it back', () => {
    let s = run(game(), { type: 'area.save', area: area('crypt', [11, 12, 21, 22]) });
    s = run(s, { type: 'area.reveal', id: 'crypt', value: 'reveal', gesture: 'g1' });
    expect(maskCells(active(s).fog.revealed, N)).toEqual([11, 12, 21, 22]);
    expect(s.history.undo.at(-1)).toMatchObject({ kind: 'fog', gesture: 'g1' });
    s = run(s, { type: 'history.undo' });
    expect(maskCells(active(s).fog.revealed, N)).toEqual([]);
    s = run(s, { type: 'history.redo' }, { type: 'area.reveal', id: 'crypt', value: 'hide', gesture: 'g2' });
    expect(maskCells(active(s).fog.revealed, N)).toEqual([]);
  });

  test('with Preview first the area is staged, not shown', () => {
    let s = run(game(), { type: 'fog.preview', on: true }, { type: 'area.save', area: area('x', [3, 4]) });
    s = run(s, { type: 'area.reveal', id: 'x', value: 'reveal', gesture: 'g' });
    expect(maskCells(active(s).fog.revealed, N)).toEqual([]);
    expect(maskCells(active(s).fog.staged!.reveal, N)).toEqual([3, 4]);
  });

  test('refusals: unknown area, a mask of another size, more than 64', () => {
    expect(refused(game(), { type: 'area.reveal', id: 'nope', value: 'reveal', gesture: 'g' })).toContain('gone');
    expect(refused(game(), { type: 'area.save', area: { id: 'w', name: '', cells: maskFromCells(N * 4, [1]) } })).toContain('another map');
    let s = game();
    for (let i = 0; i < 64; i++) s = run(s, { type: 'area.save', area: area(`a${i}`, [i]) });
    expect(refused(s, { type: 'area.save', area: area('one-more', [1]) })).toContain('64');
    expect(run(s, { type: 'area.save', area: area('a3', [9]) })).not.toBe(s); // replacing still works
  });
});

describe('secrets', () => {
  test('save, replace, remove; a map door or a drawn door', () => {
    let s = run(game(),
      { type: 'secret.save', secret: secret('d', 'door', { door: 1 }) },
      { type: 'secret.save', secret: secret('t', 'trap', { note: 'DC 15, 2d6 piercing', effect: 'dust-burst' }) },
      { type: 'secret.save', secret: secret('m', 'mark', { col: 9, row: 7 }) });
    expect(secretsOf(active(s)).map((x) => x.id)).toEqual(['d', 't', 'm']);
    expect([...hiddenDoors(active(s))]).toEqual([1]);
    s = run(s, { type: 'secret.save', secret: secret('t', 'trap', { name: 'Pit' }) });
    expect(secretsOf(active(s))[1]!.name).toBe('Pit');
    s = run(s, { type: 'secret.remove', id: 'm' });
    expect(secretsOf(active(s)).map((x) => x.id)).toEqual(['d', 't']);
    expect(s.history.undo).toEqual([]);
  });

  test('found / sprung with its effect; hidden again; the effect plays once', () => {
    let s = run(game(), { type: 'secret.save', secret: secret('d', 'door', { door: 0 }) });
    s = run(s, { type: 'secret.found', id: 'd', found: true, shot });
    expect(secretsOf(active(s))[0]!.found).toBe(true);
    expect(s.live.shots.map((x) => x.id)).toEqual(['sh1']);
    expect(hiddenDoors(active(s)).size).toBe(0);
    // replayed: nothing new
    const again = run(s, { type: 'secret.found', id: 'd', found: true, shot });
    expect(again.live.shots).toEqual(s.live.shots);
    s = run(s, { type: 'secret.found', id: 'd', found: false });
    expect(secretsOf(active(s))[0]!.found).toBe(false);
    expect([...hiddenDoors(active(s))]).toEqual([0]);
  });

  test('refusals: off the map, a door the map lacks, unknown secret', () => {
    expect(refused(game(), { type: 'secret.save', secret: secret('x', 'trap', { col: 10 }) })).toContain('not on this map');
    expect(refused(game(), { type: 'secret.save', secret: secret('x', 'door', { door: 2 }) })).toContain('door');
    expect(refused(game(), { type: 'secret.save', secret: secret('x', 'trap', { door: 0 }) })).toContain('door');
    expect(refused(game(), { type: 'secret.found', id: 'x', found: true })).toContain('gone');
  });

  test('the players’ state never holds an unfound secret, a note or an area', () => {
    let s = run(game(),
      { type: 'area.save', area: area('crypt', [1, 2]) },
      { type: 'secret.save', secret: secret('d', 'door', { door: 0, note: 'behind the bookcase' }) },
      { type: 'secret.save', secret: secret('t', 'trap', { note: 'poison needle' }) });
    let p = playersState(s);
    expect(secretsOf(active(p))).toEqual([]);
    expect(areasOf(active(p))).toEqual([]);
    expect(JSON.stringify(p)).not.toContain('bookcase');
    s = run(s, { type: 'secret.found', id: 't', found: true });
    p = playersState(s);
    expect(secretsOf(active(p)).map((x) => [x.id, x.note])).toEqual([['t', '']]);
    expect(JSON.stringify(p)).not.toContain('poison');
    expect(JSON.stringify(p)).not.toContain('bookcase');
    // the full state still has everything (the TV is the authority)
    expect(secretsOf(active(s))).toHaveLength(2);
    // a game with nothing secret is passed through as is
    const plain = game();
    expect(playersState(plain)).toBe(plain);
  });

  test('the wire: commands check, a stored game without the fields reads as none', () => {
    expect(checkCommand({ type: 'secret.found', id: 'd', found: true, shot }).ok).toBe(true);
    expect(checkCommand({ type: 'area.reveal', id: 'a', value: 'reveal', gesture: 'g' }).ok).toBe(true);
    expect(checkCommand({ type: 'secret.save', secret: { ...secret('x', 'trap'), kind: 'pit' } }).ok).toBe(false);
    const g = structuredClone(game().game!) as Record<string, any>;
    for (const m of Object.values(g.maps as Record<string, any>)) {
      delete m.areas;
      delete m.secrets;
    }
    const parsed = check(Game, g);
    if (!parsed.ok) throw new Error(parsed.error);
    const map = Object.values(parsed.value.maps as Record<string, any>)[0];
    expect(areasOf(map)).toEqual([]);
    expect(secretsOf(map)).toEqual([]);
  });
});
