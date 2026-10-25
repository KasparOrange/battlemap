/**
 * Ported from the old app's `test/table_fit_test.dart`: the 34 × 19 table, the layout, overscan,
 * the calibration pivot — plus the derived TV camera.
 */
import { describe, expect, test } from 'bun:test';
import {
  barInches, barRunsRight, DEFAULT_WIDTH_INCHES, marginXInches, marginYInches, MAX_OVERSCAN_PERCENT, pivotInset, pivotPoint,
  startFor, tableGrid, tableLayout, tvView, windowSquares, type CalibrationPivot,
} from '../src/index.ts';
import { active, pictureMap, run, withGame } from './fixtures.ts';

const screen = { width: 1920, height: 1080 };
const PIVOTS: CalibrationPivot[] = ['bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'center'];

describe('tableGrid', () => {
  test("Konrad's TV: 34 × 19 one-inch squares, a bit of gap both ways", () => {
    const g = tableGrid(screen, DEFAULT_WIDTH_INCHES)!;
    expect([g.cols, g.rows]).toEqual([34, 19]);
    expect(marginXInches(g)).toBeGreaterThan(0);
    expect(marginXInches(g)).toBeLessThan(0.5);
    expect(marginYInches(g)).toBeGreaterThan(0);
    expect(marginYInches(g)).toBeLessThan(0.5);
  });

  test('the window is centred: the leftover is split evenly', () => {
    const g = tableGrid(screen, 34.5)!;
    expect(g.window.width).toBeCloseTo(34 * g.ppi, 9);
    expect(g.window.x).toBeCloseTo(screen.width - (g.window.x + g.window.width), 9);
    expect(g.window.y).toBeCloseTo(screen.height - (g.window.y + g.window.height), 9);
  });

  test('an exact fit counts the last square; a bigger picture holds more', () => {
    const g = tableGrid({ width: 1000, height: 500 }, 10)!;
    expect([g.cols, g.rows]).toEqual([10, 5]);
    expect(g.window).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    const big = tableGrid(screen, 47.6)!;
    expect([big.cols, big.rows]).toEqual([47, 26]);
  });

  test('no table for an empty screen or width', () => {
    expect(tableGrid({ width: 0, height: 0 }, 34.5)).toBeNull();
    expect(tableGrid(screen, 0)).toBeNull();
  });
});

describe('tableLayout', () => {
  const grid = tableGrid(screen, 34.5)!;

  test('a small map is centred at one inch per square', () => {
    const l = tableLayout({ grid, mapCols: 20, mapRows: 15 });
    expect(l.zoom).toBeCloseTo(grid.ppi, 12);
    expect([l.centerX, l.centerY]).toEqual([10, 7.5]);
    expect(l.pansX || l.pansY).toBe(false);
    expect(windowSquares(l)).toEqual({ x: -7, y: -2, width: 34, height: 19 });
  });

  test('a map exactly the table size fills the window', () => {
    expect(windowSquares(tableLayout({ grid, mapCols: 34, mapRows: 19 }))).toEqual({ x: 0, y: 0, width: 34, height: 19 });
  });

  test('a big map starts centred, the window on whole squares', () => {
    const l = tableLayout({ grid, mapCols: 60, mapRows: 40 });
    expect([l.pansX, l.pansY]).toEqual([true, true]);
    expect([l.col, l.row]).toEqual([13, 11]); // 10.5 rounds away from zero, like Dart
    expect([l.centerX, l.centerY]).toEqual([30, 20.5]);
  });

  test('the window is clamped to the map', () => {
    const low = tableLayout({ grid, mapCols: 60, mapRows: 40, col: -5, row: -1 });
    expect([low.col, low.row]).toEqual([0, 0]);
    const high = tableLayout({ grid, mapCols: 60, mapRows: 40, col: 99, row: 99 });
    expect([high.col, high.row]).toEqual([26, 21]);
  });

  test('one axis pans, the other stays centred', () => {
    const l = tableLayout({ grid, mapCols: 50, mapRows: 12, col: 4, row: 3 });
    expect([l.pansX, l.pansY]).toEqual([true, false]);
    expect(l.col).toBe(4);
    expect(l.centerY).toBe(6);
  });

  test('a fitting odd difference rounds like the old app', () => {
    expect(tableLayout({ grid, mapCols: 21, mapRows: 19 }).col).toBe(-7); // −6.5 → −7
  });

  test('turned 90°: the 34 screen columns run down the map', () => {
    const l = tableLayout({ grid, mapCols: 25, mapRows: 30, quarterTurns: 1 });
    expect([l.winCols, l.winRows]).toEqual([19, 34]);
    expect([l.pansX, l.pansY]).toEqual([true, false]);
    expect(tableLayout({ grid, mapCols: 25, mapRows: 30, quarterTurns: 2 }).winCols).toBe(34);
  });

  test('startFor centres the window on a square, rounded', () => {
    const l = tableLayout({ grid, mapCols: 60, mapRows: 40 });
    expect(startFor(l, { x: 30.4, y: 20.2 })).toEqual({ col: 13, row: 11 });
    const far = startFor(l, { x: 50, y: 35 });
    const moved = tableLayout({ grid, mapCols: 60, mapRows: 40, col: far.col, row: far.row });
    expect([moved.col, moved.row]).toEqual([26, 21]);
  });
});

describe('overscan', () => {
  const small = { width: 960, height: 540 };

  test('without overscan every square of the picture counts', () => {
    const g = tableGrid(small, 38.97)!;
    expect([g.cols, g.rows]).toEqual([38, 21]);
    expect(g.visible).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });

  test('only the squares the TV shows count, the inch stays the same', () => {
    const g = tableGrid(small, 38.97, 5)!;
    expect([g.cols, g.rows]).toEqual([35, 19]);
    expect(g.ppi).toBe(tableGrid(small, 38.97)!.ppi);
    expect(g.visible.width / g.ppi).toBeCloseTo(35.07, 2);
    expect(g.window.x + g.window.width / 2).toBeCloseTo(480, 9);
    expect(g.window.x).toBeGreaterThanOrEqual(g.visible.x);
  });

  test('overscan is clamped', () => {
    expect(tableGrid(small, 34.5, 40)!.overscanPercent).toBe(MAX_OVERSCAN_PERCENT);
  });
});

describe('calibration pivot', () => {
  const g = tableGrid({ width: 960, height: 540 }, 34.5)!;

  test('corners sit inset from the screen edges, the centre in the middle', () => {
    const i = pivotInset(g);
    expect(i).toBeCloseTo(43.2, 9);
    expect(pivotPoint(g, 'bottomLeft')).toEqual({ x: i, y: 540 - i });
    expect(pivotPoint(g, 'topRight')).toEqual({ x: 960 - i, y: i });
    expect(pivotPoint(g, 'center')).toEqual({ x: 480, y: 270 });
  });

  test('the pivot does not move when the calibration changes', () => {
    const wider = tableGrid({ width: 960, height: 540 }, 36)!;
    for (const p of PIVOTS) expect(pivotPoint(wider, p)).toEqual(pivotPoint(g, p));
  });

  test('the bar runs into the screen and is 10 in where there is room', () => {
    expect(barRunsRight('bottomLeft')).toBe(true);
    expect(barRunsRight('topRight')).toBe(false);
    expect(barRunsRight('center')).toBe(true);
    for (const p of PIVOTS) expect(barInches(34.5, 34.5 * 540 / 960, p)).toBe(10);
    expect(barInches(15, (15 * 9) / 16, 'center')).toBe(7);
    expect(barInches(15, (15 * 9) / 16, 'bottomLeft')).toBe(10);
  });

  test('the pivot sits inside what the TV shows when it cuts edges off', () => {
    const cut = tableGrid({ width: 960, height: 540 }, 34.5, 5)!;
    expect(cut.visible).toEqual({ x: 48, y: 27, width: 864, height: 486 });
    const i = pivotInset(cut);
    expect(i).toBeCloseTo(0.08 * 486, 9);
    expect(pivotPoint(cut, 'bottomLeft')).toEqual({ x: 48 + i, y: 513 - i });
  });
});

describe('tvView (the derived TV camera)', () => {
  test('table mode: one inch per square, window centred on a small map', () => {
    const s = withGame(pictureMap('m', 20, 15));
    const view = tvView(s.table, active(s))!;
    expect(view.layout).not.toBeNull();
    expect(view.camera.zoom).toBeCloseTo(1920 / 34.5, 9);
    expect([view.camera.centerX, view.camera.centerY]).toEqual([10, 7.5]);
  });

  test('fit mode shows the whole map; free mode clamps the zoom', () => {
    const s = run(withGame(pictureMap('m', 100, 50)), { type: 'view.mode', mode: 'fit' });
    expect(tvView(s.table, active(s))!.camera.zoom).toBeCloseTo(Math.min(1920 / 100, 1080 / 50), 9);
    const free = run(s, { type: 'view.free', x: 10, y: 10, zoom: 100000 });
    expect(tvView(free.table, active(free))!.camera.zoom).toBeCloseTo((1920 / 34.5) * 4, 9);
  });

  test('no view before the TV reported a viewport', () => {
    const s = withGame();
    expect(tvView({ ...s.table, viewport: null }, active(s))).toBeNull();
  });
});
