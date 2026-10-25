/**
 * The companion map's input: turns the gesture tracker's decisions into camera moves, disc and
 * ruler drags, door taps and the chosen tab's tool (architecture.md "input"). The decision part
 * ({@link MapInputController}) has no DOM and is tested under `bun test`; {@link bindPointers}
 * wires a real element's Pointer Events, the wheel and the space key to it.
 */
import { snapDiscPoint, type Camera, type Command, type MapGeometry, type MapPlay, type Point, type Ruler, type TemplateDisc } from '@battlemap/shared';
import type { Logger } from '../../log.ts';
import type { MapTool, ToolDrag } from '../game/tabs.ts';
import { panBy, pinchCamera, toSquares, zoomAt, type Viewport } from './camera.ts';
import { GestureTracker, type GestureHandler } from './gesture.ts';
import { doorAt, hitAt, TOUCH_SLOP_PX } from './hits.ts';
import { LIVE_PER_SECOND, throttle, type Throttle } from './throttle.ts';

/** What the controller needs from the game screen (all read fresh on every event). */
export interface MapInputDeps {
  /** The map on the table, or null without a game. */
  map(): MapPlay | null;
  /** Its walls and doors. */
  geometry(): MapGeometry | null;
  /** The DM camera. */
  camera(): Camera;
  /** Moves the DM camera (the deps clamp it). */
  setCamera(c: Camera): void;
  /** The view's size in CSS px. */
  viewport(): Viewport;
  /** The chosen tab's tool. */
  tool(): MapTool;
  /** Whether door taps work in the chosen tab. */
  doors(): boolean;
  /** Sends a command. */
  dispatch(cmd: Command): boolean;
  /** The logger. */
  log: Logger;
}

/** What the current press is aimed at. */
type Target =
  | { kind: 'disc'; disc: TemplateDisc; from: Point }
  | { kind: 'discKnob'; disc: TemplateDisc }
  | { kind: 'ruler'; ruler: Ruler; from: Point }
  | { kind: 'door'; index: number }
  | { kind: 'tool'; claimed: boolean };

/** Decides what each gesture does. */
export class MapInputController implements GestureHandler {
  /** The pointer tracker feeding this controller. */
  readonly tracker: GestureTracker;
  private target: Target = { kind: 'tool', claimed: false };
  private drag: ToolDrag | null = null;
  private live: Throttle<Command> | null = null;
  private camStart: Camera | null = null;
  private fingers0: Point[] = [];

  /** @param deps - the game screen's hooks */
  constructor(private readonly deps: MapInputDeps) {
    this.tracker = new GestureTracker(this);
  }

  /** A screen point in squares. */
  private sq(at: Point): Point {
    return toSquares(this.deps.camera(), this.deps.viewport(), at);
  }

  /** Touch slop in squares at the current zoom. */
  private reach(): number {
    return TOUCH_SLOP_PX / this.deps.camera().zoom;
  }

  /** @inheritdoc */
  press(at: Point): void {
    const map = this.deps.map();
    this.target = { kind: 'tool', claimed: false };
    if (!map) return;
    const p = this.sq(at);
    const hit = hitAt(map, null, p, this.reach(), { tokens: false, doors: false });
    if (hit?.kind === 'discKnob') this.target = { kind: 'discKnob', disc: map.disc };
    else if (hit?.kind === 'disc') this.target = { kind: 'disc', disc: map.disc, from: p };
    else if (hit?.kind === 'ruler') this.target = { kind: 'ruler', ruler: map.ruler, from: p };
    else if (this.deps.tool().claims?.(p)) this.target = { kind: 'tool', claimed: true };
    else if (this.deps.doors()) {
      const door = doorAt(this.deps.geometry(), p, Math.max(this.reach(), 0.35));
      if (door !== null && door < map.info.doorCount) this.target = { kind: 'door', index: door };
    }
  }

  /** @inheritdoc */
  tap(at: Point): void {
    const map = this.deps.map();
    if (!map) return;
    const t = this.target;
    if (t.kind === 'door') {
      const open = !map.doorsOpen.includes(t.index);
      this.deps.log.info('companion', 'Door tapped', { index: t.index, open });
      this.deps.dispatch({ type: 'door.set', index: t.index, open });
      return;
    }
    if (t.kind === 'tool') this.deps.tool().tap?.(this.sq(at));
  }

  /** @inheritdoc */
  dragStart(from: Point, at: Point): boolean {
    const t = this.target;
    const send = (cmd: Command) => this.deps.dispatch(cmd);
    switch (t.kind) {
      case 'disc':
      case 'discKnob':
      case 'ruler':
        this.live = throttle(1000 / LIVE_PER_SECOND, send);
        this.dragMove(at);
        return true;
      case 'door':
      case 'tool': {
        const drag = this.deps.tool().begin?.(this.sq(from), this.sq(at)) ?? null;
        this.drag = drag;
        return drag !== null;
      }
    }
  }

  /** @inheritdoc */
  dragMove(at: Point): void {
    const t = this.target;
    const p = this.sq(at);
    if (t.kind === 'disc') {
      const moved = snapDiscPoint(t.disc, { x: t.disc.x + p.x - t.from.x, y: t.disc.y + p.y - t.from.y });
      this.live?.push({ type: 'disc.set', disc: { ...t.disc, x: moved.x, y: moved.y } });
    } else if (t.kind === 'discKnob') {
      // the knob sits at local (−r, 0): the disc's rotation points from the knob through the centre
      const rotation = (Math.atan2(p.y - t.disc.y, p.x - t.disc.x) * 180) / Math.PI + 180;
      this.live?.push({ type: 'disc.set', disc: { ...t.disc, rotation: ((rotation % 360) + 360) % 360 } });
    } else if (t.kind === 'ruler') {
      this.live?.push({ type: 'ruler.set', ruler: { ...t.ruler, x: t.ruler.x + p.x - t.from.x, y: t.ruler.y + p.y - t.from.y } });
    } else {
      this.drag?.move(p);
    }
  }

  /** @inheritdoc */
  dragEnd(at: Point): void {
    if (this.live) {
      this.dragMove(at);
      this.live.flush();
      this.live = null;
      return;
    }
    this.drag?.end(this.sq(at));
    this.drag = null;
  }

  /** @inheritdoc */
  dragCancel(): void {
    if (this.live) {
      this.live.flush(); // the disc / ruler stays where it got to
      this.live = null;
    }
    this.drag?.cancel();
    this.drag = null;
  }

  /** @inheritdoc */
  cameraStart(fingers: Point[]): void {
    this.camStart = this.deps.camera();
    this.fingers0 = fingers;
  }

  /** @inheritdoc */
  cameraMove(fingers: Point[]): void {
    const start = this.camStart;
    if (!start || fingers.length === 0 || fingers.length !== this.fingers0.length) return;
    const vp = this.deps.viewport();
    const next = fingers.length >= 2
      ? pinchCamera(start, vp, this.fingers0[0]!, this.fingers0[1]!, fingers[0]!, fingers[1]!)
      : panBy(start, fingers[0]!.x - this.fingers0[0]!.x, fingers[0]!.y - this.fingers0[0]!.y);
    this.deps.setCamera(next);
  }

  /** @inheritdoc */
  cameraEnd(): void {
    this.camStart = null;
    this.fingers0 = [];
  }

  /**
   * The wheel (desk): zooms at the cursor, ×1.15 per notch.
   *
   * @param at - the cursor in CSS px
   * @param deltaY - the wheel's delta (negative = zoom in)
   */
  wheel(at: Point, deltaY: number): void {
    const factor = Math.pow(1.15, -Math.sign(deltaY) * Math.min(3, Math.abs(deltaY) / 100 || 1));
    this.deps.setCamera(zoomAt(this.deps.camera(), this.deps.viewport(), at, factor));
  }
}

/**
 * Wires an element's pointers, wheel and the space key to a controller.
 *
 * @param el - the map view (gets `touch-action: none`)
 * @param controller - decides what the gestures do
 * @returns a function that unbinds everything
 */
export function bindPointers(el: HTMLElement, controller: MapInputController): () => void {
  const tracker = controller.tracker;
  let space = false;
  el.style.touchAction = 'none';
  const local = (e: PointerEvent | WheelEvent): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    el.setPointerCapture?.(e.pointerId);
    tracker.down(e.pointerId, local(e), e.button === 2 || space);
    e.preventDefault();
  };
  const move = (e: PointerEvent) => tracker.move(e.pointerId, local(e));
  const up = (e: PointerEvent) => tracker.up(e.pointerId, local(e));
  const cancel = (e: PointerEvent) => tracker.cancel(e.pointerId);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    controller.wheel(local(e), e.deltaY);
  };
  const menu = (e: Event) => e.preventDefault();
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) space = e.type === 'keydown';
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', menu);
  addEventListener('keydown', key);
  addEventListener('keyup', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', cancel);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', menu);
    removeEventListener('keydown', key);
    removeEventListener('keyup', key);
  };
}
