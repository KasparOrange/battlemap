/// <reference types="bun" />
/**
 * The Tokens, Fog and Draw tools against the real reducer (through a fake game context), the
 * fog cell maths, token rules, stroke helpers, undo helpers and the tab registry.
 */
import '../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { apply, bitIsSet, maskCount, maskToBytes, type Command, type RootState } from '@battlemap/shared';
import { fakeContext, stateWithGame, testMap } from '../game/fake-context.ts';
import { collectTabs, type TabDef } from '../game/tabs.ts';
import { canRedo, canUndo, undoKey, withUndo } from '../game/undo.ts';
import { BrushStroke, circleRevealCells, roomCells, squaresBetween } from './fog/cells.ts';
import { fogLocal } from './fog/local.svelte.ts';
import { fogTool, resizeLiveCircle } from './fog/tool.ts';
import { makeToken, nextLabel, squareFree, tokenName } from './tokens/logic.ts';
import { tokensLocal } from './tokens/local.svelte.ts';
import { armToken, tokensTool } from './tokens/tool.ts';
import { drawLocal } from './draw/local.svelte.ts';
import { StrokeBuilder, strokesHit } from './draw/stroke.ts';
import { drawTool } from './draw/tool.ts';

const P = (x: number, y: number) => ({ x, y });

function revealed(state: RootState): number {
  const map = state.game!.maps[state.game!.activeMapId]!;
  return maskCount(map.fog.revealed, map.info.grid.cols * map.info.grid.rows);
}

describe('fog cells', () => {
  test('squaresBetween fills the gaps of a fast drag', () => {
    expect(squaresBetween(P(0.5, 0.5), P(4.5, 0.5)).map(([c]) => c)).toEqual([1, 2, 3, 4]);
    expect(squaresBetween(P(0.5, 0.5), P(0.6, 0.7))).toEqual([]);
  });

  test('a brush stroke sends each square once', () => {
    const s = new BrushStroke(P(5.5, 5.5), 1, 20, 15);
    const first = s.first();
    expect(first.length).toBe(9);
    const next = s.moveTo(P(6.5, 5.5));
    expect(next.length).toBe(3); // the new column of the 3 × 3 stamp
    expect(s.moveTo(P(6.6, 5.6))).toEqual([]);
  });

  test('Room stops at walls and closed doors, passes open ones; no walls = whole map', () => {
    const ctx = fakeContext(stateWithGame(testMap(10, 4, 1)));
    // a wall down x = 5 with a door in it at row 1
    const geometry = { walls: [[P(5, 0), P(5, 1)], [P(5, 2), P(5, 4)]], lights: [], doors: [{ a: P(5, 1), b: P(5, 2) }] };
    expect(roomCells(ctx.map, geometry, P(1.5, 1.5)).length).toBe(20);
    ctx.dispatch({ type: 'door.set', index: 0, open: true });
    expect(roomCells(ctx.map, geometry, P(1.5, 1.5)).length).toBe(40);
    expect(roomCells(ctx.map, null, P(1.5, 1.5)).length).toBe(40);
    expect(roomCells(ctx.map, null, P(-3, 1))).toEqual([]);
  });

  test('Circle is a plain circle without walls and stops at a wall', () => {
    const ctx = fakeContext(stateWithGame(testMap(20, 20)));
    const centre = 10 * 20 + 10;
    expect(circleRevealCells(ctx.map, null, centre, 1).length).toBe(9);
    const wall = { walls: [[P(11, 0), P(11, 20)]], lights: [], doors: [] };
    const cells = circleRevealCells(ctx.map, wall, centre, 3);
    expect(cells.every((c) => c % 20 <= 10)).toBe(true);
  });
});

describe('fog tool', () => {
  test('a single brush tap reaches the state (v1 bug: it never reached the TV)', () => {
    const ctx = fakeContext();
    fogLocal.tool = 'brush';
    fogLocal.value = 'reveal';
    fogLocal.brush = 0;
    fogTool(ctx).tap!(P(3.5, 3.5));
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]).toMatchObject({ type: 'fog.apply', cells: [3 * 20 + 3], value: 'reveal' });
    expect(revealed(ctx.state)).toBe(1);
  });

  test('a brush drag is one gesture — one undo takes all of it back', () => {
    const ctx = fakeContext();
    fogLocal.tool = 'brush';
    fogLocal.brush = 1;
    const drag = fogTool(ctx).begin!(P(2.5, 2.5), P(3.5, 2.5))!;
    drag.move(P(6.5, 2.5));
    drag.end(P(8.5, 2.5));
    const gestures = new Set(ctx.sent.map((c) => (c as Extract<Command, { type: 'fog.apply' }>).gesture));
    expect(gestures.size).toBe(1);
    expect(revealed(ctx.state)).toBe(3 * 9); // columns 1..9, rows 1..3
    expect(ctx.state.history.undo).toHaveLength(1);
    ctx.dispatch({ type: 'history.undo' });
    expect(revealed(ctx.state)).toBe(0);
  });

  test('brushing over revealed ground sends nothing', () => {
    const ctx = fakeContext();
    ctx.dispatch({ type: 'fog.all', value: 'reveal' });
    ctx.sent.length = 0;
    fogLocal.tool = 'brush';
    fogLocal.value = 'reveal';
    fogTool(ctx).tap!(P(3.5, 3.5));
    expect(ctx.sent).toEqual([]);
  });

  test('Room and Circle have no drag (the finger pans)', () => {
    const ctx = fakeContext();
    fogLocal.tool = 'room';
    expect(fogTool(ctx).begin!(P(1, 1), P(3, 1))).toBeNull();
    fogLocal.tool = 'circle';
    expect(fogTool(ctx).begin!(P(1, 1), P(3, 1))).toBeNull();
  });

  test('with Preview first a circle waits and the radius stepper redraws it', () => {
    const ctx = fakeContext();
    ctx.dispatch({ type: 'fog.preview', on: true });
    fogLocal.tool = 'circle';
    fogLocal.value = 'reveal';
    fogLocal.circle = 1;
    fogTool(ctx).tap!(P(10.5, 7.5));
    const n = 20 * 15;
    expect(maskCount(ctx.map.fog.staged!.reveal, n)).toBe(9);
    expect(revealed(ctx.state)).toBe(0);
    fogLocal.circle = 2;
    expect(resizeLiveCircle(ctx)).toBe(true);
    expect(maskCount(ctx.map.fog.staged!.reveal, n)).toBe(21);
    ctx.dispatch({ type: 'fog.commit' });
    expect(revealed(ctx.state)).toBe(21);
    expect(resizeLiveCircle(ctx)).toBe(false); // nothing waits any more
  });

  test('Hide hides', () => {
    const ctx = fakeContext();
    ctx.dispatch({ type: 'fog.all', value: 'reveal' });
    fogLocal.tool = 'room';
    fogLocal.value = 'hide';
    fogTool(ctx).tap!(P(1, 1));
    expect(revealed(ctx.state)).toBe(0);
    fogLocal.value = 'reveal';
  });
});

describe('tokens', () => {
  test('labels are the smallest unused number', () => {
    const t = (label: string) => makeToken([], '', null) && { ...makeToken([], '', null), label };
    expect(nextLabel([t('1'), t('3')])).toBe('2');
    expect(nextLabel([])).toBe('1');
    expect(tokenName({ ...t('4'), name: '' })).toBe('Token 4');
  });

  test('tap on an empty square adds a token; tap on it selects; again deselects', () => {
    const ctx = fakeContext();
    const tool = tokensTool(ctx);
    tool.tap!(P(4.5, 2.5));
    expect(ctx.map.tokens).toHaveLength(1);
    expect(ctx.map.tokens[0]).toMatchObject({ col: 4, row: 2, placed: true, label: '1' });
    expect(tool.claims!(P(4.2, 2.9))).toBe(true);
    tool.tap!(P(4.5, 2.5));
    expect(ctx.selectedToken).toBe(ctx.map.tokens[0]!.id);
    tool.tap!(P(9.5, 9.5)); // empty square with a selection: only deselects
    expect(ctx.selectedToken).toBeNull();
    expect(ctx.map.tokens).toHaveLength(1);
    tool.tap!(P(4.5, 2.5));
    tool.tap!(P(4.5, 2.5));
    expect(ctx.selectedToken).toBeNull();
  });

  test('dragging a token moves it square by square as one undo step, never onto another token', () => {
    const ctx = fakeContext();
    const a = makeToken([], 'A', { col: 1, row: 1 });
    ctx.dispatch({ type: 'token.add', token: a });
    ctx.dispatch({ type: 'token.add', token: makeToken([a], 'B', { col: 4, row: 1 }) });
    const drag = tokensTool(ctx).begin!(P(1.5, 1.5), P(2.5, 1.5))!;
    drag.move(P(3.5, 1.5));
    drag.move(P(4.5, 1.5)); // occupied: stays on 3
    drag.end(P(4.5, 1.5));
    expect(ctx.map.tokens.find((t) => t.id === a.id)).toMatchObject({ col: 3, row: 1 });
    const undoBefore = ctx.state.history.undo.length;
    ctx.dispatch({ type: 'history.undo' });
    expect(ctx.map.tokens.find((t) => t.id === a.id)).toMatchObject({ col: 1, row: 1 });
    expect(ctx.state.history.undo.length).toBe(undoBefore - 1);
  });

  test('a drag that starts off a token is no token drag', () => {
    const ctx = fakeContext();
    expect(tokensTool(ctx).begin!(P(1, 1), P(3, 3))).toBeNull();
  });

  test('an armed off-map token is placed by the next tap', () => {
    const ctx = fakeContext();
    const t = makeToken([], 'Thorin', null);
    ctx.dispatch({ type: 'token.add', token: t });
    armToken(ctx, t.id);
    expect(tokensLocal.armed).toBe(t.id);
    tokensTool(ctx).tap!(P(6.5, 6.5));
    expect(tokensLocal.armed).toBeNull();
    expect(ctx.map.tokens[0]).toMatchObject({ placed: true, col: 6, row: 6 });
    expect(squareFree(ctx.map.tokens, 6, 6)).toBe(false);
  });
});

describe('draw', () => {
  test('strokes thin their points and the eraser finds them', () => {
    const b = new StrokeBuilder(P(1, 1));
    expect(b.add(P(1.01, 1))).toBe(false);
    expect(b.add(P(2, 1))).toBe(true);
    const stroke = { id: 's', points: b.points, color: '#ffffff', width: 0.2 };
    expect(strokesHit([stroke], P(1.5, 1.05), 0.1)).toEqual(['s']);
    expect(strokesHit([stroke], P(1.5, 2), 0.1)).toEqual([]);
  });

  test('a pen drag streams a live stroke, adds it on release, clears the live one', () => {
    const ctx = fakeContext();
    drawLocal.pen = 'pen';
    const drag = drawTool(ctx).begin!(P(1, 1), P(2, 1));
    drag!.move(P(3, 2));
    drag!.end(P(4, 2));
    expect(ctx.map.strokes).toHaveLength(1);
    expect(ctx.map.strokes[0]!.points.length).toBeGreaterThanOrEqual(6);
    expect(ctx.state.live.stroke).toBeNull();
    ctx.dispatch({ type: 'history.undo' });
    expect(ctx.map.strokes).toHaveLength(0);
  });

  test('a second finger drops the live stroke; the eraser removes what it touches', () => {
    const ctx = fakeContext();
    drawLocal.pen = 'pen';
    const drag = drawTool(ctx).begin!(P(1, 1), P(2, 1))!;
    drag.cancel();
    expect(ctx.map.strokes).toHaveLength(0);
    expect(ctx.state.live.stroke).toBeNull();
    drawTool(ctx).tap!(P(5, 5));
    expect(ctx.map.strokes).toHaveLength(1);
    drawLocal.pen = 'eraser';
    drawTool(ctx).tap!(P(5.05, 5));
    expect(ctx.map.strokes).toHaveLength(0);
    drawLocal.pen = 'pen';
  });
});

describe('undo', () => {
  test('keys', () => {
    const k = (key: string, ctrlKey = true, shiftKey = false, metaKey = false) => undoKey({ key, ctrlKey, shiftKey, metaKey });
    expect(k('z')).toBe('undo');
    expect(k('Z', true, true)).toBe('redo');
    expect(k('y')).toBe('redo');
    expect(k('z', false, false, true)).toBe('undo');
    expect(k('z', false)).toBeNull();
  });

  test('withUndo offers an Undo that takes back exactly that step, and refuses after another', () => {
    const ctx = fakeContext();
    const said: string[] = [];
    expect(canUndo(ctx.state)).toBe(false);
    const r = withUndo(() => ctx.state, (c) => ctx.dispatch(c), { type: 'fog.all', value: 'reveal' }, (s) => said.push(s));
    expect(r.changed).toBe(true);
    r.options.action!.run();
    expect(revealed(ctx.state)).toBe(0);
    expect(canRedo(ctx.state)).toBe(true);

    const again = withUndo(() => ctx.state, (c) => ctx.dispatch(c), { type: 'fog.all', value: 'reveal' }, (s) => said.push(s));
    ctx.dispatch({ type: 'token.add', token: makeToken([], '', { col: 1, row: 1 }) });
    again.options.action!.run();
    expect(said).toHaveLength(1);
    expect(revealed(ctx.state)).toBe(20 * 15);
  });

  test('no Undo when nothing changed', () => {
    const ctx = fakeContext();
    const r = withUndo(() => ctx.state, (c) => ctx.dispatch(c), { type: 'draw.clear' }, () => {});
    expect(r.changed).toBe(false);
    expect(r.options.action).toBeUndefined();
  });
});

describe('tab registry', () => {
  test('modes first, then panels, by order; duplicates keep the first', () => {
    const def = (id: string, group: 'modes' | 'panels', order: number) => ({ default: { id, label: id, title: id, icon: 'fog', group, order, panel: null as never } as TabDef });
    const tabs = collectTabs({ a: def('view', 'panels', 60), b: def('fog', 'modes', 20), c: def('tokens', 'modes', 10), d: def('fog', 'modes', 99), e: {} });
    expect(tabs.map((t) => t.id)).toEqual(['tokens', 'fog', 'view']);
  });

  test('the real tab files register Tokens, Fog and Draw', async () => {
    const mods = { t: await import('./tokens/tab.ts'), f: await import('./fog/tab.ts'), d: await import('./draw/tab.ts') };
    expect(collectTabs(mods).map((t) => t.id)).toEqual(['tokens', 'fog', 'draw']);
  });
});

test('fog masks: the reducer agrees with the tablet on which squares changed', () => {
  const ctx = fakeContext();
  fogLocal.tool = 'brush';
  fogLocal.brush = 0;
  fogTool(ctx).tap!(P(0.5, 0.5));
  const bytes = maskToBytes(ctx.map.fog.revealed, 300);
  expect(bitIsSet(bytes, 0)).toBe(true);
  expect(apply(ctx.state, { type: 'history.undo' }).ok).toBe(true);
});
