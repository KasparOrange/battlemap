/**
 * Camera maths of the table renderer — pure, no Pixi. A camera looks at a centre (in squares)
 * with a zoom (screen px per square) and a turn (quarter turns clockwise); the screen centre is
 * the host's middle. The TV's camera comes from the state (`tvView`), the DM's is its own and
 * moved by pinch/pan through the helpers here, clamped so the map never gets lost.
 *
 * World units: the scene graph works in `SQUARE` units per map square (so Pixi tessellates
 * circles and curves finely), the state in squares. `worldTransform` turns a camera into the
 * world container's transform.
 *
 * @see ../../../../docs/architecture.md "table view maths"
 */
import type { Camera, Point } from '@battlemap/shared';

/** World units per map square in the scene graph (`squares × SQUARE` = world units). */
export const SQUARE = 64;

/** A viewport in CSS px. */
export interface Size {
  /** Width in CSS px. */
  readonly width: number;
  /** Height in CSS px. */
  readonly height: number;
}

/** The DM's camera: the shared `Camera` shape (centre in squares, px per square, quarter turns). */
export type DmCamera = Camera;

/** The transform of the world container for a camera (Pixi: position, pivot, rotation, scale). */
export interface WorldTransform {
  /** Screen point the camera centre lands on (CSS px). */
  readonly x: number;
  /** Screen point the camera centre lands on (CSS px). */
  readonly y: number;
  /** World point under the screen centre (world units). */
  readonly pivotX: number;
  /** World point under the screen centre (world units). */
  readonly pivotY: number;
  /** Radians clockwise. */
  readonly rotation: number;
  /** Screen px per world unit. */
  readonly scale: number;
}

/**
 * The world container's transform for a camera on a viewport.
 *
 * @param cam - the camera
 * @param view - the host size in CSS px
 * @returns the transform
 */
export function worldTransform(cam: Camera, view: Size): WorldTransform {
  return {
    x: view.width / 2,
    y: view.height / 2,
    pivotX: cam.centerX * SQUARE,
    pivotY: cam.centerY * SQUARE,
    rotation: (cam.quarterTurns % 4) * (Math.PI / 2),
    scale: cam.zoom / SQUARE,
  };
}

/** cos/sin of a quarter turn, exact (no 6e-17 leftovers). */
function turn(q: number): { c: number; s: number } {
  switch (((q % 4) + 4) % 4) {
    case 0: return { c: 1, s: 0 };
    case 1: return { c: 0, s: 1 };
    case 2: return { c: -1, s: 0 };
    default: return { c: 0, s: -1 };
  }
}

/**
 * A screen point (CSS px in the host) → map squares.
 *
 * @param cam - the camera
 * @param view - the host size
 * @param p - the screen point
 * @returns the point in squares
 */
export function screenToSquares(cam: Camera, view: Size, p: Point): Point {
  const { c, s } = turn(cam.quarterTurns);
  const dx = (p.x - view.width / 2) / cam.zoom;
  const dy = (p.y - view.height / 2) / cam.zoom;
  // inverse rotation: R(−θ)
  return { x: cam.centerX + dx * c + dy * s, y: cam.centerY - dx * s + dy * c };
}

/**
 * Map squares → a screen point (CSS px in the host).
 *
 * @param cam - the camera
 * @param view - the host size
 * @param p - the point in squares
 * @returns the screen point
 */
export function squaresToScreen(cam: Camera, view: Size, p: Point): Point {
  const { c, s } = turn(cam.quarterTurns);
  const dx = (p.x - cam.centerX) * cam.zoom;
  const dy = (p.y - cam.centerY) * cam.zoom;
  return { x: view.width / 2 + dx * c - dy * s, y: view.height / 2 + dx * s + dy * c };
}

/**
 * The axis-aligned rectangle of squares a camera shows (the bounding box when turned).
 *
 * @param cam - the camera
 * @param view - the host size
 * @returns left, top, right, bottom in squares
 */
export function visibleSquares(cam: Camera, view: Size): { x0: number; y0: number; x1: number; y1: number } {
  const sideways = cam.quarterTurns % 2 !== 0;
  const hw = (sideways ? view.height : view.width) / 2 / cam.zoom;
  const hh = (sideways ? view.width : view.height) / 2 / cam.zoom;
  return { x0: cam.centerX - hw, y0: cam.centerY - hh, x1: cam.centerX + hw, y1: cam.centerY + hh };
}

/**
 * Screen px of the host covered by the companion's own panels (side panel, bottom sheet, top
 * bar). The map is fitted into what is left; hit tests and drawing still use the whole host.
 */
export interface Insets {
  /** Covered px at the top. */
  readonly top: number;
  /** Covered px at the right. */
  readonly right: number;
  /** Covered px at the bottom. */
  readonly bottom: number;
  /** Covered px at the left. */
  readonly left: number;
}

/** No panels over the map. */
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Limits of the DM camera. */
export interface DmLimits {
  /** Map width in squares. */
  readonly cols: number;
  /** Map height in squares. */
  readonly rows: number;
  /** The host size. */
  readonly view: Size;
  /** Panels over the host (default none). */
  readonly insets?: Insets;
}

/** Most screen px per square the DM can zoom in to (a map that fits at more keeps its fit). */
export const DM_MAX_ZOOM = 400;

/** The DM can zoom out to half of "whole map fits". */
export const DM_MIN_FIT_FACTOR = 0.5;

/** Room kept around a fitted map, in screen px per side. */
export const FIT_MARGIN_PX = 24;

/**
 * The zoom that shows the whole map (turned) in the free part of a viewport, with
 * {@link FIT_MARGIN_PX} of room on each side.
 *
 * @param cols - map width in squares
 * @param rows - map height in squares
 * @param view - the host size
 * @param quarterTurns - camera turn
 * @param insets - panels over the host (default none)
 * @returns px per square
 */
export function fitZoomFor(cols: number, rows: number, view: Size, quarterTurns = 0, insets: Insets = NO_INSETS): number {
  const sideways = quarterTurns % 2 !== 0;
  const w = sideways ? rows : cols;
  const h = sideways ? cols : rows;
  const freeW = Math.max(1, view.width - insets.left - insets.right - 2 * FIT_MARGIN_PX);
  const freeH = Math.max(1, view.height - insets.top - insets.bottom - 2 * FIT_MARGIN_PX);
  return Math.max(1e-3, Math.min(freeW / Math.max(w, 1e-3), freeH / Math.max(h, 1e-3)));
}

/**
 * The DM camera that shows the whole map, centred in the free part of the host.
 *
 * @param lim - map size, viewport, panels
 * @param quarterTurns - camera turn (default 0)
 * @returns the camera
 */
export function fitDmCamera(lim: DmLimits, quarterTurns = 0): DmCamera {
  const ins = lim.insets ?? NO_INSETS;
  const centred: DmCamera = { centerX: lim.cols / 2, centerY: lim.rows / 2, zoom: fitZoomFor(lim.cols, lim.rows, lim.view, quarterTurns, ins), quarterTurns };
  const ox = (ins.left - ins.right) / 2;
  const oy = (ins.top - ins.bottom) / 2;
  return ox === 0 && oy === 0 ? centred : panCamera(centred, ox, oy);
}

/**
 * Clamps a DM camera: zoom within `[fit × 0.5, max(DM_MAX_ZOOM, fit)]`, the centre inside the
 * map (so some of the map always stays on screen). This is the one rule both the renderer and
 * the companion's gestures use.
 *
 * @param cam - the wanted camera
 * @param lim - map size, viewport, panels
 * @returns the clamped camera (the same object when nothing changed)
 */
export function clampDmCamera(cam: DmCamera, lim: DmLimits): DmCamera {
  const fit = fitZoomFor(lim.cols, lim.rows, lim.view, cam.quarterTurns, lim.insets ?? NO_INSETS);
  const zoom = Math.min(Math.max(cam.zoom, fit * DM_MIN_FIT_FACTOR), Math.max(DM_MAX_ZOOM, fit));
  const centerX = Math.min(Math.max(cam.centerX, 0), lim.cols);
  const centerY = Math.min(Math.max(cam.centerY, 0), lim.rows);
  if (zoom === cam.zoom && centerX === cam.centerX && centerY === cam.centerY) return cam;
  return { ...cam, zoom, centerX, centerY };
}

/**
 * Whether two cameras are the same (to skip writes and events).
 *
 * @param a - one camera
 * @param b - the other
 * @returns true when every field matches
 */
export function sameCamera(a: Camera | null, b: Camera | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.centerX === b.centerX && a.centerY === b.centerY && a.zoom === b.zoom && a.quarterTurns === b.quarterTurns;
}

/**
 * Pans a camera by a finger movement in screen px (the map follows the finger).
 *
 * @param cam - the camera
 * @param dx - screen px to the right
 * @param dy - screen px down
 * @returns the moved camera (not clamped)
 */
export function panCamera(cam: DmCamera, dx: number, dy: number): DmCamera {
  const { c, s } = turn(cam.quarterTurns);
  const sx = dx / cam.zoom;
  const sy = dy / cam.zoom;
  return { ...cam, centerX: cam.centerX - (sx * c + sy * s), centerY: cam.centerY - (-sx * s + sy * c) };
}

/**
 * Zooms a camera by a factor keeping the square under a screen point in place (pinch, wheel).
 *
 * @param cam - the camera
 * @param view - the host size
 * @param factor - new zoom ÷ old zoom
 * @param at - the screen point that stays put
 * @returns the zoomed camera (not clamped)
 */
export function zoomCameraAt(cam: DmCamera, view: Size, factor: number, at: Point): DmCamera {
  const before = screenToSquares(cam, view, at);
  const zoomed: DmCamera = { ...cam, zoom: cam.zoom * factor };
  const after = screenToSquares(zoomed, view, at);
  return { ...zoomed, centerX: zoomed.centerX + before.x - after.x, centerY: zoomed.centerY + before.y - after.y };
}

/**
 * The camera during a pinch: the map point under the fingers' midpoint at the start stays under
 * their midpoint now, and the zoom scales with the fingers' distance. With one finger
 * (`a1 === b1`, after the other lifted) it is a pan.
 *
 * @param start - the camera when the pinch (re)started
 * @param view - the host size
 * @param a0 - first finger at the start
 * @param b0 - second finger at the start
 * @param a1 - first finger now
 * @param b1 - second finger now
 * @returns the new camera (not clamped — hand it to `setDmCamera`)
 */
export function pinchCamera(start: DmCamera, view: Size, a0: Point, b0: Point, a1: Point, b1: Point): DmCamera {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const factor = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const anchor = screenToSquares(start, view, m0);
  const zoomed: DmCamera = { ...start, zoom: start.zoom * factor };
  const under = screenToSquares(zoomed, view, m1);
  return { ...zoomed, centerX: zoomed.centerX + anchor.x - under.x, centerY: zoomed.centerY + anchor.y - under.y };
}
