/**
 * What effects cost and how the runtime saves when frames get slow — pure logic.
 *
 * - {@link estimateCost}: an effect's cost from its manifest (draw calls, texture bytes, the
 *   area it fills, live particles), so the bench and the log can say what a scene asks of the GPU.
 * - {@link FrameGovernor}: watches frame intervals while effects animate and steps a degrade
 *   level up when they stay slow, down when they stay fast (with hysteresis), within the floor
 *   the `effects` quality setting allows. {@link degradeFor} turns a level into concrete
 *   savings: fewer particles, slower flipbooks, no crossfade, lower filter resolution.
 *
 * @see ../../../../docs/architecture.md "performance budgets"
 */
import type { EffectManifest } from './manifest.ts';
import { nominalSquares } from './anchors.ts';

/** The `effects` quality setting of a screen. */
export type EffectsQuality = 'off' | 'low' | 'full';

/** An effect's estimated cost. */
export interface CostEstimate {
  /** Draw calls (a filter counts its extra pass). */
  drawCalls: number;
  /** GPU bytes of its own textures (shared by every copy of the effect). */
  textureBytes: number;
  /** Area it covers, squares² (a full-screen filter: the visible area). */
  fillSquares: number;
  /** Live particles at most. */
  particles: number;
}

/** Squares² of the 34 × 19 table — what a full-screen pass covers. */
export const TABLE_SQUARES = 34 * 19;

/**
 * Estimates one effect's cost from its manifest.
 *
 * @param m - the manifest
 * @param parts - a composite's part manifests by id (missing parts count as one draw call)
 * @param scale - size factor of the placement (area grows with its square)
 * @returns the estimate
 */
export function estimateCost(m: EffectManifest, parts?: ReadonlyMap<string, EffectManifest>, scale = 1): CostEstimate {
  const area = (m.size ? m.size.w * m.size.h : nominalSquares(m) ** 2) * scale * scale;
  switch (m.technique) {
    case 'sheet':
      return { drawCalls: m.sheet?.crossfade ? 2 : 1, textureBytes: m.gpuBytes, fillSquares: area * (m.sheet?.crossfade ? 2 : 1), particles: 0 };
    case 'set':
      return { drawCalls: 1, textureBytes: m.gpuBytes, fillSquares: area / Math.max(1, m.sheet?.frames.length ?? 1), particles: 0 };
    case 'layers': {
      const n = m.layers?.length ?? 1;
      return { drawCalls: 1, textureBytes: m.gpuBytes, fillSquares: area * n, particles: 0 };
    }
    case 'texture': {
      const filtered = Boolean(m.motion?.shader);
      return { drawCalls: filtered ? 3 : 1, textureBytes: m.gpuBytes, fillSquares: area * (filtered ? 2 : 1), particles: 0 };
    }
    case 'particles': {
      const p = m.particles;
      if (!p) return { drawCalls: 1, textureBytes: m.gpuBytes, fillSquares: 0, particles: 0 };
      const screen = p.emitter === 'screen' ? TABLE_SQUARES / 100 : 1;
      const live = Math.round((p.burst ?? p.max) * screen);
      const avg = (p.size[0] + p.size[1]) / 2;
      return { drawCalls: p.textures.length, textureBytes: m.gpuBytes, fillSquares: live * avg * avg * scale * scale, particles: live };
    }
    case 'shader': {
      const global = m.shader?.apply === 'filter';
      return { drawCalls: 2, textureBytes: m.gpuBytes, fillSquares: global ? TABLE_SQUARES : area, particles: 0 };
    }
    case 'composite': {
      const sum: CostEstimate = { drawCalls: 0, textureBytes: 0, fillSquares: 0, particles: 0 };
      const counted = new Set<string>();
      for (const part of m.parts ?? []) {
        const pm = parts?.get(part.id);
        if (!pm) {
          sum.drawCalls++;
          continue;
        }
        const c = estimateCost(pm, parts, scale * (part.scale ?? 1));
        sum.drawCalls += c.drawCalls;
        sum.fillSquares += c.fillSquares;
        sum.particles += c.particles;
        if (!counted.has(part.id)) sum.textureBytes += c.textureBytes;
        counted.add(part.id);
      }
      return sum;
    }
  }
}

/**
 * Adds costs together (texture bytes of the same effect id count once — the runtime passes
 * each id's bytes once).
 *
 * @param costs - the costs
 * @returns the total
 */
export function sumCosts(costs: Iterable<CostEstimate>): CostEstimate {
  const t: CostEstimate = { drawCalls: 0, textureBytes: 0, fillSquares: 0, particles: 0 };
  for (const c of costs) {
    t.drawCalls += c.drawCalls;
    t.textureBytes += c.textureBytes;
    t.fillSquares += c.fillSquares;
    t.particles += c.particles;
  }
  return t;
}

/** The concrete savings of a degrade level. */
export interface Degrade {
  /** The level (0 = full). */
  level: number;
  /** Factor on particle rates and maximums. */
  particles: number;
  /** Most flipbook frames per second (frames are skipped, the duration stays). */
  maxSheetFps: number;
  /** Whether slow loops crossfade between frames. */
  crossfade: boolean;
  /** Resolution factor of shader filters. */
  filterResolution: number;
  /** Whether a texture's extra band shader (`magic-circle.frag`) runs. */
  spriteShaders: boolean;
}

const LEVELS: readonly Degrade[] = [
  { level: 0, particles: 1, maxSheetFps: 60, crossfade: true, filterResolution: 1, spriteShaders: true },
  { level: 1, particles: 0.6, maxSheetFps: 24, crossfade: false, filterResolution: 0.75, spriteShaders: true },
  { level: 2, particles: 0.35, maxSheetFps: 12, crossfade: false, filterResolution: 0.5, spriteShaders: false },
];

/** The highest degrade level. */
export const MAX_DEGRADE = LEVELS.length - 1;

/**
 * The savings of a level.
 *
 * @param level - 0..{@link MAX_DEGRADE} (clamped)
 * @returns the savings
 */
export function degradeFor(level: number): Degrade {
  return LEVELS[Math.max(0, Math.min(MAX_DEGRADE, Math.round(level)))]!;
}

/** The lowest level a quality setting allows. */
export function floorLevel(quality: EffectsQuality): number {
  return quality === 'low' ? 1 : 0;
}

/** Options of a {@link FrameGovernor}. */
export interface GovernorOptions {
  /** Average frame interval above which it degrades, ms (default 20 — under 50 fps). */
  slowMs?: number;
  /** Average frame interval below which it recovers, ms (default 17.5). */
  fastMs?: number;
  /** How long it must stay slow before stepping up, ms (default 1000). */
  slowForMs?: number;
  /** How long it must stay fast before stepping down, ms (default 4000). */
  fastForMs?: number;
  /** Intervals longer than this are gaps (idle, a hidden tab), not slow frames (default 120). */
  gapMs?: number;
}

/**
 * Steps a degrade level from frame intervals. Feed it one interval per animated frame.
 */
export class FrameGovernor {
  /** The current level. */
  level = 0;
  /** Smoothed frame interval, ms. */
  avgMs = 16.7;
  private floor = 0;
  private slowSince = -1;
  private fastSince = -1;
  private clock = 0;
  private readonly o: Required<GovernorOptions>;

  /** @param opts - thresholds */
  constructor(opts: GovernorOptions = {}) {
    this.o = { slowMs: 20, fastMs: 17.5, slowForMs: 1000, fastForMs: 4000, gapMs: 120, ...opts };
  }

  /**
   * Sets the lowest level allowed (the quality setting).
   *
   * @param floor - 0 or 1
   */
  setFloor(floor: number): void {
    this.floor = floor;
    if (this.level < floor) this.level = floor;
  }

  /**
   * Feeds one frame interval.
   *
   * @param dtMs - time since the previous animated frame
   * @returns true when the level changed
   */
  frame(dtMs: number): boolean {
    if (!(dtMs > 0) || dtMs > this.o.gapMs) return false;
    this.clock += dtMs;
    this.avgMs += (dtMs - this.avgMs) * 0.08;
    const before = this.level;
    if (this.avgMs > this.o.slowMs) {
      this.fastSince = -1;
      if (this.slowSince < 0) this.slowSince = this.clock;
      if (this.clock - this.slowSince >= this.o.slowForMs && this.level < MAX_DEGRADE) {
        this.level++;
        this.slowSince = this.clock;
        this.avgMs = (this.o.slowMs + this.o.fastMs) / 2;
      }
    } else if (this.avgMs < this.o.fastMs) {
      this.slowSince = -1;
      if (this.fastSince < 0) this.fastSince = this.clock;
      if (this.clock - this.fastSince >= this.o.fastForMs && this.level > this.floor) {
        this.level--;
        this.fastSince = this.clock;
      }
    } else {
      this.slowSince = -1;
      this.fastSince = -1;
    }
    if (this.level < this.floor) this.level = this.floor;
    return this.level !== before;
  }
}
