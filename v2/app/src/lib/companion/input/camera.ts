/**
 * The DM's own camera on the companion: squares ↔ screen pixels, fit, clamps, wheel zoom and
 * the two-finger pinch. Pure maths, tested under `bun test`.
 *
 * Convention (the same as the TV's `Camera`): the camera's centre (in squares) sits at the middle
 * of the view; `zoom` is screen (CSS) px per square; `quarterTurns` turns the map clockwise.
 */
import type { Camera, Point } from '@battlemap/shared';

/** The view's size in CSS px. */
export interface Viewport {
  /** Width in CSS px. */
  width: number;
  /** Height in CSS px. */
  height: number;
}

/** Most screen px per square the DM can zoom in to. */
export const MAX_ZOOM = 220;

/** How far out the DM can zoom, as a share of the fit zoom (v1: fit × 0.5). */
export const MIN_ZOOM_OF_FIT = 0.5;

/** Room kept around the map when it is fitted, in px per side. */
export const FIT_MARGIN_PX = 24;

/** Turns a vector by quarter turns clockwise (screen y points down). */
function turn(x: number, y: number, quarterTurns: number): Point {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1: return { x: -y, y: x };
    case 2: return { x: -x, y: -y };
    case 3: return { x: y, y: -x };
    default: return { x, y };
  }
}

/**
 * Where a map point lands on the screen.
 *
 * @param cam - the camera
 * @param vp - the view's size
 * @param p - a point in squares
 * @returns the point in CSS px from the view's top-left corner
 */
export function toScreen(cam: Camera, vp: Viewport, p: Point): Point {
  const d = turn((p.x - cam.centerX) * cam.zoom, (p.y - cam.centerY) * cam.zoom, cam.quarterTurns);
  return { x: vp.width / 2 + d.x, y: vp.height / 2 + d.y };
}

/**
 * Which map point is under a screen point.
 *
 * @param cam - the camera
 * @param vp - the view's size
 * @param s - a point in CSS px from the view's top-left corner
 * @returns the point in squares (fractional, may be off the map)
 */
export function toSquares(cam: Camera, vp: Viewport, s: Point): Point {
  const d = turn((s.x - vp.width / 2) / cam.zoom, (s.y - vp.height / 2) / cam.zoom, 4 - (cam.quarterTurns % 4));
  return { x: cam.centerX + d.x, y: cam.centerY + d.y };
}

/**
 * The zoom at which the whole map fits in the view.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param vp - the view's size
 * @param quarterTurns - the camera's turn
 * @returns px per square
 */
export function fitZoomFor(cols: number, rows: number, vp: Viewport, quarterTurns = 0): number {
  const sideways = quarterTurns % 2 !== 0;
  const w = Math.max(1, vp.width - 2 * FIT_MARGIN_PX);
  const h = Math.max(1, vp.height - 2 * FIT_MARGIN_PX);
  return Math.max(0.5, Math.min(w / (sideways ? rows : cols), h / (sideways ? cols : rows)));
}

/**
 * A camera that shows the whole map, centred.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param vp - the view's size
 * @returns the camera
 */
export function fitCamera(cols: number, rows: number, vp: Viewport): Camera {
  return { centerX: cols / 2, centerY: rows / 2, zoom: fitZoomFor(cols, rows, vp), quarterTurns: 0 };
}

/**
 * Keeps a camera sensible: zoom between half the fit and {@link MAX_ZOOM}, centre on the map.
 *
 * @param cam - the camera asked for
 * @param cols - squares across
 * @param rows - squares down
 * @param vp - the view's size
 * @returns the clamped camera
 */
export function clampCamera(cam: Camera, cols: number, rows: number, vp: Viewport): Camera {
  const fit = fitZoomFor(cols, rows, vp, cam.quarterTurns);
  const zoom = Math.min(Math.max(cam.zoom, fit * MIN_ZOOM_OF_FIT), Math.max(MAX_ZOOM, fit));
  const centerX = Math.min(Math.max(cam.centerX, 0), cols);
  const centerY = Math.min(Math.max(cam.centerY, 0), rows);
  if (zoom === cam.zoom && centerX === cam.centerX && centerY === cam.centerY) return cam;
  return { ...cam, zoom, centerX, centerY };
}

/**
 * Zooms by a factor around a screen point, which stays under the cursor / fingers.
 *
 * @param cam - the camera
 * @param vp - the view's size
 * @param at - the fixed point in CSS px
 * @param factor - > 1 zooms in
 * @returns the new camera (not clamped)
 */
export function zoomAt(cam: Camera, vp: Viewport, at: Point, factor: number): Camera {
  const before = toSquares(cam, vp, at);
  const zoomed = { ...cam, zoom: cam.zoom * factor };
  const after = toSquares(zoomed, vp, at);
  return { ...zoomed, centerX: cam.centerX + before.x - after.x, centerY: cam.centerY + before.y - after.y };
}

/**
 * Moves the camera so the map follows the finger by a screen offset.
 *
 * @param cam - the camera
 * @param dx - finger movement in CSS px
 * @param dy - finger movement in CSS px
 * @returns the new camera (not clamped)
 */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  const d = turn(dx / cam.zoom, dy / cam.zoom, 4 - (cam.quarterTurns % 4));
  return { ...cam, centerX: cam.centerX - d.x, centerY: cam.centerY - d.y };
}

/**
 * The camera during a pinch: the map point that was under the fingers' midpoint at the start
 * stays under their midpoint now, and the zoom scales with the fingers' distance. With one finger
 * (`a1 === b1`, after the other lifted) it is a pan.
 *
 * @param start - the camera when the pinch (re)started
 * @param vp - the view's size
 * @param a0 - first finger at the start
 * @param b0 - second finger at the start
 * @param a1 - first finger now
 * @param b1 - second finger now
 * @returns the new camera (not clamped)
 */
export function pinchCamera(start: Camera, vp: Viewport, a0: Point, b0: Point, a1: Point, b1: Point): Camera {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const factor = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const anchor = toSquares(start, vp, m0);
  const zoomed = { ...start, zoom: start.zoom * factor };
  const under = toSquares(zoomed, vp, m1);
  return { ...zoomed, centerX: zoomed.centerX + anchor.x - under.x, centerY: zoomed.centerY + anchor.y - under.y };
}

/**
 * Whether two cameras are the same (to skip writes).
 *
 * @param a - one camera
 * @param b - the other
 * @returns true when every field matches
 */
export function sameCamera(a: Camera, b: Camera): boolean {
  return a.centerX === b.centerX && a.centerY === b.centerY && a.zoom === b.zoom && a.quarterTurns === b.quarterTurns;
}
