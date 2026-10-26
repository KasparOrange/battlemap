/**
 * The gesture rules of the companion's map (architecture.md "input", parity CV-01/02, lesson L2):
 * a gesture lasts from the first finger down to the last finger up.
 *
 * - One finger: after {@link TOOL_SLOP_PX} of travel it is a tool drag; released before that, a tap.
 * - A second finger **before** that → the whole gesture is camera only (pinch + pan); nothing paints.
 * - A second finger **after** → the tool drag is cancelled (what it already did stays, one undo
 *   step) and the camera takes over until every finger is up.
 * - A tool that has no drag at that spot (`dragStart` returns false) lets the finger pan the view.
 * - `panOnly` presses (right mouse button, space held) are camera from the start.
 * - One finger held still for {@link HOLD_MS} is a **long press** (the second action, design.md
 *   "touch"): the handler's `hold` decides whether it takes it (a DM note, `docs/features.md`
 *   "table moments"); taken, the rest of the gesture does nothing — no tap, no drag. Not taken,
 *   the press goes on as if nothing happened.
 *
 * Plain TypeScript with no DOM: the map's pointer events are fed in, the decisions come out
 * through a {@link GestureHandler}. Tested under `bun test`.
 */
import type { Point } from '@battlemap/shared';

/** One-finger travel (CSS px) after which a touch is a drag, not a tap. */
export const TOOL_SLOP_PX = 8;

/** How long one finger stays still before it is a long press, ms (a little past the kit's 420 ms hold fill). */
export const HOLD_MS = 550;

/** The clock the tracker waits for a long press with (tests pass their own). */
export interface HoldTimers {
  /** Calls `fn` after `ms`; returns a handle for {@link HoldTimers.clear}. */
  set(fn: () => void, ms: number): unknown;
  /** Cancels a pending call. */
  clear(handle: unknown): void;
}

/** The page's own timers. */
const PAGE_TIMERS: HoldTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** What the tracker decides, in screen (CSS) px. */
export interface GestureHandler {
  /** The first finger went down (hit tests happen here). */
  press(at: Point): void;
  /** A tap at the first finger's spot. */
  tap(at: Point): void;
  /**
   * A one-finger drag starts.
   *
   * @returns false when the tool has nothing to drag here — the finger then pans the camera
   */
  dragStart(from: Point, at: Point): boolean;
  /** The dragging finger moved. */
  dragMove(at: Point): void;
  /** The dragging finger came up. */
  dragEnd(at: Point): void;
  /** The drag was cut short (second finger, lost pointer). */
  dragCancel(): void;
  /** The camera takes over with these fingers (one or two). */
  cameraStart(fingers: Point[]): void;
  /** The camera's fingers moved (same order as at the start; restarted when the count changes). */
  cameraMove(fingers: Point[]): void;
  /** Every finger is up after a camera gesture. */
  cameraEnd(): void;
  /**
   * One finger stayed still for {@link HOLD_MS} (optional).
   *
   * @returns true when the handler took the long press — the gesture then ends without a tap
   */
  hold?(at: Point): boolean;
}

type Phase = 'idle' | 'pending' | 'tool' | 'camera' | 'held';

/** Tracks the pointers on the map and turns them into tool and camera gestures. */
export class GestureTracker {
  private phase: Phase = 'idle';
  private readonly pointers = new Map<number, Point>();
  private start: Point = { x: 0, y: 0 };
  private first = -1;
  private holdTimer: unknown = null;

  /**
   * @param handler - receives the decisions
   * @param timers - the clock for long presses (default the page's timers)
   */
  constructor(
    private readonly handler: GestureHandler,
    private readonly timers: HoldTimers = PAGE_TIMERS,
  ) {}

  /** The current phase (for tests and logs). */
  get state(): Phase {
    return this.phase;
  }

  /**
   * A pointer went down.
   *
   * @param id - the pointer's id
   * @param at - where, in CSS px of the map view
   * @param panOnly - this press pans the view whatever the tab (right button, space)
   */
  down(id: number, at: Point, panOnly = false): void {
    this.pointers.set(id, at);
    switch (this.phase) {
      case 'idle':
        this.first = id;
        this.start = at;
        if (panOnly) {
          this.toCamera();
          return;
        }
        this.phase = 'pending';
        this.handler.press(at);
        this.armHold();
        return;
      case 'pending':
        this.disarmHold();
        this.toCamera();
        return;
      case 'tool':
        this.handler.dragCancel();
        this.toCamera();
        return;
      case 'camera':
        this.handler.cameraStart(this.fingers()); // restart with the new set of fingers
        return;
      case 'held':
        return; // the long press took the gesture: more fingers change nothing
    }
  }

  /**
   * A pointer moved.
   *
   * @param id - the pointer's id
   * @param at - where, in CSS px of the map view
   */
  move(id: number, at: Point): void {
    if (!this.pointers.has(id)) return;
    this.pointers.set(id, at);
    switch (this.phase) {
      case 'pending': {
        if (id !== this.first) return;
        if (Math.hypot(at.x - this.start.x, at.y - this.start.y) < TOOL_SLOP_PX) return;
        this.disarmHold();
        if (this.handler.dragStart(this.start, at)) this.phase = 'tool';
        else this.toCamera();
        return;
      }
      case 'tool':
        if (id !== this.first) return;
        this.handler.dragMove(at);
        return;
      case 'camera':
        this.handler.cameraMove(this.fingers());
        return;
      default:
        return;
    }
  }

  /**
   * A pointer came up.
   *
   * @param id - the pointer's id
   * @param at - where, in CSS px (the last known spot when omitted)
   */
  up(id: number, at?: Point): void {
    if (!this.pointers.has(id)) return;
    const where = at ?? this.pointers.get(id)!;
    this.pointers.delete(id);
    switch (this.phase) {
      case 'pending':
        this.disarmHold();
        this.phase = 'idle';
        this.handler.tap(this.start);
        return;
      case 'held':
        if (this.pointers.size === 0) this.phase = 'idle';
        return;
      case 'tool':
        this.phase = 'idle';
        this.handler.dragEnd(where);
        return;
      case 'camera':
        if (this.pointers.size === 0) {
          this.phase = 'idle';
          this.handler.cameraEnd();
        } else {
          this.handler.cameraStart(this.fingers()); // carry on with the fingers left
        }
        return;
      default:
        return;
    }
  }

  /**
   * A pointer was lost (the system took it: a scroll, an alert).
   *
   * @param id - the pointer's id
   */
  cancel(id: number): void {
    if (!this.pointers.has(id)) return;
    this.pointers.delete(id);
    this.disarmHold();
    if (this.phase === 'held') {
      if (this.pointers.size === 0) this.phase = 'idle';
      return;
    }
    if (this.phase === 'tool') this.handler.dragCancel();
    if (this.phase === 'camera' && this.pointers.size > 0) {
      this.handler.cameraStart(this.fingers());
      return;
    }
    if (this.phase === 'camera') this.handler.cameraEnd();
    if (this.pointers.size === 0) this.phase = 'idle';
    else if (this.phase !== 'camera') this.toCamera();
  }

  /** Starts waiting for a long press (only when the handler wants them). */
  private armHold(): void {
    this.disarmHold();
    if (!this.handler.hold) return;
    this.holdTimer = this.timers.set(() => {
      this.holdTimer = null;
      if (this.phase !== 'pending' || this.pointers.size !== 1) return;
      if (this.handler.hold?.(this.start)) this.phase = 'held';
    }, HOLD_MS);
  }

  /** Stops waiting for a long press. */
  private disarmHold(): void {
    if (this.holdTimer === null) return;
    this.timers.clear(this.holdTimer);
    this.holdTimer = null;
  }

  private toCamera(): void {
    this.phase = 'camera';
    this.handler.cameraStart(this.fingers());
  }

  /** At most two fingers, in the order they went down. */
  private fingers(): Point[] {
    return [...this.pointers.values()].slice(0, 2);
  }
}
