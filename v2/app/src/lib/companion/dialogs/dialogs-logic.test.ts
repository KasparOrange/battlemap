/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { defaultTable, wholeGrid, type TableState } from '@battlemap/shared';
import {
  currentBarInches, formatLength, fromUnit, parseLength, resultLine, tableSquares, toUnit, widthFromMeasurement,
} from './calibration-logic.ts';
import { fitView, fromCorners, fromLength, GridHistory, jumpView, moved, readout, toPicture, toScreen, zoomAt } from './grid-editor/editor-logic.ts';

const table = (over: Partial<TableState> = {}): TableState => ({ ...defaultTable(), viewport: { width: 1920, height: 1080 }, ...over });

describe('calibration', () => {
  test('the default table is 34 × 19 with a 10 in bar', () => {
    expect(tableSquares(table())).toEqual({ cols: 34, rows: 19 });
    expect(currentBarInches(table())).toBeCloseTo(10, 5);
    expect(resultLine(table())).toBe('34 × 19 squares · picture 34.5 in (87.63 cm) wide');
    expect(resultLine(table({ overscanPercent: 2 }))).toContain('2 % cut off each edge');
    expect(resultLine({ ...defaultTable() })).toContain('not reported');
  });
  test('units and parsing', () => {
    expect(toUnit(10, 'cm')).toBeCloseTo(25.4);
    expect(fromUnit(25.4, 'cm')).toBeCloseTo(10);
    expect(parseLength(' 25,4 ')).toBe(25.4);
    expect(parseLength('abc')).toBeNull();
    expect(formatLength(10, 'cm')).toBe('25.4 cm');
  });
  test('a longer bar means a wider picture', () => {
    const r = widthFromMeasurement(table(), '27.94', 'cm'); // 11 in measured for 10 in
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.widthInches).toBeCloseTo(34.5 * 1.1, 3);
  });
  test('refuses empty and far-off measurements', () => {
    expect(widthFromMeasurement(table(), '', 'cm')).toEqual({ ok: false, message: 'Enter what the bar measures.' });
    const far = widthFromMeasurement(table(), '3', 'in');
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.message).toBe('That is far from 10 in — measure the bar again.');
  });
});

describe('grid editor', () => {
  const g = wholeGrid(40, 30, 1280, 960);
  test('history: steps, undo, redo, equal grids ignored', () => {
    const h = new GridHistory(g);
    expect(h.push(g)).toBe(false);
    expect(h.push(moved(g, 3, 0))).toBe(true);
    expect(h.push(moved(g, 5, 0))).toBe(true);
    expect(h.undo().x).toBe(3);
    expect(h.undo().x).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo().x).toBe(3);
    h.push(moved(g, 9, 0));
    expect(h.canRedo).toBe(false);
  });
  test('view: fit, round trip, zoom about a point', () => {
    const v = fitView(1280, 960, 1000, 800);
    expect(v.scale).toBeCloseTo((1000 * 0.94) / 1280);
    const p = { x: 100, y: 200 };
    const back = toPicture(v, toScreen(v, p));
    expect(back.x).toBeCloseTo(100);
    const z = zoomAt(v, 2, { x: 500, y: 400 });
    const before = toPicture(v, { x: 500, y: 400 });
    const after = toPicture(z, { x: 500, y: 400 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  test('jump to a corner shows about six squares', () => {
    const v = jumpView(g, 'topLeft', 600, 600);
    expect(v.scale * g.cellW * 6).toBeCloseTo(600);
  });
  test('two corners', () => {
    const r = fromCorners(g, { x: 10, y: 10 }, { x: 10 + 33 * 10, y: 10 + 33 * 5 }, true, false);
    expect(r.grid?.cellW).toBeCloseTo(33);
    expect([r.across, r.down]).toEqual([10, 5]);
    expect(r.text).toContain('Gives squares of 33 px');
    expect(fromCorners(g, { x: 10, y: 10 }, { x: 12, y: 11 }, true, false).text).toContain('one square apart');
  });
  test('known length in squares and feet', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 64, y: 0 };
    const sq = fromLength(a, b, 2, 'squares', 1280, 960, { cols: 34, rows: 19 }, false);
    expect(sq.grid?.cellW).toBe(32);
    expect(sq.text).toContain('40 × 30 squares, bigger than the TV');
    const ft = fromLength(a, b, 10, 'feet', 1280, 960, null, false);
    expect(ft.grid?.cellW).toBe(32);
    expect(fromLength(a, { x: 2, y: 0 }, 1, 'squares', 1280, 960, null, false).grid).toBeNull();
  });
  test('readout and skew', () => {
    const r = readout(g, { cols: 34, rows: 19 });
    expect(r.squares).toBe('40 × 30 squares');
    expect(r.size).toBe('Square 32 px');
    expect(r.skew).toBeNull();
    expect(readout({ ...g, cellH: 34 }, null).skew).toContain('off square');
  });
});
