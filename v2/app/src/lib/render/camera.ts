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

/** Limits of the DM camera. */
export interface DmLimits {
  /** Map width in squares. */
  readonly cols: number;
  /** Map height in squares. */
  readonly rows: number;
  /** The host size. */
  readonly view: Size;
}

/** Most screen px per square the DM can zoom in to. */
export const DM_MAX_ZOOM = 400;

/** The DM can zoom out to half of "whole map fits". */
export const DM_MIN_FIT_FACTOR = 0.5;

/**
 * The zoom that shows the whole map (turned) in a viewport, with a small margin.
 *
 * @param cols - map width in squares
 * @param rows - map height in squares
 * @param view - the host size
 * @param quarterTurns - camera turn
 * @returns px per square
 */
export function fitZoomFor(cols: number, rows: number, view: Size, quarterTurns = 0): number {
  const sideways = quarterTurns % 2 !== 0;
  const w = sideways ? rows : cols;
  const h = sideways ? cols : rows;
  return Math.max(1e-3, Math.min((view.width * 0.96) / w, (view.height * 0.96) / h));
}

/**
 * The DM camera that shows the whole map.
 *
 * @param lim - map size and viewport
 * @param quarterTurns - camera turn (default 0)
 * @returns the camera
 */
export function fitDmCamera(lim: DmLimits, quarterTurns = 0): DmCamera {
  return { centerX: lim.cols / 2, centerY: lim.rows / 2, zoom: fitZoomFor(lim.cols, lim.rows, lim.view, quarterTurns), quarterTurns };
}

/**
 * Clamps a DM camera: zoom within `[fit × 0.5, DM_MAX_ZOOM]`, the centre inside the map (so
 * some of the map always stays on screen).
 *
 * @param cam - the wanted camera
 * @param lim - map size and viewport
 * @returns the clamped camera (the same object when nothing changed)
 */
export function clampDmCamera(cam: DmCamera, lim: DmLimits): DmCamera {
  const minZoom = fitZoomFor(lim.cols, lim.rows, lim.view, cam.quarterTurns) * DM_MIN_FIT_FACTOR;
  const zoom = Math.min(Math.max(cam.zoom, Math.min(minZoom, DM_MAX_ZOOM)), DM_MAX_ZOOM);
  const centerX = Math.min(Math.max(cam.centerX, 0), lim.cols);
  const centerY = Math.min(Math.max(cam.centerY, 0), lim.rows);
  if (zoom === cam.zoom && centerX === cam.centerX && centerY === cam.centerY) return cam;
  return { ...cam, zoom, centerX, centerY };
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
