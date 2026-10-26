/// <reference types="bun" />
/**
 * The long press on the companion's map (`gesture.ts` HOLD_MS, `map-input.ts` hold): a still
 * finger becomes a long press only when the handler takes it; moving, a second finger or
 * lifting first cancel it; taken, the gesture neither taps nor drags; the controller hands it
 * on in squares but never from the disc, the ruler or a door.
 */
import '../runes-shim.ts';
import { describe, expect, test } from 'bun:test';
import type { Point } from '@battlemap/shared';
import { GestureTracker, HOLD_MS, TOOL_SLOP_PX, type GestureHandler, type HoldTimers } from './gesture.ts';

/** Timers the test fires by hand. */
function manualTimers(): HoldTimers & { fire(): void; pending(): number } {
  const due = new Map<number, () => void>();
  let next = 1;
  return {
    set: (fn, ms) => {
      expect(ms).toBe(HOLD_MS);
      due.set(next, fn);
      return next++;
    },
    clear: (h) => void due.delete(h as number),
    fire: () => {
      const fns = [...due.values()];
      due.clear();
      for (const fn of fns) fn();
    },
    pending: () => due.size,
  };
}

/** A handler that writes down what it was told; `take` says whether it takes long presses. */
function recorder(take: boolean): GestureHandler & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    press: () => log.push('press'),
    tap: () => log.push('tap'),
    dragStart: () => (log.push('dragStart'), true),
    dragMove: () => log.push('dragMove'),
    dragEnd: () => log.push('dragEnd'),
    dragCancel: () => log.push('dragCancel'),
    cameraStart: (f) => log.push(`cameraStart${f.length}`),
    cameraMove: (f) => log.push(`cameraMove${f.length}`),
    cameraEnd: () => log.push('cameraEnd'),
    hold: (at: Point) => (log.push(`hold ${at.x},${at.y}`), take),
  };
}

const P = (x: number, y: number): Point => ({ x, y });

describe('long press', () => {
  test('a still finger: hold at the press point; taken, the rest of the gesture does nothing', () => {
    const t = manualTimers();
    const h = recorder(true);
    const g = new GestureTracker(h, t);
    g.down(1, P(40, 50));
    g.move(1, P(42, 50)); // inside the slop: still a press
    t.fire();
    g.move(1, P(90, 50)); // a move after the hold drags nothing
    g.down(2, P(10, 10)); // nor does a second finger
    g.up(2);
    g.up(1);
    expect(h.log).toEqual(['press', 'hold 40,50']);
    expect(g.state).toBe('idle');
  });

  test('not taken: the press goes on — a tap, or a drag', () => {
    const t = manualTimers();
    const h = recorder(false);
    const g = new GestureTracker(h, t);
    g.down(1, P(0, 0));
    t.fire();
    g.up(1);
    g.down(1, P(0, 0));
    t.fire();
    g.move(1, P(TOOL_SLOP_PX + 2, 0));
    g.up(1);
    expect(h.log).toEqual(['press', 'hold 0,0', 'tap', 'press', 'hold 0,0', 'dragStart', 'dragEnd']);
  });

  test('moving, a second finger, lifting or a lost pointer before the time cancel it', () => {
    const t = manualTimers();
    const h = recorder(true);
    const g = new GestureTracker(h, t);
    g.down(1, P(0, 0));
    g.move(1, P(TOOL_SLOP_PX + 1, 0));
    expect(t.pending()).toBe(0);
    g.up(1);
    g.down(1, P(0, 0));
    g.down(2, P(50, 0));
    expect(t.pending()).toBe(0);
    g.up(1);
    g.up(2);
    g.down(1, P(0, 0));
    g.up(1);
    expect(t.pending()).toBe(0);
    g.down(1, P(0, 0));
    g.cancel(1);
    expect(t.pending()).toBe(0);
    expect(h.log.some((l) => l.startsWith('hold'))).toBe(false);
  });

  test('a handler without hold never arms a timer', () => {
    const t = manualTimers();
    const h = recorder(true);
    delete h.hold;
    const g = new GestureTracker(h, t);
    g.down(1, P(0, 0));
    expect(t.pending()).toBe(0);
    g.up(1);
    expect(h.log).toEqual(['press', 'tap']);
  });
});
