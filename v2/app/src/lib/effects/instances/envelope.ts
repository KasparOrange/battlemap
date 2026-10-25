/**
 * Brightness envelopes of the built-in screen one-shots — pure, tested under `bun test`.
 */

/** The phases of a fade to a colour, seconds. */
export interface FadePhases {
  /** Fading in (to the colour). */
  readonly fadeIn: number;
  /** Fully covered. */
  readonly hold: number;
  /** Fading back out. */
  readonly fadeOut: number;
}

/**
 * The phases of `screen-fade` from its total duration: in 0.6 s, out 0.8 s (each at most a
 * third of the total), the rest held.
 *
 * @param duration - total seconds (≥ 0)
 * @param fadeIn - wanted fade-in seconds
 * @param fadeOut - wanted fade-out seconds
 * @returns the phases (they add up to `duration`)
 */
export function fadePhases(duration: number, fadeIn = 0.6, fadeOut = 0.8): FadePhases {
  const d = Math.max(0, duration);
  const i = Math.min(Math.max(0, fadeIn), d / 3);
  const o = Math.min(Math.max(0, fadeOut), d / 3);
  return { fadeIn: i, hold: d - i - o, fadeOut: o };
}

/**
 * How much of the colour covers the screen at a time of a fade (smoothstep in and out).
 *
 * @param t - seconds since the start
 * @param p - the phases
 * @returns 0–1 (0 after the end)
 */
export function fadeCover(t: number, p: FadePhases): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t <= 0) return 0;
  if (t < p.fadeIn) return smooth(t / p.fadeIn);
  if (t < p.fadeIn + p.hold) return 1;
  const out = t - p.fadeIn - p.hold;
  if (out < p.fadeOut) return 1 - smooth(out / p.fadeOut);
  return 0;
}

/** GLSL's `fract(sin(n * 12.9898) * 43758.5453)` — the lightning shader's hash. */
function hash1(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The lightning flash of `lightning-flash.frag`, on the CPU: one slot every `every` seconds,
 * a strike at a random moment in it (some slots stay dark), a quick double flash.
 *
 * @param t - seconds
 * @param every - slot length in seconds (the manifest's `uEvery`, 7)
 * @returns flash strength 0–1
 */
export function lightningFlash(t: number, every: number): number {
  const k = Math.floor(t / every);
  const start = (k + 0.1 + 0.6 * hash1(k)) * every;
  const dt = t - start;
  if (dt < 0 || hash1(k + 7) < 0.35) return 0;
  const f = Math.exp(-dt * 14) + (dt >= 0.16 ? 0.7 * Math.exp(-(dt - 0.16) * 9) : 0);
  return Math.min(1, f < 0.004 ? 0 : f);
}
