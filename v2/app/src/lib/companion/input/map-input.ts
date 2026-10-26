/**
 * The companion map's input: turns the gesture tracker's decisions into camera moves, disc,
 * ruler and players'-window drags, door taps and the chosen tab's tool (architecture.md
 * "input"). The camera and the hit tests are the table view's (`render/`, rv#8, rv#32): this
 * file keeps neither — it asks the view what is under a finger and hands it the next camera.
 * The decision part ({@link MapInputController}) has no DOM and is tested under `bun test`;
 * {@link bindPointers} wires a real element's Pointer Events, the wheel and the space key to it.
 */
import { snapDiscPoint, tvView, type Camera, type Command, type MapPlay, type Point, type Ruler, type TableState, type TemplateDisc } from '@battlemap/shared';
import type { Logger } from '../../log.ts';
import { pinchCamera } from '../../render/camera.ts';
import type { TableView } from '../../render/types.ts';
import type { MapTool, ToolDrag } from '../game/tabs.ts';
import { GestureTracker, type GestureHandler, type HoldTimers } from './gesture.ts';
import { LIVE_PER_SECOND, throttle, type Throttle } from './throttle.ts';

/** How often a players'-window drag sends, in ms (v1: 80). */
export const WINDOW_SEND_MS = 80;

/** What the controller uses of the table view. */
export type InputView = Pick<TableView, 'dmCamera' | 'setDmCamera' | 'viewport' | 'screenToSquares' | 'hits' | 'zoomAt'>;

/** What the controller needs from the game screen (all read fresh on every event). */
export interface MapInputDeps {
  /** The map on the table, or null without a game. */
  map(): MapPlay | null;
  /** The TV's calibration and screen (for the players' window). */
  table(): TableState | null;
  /** The table view, null before it runs. */
  view(): InputView | null;
  /** The chosen tab's tool. */
  tool(): MapTool;
  /** Whether door taps work in the chosen tab. */
  doors(): boolean;
  /** Sends a command. */
  dispatch(cmd: Command): boolean;
  /**
   * A long press on the map, in squares (a DM note — optional; without it a press never becomes
   * a long press).
   *
   * @returns true when it was taken (the press then neither taps nor drags)
   */
  hold?(at: Point): boolean;
  /** The long press's clock (tests pass their own; default the page's timers). */
  timers?: HoldTimers;
  /** The logger. */
  log: Logger;
}

/** What the current press is aimed at. */
type Target =
  | { kind: 'disc'; disc: TemplateDisc; from: Point }
  | { kind: 'discKnob'; disc: TemplateDisc }
  | { kind: 'ruler'; ruler: Ruler; from: Point }
  | { kind: 'door'; index: number }
  | { kind: 'frame'; from: Point; col: number; row: number; maxCol: number; maxRow: number; pansX: boolean; pansY: boolean }
  | { kind: 'tool' };

/** Decides what each gesture does. */
export class MapInputController implements GestureHandler {
  /** The pointer tracker feeding this controller. */
  readonly tracker: GestureTracker;
  private target: Target = { kind: 'tool' };
  private drag: ToolDrag | null = null;
  private live: Throttle<Command> | null = null;
  private camStart: Camera | null = null;
  private fingers0: Point[] = [];

  /** @param deps - the game screen's hooks */
  constructor(private readonly deps: MapInputDeps) {
    this.tracker = new GestureTracker(this, deps.timers);
  }

  /** A host point in squares (the view's camera), or null before a map is drawn. */
  private sq(at: Point): Point | null {
    return this.deps.view()?.screenToSquares(at) ?? null;
  }

  /** @inheritdoc */
  press(at: Point): void {
    const map = this.deps.map();
    const view = this.deps.view();
    this.target = { kind: 'tool' };
    const p = this.sq(at);
    if (!map || !view || !p) return;
    const hits = view.hits(at);
    const first = (kind: string) => hits.find((h) => h.kind === kind);
    const disc = hits.find((h) => h.kind === 'disc');
    if (disc?.kind === 'disc' && disc.part === 'knob') this.target = { kind: 'discKnob', disc: map.disc };
    else if (disc) this.target = { kind: 'disc', disc: map.disc, from: p };
    else if (first('ruler')) this.target = { kind: 'ruler', ruler: map.ruler, from: p };
    else if (this.deps.tool().claims?.(p)) this.target = { kind: 'tool' };
    else {
      const door = this.deps.doors() ? hits.find((h) => h.kind === 'door') : undefined;
      if (door?.kind === 'door' && door.index < map.info.doorCount) this.target = { kind: 'door', index: door.index };
      else if (first('frame')) this.target = this.frameTarget(map, p) ?? { kind: 'tool' };
    }
  }

  /** The players' window under the finger, when it can move (table mode, a map bigger than the table). */
  private frameTarget(map: MapPlay, from: Point): Target | null {
    const table = this.deps.table();
    const layout = table ? tvView(table, map)?.layout : null;
    if (!layout || !(layout.pansX || layout.pansY)) return null;
    const { cols, rows } = map.info.grid;
    return {
      kind: 'frame', from, col: layout.col, row: layout.row,
      maxCol: Math.max(0, cols - layout.winCols), maxRow: Math.max(0, rows - layout.winRows), pansX: layout.pansX, pansY: layout.pansY,
    };
  }

  /**
   * A long press: handed to the game screen (a note) unless the finger is on the disc, the
   * ruler or a door — those keep their own press.
   *
   * @param at - where, in CSS px of the map view
   * @returns whether it was taken
   */
  hold(at: Point): boolean {
    const t = this.target.kind;
    if (!this.deps.hold || (t !== 'tool' && t !== 'frame')) return false;
    const p = this.sq(at);
    if (!p || !this.deps.map()) return false;
    const taken = this.deps.hold(p);
    if (taken) this.deps.log.info('companion', 'Long press on the map', { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
    return taken;
  }

  /** @inheritdoc */
  tap(at: Point): void {
    const map = this.deps.map();
    const p = this.sq(at);
    if (!map || !p) return;
    const t = this.target;
    if (t.kind === 'door') {
      const open = !map.doorsOpen.includes(t.index);
      this.deps.log.info('companion', 'Door tapped', { index: t.index, open });
      this.deps.dispatch({ type: 'door.set', index: t.index, open });
      return;
    }
    if (t.kind === 'tool' || t.kind === 'frame') this.deps.tool().tap?.(p);
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
      case 'frame':
        this.live = throttle(WINDOW_SEND_MS, send);
        this.dragMove(at);
        return true;
      case 'door':
      case 'tool': {
        const a = this.sq(from);
        const b = this.sq(at);
        const drag = a && b ? this.deps.tool().begin?.(a, b) ?? null : null;
        this.drag = drag;
        return drag !== null;
      }
    }
  }

  /** @inheritdoc */
  dragMove(at: Point): void {
    const t = this.target;
    const p = this.sq(at);
    if (!p) return;
    if (t.kind === 'disc') {
      const moved = snapDiscPoint(t.disc, { x: t.disc.x + p.x - t.from.x, y: t.disc.y + p.y - t.from.y });
      this.live?.push({ type: 'disc.set', disc: { ...t.disc, x: moved.x, y: moved.y } });
    } else if (t.kind === 'discKnob') {
      // the knob sits at local (−r, 0): the disc's rotation points from the knob through the centre
      const rotation = (Math.atan2(p.y - t.disc.y, p.x - t.disc.x) * 180) / Math.PI + 180;
      this.live?.push({ type: 'disc.set', disc: { ...t.disc, rotation: ((rotation % 360) + 360) % 360 } });
    } else if (t.kind === 'ruler') {
      this.live?.push({ type: 'ruler.set', ruler: { ...t.ruler, x: t.ruler.x + p.x - t.from.x, y: t.ruler.y + p.y - t.from.y } });
    } else if (t.kind === 'frame') {
      const col = t.pansX ? clampInt(t.col + Math.round(p.x - t.from.x), t.maxCol) : t.col;
      const row = t.pansY ? clampInt(t.row + Math.round(p.y - t.from.y), t.maxRow) : t.row;
      this.live?.push({ type: 'view.window', col, row });
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
      if (this.target.kind === 'frame') this.deps.log.info('companion', "Players' window dragged");
      return;
    }
    const p = this.sq(at);
    if (p) this.drag?.end(p);
    else this.drag?.cancel();
    this.drag = null;
  }

  /** @inheritdoc */
  dragCancel(): void {
    if (this.live) {
      this.live.flush(); // the disc / ruler / window stays where it got to
      this.live = null;
    }
    this.drag?.cancel();
    this.drag = null;
  }

  /** @inheritdoc */
  cameraStart(fingers: Point[]): void {
    this.camStart = this.deps.view()?.dmCamera() ?? null;
    this.fingers0 = fingers;
  }

  /** @inheritdoc */
  cameraMove(fingers: Point[]): void {
    const start = this.camStart;
    const view = this.deps.view();
    if (!start || !view || fingers.length === 0 || fingers.length !== this.fingers0.length) return;
    const a0 = this.fingers0[0]!;
    const b0 = this.fingers0[1] ?? a0;
    const a1 = fingers[0]!;
    const b1 = fingers[1] ?? a1;
    view.setDmCamera(pinchCamera(start, view.viewport(), a0, b0, a1, b1));
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
    this.deps.view()?.zoomAt(factor, at);
  }
}

function clampInt(v: number, max: number): number {
  return Math.min(Math.max(Math.round(v), 0), max);
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
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', menu);
  addEventListener('keydown', key);
  addEventListener('keyup', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', menu);
    removeEventListener('keydown', key);
    removeEventListener('keyup', key);
  };
}
