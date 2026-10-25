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
 *
 * Plain TypeScript with no DOM: the map's pointer events are fed in, the decisions come out
 * through a {@link GestureHandler}. Tested under `bun test`.
 */
import type { Point } from '@battlemap/shared';

/** One-finger travel (CSS px) after which a touch is a drag, not a tap. */
export const TOOL_SLOP_PX = 8;

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
}

type Phase = 'idle' | 'pending' | 'tool' | 'camera';

/** Tracks the pointers on the map and turns them into tool and camera gestures. */
export class GestureTracker {
  private phase: Phase = 'idle';
  private readonly pointers = new Map<number, Point>();
  private start: Point = { x: 0, y: 0 };
  private first = -1;

  /** @param handler - receives the decisions */
  constructor(private readonly handler: GestureHandler) {}

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
        return;
      case 'pending':
        this.toCamera();
        return;
      case 'tool':
        this.handler.dragCancel();
        this.toCamera();
        return;
      case 'camera':
        this.handler.cameraStart(this.fingers()); // restart with the new set of fingers
        return;
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
        this.phase = 'idle';
        this.handler.tap(this.start);
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
    if (this.phase === 'tool') this.handler.dragCancel();
    if (this.phase === 'camera' && this.pointers.size > 0) {
      this.handler.cameraStart(this.fingers());
      return;
    }
    if (this.phase === 'camera') this.handler.cameraEnd();
    if (this.pointers.size === 0) this.phase = 'idle';
    else if (this.phase !== 'camera') this.toCamera();
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
