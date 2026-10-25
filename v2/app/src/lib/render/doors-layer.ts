/**
 * Doors, above the fog. The DM sees a marker on every door (orange closed, green open — the
 * taps go there). Maps whose picture shows empty doorways (`drawDoors`, AI maps) get drawn
 * wooden leaves on both screens: a leaf with grain, iron straps at 20/80 %, a hinge pin and a
 * shadow, swinging 0.4 s ease-in-out to 85° (south/east), reversing from where it is when
 * toggled mid-swing, no swing on load. On the TV a drawn door shows only while the fog is off or
 * a square beside the doorway is revealed, so doors deep in the fog give nothing away. The DM's
 * walls debug view draws here too.
 */
import { Container, Graphics } from 'pixi.js';
import { bitIsSet, maskToBytes, type Door, type FogState, type MapGeometry } from '@battlemap/shared';
import { SQUARE } from './camera.ts';
import type { RenderScheduler } from './scheduler.ts';

/** Swing time, ms. */
export const SWING_MS = 400;

/** Open angle, radians (85°). */
const OPEN = (85 * Math.PI) / 180;

/** Leaf thickness in squares. */
const LEAF = 0.14;

/** One drawn door. */
interface Leaf {
  root: Container;
  base: number;
  sign: number;
  angle: number;
  from: number;
  to: number;
  start: number;
}

/** Which way a door opens: +1 or −1, so its free end swings toward south-east. */
export function swingSign(d: Door): number {
  const dx = d.b.x - d.a.x;
  const dy = d.b.y - d.a.y;
  // normal of a +θ turn is (−dy, dx); pick the sign whose normal points down-right
  return -dy + dx >= 0 ? 1 : -1;
}

/**
 * The two squares beside a doorway (cell indices, −1 off the map).
 *
 * @param d - the door
 * @param cols - map width
 * @param rows - map height
 * @returns the cells on either side of the door's middle
 */
export function doorSides(d: Door, cols: number, rows: number): [number, number] {
  const mx = (d.a.x + d.b.x) / 2;
  const my = (d.a.y + d.b.y) / 2;
  const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) || 1;
  const nx = -(d.b.y - d.a.y) / len;
  const ny = (d.b.x - d.a.x) / len;
  const cell = (x: number, y: number) => {
    const c = Math.floor(x);
    const r = Math.floor(y);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  return [cell(mx + nx * 0.5, my + ny * 0.5), cell(mx - nx * 0.5, my - ny * 0.5)];
}

/** The doors layer. */
export class DoorsLayer {
  /** The container (the scene's doors slot). */
  readonly container = new Container({ label: 'doors' });
  private readonly walls = new Graphics({ label: 'walls' });
  private readonly markers = new Graphics({ label: 'door-markers' });
  private readonly leavesBox = new Container({ label: 'door-leaves' });
  private leaves: Leaf[] = [];
  private geometry: MapGeometry | null = null;
  private drawDoors = false;
  private open: readonly number[] = [];
  private fog: FogState | null = null;
  private cols = 0;
  private rows = 0;
  private release: (() => void) | null = null;
  private readonly stopTicker: () => void;
  private wallsOn = false;

  /**
   * @param parent - the scene's doors slot
   * @param dm - DM view (markers, walls debug) or players' (fog rule for drawn doors)
   * @param scheduler - for the swing lease
   */
  constructor(parent: Container, private readonly dm: boolean, private readonly scheduler: RenderScheduler) {
    this.walls.visible = false;
    this.container.addChild(this.walls, this.leavesBox, this.markers);
    parent.addChild(this.container);
    this.stopTicker = scheduler.onFrame((now) => this.tick(now));
  }

  /**
   * Shows a map's doors.
   *
   * @param geometry - walls and doors (null while not loaded or a picture map)
   * @param drawDoors - whether leaves are drawn
   * @param open - indices of open doors
   * @param fog - the map's fog (players: which drawn doors show)
   * @param cols - map width
   * @param rows - map height
   * @param fresh - a new map: no swing
   * @returns whether anything changed
   */
  set(geometry: MapGeometry | null, drawDoors: boolean, open: readonly number[], fog: FogState | null, cols: number, rows: number, fresh: boolean): boolean {
    let changed = false;
    if (geometry !== this.geometry || drawDoors !== this.drawDoors) {
      this.geometry = geometry;
      this.drawDoors = drawDoors;
      this.cols = cols;
      this.rows = rows;
      this.buildLeaves();
      this.drawWalls();
      fresh = true;
      changed = true;
    }
    if (open !== this.open || changed) {
      const now = performance.now();
      const set = new Set(open);
      this.leaves.forEach((l, i) => {
        const to = set.has(i) ? OPEN : 0;
        if (fresh) {
          l.angle = l.from = l.to = to;
          l.root.rotation = l.base + l.sign * to;
        } else if (to !== l.to) {
          l.from = l.angle;
          l.to = to;
          l.start = now;
          this.release ??= this.scheduler.hold('door-swing');
        }
      });
      this.open = open;
      this.drawMarkers(set);
      changed = true;
    }
    if (fog !== this.fog || changed) {
      this.fog = fog;
      this.applyFogRule();
      changed = true;
    }
    return changed;
  }

  /**
   * DM: shows the walls debug lines.
   *
   * @param on - whether walls show
   */
  setWalls(on: boolean): void {
    this.wallsOn = on;
    this.walls.visible = on && this.dm;
  }

  /** The doors (for hit tests). */
  get doors(): readonly Door[] {
    return this.geometry?.doors ?? [];
  }

  private tick(now: number): void {
    if (!this.release) return;
    let moving = false;
    for (const l of this.leaves) {
      if (l.angle === l.to) continue;
      // reversing mid-swing takes only the remaining share of the time
      const span = Math.abs(l.to - l.from) / OPEN;
      const t = Math.min(1, (now - l.start) / (SWING_MS * Math.max(span, 0.05)));
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      l.angle = t >= 1 ? l.to : l.from + (l.to - l.from) * e;
      l.root.rotation = l.base + l.sign * l.angle;
      if (t < 1) moving = true;
    }
    if (!moving) {
      this.release();
      this.release = null;
    }
  }

  private applyFogRule(): void {
    if (this.dm || !this.leaves.length) return;
    const fog = this.fog;
    if (!fog || !fog.on) {
      for (const l of this.leaves) l.root.visible = true;
      return;
    }
    const bytes = maskToBytes(fog.revealed, this.cols * this.rows);
    this.geometry!.doors.forEach((d, i) => {
      const [s1, s2] = doorSides(d, this.cols, this.rows);
      this.leaves[i]!.root.visible = (s1 >= 0 && bitIsSet(bytes, s1)) || (s2 >= 0 && bitIsSet(bytes, s2));
    });
  }

  private buildLeaves(): void {
    for (const l of this.leaves) l.root.destroy({ children: true });
    this.leaves = [];
    if (!this.geometry || !this.drawDoors) return;
    for (const d of this.geometry.doors) {
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * SQUARE;
      const root = new Container({ label: 'door' });
      root.position.set(d.a.x * SQUARE, d.a.y * SQUARE);
      const base = Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x);
      root.rotation = base;
      root.addChild(leafGraphics(len));
      this.leavesBox.addChild(root);
      this.leaves.push({ root, base, sign: swingSign(d), angle: 0, from: 0, to: 0, start: 0 });
    }
  }

  private drawMarkers(open: Set<number>): void {
    const g = this.markers.clear();
    if (!this.dm || !this.geometry) return;
    this.geometry.doors.forEach((d, i) => {
      const pad = 0.15;
      let x0 = Math.min(d.a.x, d.b.x) - pad;
      let x1 = Math.max(d.a.x, d.b.x) + pad;
      let y0 = Math.min(d.a.y, d.b.y) - pad;
      let y1 = Math.max(d.a.y, d.b.y) + pad;
      if (x1 - x0 < 0.5) [x0, x1] = [(x0 + x1) / 2 - 0.25, (x0 + x1) / 2 + 0.25];
      if (y1 - y0 < 0.5) [y0, y1] = [(y0 + y1) / 2 - 0.25, (y0 + y1) / 2 + 0.25];
      g.rect(x0 * SQUARE, y0 * SQUARE, (x1 - x0) * SQUARE, (y1 - y0) * SQUARE)
        .fill({ color: open.has(i) ? 0x00aa00 : 0xaa4400, alpha: 0.6 })
        .stroke({ width: 0.04 * SQUARE, color: 0xffffff, alpha: 0.53 });
    });
  }

  private drawWalls(): void {
    const g = this.walls.clear();
    if (!this.dm || !this.geometry) return;
    for (const w of this.geometry.walls) {
      if (w.length < 2) continue;
      g.moveTo(w[0]!.x * SQUARE, w[0]!.y * SQUARE);
      for (let i = 1; i < w.length; i++) g.lineTo(w[i]!.x * SQUARE, w[i]!.y * SQUARE);
    }
    g.stroke({ width: 0.05 * SQUARE, color: 0xff0000, alpha: 0.53, cap: 'round', join: 'round' });
    this.walls.visible = this.wallsOn;
  }

  /** Frees everything. */
  destroy(): void {
    this.stopTicker();
    this.release?.();
    this.container.destroy({ children: true });
  }
}

/** A wooden leaf from the hinge (0, 0) along +x, `len` world units. */
function leafGraphics(len: number): Graphics {
  const t = LEAF * SQUARE;
  const g = new Graphics();
  g.rect(t * 0.25, -t / 2 + t * 0.3, len, t).fill({ color: 0x000000, alpha: 0.35 }); // shadow
  g.rect(0, -t / 2, len, t).fill(0x6e4b2c).stroke({ width: t * 0.12, color: 0x3a2412 });
  for (const f of [0.3, 0.55, 0.8]) g.moveTo(t * 0.4, -t / 2 + t * f * 0.9).lineTo(len - t * 0.4, -t / 2 + t * f * 0.9);
  g.stroke({ width: t * 0.06, color: 0x4f341d });
  for (const f of [0.2, 0.8]) g.rect(len * f - t * 0.3, -t / 2, t * 0.6, t).fill(0x2b2b2b);
  g.circle(0, 0, t * 0.42).fill(0x1c1c1c);
  return g;
}
