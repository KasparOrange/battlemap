/**
 * The reveal areas end to end on a fake game screen (the shared reducer behind it): draw with
 * Paint, Room and Outline, save, reveal / hide in one tap with Undo, delete with Undo at its
 * place, and the draft dropped when another map comes on the table.
 */
import '../../../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { maskCells, maskCount, type Point } from '@battlemap/shared';
import { fakeContext, stateWithGame, testMap } from '../../../game/fake-context.ts';
import { notices } from '../../../../ui/notice.svelte.ts';
import { deleteArea, saveDraft, startEditArea, startNewArea, toggleArea } from './actions.ts';
import { areasLocal } from './local.svelte.ts';
import { areaStates } from './logic.ts';
import { areaTool } from './tool.ts';

const P = (x: number, y: number): Point => ({ x, y });
const lastNotice = () => notices.current;

function fresh() {
  const ctx = fakeContext(stateWithGame(testMap(10, 6)));
  areasLocal.draft = null;
  areasLocal.selected = null;
  areasLocal.tool = 'paint';
  areasLocal.add = true;
  return { ctx, tool: areaTool(ctx) };
}

describe('drawing an area', () => {
  test('paint: taps and a drag collect squares, nothing is sent before Save', () => {
    const { ctx, tool } = fresh();
    expect(tool.claims!(P(1, 1))).toBe(false); // no draft: the fog tool works
    startNewArea(ctx);
    expect(tool.claims!(P(1, 1))).toBe(true);
    tool.tap!(P(0.5, 0.5));
    const drag = tool.begin!(P(1.5, 0.5), P(2.5, 0.5))!;
    drag.move(P(3.5, 0.5));
    drag.end(P(3.5, 0.5));
    expect(areasLocal.draft!.cells.size).toBe(4);
    areasLocal.add = false;
    tool.tap!(P(0.5, 0.5));
    expect(areasLocal.draft!.cells.size).toBe(3);
    expect(ctx.sent).toEqual([]);
    areasLocal.patch({ name: '  The crypt ' });
    expect(saveDraft(ctx)).toBe(true);
    const area = ctx.map.areas![0]!;
    expect(area.name).toBe('The crypt');
    expect(maskCells(area.cells, 60)).toEqual([1, 2, 3]);
    expect(areasLocal.draft).toBeNull();
    expect(areasLocal.selected).toBe(area.id);
  });

  test('outline: corners snap, a tap on the first corner closes it and takes the squares inside', () => {
    const { ctx, tool } = fresh();
    startNewArea(ctx);
    areasLocal.tool = 'outline';
    tool.tap!(P(1.1, 1.2));
    tool.tap!(P(3.9, 0.8));
    tool.tap!(P(4.2, 3.1));
    tool.tap!(P(0.8, 2.9));
    expect(areasLocal.draft!.poly).toEqual([P(1, 1), P(4, 1), P(4, 3), P(1, 3)]);
    expect(tool.begin!(P(1, 1), P(2, 2))).toBeNull(); // a drag pans
    tool.tap!(P(1.2, 0.9));
    expect(areasLocal.draft!.poly).toEqual([]);
    expect(areasLocal.draft!.cells.size).toBe(6);
  });

  test('room: walls stop the fill', () => {
    const { ctx, tool } = fresh();
    ctx.setGeometry({ walls: [[P(5, 0), P(5, 6)]], doors: [], lights: [] });
    startNewArea(ctx);
    areasLocal.tool = 'room';
    tool.tap!(P(1.5, 1.5));
    expect(areasLocal.draft!.cells.size).toBe(30);
  });

  test('an empty draft is not saved; another map drops the draft', () => {
    const { ctx } = fresh();
    startNewArea(ctx);
    expect(saveDraft(ctx)).toBe(false);
    areasLocal.patch({ cells: new Set([1]), mapId: 'another' });
    expect(saveDraft(ctx)).toBe(false);
    expect(areasLocal.draft).toBeNull();
    expect(ctx.sent).toEqual([]);
  });
});

describe('at the table', () => {
  function withArea() {
    const r = fresh();
    startNewArea(r.ctx);
    areasLocal.patch({ cells: new Set([0, 1, 10, 11]), name: 'Crypt' });
    saveDraft(r.ctx);
    return r;
  }

  test('one tap reveals, the next hides; the notice Undo takes the reveal back', () => {
    const { ctx } = withArea();
    const area = ctx.map.areas![0]!;
    let [s] = areaStates(ctx.map.areas!, ctx.map.fog, 60);
    expect(s!.state).toBe('hidden');
    expect(toggleArea(ctx, area, 0, s!.state)).toBe(true);
    expect(maskCount(ctx.map.fog.revealed, 60)).toBe(4);
    const notice = lastNotice();
    expect(notice?.text).toBe('“Crypt” revealed');
    notice!.action!.run();
    expect(maskCount(ctx.map.fog.revealed, 60)).toBe(0);
    toggleArea(ctx, area, 0, 'hidden');
    [s] = areaStates(ctx.map.areas!, ctx.map.fog, 60);
    expect(s!.state).toBe('revealed');
    toggleArea(ctx, area, 0, s!.state);
    expect(maskCount(ctx.map.fog.revealed, 60)).toBe(0);
  });

  test('delete, then Undo saves it back at its place; edit replaces in place', () => {
    const { ctx } = withArea();
    startNewArea(ctx);
    areasLocal.patch({ cells: new Set([30]) });
    saveDraft(ctx);
    const [first] = ctx.map.areas!;
    deleteArea(ctx, first!, 0);
    expect(ctx.map.areas!.length).toBe(1);
    lastNotice()!.action!.run();
    expect(ctx.map.areas!.map((a) => a.id)[0]).toBe(first!.id);
    startEditArea(ctx, first!);
    areasLocal.patch({ cells: new Set([5]) });
    saveDraft(ctx);
    expect(ctx.map.areas!.length).toBe(2);
    expect(maskCells(ctx.map.areas![0]!.cells, 60)).toEqual([5]);
  });
});
