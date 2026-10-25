/**
 * The particle recipe (`particles` technique) as a fixed-size simulation in typed arrays: no
 * allocation after construction, deterministic (seeded), positions an exact function of age
 * (`p = p0 + v·a + ½·g·a²`), so the frame loop only seeds new particles and evaluates.
 * The Pixi side (`instances/particles.ts`) copies the result into pooled `Particle`s.
 *
 * Units are squares and seconds, in the emitter's own space (its origin is the anchor).
 *
 * @see ../../../../docs/effects.md "Techniques" (`particles`)
 */
import type { ParticleSpec } from './manifest.ts';

/** The visible area, squares, for `screen` emitters (written by the runtime every frame). */
export interface ViewRect {
  /** Left. */
  x: number;
  /** Top. */
  y: number;
  /** Width. */
  w: number;
  /** Height. */
  h: number;
}

/** The 34 × 19 table, for `screen` emitters that were given no view. */
const TABLE_VIEW: ViewRect = { x: 0, y: 0, w: 34, h: 19 };

/**
 * A small fast seeded random generator (mulberry32).
 *
 * @param seed - any integer
 * @returns a function giving numbers in [0, 1)
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A hash of a text to a 32-bit seed (so every screen seeds a placed effect alike).
 *
 * @param text - e.g. the placed effect's id
 * @returns the seed
 */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Parses `#rrggbb` to 0xrrggbb (white when unreadable). */
export function hexColor(s: string | undefined): number {
  if (!s || !/^#?[0-9a-f]{6}$/i.test(s)) return 0xffffff;
  return parseInt(s.replace('#', ''), 16);
}

/** Mixes two 0xrrggbb colours. */
export function mixColor(a: number, b: number, f: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * f);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * f);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * f);
  return ((r & 255) << 16) | ((g & 255) << 8) | (bl & 255);
}

/** One particle's look at a moment (written by {@link ParticleSim.sample}). */
export interface ParticleSample {
  /** Position, squares. */
  x: number;
  /** Position, squares. */
  y: number;
  /** Rotation, radians. */
  rot: number;
  /** Size, squares (the sprite's width). */
  size: number;
  /** Opacity 0..1. */
  alpha: number;
  /** 0xrrggbb. */
  color: number;
  /** Which of the recipe's textures. */
  tex: number;
  /** Mirrored. */
  flip: boolean;
}

/** The fixed-size simulation of one emitter. */
export class ParticleSim {
  /** Slots (the recipe's `max`, or `burst`, times the screen factor). */
  readonly capacity: number;
  /** Live particles after the last {@link step}. */
  live = 0;
  /** Factor on rate and maximum (the degrade level; 0..1). */
  density = 1;
  /** Factor on the rate (`params.intensity`). */
  intensity = 1;

  private readonly x0: Float32Array;
  private readonly y0: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  // Birth times in float64: a float32 copy of t can round above t and hide a newborn.
  private readonly born: Float64Array;
  private readonly life: Float64Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly rot0: Float32Array;
  private readonly phase: Float32Array;
  private readonly tex: Uint8Array;
  private readonly flip: Uint8Array;
  private readonly rand: () => number;
  private readonly colorA: number;
  private readonly colorB: number;
  private acc = 0;
  private fired = false;
  private cursor = 0;

  /**
   * @param spec - the recipe
   * @param seed - random seed (a hash of the placed id)
   * @param screenFactor - `screen` emitters: visible squares² ÷ 100 (rates and max scale with it)
   */
  constructor(
    readonly spec: ParticleSpec,
    seed: number,
    private screenFactor = 1,
  ) {
    const n = Math.max(1, Math.ceil((spec.burst ?? spec.max) * (spec.emitter === 'screen' ? screenFactor : 1)));
    this.capacity = n;
    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.born = new Float64Array(n).fill(-1e9);
    this.life = new Float64Array(n);
    this.size = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.rot0 = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.tex = new Uint8Array(n);
    this.flip = new Uint8Array(n);
    this.rand = seededRandom(seed);
    this.colorA = hexColor(spec.colors[0]);
    this.colorB = hexColor(spec.colors[1]);
  }

  /** Whether this emitter is a one-shot burst. */
  get isBurst(): boolean {
    return Boolean(this.spec.burst) && !this.spec.rate;
  }

  /** Whether a burst has fired and every particle is dead. */
  done(t: number): boolean {
    return this.isBurst && this.fired && this.countLive(t) === 0;
  }

  /**
   * Advances the emitter to time `t`: spawns what the rate (or the burst) asks for.
   *
   * @param t - seconds since the effect started
   * @param dt - seconds since the last step (clamped to 0.1)
   * @param view - the visible area for `screen` emitters
   */
  step(t: number, dt: number, view?: ViewRect): void {
    const s = this.spec;
    if (s.burst && !this.fired) {
      this.fired = true;
      const n = Math.min(this.capacity, Math.max(1, Math.round(s.burst * this.density)));
      for (let i = 0; i < n; i++) this.spawn(t, view);
    }
    if (s.rate) {
      const cap = Math.max(1, Math.floor(this.capacity * this.density));
      this.acc += Math.min(dt, 0.1) * s.rate * (s.emitter === 'screen' ? this.screenFactor : 1) * this.density * this.intensity;
      let live = this.countLive(t);
      while (this.acc >= 1) {
        this.acc -= 1;
        if (live >= cap) continue;
        if (this.spawn(t, view)) live++;
      }
    }
    this.live = this.countLive(t);
  }

  /**
   * Fills the emitter's steady state at once (a loop starts full, not empty): simulates the
   * births of the last `seconds` without drawing.
   *
   * @param t - seconds since start (usually 0)
   * @param view - the visible area for `screen` emitters
   * @param seconds - how far back (default the longest life)
   */
  warm(t: number, view?: ViewRect, seconds = this.spec.life[1]): void {
    if (!this.spec.rate) return;
    const steps = 20;
    for (let i = 0; i < steps; i++) this.step(t - seconds + (seconds * (i + 1)) / steps, seconds / steps, view);
  }

  /**
   * Updates the screen factor of a `screen` emitter (the view grew or shrank). The capacity
   * stays; only the rate follows.
   *
   * @param factor - visible squares² ÷ 100
   */
  setScreenFactor(factor: number): void {
    this.screenFactor = factor;
  }

  /**
   * Evaluates slot `i` at time `t`.
   *
   * @param i - slot 0..capacity−1
   * @param t - seconds since start
   * @param out - written in place
   * @returns false when the slot is dead (out untouched)
   */
  sample(i: number, t: number, out: ParticleSample): boolean {
    const a = t - this.born[i]!;
    const life = this.life[i]!;
    if (a < 0 || a >= life) return false;
    const s = this.spec;
    const f = a / life;
    const al = f < 0.5 ? s.alpha[0] + (s.alpha[1] - s.alpha[0]) * f * 2 : s.alpha[1] + (s.alpha[2] - s.alpha[1]) * (f - 0.5) * 2;
    const flick = s.flicker ? 0.7 + 0.3 * Math.sin(t * s.flicker * 6.2832 + this.phase[i]!) : 1;
    const wob = s.wobble ? Math.sin(t * s.wobble[1] * 6.2832 + this.phase[i]!) * s.wobble[0] : 0;
    const vx = this.vx[i]! + s.gravity[0] * a;
    const vy = this.vy[i]! + s.gravity[1] * a;
    out.x = this.x0[i]! + this.vx[i]! * a + 0.5 * s.gravity[0] * a * a + wob;
    out.y = this.y0[i]! + this.vy[i]! * a + 0.5 * s.gravity[1] * a * a;
    out.rot = s.alignToVelocity ? Math.atan2(vy, vx) : this.rot0[i]! + this.spin[i]! * a * (Math.PI / 180);
    out.size = this.size[i]! * (1 + ((s.grow ?? 1) - 1) * f);
    out.alpha = Math.max(0, Math.min(1, al * flick));
    out.color = this.colorA === this.colorB ? this.colorA : mixColor(this.colorA, this.colorB, f);
    out.tex = this.tex[i]!;
    out.flip = this.flip[i] === 1;
    return true;
  }

  private countLive(t: number): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const a = t - this.born[i]!;
      if (a >= 0 && a < this.life[i]!) n++;
    }
    return n;
  }

  private range(v: [number, number]): number {
    return v[0] + this.rand() * (v[1] - v[0]);
  }

  private spawn(t: number, view?: ViewRect): boolean {
    const n = this.capacity;
    let slot = -1;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (t - this.born[i]! >= this.life[i]!) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return false;
    this.cursor = (slot + 1) % n;
    const s = this.spec;
    const r = this.rand;
    let x = 0;
    let y = 0;
    if (s.emitter === 'screen') {
      const v = view ?? TABLE_VIEW;
      x = v.x + r() * v.w;
      y = v.y + r() * v.h;
    } else if (s.emitter === 'area') {
      x = (r() - 0.5) * (s.w ?? 1);
      y = (r() - 0.5) * (s.h ?? 1);
    } else if (s.emitter === 'ring') {
      const b = r() * Math.PI * 2;
      x = Math.cos(b) * (s.radius ?? 0.5);
      y = Math.sin(b) * (s.radius ?? 0.5);
    } else {
      const b = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * (s.radius ?? 0);
      x = Math.cos(b) * d;
      y = Math.sin(b) * d;
    }
    const ang = this.range(s.angle) * (Math.PI / 180);
    const sp = this.range(s.speed);
    this.x0[slot] = x;
    this.y0[slot] = y;
    this.vx[slot] = Math.cos(ang) * sp;
    this.vy[slot] = Math.sin(ang) * sp;
    this.born[slot] = t;
    this.life[slot] = this.range(s.life);
    this.size[slot] = this.range(s.size);
    this.spin[slot] = s.spin ? this.range(s.spin) : 0;
    this.rot0[slot] = r() * Math.PI * 2;
    this.phase[slot] = r() * Math.PI * 2;
    this.tex[slot] = Math.floor(r() * s.textures.length) % Math.max(1, s.textures.length);
    this.flip[slot] = s.flip && r() < 0.5 ? 1 : 0;
    return true;
  }
}
