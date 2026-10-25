/**
 * Torch glow and map life from the map's own data (RD-120, roadmap N7): a soft light pool at
 * every light of the `.dd2vtt` file — its colour, its range, its intensity — drawn as one
 * additive sprite per light from one shared 128 px glow texture (64 KB), so all pools batch into
 * a draw call. Warm lights flicker like flames, cold ones breathe slowly; all on one shared
 * clock at {@link MAP_LIGHTS_FPS} under a render lease, so idle costs nothing when they are off.
 *
 * The pools sit in the effects' ground slot — under the fog, so fog hides what the players
 * haven't found. Nothing stops the light yet (lighting from walls comes later).
 *
 * Quality (the effects setting): `full` flickers, `low` shows still pools without a lease,
 * `off` shows none. The game switch is `GameSettings.mapLights` (default off); the renderer
 * hands the lights only while it is on.
 *
 * @see ../../../../docs/render.md "map lights"
 */
import { Container, Sprite, Texture, type BLEND_MODES } from 'pixi.js';
import type { Light } from '@battlemap/shared';
import { flicker, lightLook, type LightLook } from './light-look.ts';
import type { Logger } from '../log.ts';
import type { RenderScheduler } from '../render/scheduler.ts';
import type { EffectsQuality } from './budget.ts';

/** Frame-rate cap of the flicker (a flame reads well at 30). */
export const MAP_LIGHTS_FPS = 30;

/** Most lights drawn (the 114 × 64 castle has 80). */
export const MAX_MAP_LIGHTS = 256;

/** Side of the shared glow texture in px. */
const GLOW_PX = 128;

/** Draws the glow texture: white, alpha falling off smoothly to 0 at the rim. */
function makeGlow(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GLOW_PX;
  const g = canvas.getContext('2d')!;
  const c = GLOW_PX / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  for (let i = 0; i <= 8; i++) {
    const d = i / 8;
    const a = (1 - d * d) ** 2;
    grad.addColorStop(d, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_PX, GLOW_PX);
  const t = Texture.from(canvas);
  t.source.label = 'map-light-glow';
  return t;
}

/** One pool on screen. */
interface Pool {
  sprite: Sprite;
  look: LightLook;
}

/** The light pools of the map on the table. */
export class MapLights {
  /** The container (first child of the ground slot). */
  readonly container = new Container({ label: 'map-lights' });
  private glow: Texture | null = null;
  private pools: Pool[] = [];
  private lights: readonly Light[] | null = null;
  private quality: EffectsQuality = 'full';
  private release: (() => void) | null = null;
  private readonly stopTicker: () => void;

  /**
   * @param parent - the effects' ground slot
   * @param unitsPerSquare - world units per square there
   * @param scheduler - the render loop (lease and ticker)
   * @param log - the logger
   */
  constructor(parent: Container, private readonly unitsPerSquare: number, private readonly scheduler: RenderScheduler, private readonly log: Logger) {
    parent.addChildAt(this.container, 0);
    this.stopTicker = scheduler.onFrame((now) => this.tick(now));
  }

  /** Lights drawn. */
  get count(): number {
    return this.pools.length;
  }

  /** Texture bytes held (the glow). */
  get bytes(): number {
    return this.glow ? GLOW_PX * GLOW_PX * 4 : 0;
  }

  /**
   * Shows the map's lights (or none).
   *
   * @param lights - the geometry file's lights, null when off (setting, no map, no geometry)
   * @param quality - the effects quality of this screen
   * @returns whether anything changed on screen
   */
  set(lights: readonly Light[] | null, quality: EffectsQuality): boolean {
    const shown = quality === 'off' ? null : lights;
    if (shown === this.lights && quality === this.quality) return false;
    const rebuilt = shown !== this.lights;
    this.lights = shown;
    this.quality = quality;
    if (rebuilt) this.build(shown);
    this.updateLease();
    if (!this.release) this.still();
    return true;
  }

  private build(lights: readonly Light[] | null): void {
    for (const p of this.pools) p.sprite.destroy();
    this.pools = [];
    if (!lights || lights.length === 0) return;
    this.glow ??= makeGlow();
    const n = Math.min(lights.length, MAX_MAP_LIGHTS);
    for (let i = 0; i < n; i++) {
      const look = lightLook(lights[i]!, this.unitsPerSquare, i);
      if (!look) continue;
      const sprite = new Sprite({ texture: this.glow, anchor: 0.5, label: 'map-light' });
      sprite.blendMode = 'add' satisfies BLEND_MODES;
      sprite.tint = look.tint;
      sprite.position.set(look.x, look.y);
      this.container.addChild(sprite);
      this.pools.push({ sprite, look });
    }
    this.log.info('effects', 'Map lights', { lights: lights.length, drawn: this.pools.length, quality: this.quality });
  }

  /** Flicker needs frames: a capped lease while there are pools and the quality is full. */
  private updateLease(): void {
    const want = this.pools.length > 0 && this.quality === 'full';
    if (want && !this.release) this.release = this.scheduler.hold('map-lights', MAP_LIGHTS_FPS);
    if (!want && this.release) {
      this.release();
      this.release = null;
    }
  }

  /** Every pool at its still look. */
  private still(): void {
    for (const p of this.pools) {
      p.sprite.alpha = p.look.alpha;
      p.sprite.scale.set((2 * p.look.radius) / GLOW_PX);
    }
  }

  /** Before each frame while flickering: alpha and size follow the shared clock. */
  private tick(now: number): void {
    if (!this.release) return;
    const t = now / 1000;
    const k = 2 / GLOW_PX;
    for (const p of this.pools) {
      const f = flicker(t, p.look.phase, p.look.flicker);
      p.sprite.alpha = p.look.alpha * f;
      p.sprite.scale.set(p.look.radius * k * (1 + (f - 1) * 0.25));
    }
  }

  /** Frees the pools, the texture and the lease. */
  destroy(): void {
    this.stopTicker();
    this.release?.();
    this.release = null;
    for (const p of this.pools) p.sprite.destroy();
    this.pools = [];
    this.glow?.destroy(true);
    this.glow = null;
    this.container.destroy();
  }
}
