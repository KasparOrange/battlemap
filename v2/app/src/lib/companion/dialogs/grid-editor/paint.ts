/**
 * The grid editor's canvas drawing: the picture, the dim outside the grid, the grid lines (only
 * those on screen, thinned when squares get tiny), the marks and the measured line — and the
 * magnifier above the finger. Plain canvas 2D, no state of its own; `GridEditor.svelte` calls it
 * once per invalidated frame.
 */
import { gridCorner, type Point, type RasterGrid } from '@battlemap/shared';
import { toScreen, type EditorTool, type EditorView } from './editor-logic.ts';

/** The line colours the DM cycles through (bright, to show on any picture). */
export const LINE_COLOURS = ['#00e5ff', '#ff2bd6', '#ffea00', '#76ff03'];

/** The magnifier's side in CSS px. */
export const LENS_PX = 170;

/** Everything one paint needs. */
export interface EditorScene {
  /** The picture, once loaded. */
  image: HTMLImageElement | null;
  /** The grid being edited. */
  grid: RasterGrid;
  /** The tool (marks show only for Corners and Length). */
  tool: EditorTool;
  /** The first mark (picture px). */
  markA: Point | null;
  /** The second mark. */
  markB: Point | null;
  /** Index into `LINE_COLOURS`. */
  colour: number;
  /** Thicker lines. */
  bold: boolean;
}

/** The candle gold of the marks (the accent token's value; canvas can't read CSS variables). */
const GOLD = '#e3b45e';

/**
 * Paints the scene through a view onto a context of `w × h` CSS px.
 *
 * @param ctx - the context (already scaled to CSS px)
 * @param s - the scene
 * @param v - the view
 * @param w - width in CSS px
 * @param h - height in CSS px
 * @param inLens - painting the magnifier (smaller marks, no line between marks)
 */
export function paintScene(ctx: CanvasRenderingContext2D, s: EditorScene, v: EditorView, w: number, h: number, inLens: boolean): void {
  const { grid } = s;
  ctx.save();
  ctx.translate(v.ox, v.oy);
  ctx.scale(v.scale, v.scale);
  ctx.imageSmoothingEnabled = v.scale < 2;
  if (s.image) ctx.drawImage(s.image, 0, 0, grid.pictureW, grid.pictureH);
  ctx.restore();

  // dim outside the grid
  const tl = toScreen(v, { x: grid.x, y: grid.y });
  const br = toScreen(v, gridCorner(grid, grid.cols, grid.rows));
  ctx.fillStyle = 'rgba(0,0,0,0.67)';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(tl.x, br.y, br.x - tl.x, tl.y - br.y);
  ctx.fill('evenodd');

  paintLines(ctx, s, tl, br, v, w, h);
  if (s.tool === 'corners' || s.tool === 'length') paintMarks(ctx, s, v, inLens);
}

/** Grid lines on screen: a dark under-stroke, the chosen colour on top. */
function paintLines(ctx: CanvasRenderingContext2D, s: EditorScene, tl: Point, br: Point, v: EditorView, w: number, h: number): void {
  const { grid } = s;
  const cw = grid.cellW * v.scale;
  const ch = grid.cellH * v.scale;
  const sx = cw < 3 ? Math.ceil(3 / cw) : 1;
  const sy = ch < 3 ? Math.ceil(3 / ch) : 1;
  const c0 = Math.max(0, Math.floor(-tl.x / cw));
  const c1 = Math.min(grid.cols, Math.ceil((w - tl.x) / cw));
  const r0 = Math.max(0, Math.floor(-tl.y / ch));
  const r1 = Math.min(grid.rows, Math.ceil((h - tl.y) / ch));
  ctx.beginPath();
  for (let c = c0 - (c0 % sx); c <= c1; c += sx) {
    const x = Math.round(tl.x + c * cw) + 0.5;
    ctx.moveTo(x, Math.max(0, tl.y));
    ctx.lineTo(x, Math.min(h, br.y));
  }
  for (let r = r0 - (r0 % sy); r <= r1; r += sy) {
    const y = Math.round(tl.y + r * ch) + 0.5;
    ctx.moveTo(Math.max(0, tl.x), y);
    ctx.lineTo(Math.min(w, br.x), y);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = s.bold ? 4 : 3;
  ctx.stroke();
  ctx.strokeStyle = LINE_COLOURS[s.colour] ?? LINE_COLOURS[0]!;
  ctx.lineWidth = s.bold ? 2 : 1;
  ctx.stroke();
}

/** The two marks as gold rings, and for Length the line between them. */
function paintMarks(ctx: CanvasRenderingContext2D, s: EditorScene, v: EditorView, inLens: boolean): void {
  if (s.tool === 'length' && s.markA && s.markB) {
    const a = toScreen(v, s.markA);
    const b = toScreen(v, s.markB);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (const m of [s.markA, s.markB]) {
    if (!m) continue;
    const p = toScreen(v, m);
    ctx.beginPath();
    ctx.arc(p.x, p.y, inLens ? 6 : 9, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a1306';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * Paints the magnifier: about three squares around a picture point, with a crosshair.
 *
 * @param lens - the magnifier's canvas (sized here)
 * @param s - the scene
 * @param at - the picture point under the finger
 */
export function paintLens(lens: HTMLCanvasElement, s: EditorScene, at: Point): void {
  const ctx = lens.getContext('2d');
  if (!ctx) return;
  const size = LENS_PX;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (lens.width !== size * dpr) {
    lens.width = size * dpr;
    lens.height = size * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const scale = size / (3 * Math.max(s.grid.cellW, s.grid.cellH));
  paintScene(ctx, s, { scale, ox: size / 2 - at.x * scale, oy: size / 2 - at.y * scale }, size, size, true);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2 - 12);
  ctx.lineTo(size / 2, size / 2 + 12);
  ctx.moveTo(size / 2 - 12, size / 2);
  ctx.lineTo(size / 2 + 12, size / 2);
  ctx.stroke();
}
