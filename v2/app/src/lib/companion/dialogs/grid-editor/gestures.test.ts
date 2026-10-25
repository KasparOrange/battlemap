/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { wholeGrid, type Point, type RasterGrid } from '@battlemap/shared';
import type { EditorTool, EditorView } from './editor-logic.ts';
import { EditorGestures, sameGrid, type GestureHost } from './gestures.ts';

/** A host whose state is plain fields, with the steps it settled. */
function host(tool: EditorTool) {
  const h = {
    tool, grid: wholeGrid(10, 10, 100, 100), view: { scale: 1, ox: 0, oy: 0 } as EditorView, square: true,
    markA: null as Point | null, markB: null as Point | null, magnifier: null as { at: Point; pic: Point } | null,
    steps: [] as RasterGrid[], hints: [] as string[],
    preview(g: RasterGrid) { h.grid = g; },
    settle(before: RasterGrid) { h.steps.push(h.grid); void before; },
    hint(t: string) { h.hints.push(t); },
  };
  return h satisfies GestureHost;
}

describe('grid editor gestures', () => {
  test('Move slides the grid by the drag and settles one step', () => {
    const h = host('move');
    const g = new EditorGestures(h);
    g.down(1, { x: 10, y: 10 }, 0);
    g.move(1, { x: 20, y: 15 });
    expect(h.grid.x).toBeCloseTo(10);
    expect(h.grid.y).toBeCloseTo(5);
    expect(h.magnifier).not.toBeNull();
    g.up(1);
    expect(h.steps).toHaveLength(1);
    expect(h.magnifier).toBeNull();
  });

  test('a second finger takes back the edit and pans the view', () => {
    const h = host('move');
    const start = h.grid;
    const g = new EditorGestures(h);
    g.down(1, { x: 10, y: 10 }, 0);
    g.move(1, { x: 30, y: 10 });
    g.down(2, { x: 50, y: 10 }, 0);
    expect(sameGrid(h.grid, start)).toBe(true);
    g.move(1, { x: 40, y: 10 });
    g.move(2, { x: 60, y: 10 });
    expect(h.view.ox).toBeCloseTo(10);
    g.up(1);
    g.up(2);
    expect(h.steps).toHaveLength(0);
  });

  test('taps place two marks, a third starts over', () => {
    const h = host('corners');
    const g = new EditorGestures(h);
    const tap = (x: number, y: number) => {
      g.down(1, { x, y }, 0);
      g.up(1);
    };
    tap(10, 10);
    tap(90, 90);
    expect(h.markA).toEqual({ x: 10, y: 10 });
    expect(h.markB).toEqual({ x: 90, y: 90 });
    tap(50, 50);
    expect(h.markA).toEqual({ x: 50, y: 50 });
    expect(h.markB).toBeNull();
  });

  test('Length drags a line; Look only moves the view', () => {
    const h = host('length');
    const g = new EditorGestures(h);
    g.down(1, { x: 0, y: 0 }, 0);
    g.move(1, { x: 50, y: 0 });
    g.up(1);
    expect(h.markA).toEqual({ x: 0, y: 0 });
    expect(h.markB).toEqual({ x: 50, y: 0 });
    const l = host('look');
    const gl = new EditorGestures(l);
    gl.down(1, { x: 0, y: 0 }, 0);
    gl.move(1, { x: 20, y: 0 });
    gl.up(1);
    expect(l.view.ox).toBe(20);
    expect(l.steps).toHaveLength(0);
  });
});
