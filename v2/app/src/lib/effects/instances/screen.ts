/**
 * Built-in screen one-shots that need no art from the library: `screen-shake` (the world
 * shakes, through the renderer's `shake`), `screen-flash` (a colour flash over the whole
 * screen that fades out) and `screen-fade` (the screen fades to a colour, holds, and comes
 * back — a scene change). Params: `duration` s (default 0.6 / 0.5 / 2.5), `amplitude` px
 * (shake, default 12), `color` (flash default white, fade default black), `opacity` (flash
 * peak 0.8, fade 1), `fadeIn` / `fadeOut` s (fade, default 0.6 / 0.8).
 *
 * @see ../runtime.ts — these ids are handled before the registry is asked
 */
import { fadeCover, fadePhases, lightningFlash, type FadePhases } from './envelope.ts';
import { Graphics, type Container } from 'pixi.js';
import type { EffectParams } from '@battlemap/shared';
import type { CostEstimate } from '../budget.ts';
import { hexColor } from '../particle-sim.ts';
import { makeRoot, numParam, type EffectInstance, type FrameContext } from './base.ts';

/** The built-in effect ids. */
export const BUILTIN_EFFECTS = ['screen-shake', 'screen-flash', 'screen-fade'] as const;

/**
 * Library effects the runtime draws itself, cheaper than their manifest: `lightning-storm` is a
 * full-screen filter pass every frame in its manifest; here it is a screen quad shown only
 * while a strike flashes (W3-D: Storm = rain-storm + lightning-storm ran two global filters).
 */
export const STAND_INS = ['lightning-storm'] as const;

/**
 * Whether the runtime draws an effect itself instead of from its manifest.
 *
 * @param id - the effect id
 * @returns true for {@link STAND_INS}
 */
export function isStandIn(id: string): boolean {
  return (STAND_INS as readonly string[]).includes(id);
}

/**
 * Whether an effect id is built in.
 *
 * @param id - the effect id
 * @returns true for {@link BUILTIN_EFFECTS}
 */
export function isBuiltin(id: string): boolean {
  return (BUILTIN_EFFECTS as readonly string[]).includes(id);
}

/**
 * How long a built-in plays, seconds.
 *
 * @param id - a built-in id
 * @param params - its params
 * @returns seconds
 */
export function builtinSeconds(id: string, params: EffectParams): number {
  return numParam(params, 'duration', id === 'screen-shake' ? 0.6 : id === 'screen-fade' ? 2.5 : 0.5);
}

const NO_COST: CostEstimate = { drawCalls: 0, textureBytes: 0, fillSquares: 0, particles: 0 };

/** The world shakes, decaying. */
class ShakeInstance implements EffectInstance {
  readonly root: Container = makeRoot('screen-shake');
  readonly cost = NO_COST;
  readonly animates = true;
  private duration: number;
  private amplitude: number;

  constructor(
    params: EffectParams,
    private readonly shake: ((dx: number, dy: number) => void) | undefined,
  ) {
    this.duration = builtinSeconds('screen-shake', params);
    this.amplitude = numParam(params, 'amplitude', 12);
  }

  setParams(_a: unknown, params: EffectParams): void {
    this.duration = builtinSeconds('screen-shake', params);
    this.amplitude = numParam(params, 'amplitude', 12);
  }

  update(t: number): boolean {
    if (!this.shake) return false;
    if (t >= this.duration) {
      this.shake(0, 0);
      return false;
    }
    const k = this.amplitude * (1 - t / this.duration);
    this.shake(Math.sin(t * 71) * k, Math.cos(t * 53) * k);
    return true;
  }

  destroy(): void {
    this.shake?.(0, 0);
    this.root.destroy();
  }
}

/** A colour flash over the screen. */
class FlashInstance implements EffectInstance {
  readonly root: Container = makeRoot('screen-flash');
  readonly cost: CostEstimate = { drawCalls: 1, textureBytes: 0, fillSquares: 34 * 19, particles: 0 };
  readonly animates = true;
  private readonly quad = new Graphics();
  private duration: number;
  private peak: number;
  private w = 0;
  private h = 0;
  private color: number;

  constructor(params: EffectParams) {
    this.duration = builtinSeconds('screen-flash', params);
    this.peak = numParam(params, 'opacity', 0.8);
    this.color = hexColor(typeof params.color === 'string' ? params.color : '#ffffff');
    this.root.addChild(this.quad);
  }

  setParams(_a: unknown, params: EffectParams): void {
    this.duration = builtinSeconds('screen-flash', params);
    this.peak = numParam(params, 'opacity', 0.8);
    this.color = hexColor(typeof params.color === 'string' ? params.color : '#ffffff');
    this.w = 0;
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    if (t >= this.duration) {
      this.root.visible = false;
      return false;
    }
    if (ctx.screenW !== this.w || ctx.screenH !== this.h) {
      this.w = ctx.screenW;
      this.h = ctx.screenH;
      this.quad.clear().rect(0, 0, this.w, this.h).fill({ color: this.color });
    }
    // A fast rise, then an ease-out fade.
    const f = t / this.duration;
    this.root.alpha = this.peak * (f < 0.1 ? f / 0.1 : Math.pow(1 - (f - 0.1) / 0.9, 2));
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** The screen fades to a colour, holds, and comes back (W3-D's Fade button). */
class FadeInstance implements EffectInstance {
  readonly root: Container = makeRoot('screen-fade');
  readonly cost: CostEstimate = { drawCalls: 1, textureBytes: 0, fillSquares: 34 * 19, particles: 0 };
  readonly animates = true;
  private readonly quad = new Graphics();
  private phases: FadePhases;
  private peak = 1;
  private color = 0;
  private w = 0;
  private h = 0;

  constructor(params: EffectParams) {
    this.phases = fadePhases(0);
    this.setParams(null, params);
    this.root.addChild(this.quad);
  }

  setParams(_a: unknown, params: EffectParams): void {
    this.phases = fadePhases(builtinSeconds('screen-fade', params), numParam(params, 'fadeIn', 0.6), numParam(params, 'fadeOut', 0.8));
    this.peak = numParam(params, 'opacity', 1);
    this.color = hexColor(typeof params.color === 'string' ? params.color : '#000000');
    this.w = 0;
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    const p = this.phases;
    if (t >= p.fadeIn + p.hold + p.fadeOut) {
      this.root.visible = false;
      return false;
    }
    if (ctx.screenW !== this.w || ctx.screenH !== this.h) {
      this.w = ctx.screenW;
      this.h = ctx.screenH;
      this.quad.clear().rect(0, 0, this.w, this.h).fill({ color: this.color });
    }
    this.root.alpha = this.peak * fadeCover(t, p);
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * `lightning-storm` without a filter: a full-screen quad in the flash colour, its alpha the
 * shader's flash curve, hidden between strikes. Lasting (it never ends by itself).
 */
class LightningInstance implements EffectInstance {
  readonly root: Container = makeRoot('lightning-storm');
  readonly cost: CostEstimate = { drawCalls: 1, textureBytes: 0, fillSquares: 34 * 19 * 0.1, particles: 0 };
  readonly animates = true;
  private readonly quad = new Graphics();
  private every = 7;
  private strength = 0.85;
  private color = 0xd9e6ff;
  private w = 0;
  private h = 0;

  constructor(params: EffectParams) {
    this.setParams(null, params);
    this.quad.blendMode = 'add';
    this.root.addChild(this.quad);
  }

  setParams(_a: unknown, params: EffectParams): void {
    this.every = Math.max(1, numParam(params, 'every', 7));
    this.strength = numParam(params, 'strength', 0.85);
    this.color = hexColor(typeof params.color === 'string' ? params.color : '#d9e6ff');
    this.w = 0;
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    const f = lightningFlash(t, this.every) * this.strength;
    this.root.visible = f > 0;
    if (f <= 0) return true;
    if (ctx.screenW !== this.w || ctx.screenH !== this.h) {
      this.w = ctx.screenW;
      this.h = ctx.screenH;
      this.quad.clear().rect(0, 0, this.w, this.h).fill({ color: this.color });
    }
    this.root.alpha = f * 0.6;
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * Makes a built-in instance.
 *
 * @param id - a built-in id or a stand-in ({@link STAND_INS})
 * @param params - its params
 * @param shake - the renderer's world shake (absent: the shake does nothing)
 * @returns the instance
 */
export function createBuiltin(id: string, params: EffectParams, shake?: (dx: number, dy: number) => void): EffectInstance {
  if (id === 'screen-shake') return new ShakeInstance(params, shake);
  if (id === 'lightning-storm') return new LightningInstance(params);
  return id === 'screen-fade' ? new FadeInstance(params) : new FlashInstance(params);
}
