/**
 * The grid editor's fingers and mouse: one finger edits with the current tool (Move slides the
 * grid, Stretch drags a line, Corners / Length place and drag marks), a second finger takes back
 * what the first did and the touch pans / pinches the view; Look, the middle and the right
 * button only move the view. A drag previews and becomes one undo step on release. No DOM of
 * its own: `GridEditor.svelte` forwards the canvas's pointer events and implements the host.
 */
import { stretched, type Point, type RasterGrid } from '@battlemap/shared';
import { moved, toPicture, toScreen, zoomAt, type EditorTool, type EditorView } from './editor-logic.ts';

/** What the gestures read and change in the editor. */
export interface GestureHost {
  /** The current tool. */
  readonly tool: EditorTool;
  /** The grid shown now. */
  readonly grid: RasterGrid;
  /** The view. */
  view: EditorView;
  /** Whether Stretch keeps squares square. */
  readonly square: boolean;
  /** First mark (picture px). */
  markA: Point | null;
  /** Second mark. */
  markB: Point | null;
  /** The magnifier: where the finger is on screen and on the picture, or null to hide it. */
  magnifier: { at: Point; pic: Point } | null;
  /** Shows a grid during a drag (no undo step). */
  preview(grid: RasterGrid): void;
  /** Turns the drag's result into one undo step, starting from the grid before the drag. */
  settle(before: RasterGrid): void;
  /** A hint for the DM. */
  hint(text: string): void;
}

/** A gesture in progress. */
interface Gesture {
  kind: 'tool' | 'view';
  startGrid: RasterGrid;
  startPic: Point;
  startScreen: Point;
  moved: boolean;
  dragMark: 'a' | 'b' | 'new' | null;
  startView: EditorView;
  pinch: { d: number; mid: Point } | null;
}

/** How close (CSS px) a touch must start to grab a mark. */
const GRAB_PX = 36;
/** Movement (CSS px) below which a touch is a tap. */
const TAP_PX = 4;

/** Two grids equal (to a millionth of a px). */
export function sameGrid(a: RasterGrid, b: RasterGrid): boolean {
  return a.cols === b.cols && a.rows === b.rows && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 &&
    Math.abs(a.cellW - b.cellW) < 1e-6 && Math.abs(a.cellH - b.cellH) < 1e-6;
}

/** The editor's pointer handling. */
export class EditorGestures {
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;

  /** @param host - the editor's state */
  constructor(private readonly host: GestureHost) {}

  /**
   * A finger or button went down.
   *
   * @param id - the pointer id
   * @param p - where, in canvas CSS px
   * @param button - the mouse button (0 for touch)
   */
  down(id: number, p: Point, button: number): void {
    const h = this.host;
    this.pointers.set(id, p);
    if (this.pointers.size === 1) {
      const markTool = h.tool === 'corners' || h.tool === 'length';
      this.gesture = {
        kind: h.tool === 'look' || button === 1 || button === 2 ? 'view' : 'tool',
        startGrid: h.grid, startPic: toPicture(h.view, p), startScreen: p, moved: false, startView: h.view, pinch: null,
        dragMark: markTool ? this.nearMark(p) ?? 'new' : null,
      };
    } else if (this.gesture) {
      // a second finger: undo what the first did, the touch now moves the view
      if (this.gesture.kind === 'tool') {
        h.preview(this.gesture.startGrid);
        h.magnifier = null;
      }
      this.gesture = { ...this.gesture, kind: 'view', startView: h.view, pinch: this.twoFinger() };
    }
  }

  /**
   * A finger moved.
   *
   * @param id - the pointer id
   * @param p - where, in canvas CSS px
   */
  move(id: number, p: Point): void {
    const g = this.gesture;
    const h = this.host;
    if (!this.pointers.has(id) || !g) return;
    this.pointers.set(id, p);
    if (!g.moved && Math.hypot(p.x - g.startScreen.x, p.y - g.startScreen.y) < TAP_PX) return;
    g.moved = true;
    if (g.kind === 'view') {
      h.view = this.viewFor(g, p);
      return;
    }
    const pic = toPicture(h.view, p);
    h.magnifier = { at: p, pic };
    switch (h.tool) {
      case 'move':
        h.preview(moved(g.startGrid, pic.x - g.startPic.x, pic.y - g.startPic.y));
        break;
      case 'stretch':
        h.preview(stretched(g.startGrid, g.startPic, pic, h.square));
        break;
      case 'corners':
      case 'length':
        if (g.dragMark === 'a') h.markA = pic;
        else if (g.dragMark === 'b') h.markB = pic;
        else if (h.tool === 'length') {
          h.markA = g.startPic;
          h.markB = pic;
        }
        break;
    }
  }

  /**
   * A finger lifted (or the touch was cancelled).
   *
   * @param id - the pointer id
   */
  up(id: number): void {
    const h = this.host;
    if (!this.pointers.delete(id) || !this.gesture || this.pointers.size > 0) return;
    const g = this.gesture;
    this.gesture = null;
    h.magnifier = null;
    if (g.kind !== 'tool') return;
    if (h.tool === 'move' || h.tool === 'stretch') {
      if (h.tool === 'stretch' && g.moved && sameGrid(h.grid, g.startGrid)) h.hint('Start the stretch on a line farther from the top-left corner.');
      h.settle(g.startGrid);
      return;
    }
    if (!g.moved && (h.tool === 'corners' || h.tool === 'length')) {
      // a tap places marks: first, second, then starts over
      if (g.dragMark === 'a' || g.dragMark === 'b') return;
      if (!h.markA || h.markB) {
        h.markA = g.startPic;
        h.markB = null;
      } else h.markB = g.startPic;
    }
  }

  /** The view a view-gesture gives at `p` (pan, or pinch with two fingers). */
  private viewFor(g: Gesture, p: Point): EditorView {
    if (g.pinch && this.pointers.size >= 2) {
      const now = this.twoFinger();
      const v = zoomAt(g.startView, now.d / Math.max(1, g.pinch.d), g.pinch.mid);
      return { ...v, ox: v.ox + now.mid.x - g.pinch.mid.x, oy: v.oy + now.mid.y - g.pinch.mid.y };
    }
    return { ...g.startView, ox: g.startView.ox + p.x - g.startScreen.x, oy: g.startView.oy + p.y - g.startScreen.y };
  }

  private twoFinger(): { d: number; mid: Point } {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(b!.x - a!.x, b!.y - a!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } };
  }

  private nearMark(p: Point): 'a' | 'b' | null {
    for (const [id, m] of [['a', this.host.markA], ['b', this.host.markB]] as const) {
      if (!m) continue;
      const s = toScreen(this.host.view, m);
      if (Math.hypot(s.x - p.x, s.y - p.y) <= GRAB_PX) return id;
    }
    return null;
  }
}
