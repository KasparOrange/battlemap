/// <reference types="bun" />
/**
 * Companion input: the gesture rules, the rate limiter and
 * the controller that ties them to tools, doors, the disc, the ruler and the players' window (camera maths and hit tests are the renderer's, tested there).
 */
import '../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { classicDisc, type Command, type Point } from '@battlemap/shared';
import { squaresToScreen } from '../../render/camera.ts';
import { GestureTracker, TOOL_SLOP_PX, type GestureHandler } from './gesture.ts';
import { MapInputController } from './map-input.ts';
import { throttle, type ThrottleClock } from './throttle.ts';
import { fakeContext, stateWithGame, testMap } from '../game/fake-context.ts';
import type { MapTool } from '../game/tabs.ts';

/** A handler that writes down what it was told. */
function recorder(dragOk = true): GestureHandler & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    press: () => log.push('press'),
    tap: () => log.push('tap'),
    dragStart: () => (log.push('dragStart'), dragOk),
    dragMove: () => log.push('dragMove'),
    dragEnd: () => log.push('dragEnd'),
    dragCancel: () => log.push('dragCancel'),
    cameraStart: (f) => log.push(`cameraStart${f.length}`),
    cameraMove: (f) => log.push(`cameraMove${f.length}`),
    cameraEnd: () => log.push('cameraEnd'),
  };
}

const P = (x: number, y: number): Point => ({ x, y });

describe('gesture rules', () => {
  test('a touch that moves less than the slop is a tap', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(100, 100));
    g.move(1, P(100 + TOOL_SLOP_PX - 1, 100));
    g.up(1);
    expect(h.log).toEqual(['press', 'tap']);
  });

  test('one finger past the slop is a tool drag, ended on release', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(0, 0));
    g.move(1, P(10, 0));
    g.move(1, P(20, 0));
    g.up(1);
    expect(h.log).toEqual(['press', 'dragStart', 'dragMove', 'dragEnd']);
  });

  test('a second finger before the slop makes it camera only — nothing paints', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(0, 0));
    g.down(2, P(50, 0));
    g.move(1, P(30, 0));
    g.move(2, P(90, 0));
    g.up(1);
    g.move(2, P(100, 0));
    g.up(2);
    expect(h.log).toEqual(['press', 'cameraStart2', 'cameraMove2', 'cameraMove2', 'cameraStart1', 'cameraMove1', 'cameraEnd']);
    expect(h.log).not.toContain('tap');
    expect(h.log).not.toContain('dragStart');
  });

  test('a second finger during a drag cancels the drag and hands over to the camera', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(0, 0));
    g.move(1, P(20, 0));
    g.down(2, P(80, 0));
    g.move(2, P(90, 0));
    g.up(2);
    g.up(1);
    expect(h.log).toEqual(['press', 'dragStart', 'dragCancel', 'cameraStart2', 'cameraMove2', 'cameraStart1', 'cameraEnd']);
  });

  test('a tool without a drag lets the finger pan', () => {
    const h = recorder(false);
    const g = new GestureTracker(h);
    g.down(1, P(0, 0));
    g.move(1, P(20, 0));
    g.move(1, P(30, 0));
    g.up(1);
    expect(h.log).toEqual(['press', 'dragStart', 'cameraStart1', 'cameraMove1', 'cameraEnd']);
  });

  test('a pan-only press (right button, space) never reaches the tool', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(0, 0), true);
    g.move(1, P(30, 0));
    g.up(1);
    expect(h.log).toEqual(['cameraStart1', 'cameraMove1', 'cameraEnd']);
  });

  test('a lost pointer ends the drag without a tap', () => {
    const h = recorder();
    const g = new GestureTracker(h);
    g.down(1, P(0, 0));
    g.move(1, P(20, 0));
    g.cancel(1);
    expect(h.log).toEqual(['press', 'dragStart', 'dragCancel']);
    expect(g.state).toBe('idle');
  });
});

describe('throttle', () => {
  function fakeClock(): ThrottleClock & { t: number; run(): void } {
    let pending: { fn: () => void; at: number } | null = null;
    const c = {
      t: 0,
      now: () => c.t,
      later: (fn: () => void, ms: number) => (pending = { fn, at: c.t + ms }),
      clear: () => (pending = null),
      run: () => {
        if (pending && pending.at <= c.t) {
          const p = pending;
          pending = null;
          p.fn();
        }
      },
    };
    return c;
  }

  test('sends at most once per interval, the newest value, and never loses the last one', () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const th = throttle(33, (v: number) => sent.push(v), clock);
    th.push(1);
    th.push(2);
    th.push(3);
    expect(sent).toEqual([1]);
    clock.t = 33;
    clock.run();
    expect(sent).toEqual([1, 3]);
    th.push(4);
    th.flush();
    expect(sent).toEqual([1, 3, 4]);
    th.push(5);
    th.cancel();
    clock.t = 200;
    clock.run();
    expect(sent).toEqual([1, 3, 4]);
  });
});

describe('map input controller', () => {
  function setup(tool: MapTool, doorCount = 0) {
    const ctx = fakeContext(stateWithGame(testMap(20, 15, doorCount)));
    const sent: Command[] = [];
    const c = new MapInputController({
      map: () => ctx.map,
      table: () => ctx.state.table,
      view: () => ctx.view,
      tool: () => tool,
      doors: () => true,
      dispatch: (cmd) => (sent.push(cmd), ctx.dispatch(cmd)),
      log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    });
    /** Screen point of a map point (camera: centre 10, 7.5, 40 px per square). */
    const at = (x: number, y: number) => squaresToScreen(ctx.camera.get()!, ctx.view.viewport(), P(x, y));
    return { ctx, c, sent, at };
  }

  test('a tap on a door toggles it, and the tool never hears of it', () => {
    const taps: Point[] = [];
    const { ctx, c, sent, at } = setup({ tap: (p) => taps.push(p) }, 1);
    ctx.setGeometry({ walls: [], lights: [], doors: [{ a: P(5, 5), b: P(6, 5) }] });
    c.tracker.down(1, at(5.5, 5.05));
    c.tracker.up(1);
    expect(sent).toEqual([{ type: 'door.set', index: 0, open: true }]);
    expect(taps).toEqual([]);
    expect(ctx.map.doorsOpen).toEqual([0]);
  });

  test('a tap elsewhere goes to the tool in squares', () => {
    const taps: Point[] = [];
    const { c, at } = setup({ tap: (p) => taps.push(p) });
    c.tracker.down(1, at(3.5, 4.25));
    c.tracker.up(1);
    expect(taps[0]!.x).toBeCloseTo(3.5, 9);
    expect(taps[0]!.y).toBeCloseTo(4.25, 9);
  });

  test('dragging the disc moves it in every tab (the tool is not asked)', () => {
    let begun = false;
    const { ctx, c, sent, at } = setup({ begin: () => ((begun = true), null) });
    ctx.dispatch({ type: 'disc.set', disc: { ...classicDisc(), visible: true, x: 10, y: 7, snap: 'none' } });
    c.tracker.down(1, at(10, 7));
    c.tracker.move(1, at(11, 7));
    c.tracker.move(1, at(12, 8));
    c.tracker.up(1, at(12, 8));
    expect(begun).toBe(false);
    const last = sent.filter((s) => s.type === 'disc.set').at(-1) as Extract<Command, { type: 'disc.set' }>;
    expect(last.disc.x).toBeCloseTo(12, 6);
    expect(last.disc.y).toBeCloseTo(8, 6);
  });

  test('two fingers pinch the camera; no tool, no command', () => {
    const { ctx, c, sent, at } = setup({ tap: () => { throw new Error('no tap'); }, begin: () => { throw new Error('no drag'); } });
    const z0 = ctx.camera.get()!.zoom;
    c.tracker.down(1, at(8, 7));
    c.tracker.down(2, at(12, 7));
    c.tracker.move(2, at(16, 7));
    c.tracker.up(1);
    c.tracker.up(2);
    expect(ctx.camera.get()!.zoom).toBeCloseTo(z0 * 2, 6);
    expect(sent).toEqual([]);
  });

  test("dragging the players' window moves it in whole squares, the last position always sent", () => {
    const ctx = fakeContext(stateWithGame(testMap(60, 40)));
    ctx.setState({ ...ctx.state, table: { ...ctx.state.table, viewport: { width: 1920, height: 1080 } } });
    const sent: Command[] = [];
    const view = { ...ctx.view, hits: () => [{ kind: 'frame' as const }] };
    const c = new MapInputController({
      map: () => ctx.map, table: () => ctx.state.table, view: () => view, tool: () => ({}), doors: () => true,
      dispatch: (cmd) => (sent.push(cmd), ctx.dispatch(cmd)), log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    });
    const at = (x: number, y: number) => squaresToScreen(ctx.camera.get()!, ctx.view.viewport(), P(x, y));
    c.tracker.down(1, at(10, 7));
    c.tracker.move(1, at(11, 7));
    c.tracker.move(1, at(13.4, 8.6));
    c.tracker.up(1, at(13.4, 8.6));
    const last = sent.at(-1) as Extract<Command, { type: 'view.window' }>;
    expect(last.type).toBe('view.window');
    expect(ctx.map.view.col).toBe(last.col);
    expect(Number.isInteger(last.col) && Number.isInteger(last.row)).toBe(true);
  });
});
