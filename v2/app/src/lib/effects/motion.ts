/**
 * Motion recipes as pure functions of time — the texture technique's `motion` block (rotate,
 * pulse, flicker, grow, fade, once, sway, glow) and a `layers` layer's turn and breath. They
 * write into a caller-owned {@link MotionState} so the per-frame loop allocates nothing.
 *
 * Same maths as `assets/effects/preview.html` (the look was approved there), except that a
 * one-shot ends instead of repeating.
 *
 * @see ../../../../docs/effects.md "Techniques" (`texture`, `layers`)
 */
import type { LayerSpec, MotionSpec } from './manifest.ts';

/** The pose of a moving picture at one moment. */
export interface MotionState {
  /** Rotation, radians. */
  rot: number;
  /** Opacity factor 0..1. */
  alpha: number;
  /** Size factor. */
  scale: number;
  /** False once a one-shot is over. */
  alive: boolean;
}

/**
 * A fresh state (allocate once per instance).
 *
 * @returns a state at rest
 */
export function motionState(): MotionState {
  return { rot: 0, alpha: 1, scale: 1, alive: true };
}

/**
 * Evaluates a motion recipe at time `t` (seconds since the effect started).
 *
 * @param mo - the recipe
 * @param t - seconds since start (may include a phase)
 * @param out - written in place
 * @returns `out`
 */
export function evalMotion(mo: MotionSpec, t: number, out: MotionState): MotionState {
  let rot = 0;
  let alpha = 1;
  let scale = 1;
  out.alive = true;
  if (mo.rotate) rot = mo.rotate * t * (Math.PI / 180);
  if (mo.pulse) {
    const p = Math.sin((2 * Math.PI * t) / mo.pulse.period);
    alpha *= 1 - (mo.pulse.alpha ?? 0) * (0.5 - 0.5 * p);
    if (typeof mo.pulse.scale === 'number') scale *= 1 + mo.pulse.scale * p;
  }
  if (mo.flicker) {
    const n = 0.5 + 0.25 * Math.sin(t * mo.flicker.hz * 2.1) + 0.25 * Math.sin(t * mo.flicker.hz * 3.7 + 1.3);
    alpha *= mo.flicker.alpha[0] + (mo.flicker.alpha[1] - mo.flicker.alpha[0]) * n;
    scale *= mo.flicker.scale[0] + (mo.flicker.scale[1] - mo.flicker.scale[0]) * n;
  }
  if (mo.glow) alpha *= 1 - mo.glow.amount * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / mo.glow.period));
  if (mo.once && t > mo.once) out.alive = false;
  if (mo.grow) {
    const f = Math.min(1, Math.max(0, t / mo.grow.duration));
    scale *= mo.grow.from + (1 - mo.grow.from) * (1 - Math.pow(1 - f, 3));
  }
  if (mo.fadeIn) alpha *= Math.min(1, Math.max(0, t / mo.fadeIn));
  if (mo.fadeOut && mo.once) alpha *= Math.min(1, Math.max(0, (mo.once - t) / mo.fadeOut));
  if (mo.sway) rot += Math.sin((2 * Math.PI * t) / mo.sway.period) * mo.sway.angle * (Math.PI / 180);
  out.rot = rot;
  out.alpha = alpha;
  out.scale = scale;
  return out;
}

/**
 * Whether a recipe changes anything over time (a still decal needs no frames).
 *
 * @param mo - the recipe, if any
 * @returns true when it animates
 */
export function motionAnimates(mo: MotionSpec | undefined): boolean {
  if (!mo) return false;
  return Boolean(mo.rotate || mo.pulse || mo.flicker || mo.grow || mo.fadeIn || mo.once || mo.sway || mo.glow || mo.shader);
}

/**
 * Evaluates one layer of a `layers` effect.
 *
 * @param layer - the layer
 * @param t - seconds since start
 * @param out - written in place (`alpha` stays 1)
 * @returns `out`
 */
export function evalLayer(layer: LayerSpec, t: number, out: MotionState): MotionState {
  out.rot = (layer.rotate ?? 0) * t * (Math.PI / 180);
  out.alpha = 1;
  out.alive = true;
  out.scale = 1;
  if (layer.pulse) {
    const p = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / layer.pulse.period);
    out.scale = layer.pulse.scale[0] + (layer.pulse.scale[1] - layer.pulse.scale[0]) * p;
  }
  return out;
}

/**
 * The frame to show of a frame sheet at time `t`, and the blend toward the next one.
 *
 * @param frames - number of frames
 * @param fps - frames per second
 * @param loop - whether it loops
 * @param t - seconds since start
 * @param out - written in place: `[frame, next, fraction]`, frame −1 when a one-shot is over
 * @returns `out`
 */
export function sheetFrame(frames: number, fps: number, loop: boolean, t: number, out: [number, number, number]): [number, number, number] {
  const k = Math.max(0, t) * fps;
  const i = Math.floor(k);
  if (!loop && i >= frames) {
    out[0] = -1;
    out[1] = -1;
    out[2] = 0;
    return out;
  }
  out[0] = loop ? i % frames : i;
  out[1] = loop ? (i + 1) % frames : Math.min(i + 1, frames - 1);
  out[2] = k - i;
  return out;
}
