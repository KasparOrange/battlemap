/**
 * Freehand drawings: committed strokes in chunks of `CHUNK` strokes per `Graphics` (adding or
 * undoing a stroke re-tessellates one chunk, not all of them, and a few hundred strokes stay a
 * handful of draw calls), plus the live stroke being drawn at 70 %. Round caps and joins; widths
 * in squares.
 */
import { Container, Graphics } from 'pixi.js';
import type { Stroke } from '@battlemap/shared';
import { SQUARE } from './camera.ts';

/** Strokes per chunk. */
export const CHUNK = 32;

/** The drawings layer. */
export class DrawingsLayer {
  /** The container (the scene's drawings slot). */
  readonly container = new Container({ label: 'drawings' });
  private chunks: { g: Graphics; strokes: Stroke[] }[] = [];
  private readonly live = new Graphics({ label: 'live-stroke' });
  private strokes: readonly Stroke[] | null = null;
  private liveStroke: Stroke | null = null;

  /** @param parent - the scene's drawings slot */
  constructor(parent: Container) {
    this.live.alpha = 0.7;
    this.container.addChild(this.live);
    parent.addChild(this.container);
  }

  /**
   * Shows a map's strokes and the live one.
   *
   * @param strokes - committed strokes, oldest first (null: none)
   * @param live - the stroke being drawn, or null
   * @returns whether anything changed
   */
  set(strokes: readonly Stroke[] | null, live: Stroke | null): boolean {
    let changed = false;
    if (strokes !== this.strokes) {
      this.strokes = strokes;
      this.setStrokes(strokes ?? []);
      changed = true;
    }
    if (live !== this.liveStroke) {
      this.liveStroke = live;
      this.live.clear();
      if (live) drawStroke(this.live, live);
      changed = true;
    }
    return changed;
  }

  private setStrokes(list: readonly Stroke[]): void {
    const need = Math.ceil(list.length / CHUNK);
    for (let c = 0; c < need; c++) {
      const part = list.slice(c * CHUNK, (c + 1) * CHUNK);
      let chunk = this.chunks[c];
      if (!chunk) {
        chunk = { g: new Graphics({ label: `strokes ${c}` }), strokes: [] };
        this.chunks.push(chunk);
        this.container.addChildAt(chunk.g, c);
      }
      if (sameRefs(chunk.strokes, part)) continue;
      chunk.strokes = part;
      chunk.g.clear();
      for (const s of part) drawStroke(chunk.g, s);
    }
    while (this.chunks.length > need) this.chunks.pop()!.g.destroy();
  }

  /** Frees everything. */
  destroy(): void {
    this.container.destroy({ children: true });
    this.chunks = [];
  }
}

function sameRefs(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Adds one stroke to a Graphics (a single point becomes a dot). */
function drawStroke(g: Graphics, s: Stroke): void {
  const p = s.points;
  const w = s.width * SQUARE;
  if (p.length < 4) {
    g.circle(p[0]! * SQUARE, p[1]! * SQUARE, w / 2).fill(s.color);
    return;
  }
  g.moveTo(p[0]! * SQUARE, p[1]! * SQUARE);
  for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(p[i]! * SQUARE, p[i + 1]! * SQUARE);
  g.stroke({ width: w, color: s.color, cap: 'round', join: 'round' });
}
