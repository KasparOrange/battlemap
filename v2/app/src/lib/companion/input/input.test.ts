/// <reference types="bun" />
/**
 * Companion input: the gesture rules, the DM camera maths, hit priority, the rate limiter and
 * the controller that ties them to tools, doors, the disc and the ruler.
 */
import '../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import { classicDisc, type Command, type Point } from '@battlemap/shared';
import { clampCamera, fitCamera, panBy, pinchCamera, toScreen, toSquares, zoomAt } from './camera.ts';
import { GestureTracker, TOOL_SLOP_PX, type GestureHandler } from './gesture.ts';
import { discHit, doorAt, hitAt, rulerHit, tokenAt } from './hits.ts';
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

describe('DM camera', () => {
  const vp = { width: 800, height: 600 };

  test('screen and squares round-trip at every quarter turn', () => {
    for (const quarterTurns of [0, 1, 2, 3]) {
      const cam = { centerX: 12, centerY: 7, zoom: 30, quarterTurns };
      const s = toScreen(cam, vp, P(14.5, 3.25));
      const back = toSquares(cam, vp, s);
      expect(back.x).toBeCloseTo(14.5, 9);
      expect(back.y).toBeCloseTo(3.25, 9);
    }
    expect(toScreen({ centerX: 10, centerY: 5, zoom: 20, quarterTurns: 0 }, vp, P(10, 5))).toEqual(P(400, 300));
  });

  test('fit shows the whole map, centred', () => {
    const cam = fitCamera(40, 20, vp);
    expect(cam.centerX).toBe(20);
    expect(cam.centerY).toBe(10);
    const tl = toScreen(cam, vp, P(0, 0));
    const br = toScreen(cam, vp, P(40, 20));
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(800);
    expect(br.y - tl.y).toBeLessThanOrEqual(600);
  });

  test('wheel zoom keeps the point under the cursor', () => {
    const cam = { centerX: 10, centerY: 10, zoom: 20, quarterTurns: 0 };
    const at = P(650, 120);
    const before = toSquares(cam, vp, at);
    const after = toSquares(zoomAt(cam, vp, at, 1.15), vp, at);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  test('a pinch scales with the fingers and keeps the map under their midpoint', () => {
    const start = { centerX: 10, centerY: 10, zoom: 20, quarterTurns: 0 };
    const a0 = P(300, 300), b0 = P(500, 300);
    const anchor = toSquares(start, vp, P(400, 300));
    const cam = pinchCamera(start, vp, a0, b0, P(250, 350), P(650, 350));
    expect(cam.zoom).toBeCloseTo(40, 9);
    const under = toSquares(cam, vp, P(450, 350));
    expect(under.x).toBeCloseTo(anchor.x, 9);
    expect(under.y).toBeCloseTo(anchor.y, 9);
  });

  test('pan follows the finger; clamps keep the zoom and centre sane', () => {
    const cam = panBy({ centerX: 10, centerY: 10, zoom: 20, quarterTurns: 0 }, 40, -20);
    expect(cam.centerX).toBeCloseTo(8, 9);
    expect(cam.centerY).toBeCloseTo(11, 9);
    const wild = clampCamera({ centerX: -50, centerY: 99, zoom: 0.01, quarterTurns: 0 }, 40, 20, vp);
    expect(wild.centerX).toBe(0);
    expect(wild.centerY).toBe(20);
    expect(wild.zoom).toBeGreaterThan(0.01);
  });
});

describe('hits', () => {
  test('token under a point; the newest wins; waiting tokens are never hit', () => {
    const t = (id: string, col: number, row: number, placed = true) => ({ id, label: id, name: '', color: '#ffffff', col, row, placed, hidden: false });
    const tokens = [t('a', 2, 3), t('b', 2, 3), t('c', 5, 5, false)];
    expect(tokenAt(tokens, P(2.9, 3.1))?.id).toBe('b');
    expect(tokenAt(tokens, P(5.5, 5.5))).toBeNull();
  });

  test('doors within reach, the nearest wins', () => {
    const geometry = { walls: [], lights: [], doors: [{ a: P(3, 2), b: P(3, 3) }, { a: P(4, 2), b: P(4, 3) }] };
    expect(doorAt(geometry, P(3.2, 2.5), 0.4)).toBe(0);
    expect(doorAt(geometry, P(3.7, 2.5), 0.4)).toBe(1);
    expect(doorAt(geometry, P(3.5, 6), 0.4)).toBeNull();
    expect(doorAt(null, P(3, 2.5), 1)).toBeNull();
  });

  test('disc knob before disc before ruler before token before door', () => {
    const state = stateWithGame(testMap(30, 30, 1));
    const map0 = state.game!.maps.map1!;
    const disc = { ...classicDisc(), visible: true, x: 10, y: 10, rotation: 0 };
    const map = {
      ...map0,
      disc,
      ruler: { visible: true, x: 20, y: 20, rotation: 0 as const },
      tokens: [{ id: 't', label: '1', name: '', color: '#ffffff', col: 25, row: 5, placed: true, hidden: false }],
    };
    const geometry = { walls: [], lights: [], doors: [{ a: P(25, 5), b: P(26, 5) }] };
    const opts = { tokens: true, doors: true };
    expect(discHit(disc, P(10, 10), 0.5)).toBe('body');
    expect(hitAt(map, geometry, P(10, 10), 0.5, opts)).toEqual({ kind: 'disc' });
    expect(rulerHit(map.ruler, P(25, 20.2), 0.3)).toBe(true);
    expect(hitAt(map, geometry, P(22, 20), 0.5, opts)).toEqual({ kind: 'ruler' });
    expect(hitAt(map, geometry, P(25.5, 5.1), 0.5, opts)?.kind).toBe('token');
    expect(hitAt(map, geometry, P(25.5, 5.1), 0.5, { tokens: false, doors: true })).toEqual({ kind: 'door', index: 0 });
    expect(hitAt(map, geometry, P(2, 28), 0.5, opts)).toBeNull();
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
    const vp = { width: 800, height: 600 };
    const c = new MapInputController({
      map: () => ctx.map,
      geometry: () => ctx.geometry,
      camera: () => ctx.camera.get(),
      setCamera: (cam) => ctx.camera.set(cam),
      viewport: () => vp,
      tool: () => tool,
      doors: () => true,
      dispatch: (cmd) => (sent.push(cmd), ctx.dispatch(cmd)),
      log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    });
    /** Screen point of a map point (camera: centre 10, 7.5, 40 px per square). */
    const at = (x: number, y: number) => toScreen(ctx.camera.get(), vp, P(x, y));
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
    const z0 = ctx.camera.get().zoom;
    c.tracker.down(1, at(8, 7));
    c.tracker.down(2, at(12, 7));
    c.tracker.move(2, at(16, 7));
    c.tracker.up(1);
    c.tracker.up(2);
    expect(ctx.camera.get().zoom).toBeCloseTo(z0 * 2, 6);
    expect(sent).toEqual([]);
  });
});
