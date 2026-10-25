/**
 * The table tools, above the fog and the DM layers: the L-ruler (wood, ticks every square and
 * half, numbers 1–10 kept upright on screen), the template disc (tint, rim, rings, cubes, cones
 * solid or dotted, compass marks, middle mark, label pills that flip rather than read upside
 * down; the gold turning knob on the DM's view only — its look is tessellated once per look,
 * moving or turning it is a transform), and the measure line (gold dashes, end dots, "N ft" by
 * the 5e diagonal rule).
 */
import { BitmapText, Container, Graphics } from 'pixi.js';
import {
  coneTriangle, feetToSquares, markerAngles, markerRadius, rimRadius, RULER_ARM_SQUARES, shows, knobLocal,
  type DiscShapeSet, type MeasureLine, type Ruler, type TemplateDisc,
} from '@battlemap/shared';
import { SQUARE } from './camera.ts';
import { FONT_TEXT, GLYPH_PX, installFonts } from './fonts.ts';
import { KNOB_RADIUS, RULER_ARM_WIDTH } from './hit.ts';

const TEXT = { fontFamily: FONT_TEXT, fontSize: GLYPH_PX };

/**
 * The 5e distance of a measure line: straight squares × 5, diagonals alternating 5 / 10 ft.
 *
 * @param m - the line in squares
 * @returns feet
 */
export function measureFeet(m: MeasureLine): number {
  const dx = Math.abs(Math.round(m.b.x - m.a.x));
  const dy = Math.abs(Math.round(m.b.y - m.a.y));
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  return Math.floor(diag / 2) * 15 + (diag % 2) * 5 + straight * 5;
}

/** A label on screen: its container and its own angle in the parent frame. */
interface Label {
  node: Container;
  angle: number;
}

/** The tools layer. */
export class ToolsLayer {
  /** The container (the scene's tools slot). */
  readonly container = new Container({ label: 'tools' });
  private readonly disc = new Container({ label: 'disc' });
  private readonly discShape = new Graphics({ label: 'disc-shape' });
  private readonly discLabels = new Container({ label: 'disc-labels' });
  private readonly knob = new Graphics({ label: 'disc-knob' });
  private readonly ruler = new Container({ label: 'ruler' });
  private readonly rulerShape = new Graphics({ label: 'ruler-shape' });
  private readonly rulerNumbers: BitmapText[] = [];
  private readonly measure = new Container({ label: 'measure' });
  private readonly measureLine = new Graphics({ label: 'measure-line' });
  private readonly measurePill = new Graphics({ label: 'measure-pill' });
  private readonly measureText: BitmapText;
  private labels: Label[] = [];
  private discLook = '';
  private discState: TemplateDisc | null = null;
  private rulerState: Ruler | null = null;
  private measureState: MeasureLine | null = null;
  private camRotation = 0;

  /**
   * @param parent - the scene's tools slot
   * @param dm - the DM's view (with the disc's knob)
   */
  constructor(parent: Container, private readonly dm: boolean) {
    installFonts();
    this.disc.addChild(this.discShape, this.discLabels, this.knob);
    this.knob.visible = dm;
    this.disc.visible = false;
    this.ruler.addChild(this.rulerShape);
    this.buildRuler();
    this.ruler.visible = false;
    this.measureText = new BitmapText({ text: '', style: TEXT, anchor: 0.5 });
    this.measureText.scale.set((0.35 * SQUARE) / GLYPH_PX);
    this.measure.addChild(this.measureLine, this.measurePill, this.measureText);
    this.measure.visible = false;
    // drawn order: disc, measure, ruler on top (the old layer order)
    this.container.addChild(this.disc, this.measure, this.ruler);
    parent.addChild(this.container);
  }

  /**
   * Shows the tools of a map.
   *
   * @param disc - the template disc (null: no map)
   * @param ruler - the ruler
   * @param measure - the live measure line
   * @returns whether anything changed
   */
  set(disc: TemplateDisc | null, ruler: Ruler | null, measure: MeasureLine | null): boolean {
    let changed = false;
    if (disc !== this.discState) {
      this.discState = disc;
      this.setDisc(disc);
      changed = true;
    }
    if (ruler !== this.rulerState) {
      this.rulerState = ruler;
      this.ruler.visible = !!ruler?.visible;
      if (ruler) {
        this.ruler.position.set(ruler.x * SQUARE, ruler.y * SQUARE);
        this.ruler.rotation = (ruler.rotation * Math.PI) / 180;
      }
      this.uprightRuler();
      changed = true;
    }
    if (measure !== this.measureState) {
      this.measureState = measure;
      this.setMeasure(measure);
      changed = true;
    }
    return changed;
  }

  /**
   * Keeps text upright for the camera's turn.
   *
   * @param rotation - the camera's turn in radians
   */
  setCameraRotation(rotation: number): void {
    if (rotation === this.camRotation) return;
    this.camRotation = rotation;
    this.uprightRuler();
    this.flipDiscLabels();
    this.measureText.rotation = -rotation;
    this.setMeasure(this.measureState);
  }

  private setDisc(disc: TemplateDisc | null): void {
    this.disc.visible = !!disc?.visible;
    if (!disc || !disc.visible) return;
    const look = lookKey(disc);
    if (look !== this.discLook) {
      this.discLook = look;
      this.buildDisc(disc);
    }
    this.disc.position.set(disc.x * SQUARE, disc.y * SQUARE);
    this.disc.rotation = (disc.rotation * Math.PI) / 180;
    this.flipDiscLabels();
  }

  private flipDiscLabels(): void {
    const turn = this.disc.rotation;
    for (const l of this.labels) {
      const onScreen = turn + l.angle + this.camRotation;
      l.node.rotation = l.angle + (Math.cos(onScreen) < 0 ? Math.PI : 0);
    }
  }

  private buildDisc(d: TemplateDisc): void {
    const g = this.discShape.clear();
    for (const l of this.labels) l.node.destroy({ children: true });
    this.labels = [];
    const S = SQUARE;
    const lw = d.lineWidth * S;
    const rim = rimRadius(d) * S;
    g.circle(0, 0, rim).fill({ color: 0xffffff, alpha: d.tint });
    if (d.rim) g.circle(0, 0, rim).stroke({ width: lw * 1.4, color: 0xe8eef2, alpha: 0.7 });
    const outline = (set: DiscShapeSet, pts: { x: number; y: number }[], closed: boolean) => {
      if (set.line === 'dotted') dashed(g, pts, closed, 0.14 * S, 0.1 * S);
      else {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        if (closed) g.closePath();
      }
      g.stroke({ width: lw, color: set.color, cap: 'round', join: 'round' });
    };
    if (shows(d.rings)) {
      for (const ft of d.rings.sizes) {
        const r = feetToSquares(ft) * S;
        outline(d.rings, circlePoints(r), true);
        if (d.rings.labels) this.addLabel(d, d.rings, `${fmt(ft)}' RADIUS`, 0, -r, 0);
      }
    }
    if (shows(d.cubes)) {
      for (const ft of d.cubes.sizes) {
        const h = (feetToSquares(ft) / 2) * S;
        outline(d.cubes, [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }], true);
        if (d.cubes.labels) this.addLabel(d, d.cubes, `${fmt(ft)}' CUBE`, 0, h, 0);
      }
    }
    if (shows(d.cones)) {
      for (const ft of d.cones.sizes) {
        const t = coneTriangle(d, ft).map((p) => ({ x: p.x * S, y: p.y * S }));
        outline(d.cones, t, true);
        if (d.cones.labels) {
          const ex = t[0]!.x - t[2]!.x;
          const ey = t[0]!.y - t[2]!.y;
          this.addLabel(d, d.cones, `${fmt(ft)}' CONE`, t[2]!.x + ex * 0.3, t[2]!.y + ey * 0.3, Math.atan2(ey, ex));
        }
      }
    }
    const angles = markerAngles(d);
    if (angles.length) {
      const r = markerRadius(d) * S;
      for (const a of angles) {
        const c = Math.cos(a), s = Math.sin(a);
        const len = 0.22 * S, side = 0.09 * S, back = 0.12 * S;
        const px = -s, py = c;
        g.poly([
          (r + len) * c, (r + len) * s,
          r * c + px * side, r * s + py * side,
          (r - back) * c, (r - back) * s,
          r * c - px * side, r * s - py * side,
        ]).fill(0x141414);
      }
    }
    if (d.centerMark) {
      g.circle(0, 0, 0.5 * S).stroke({ width: lw, color: 0x141414 });
      g.moveTo(-0.2 * S, 0).lineTo(0.2 * S, 0).moveTo(0, -0.2 * S).lineTo(0, 0.2 * S).stroke({ width: lw, color: 0x141414 });
    }
    const k = this.knob.clear();
    if (this.dm) {
      const kp = knobLocal(d);
      const kr = KNOB_RADIUS * S;
      k.circle(kp.x * S, kp.y * S, kr).fill(0xd4a24a).stroke({ width: 0.03 * S, color: 0x5a3d10 });
      k.arc(kp.x * S, kp.y * S, kr * 0.55, -Math.PI * 0.9, Math.PI * 0.5).stroke({ width: 0.05 * S, color: 0x3a2808, cap: 'round' });
    }
  }

  private addLabel(d: TemplateDisc, set: DiscShapeSet, text: string, x: number, y: number, angle: number): void {
    const S = SQUARE;
    const node = new Container({ label: 'disc-label' });
    node.position.set(x, y);
    const t = new BitmapText({ text, style: TEXT, anchor: 0.5 });
    t.scale.set((d.labelSize * S) / GLYPH_PX);
    t.tint = set.color;
    const padX = d.labelSize * 0.45 * S;
    const padY = d.labelSize * 0.18 * S;
    const w = t.width + padX * 2;
    const h = d.labelSize * S * 1.2 + padY * 2;
    const pill = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, h * 0.3)
      .fill({ color: 0xffffff, alpha: 0.95 })
      .stroke({ width: d.lineWidth * 0.6 * S, color: set.color });
    node.addChild(pill, t);
    this.discLabels.addChild(node);
    this.labels.push({ node, angle });
  }

  private buildRuler(): void {
    const S = SQUARE;
    const len = RULER_ARM_SQUARES * S;
    const w = RULER_ARM_WIDTH * S;
    const g = this.rulerShape;
    // the L: horizontal arm along +x (above the corner), vertical arm along −y (left of it)
    g.poly([-w, w * 0, len, 0, len, -w, 0, -w, 0, -len, -w, -len]).fill({ color: 0x5c3a1e, alpha: 0.85 }).stroke({ width: 0.04 * S, color: 0x3a2410 });
    for (let i = 1; i <= RULER_ARM_SQUARES * 2; i++) {
      const at = (i / 2) * S;
      const tick = (i % 2 === 0 ? 0.22 : 0.12) * S;
      g.moveTo(at, 0).lineTo(at, -tick);
      g.moveTo(-w, -at).lineTo(-w + tick, -at);
    }
    g.stroke({ width: 0.03 * S, color: 0xf3e2c4 });
    for (let i = 1; i <= RULER_ARM_SQUARES; i++) {
      for (const axis of [0, 1]) {
        const t = new BitmapText({ text: String(i), style: TEXT, anchor: 0.5 });
        t.scale.set((0.3 * S) / GLYPH_PX);
        t.tint = 0xfff4dc;
        if (axis === 0) t.position.set(i * S - 0.22 * S, -w * 0.62);
        else t.position.set(-w * 0.38, -i * S + 0.22 * S);
        this.ruler.addChild(t);
        this.rulerNumbers.push(t);
      }
    }
  }

  private uprightRuler(): void {
    const r = -(this.ruler.rotation + this.camRotation);
    for (const t of this.rulerNumbers) t.rotation = r;
  }

  private setMeasure(m: MeasureLine | null): void {
    const g = this.measureLine.clear();
    const S = SQUARE;
    const length = m ? Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) : 0;
    this.measure.visible = !!m && length > 0.02;
    if (!m || !this.measure.visible) return;
    dashed(g, [{ x: m.a.x * S, y: m.a.y * S }, { x: m.b.x * S, y: m.b.y * S }], false, 0.2 * S, 0.1 * S);
    g.stroke({ width: 0.04 * S, color: 0xd4a76a, cap: 'round' });
    g.circle(m.a.x * S, m.a.y * S, 0.08 * S).circle(m.b.x * S, m.b.y * S, 0.08 * S).fill(0xd4a76a);
    this.measureText.text = `${measureFeet(m)} ft`;
    const mx = ((m.a.x + m.b.x) / 2) * S;
    const my = ((m.a.y + m.b.y) / 2) * S;
    this.measureText.position.set(mx, my);
    this.measureText.rotation = -this.camRotation;
    const w = this.measureText.width + 0.3 * S;
    const h = 0.55 * S;
    this.measurePill.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x000000, alpha: 0.8 });
    this.measurePill.position.set(mx, my);
    this.measurePill.rotation = -this.camRotation;
  }

  /** Frees everything. */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** The disc's look without where it lies (a move or turn needs no new tessellation). */
function lookKey(d: TemplateDisc): string {
  const { x: _x, y: _y, rotation: _r, visible: _v, ...look } = d;
  return JSON.stringify(look);
}

function fmt(ft: number): string {
  return Number.isInteger(ft) ? String(ft) : ft.toFixed(1);
}

function circlePoints(r: number): { x: number; y: number }[] {
  const n = Math.max(24, Math.min(160, Math.round(r / 2)));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) });
  return out;
}

/**
 * Adds dashes along a polyline to the Graphics' current path (stroke after). The pattern runs
 * on across corners; every step advances by at least a thousandth of a dash, so rounding can
 * never stall the loop.
 */
export function dashed(g: Graphics, pts: { x: number; y: number }[], closed: boolean, dash: number, gap: number): void {
  const list = closed ? [...pts, pts[0]!] : pts;
  const period = dash + gap;
  const minStep = dash * 1e-3;
  let phase = 0; // position in the pattern, 0 ≤ phase < period
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i]!, b = list[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0)) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let t = 0;
    while (len - t > 1e-9) {
      const on = phase < dash;
      const run = Math.max(minStep, Math.min((on ? dash : period) - phase, len - t));
      if (on) g.moveTo(a.x + ux * t, a.y + uy * t).lineTo(a.x + ux * Math.min(len, t + run), a.y + uy * Math.min(len, t + run));
      t += run;
      phase += run;
      if (phase >= period - 1e-12) phase = 0;
    }
  }
}
