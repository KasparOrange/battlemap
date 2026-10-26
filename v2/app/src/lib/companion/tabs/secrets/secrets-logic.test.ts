/**
 * The Secrets tab: pure logic (making, finding, labels, effects, shots, groups) and the flow on a
 * fake game screen with the shared reducer behind it (place, select, map doors, found / spring
 * with its shot and Undo, delete with Undo at its place).
 */
import '../../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { foundSecrets, hiddenDoors, playersState, type Point, type Secret } from '@battlemap/shared';
import { fakeContext, stateWithGame, testMap } from '../../game/fake-context.ts';
import { notices } from '../../../ui/notice.svelte.ts';
import { deleteSecret, setFound, toggleFound, updateSecret } from './actions.ts';
import { secretsLocal } from './local.svelte.ts';
import { doorSquare, foundVerb, makeSecret, SECRET_EFFECTS, secretAt, secretGroups, secretLabel, secretShot, secretSub } from './logic.ts';
import { secretsTool } from './tool.ts';

const P = (x: number, y: number): Point => ({ x, y });

describe('logic', () => {
  test('makeSecret: hidden, the kind default effect, a door index only on doors', () => {
    const t = makeSecret('a', 'trap', 2, 3, 4);
    expect(t).toMatchObject({ kind: 'trap', col: 2, row: 3, door: null, found: false, effect: SECRET_EFFECTS.trap[0]!.id });
    expect(makeSecret('b', 'door', 1, 1, 0).door).toBe(0);
  });

  test('labels number by kind; sub lines come from the note', () => {
    const all = [makeSecret('a', 'trap', 0, 0), makeSecret('b', 'mark', 1, 0), makeSecret('c', 'trap', 2, 0)];
    expect(secretLabel(all[2]!, all)).toBe('Trap 2');
    expect(secretLabel(all[1]!, all)).toBe('Mark 1');
    expect(secretLabel({ ...all[0]!, name: ' Pit ' }, all)).toBe('Pit');
    expect(secretSub({ ...all[0]!, note: '\nDC 15 to spot\n2d6' })).toBe('DC 15 to spot');
    expect(secretSub(all[0]!)).toBe('Springs with an effect');
  });

  test('secretAt prefers the tapped map door, then the square', () => {
    const all = [makeSecret('a', 'trap', 2, 2), makeSecret('d', 'door', 5, 5, 1)];
    expect(secretAt(all, 2, 2, null)?.id).toBe('a');
    expect(secretAt(all, 0, 0, 1)?.id).toBe('d');
    expect(secretAt(all, 0, 0, null)).toBeNull();
  });

  test('doorSquare: the square on a doorway, which way it runs', () => {
    expect(doorSquare({ a: P(4, 1), b: P(4, 2) }, 10, 10)).toEqual({ col: 4, row: 1, vertical: true });
    expect(doorSquare({ a: P(2, 3), b: P(3, 3) }, 10, 10)).toEqual({ col: 2, row: 3, vertical: false });
    expect(doorSquare({ a: P(10, 1), b: P(10, 2) }, 10, 10).col).toBe(9);
  });

  test('a shot covers a few squares round the secret, tinted for pulses; none without an effect', () => {
    const t = makeSecret('a', 'trap', 2, 3);
    const shot = secretShot(t, 'shot1', 1000)!;
    expect(shot).toMatchObject({ id: 'shot1', effect: 'shockwave-ring', at: 1000, params: { shape: 'cube', color: '#d9473f' } });
    expect(shot.anchor).toEqual({ kind: 'region', points: [P(1, 2), P(4, 2), P(4, 5), P(1, 5)] });
    expect(secretShot({ ...t, effect: null }, 'x', 0)).toBeNull();
  });

  test('groups and verbs', () => {
    const all = [makeSecret('a', 'trap', 0, 0), { ...makeSecret('b', 'mark', 1, 0), found: true }];
    expect(secretGroups(all).hidden.map((s) => s.id)).toEqual(['a']);
    expect(secretGroups(all).found.map((s) => s.id)).toEqual(['b']);
    expect([foundVerb(all[0]!), foundVerb(makeSecret('c', 'door', 0, 0)), foundVerb(all[1]!)]).toEqual(['Spring', 'Found', 'Hide again']);
  });
});

describe('on the game screen', () => {
  function fresh() {
    const ctx = fakeContext(stateWithGame(testMap(10, 8, 1)));
    ctx.setGeometry({ walls: [], lights: [], doors: [{ a: P(4, 1), b: P(4, 2) }] });
    secretsLocal.selected = null;
    secretsLocal.place = 'trap';
    return { ctx, tool: secretsTool(ctx) };
  }
  const list = (ctx: ReturnType<typeof fresh>['ctx']): Secret[] => ctx.map.secrets ?? [];

  test('a tap places the chosen kind and selects it; a tap on it selects, never places twice', () => {
    const { ctx, tool } = fresh();
    tool.tap!(P(2.5, 3.5));
    expect(list(ctx)).toHaveLength(1);
    expect(list(ctx)[0]).toMatchObject({ kind: 'trap', col: 2, row: 3 });
    expect(secretsLocal.selected).toBe(list(ctx)[0]!.id);
    secretsLocal.selected = null;
    tool.tap!(P(2.2, 3.8));
    expect(list(ctx)).toHaveLength(1);
    expect(secretsLocal.selected as string | null).toBe(list(ctx)[0]!.id);
    notices.current!.action!.run(); // the placing notice's Undo
    expect(list(ctx)).toHaveLength(0);
  });

  test('Secret door on a map door makes that door secret: the players lose its leaf', () => {
    const { ctx, tool } = fresh();
    secretsLocal.place = 'door';
    const hit = ctx.hitsAt(P(4, 1.5));
    expect(hit.some((h) => h.kind === 'door')).toBe(true);
    tool.tap!(P(4, 1.5));
    const s = list(ctx)[0]!;
    expect(s).toMatchObject({ kind: 'door', door: 0, vertical: true });
    expect([...hiddenDoors(ctx.map)]).toEqual([0]);
    tool.tap!(P(7.5, 6.5)); // elsewhere: a drawn door on the square
    expect(list(ctx)[1]).toMatchObject({ kind: 'door', door: null, col: 7, row: 6 });
  });

  test('spring: found, its shot in live.shots, the players see it; Undo hides it again', () => {
    const { ctx, tool } = fresh();
    tool.tap!(P(2.5, 3.5));
    updateSecret(ctx, list(ctx)[0]!, { note: 'DC 15', name: 'Pit' });
    expect(playersState(ctx.state).game!.maps[ctx.game.activeMapId]!.secrets).toEqual([]);
    expect(toggleFound(ctx, list(ctx)[0]!)).toBe(true);
    expect(list(ctx)[0]!.found).toBe(true);
    expect(ctx.state.live.shots.at(-1)).toMatchObject({ effect: 'shockwave-ring' });
    const seen = foundSecrets(ctx.map);
    expect(seen[0]).toMatchObject({ name: 'Pit', note: '' });
    expect(notices.current!.text).toBe('Pit sprung — the players see it');
    notices.current!.action!.run();
    expect(list(ctx)[0]!.found).toBe(false);
    setFound(ctx, list(ctx)[0]!, true);
    setFound(ctx, list(ctx)[0]!, false);
    expect(list(ctx)[0]!.found).toBe(false);
  });

  test('delete, then Undo saves it back at its place', () => {
    const { ctx, tool } = fresh();
    tool.tap!(P(0.5, 0.5));
    secretsLocal.place = 'mark';
    tool.tap!(P(5.5, 5.5));
    const first = list(ctx)[0]!;
    deleteSecret(ctx, first);
    expect(list(ctx).map((s) => s.kind)).toEqual(['mark']);
    notices.current!.action!.run();
    expect(list(ctx).map((s) => s.id)[0]).toBe(first.id);
  });
});
