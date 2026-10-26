/**
 * Secret doors, hidden marks and traps (roadmap S9), above the fog in the doors slot: on the
 * players' view only what was found — a found door's closed leaf, a found mark's gold sigil, a
 * sprung trap's red warning glyph — on the DM's view every secret's glyph, hollow while hidden,
 * filled once found. What to draw is `secrets-logic.ts`; the graphics are rebuilt only when the
 * map's secrets, the geometry or the map change, never per frame.
 *
 * It also tells the doors layer which of the map's own doors are unfound secret doors
 * ({@link SecretsLayer.hidden}): the players' view draws no leaf for them.
 */
import { Container, Graphics } from 'pixi.js';
import { hiddenDoors, type MapGeometry, type MapPlay, type Secret } from '@battlemap/shared';
import { SQUARE } from './camera.ts';
import { leafGraphics } from './doors-layer.ts';
import { secretMarks, type SecretMark } from './secrets-logic.ts';

/** Trap red. */
const TRAP = 0xd9473f;
/** Mark gold (the accent). */
const MARK = 0xd8b25a;
/** Door wood. */
const DOOR = 0xb07a45;
/** The dark rim under every glyph, so it reads on any floor. */
const RIM = 0x14110e;

const NO_DOORS: ReadonlySet<number> = new Set();

/** The secrets layer. */
export class SecretsLayer {
  /** The container (added to the scene's doors slot, above the doors). */
  readonly container = new Container({ label: 'secrets' });
  private readonly glyphs = new Graphics({ label: 'secret-glyphs' });
  private readonly leaves = new Container({ label: 'secret-leaves' });
  private secrets: readonly Secret[] | undefined | null = null;
  private geometry: MapGeometry | null = null;
  private mapId: string | null = null;
  private hiddenSet: ReadonlySet<number> = NO_DOORS;

  /**
   * @param parent - the scene's doors slot
   * @param dm - the DM's view (every secret) or the players' (found ones)
   */
  constructor(parent: Container, private readonly dm: boolean) {
    this.container.addChild(this.leaves, this.glyphs);
    parent.addChild(this.container);
  }

  /** The map's own doors that are unfound secret doors (none on the DM's view). */
  get hidden(): ReadonlySet<number> {
    return this.hiddenSet;
  }

  /**
   * Shows a map's secrets.
   *
   * @param map - the map on the table, or null
   * @param geometry - its walls and doors (null while loading or for picture maps)
   * @returns whether anything changed
   */
  set(map: MapPlay | null, geometry: MapGeometry | null): boolean {
    const id = map?.info.id ?? null;
    if (map?.secrets === this.secrets && geometry === this.geometry && id === this.mapId) return false;
    const hadAny = (this.secrets?.length ?? 0) > 0;
    this.secrets = map?.secrets;
    this.geometry = geometry;
    this.mapId = id;
    const hidden = map && !this.dm ? hiddenDoors(map) : NO_DOORS;
    this.hiddenSet = hidden.size === 0 ? NO_DOORS : hidden;
    if (!hadAny && !map?.secrets?.length) return false;
    this.draw(secretMarks(map, this.dm, geometry));
    return true;
  }

  private draw(marks: readonly SecretMark[]): void {
    const g = this.glyphs.clear();
    for (const l of this.leaves.removeChildren()) l.destroy({ children: true });
    for (const m of marks) {
      if (m.leaf) {
        const root = new Container({ label: 'secret-door' });
        root.position.set(m.leaf.ax * SQUARE, m.leaf.ay * SQUARE);
        root.rotation = Math.atan2(m.leaf.by - m.leaf.ay, m.leaf.bx - m.leaf.ax);
        root.addChild(leafGraphics(Math.hypot(m.leaf.bx - m.leaf.ax, m.leaf.by - m.leaf.ay) * SQUARE));
        this.leaves.addChild(root);
        continue;
      }
      glyph(g, m, this.dm);
    }
  }

  /** Frees everything. */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * One secret's glyph at its square's centre: a trap a warning triangle, a mark a diamond in a
 * ring, a door a small door slab. Hidden ones (DM view) are hollow, found ones filled.
 */
function glyph(g: Graphics, m: SecretMark, dm: boolean): void {
  const cx = m.x * SQUARE;
  const cy = m.y * SQUARE;
  const r = 0.3 * SQUARE;
  const color = m.kind === 'trap' ? TRAP : m.kind === 'mark' ? MARK : DOOR;
  const solid = m.found || !dm;
  const line = 0.05 * SQUARE;
  // a soft dark disc under it: readable on any floor
  g.circle(cx, cy, r * 1.25).fill({ color: RIM, alpha: solid ? 0.55 : 0.4 });
  if (m.kind === 'trap') {
    const pts = [cx, cy - r, cx + r * 0.95, cy + r * 0.72, cx - r * 0.95, cy + r * 0.72];
    g.poly(pts);
    if (solid) g.fill({ color });
    g.stroke({ width: line, color, alpha: solid ? 1 : 0.9, join: 'round' });
    const ink = solid ? RIM : color;
    g.rect(cx - line * 0.6, cy - r * 0.45, line * 1.2, r * 0.6).fill(ink);
    g.circle(cx, cy + r * 0.4, line * 0.75).fill(ink);
  } else if (m.kind === 'mark') {
    g.circle(cx, cy, r).stroke({ width: line, color, alpha: solid ? 1 : 0.9 });
    g.poly([cx, cy - r * 0.62, cx + r * 0.62, cy, cx, cy + r * 0.62, cx - r * 0.62, cy]);
    if (solid) g.fill({ color });
    else g.stroke({ width: line, color, alpha: 0.9 });
  } else {
    g.roundRect(cx - r * 0.55, cy - r * 0.85, r * 1.1, r * 1.7, r * 0.15);
    if (solid) g.fill({ color });
    g.stroke({ width: line, color, alpha: solid ? 1 : 0.9 });
    g.circle(cx + r * 0.25, cy, line * 0.7).fill(solid ? RIM : color);
  }
}
