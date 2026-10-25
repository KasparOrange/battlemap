/**
 * The importer's size rules: limits for files and pictures, the table copy (≤ 72 px per square,
 * within what a canvas and a texture can hold), the thumbnail, the PDF render size and how the
 * detection reads a big picture. Pure maths, tested in `sizing.test.ts`.
 *
 * @see ../../../../docs/architecture.md "Persistence" (table copy) and "Rendering" (textures)
 */
import type { RasterGrid } from '@battlemap/shared';
import { boxFactor, DETECT_MAX_SIDE } from './grid-detect.ts';

/** Largest file the importer reads, in bytes (the 30 MB castle `.dd2vtt` is the big test case). */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Largest picture in pixels (16384² — the castle is 17100 × 9600 = 164 M). */
export const MAX_PICTURE_PIXELS = 16384 * 16384;

/** Pixels per square of the table copy (the TV needs ~56 at 1080p; 72 leaves room for 4K). */
export const TABLE_PX_PER_SQUARE = 72;

/**
 * Largest canvas area anything is drawn into (Safari's limit; Chrome allows more). Caps the
 * table copy, the strips the detection reads and the PDF render.
 */
export const MAX_CANVAS_PIXELS = 4096 * 4096;

/** Longest side of the table copy (the renderer tiles it into ≤ 4096 px textures). */
export const MAX_COPY_SIDE = 8192;

/** Longest side of the thumbnail. */
export const THUMB_SIDE = 288;

/** Longest side a PDF's first page is rendered at (smaller pages are scaled up, as in v1). */
export const PDF_LONG_SIDE = 4096;

/**
 * Largest picture the detection decodes at full size before averaging it down itself (above:
 * the browser decodes it scaled, which costs less memory and is a little less faithful).
 */
export const MAX_FULL_DECODE_PIXELS = 64 * 1024 * 1024;

/** A width and a height in pixels. */
export interface PixelSize {
  /** Width. */
  width: number;
  /** Height. */
  height: number;
}

/** What the table copy will be. */
export interface TableCopyPlan extends PixelSize {
  /** Its scale against the picture (< 1). */
  scale: number;
  /** Its pixels per square (the larger of width and height). */
  pxPerSquare: number;
}

/**
 * The table copy for a picture and its grid: at most `TABLE_PX_PER_SQUARE` per square, at most
 * `MAX_CANVAS_PIXELS` in all and `MAX_COPY_SIDE` on a side.
 *
 * @param grid - where the squares lie (its picture size is the picture's)
 * @returns the copy's size, or null when the picture already keeps to all limits
 */
export function tableCopyPlan(grid: RasterGrid): TableCopyPlan | null {
  const w = grid.pictureW;
  const h = grid.pictureH;
  const cell = Math.max(grid.cellW, grid.cellH);
  const scale = Math.min(1, TABLE_PX_PER_SQUARE / cell, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)), MAX_COPY_SIDE / Math.max(w, h));
  if (scale >= 0.999) return null;
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)), scale, pxPerSquare: cell * scale };
}

/**
 * The thumbnail's size: `THUMB_SIDE` on the long side, never larger than the picture.
 *
 * @param width - picture width
 * @param height - picture height
 * @returns the size
 */
export function thumbSize(width: number, height: number): PixelSize {
  const s = Math.min(1, THUMB_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/**
 * The scale a PDF page is rendered at: its long side becomes `PDF_LONG_SIDE` px, its area at
 * most `MAX_CANVAS_PIXELS` (a very long page).
 *
 * @param pageW - page width at scale 1 (PDF points)
 * @param pageH - page height at scale 1
 * @returns the scale
 */
export function pdfRenderScale(pageW: number, pageH: number): number {
  return Math.min(PDF_LONG_SIDE / Math.max(pageW, pageH), Math.sqrt(MAX_CANVAS_PIXELS / (pageW * pageH)));
}

/** How the detection reads a picture. */
export interface DetectionPlan {
  /**
   * `strips`: decode at full size, read `stripRows` rows at a time and box-average by `factor`
   * (the original's way). `scaled`: let the browser decode at `width × height` and detect on
   * that with factor 1, then scale the result back by `factor`.
   */
  mode: 'strips' | 'scaled';
  /** The box factor (≥ 1). */
  factor: number;
  /** Rows per strip (`strips`), a multiple of `factor`. */
  stripRows: number;
  /** Size the browser decodes to (`scaled`), else the picture's. */
  width: number;
  /** See `width`. */
  height: number;
}

/**
 * How to read a `width × height` picture for the detection, within the canvas limit.
 *
 * @param width - picture width
 * @param height - picture height
 * @param maxSide - the detection's long side (default `DETECT_MAX_SIDE`)
 * @returns the plan
 */
export function detectionPlan(width: number, height: number, maxSide = DETECT_MAX_SIDE): DetectionPlan {
  const factor = boxFactor(width, height, maxSide);
  if (width * height > MAX_FULL_DECODE_PIXELS) {
    return { mode: 'scaled', factor, stripRows: 0, width: Math.floor(width / factor), height: Math.floor(height / factor) };
  }
  const rows = Math.max(factor, Math.floor(MAX_CANVAS_PIXELS / width / factor) * factor);
  return { mode: 'strips', factor, stripRows: Math.min(rows, height), width, height };
}
