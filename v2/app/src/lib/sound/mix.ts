/**
 * The mixer's rules as plain functions (no Web Audio, tested under `bun test`): how a slider's
 * volume becomes a gain, which beds start, stop or change when the soundscape changes, and how
 * far the beds duck under a one-shot. The engine (`engine.ts`) carries the plan out.
 *
 * @see ../../../../docs/features.md "Sound"
 */
import type { Soundscape } from '@battlemap/shared';

/** Fade lengths in seconds. */
export const FADE = {
  /** A bed joins the mix (also: each bed of a scene that replaces another — a crossfade). */
  bedIn: 2.5,
  /** A bed leaves the mix. */
  bedOut: 2.5,
  /** A bed's or a layer's volume changes. */
  change: 0.4,
  /** "Stop all": everything fades out. */
  stopAll: 1.5,
  /** Play after a stop: the beds fade in. */
  start: 2,
  /** A one-shot stolen by the voice limit. */
  steal: 0.06,
} as const;

/** Ducking: the beds drop to this gain while a one-shot plays (about −6 dB). */
export const DUCK_GAIN = 0.5;
/** Ducking: seconds to drop. */
export const DUCK_ATTACK = 0.08;
/** Ducking: seconds to come back after the last ducking one-shot ended. */
export const DUCK_RELEASE = 0.8;

/**
 * A slider's volume (0–1) as a gain: squared, so equal slider steps sound like equal steps
 * (an "audio taper"); half way is a quarter of the amplitude, about −12 dB.
 *
 * @param volume - 0–1 (clamped)
 * @returns the gain, 0–1
 */
export function volumeGain(volume: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return v * v;
}

/**
 * The gain each bed should have (before the master and the ducking): nothing while the
 * soundscape is off.
 *
 * @param s - the soundscape
 * @returns sound id → gain, in the beds' order
 */
export function bedTargets(s: Soundscape): Map<string, number> {
  const out = new Map<string, number>();
  if (!s.on) return out;
  for (const b of s.beds) out.set(b.sound, volumeGain(b.volume));
  return out;
}

/** One bed to start, stop or ramp. */
export interface BedChange {
  /** The bed's sound id. */
  sound: string;
  /** Its target gain (0 for a stop). */
  gain: number;
  /** Fade length in seconds. */
  fade: number;
}

/** What the engine does to go from the playing beds to a new soundscape. */
export interface MixPlan {
  /** Beds to load (if needed) and fade in from silence. */
  start: BedChange[];
  /** Beds to fade out and then release. */
  stop: BedChange[];
  /** Beds that keep playing at a new gain. */
  ramp: BedChange[];
}

/**
 * The plan from what plays now to a new soundscape.
 *
 * - Off: every playing bed stops with the "stop all" fade.
 * - A bed in the new mix that isn't playing starts (the "start" fade after a stop, else the
 *   bed fade); one that plays at another gain ramps; one that left the mix fades out.
 *
 * @param playing - sound id → the gain each playing bed is heading to (fading-out beds excluded)
 * @param next - the new soundscape
 * @param wasOn - whether the soundscape was on before (a start after a stop fades in slower)
 * @returns the plan (empty lists when nothing changes)
 */
export function planMix(playing: ReadonlyMap<string, number>, next: Soundscape, wasOn: boolean): MixPlan {
  const plan: MixPlan = { start: [], stop: [], ramp: [] };
  const targets = bedTargets(next);
  for (const [sound] of playing) {
    if (!targets.has(sound)) plan.stop.push({ sound, gain: 0, fade: next.on ? FADE.bedOut : FADE.stopAll });
  }
  for (const [sound, gain] of targets) {
    const now = playing.get(sound);
    if (now === undefined) plan.start.push({ sound, gain, fade: wasOn ? FADE.bedIn : FADE.start });
    else if (Math.abs(now - gain) > 1e-6) plan.ramp.push({ sound, gain, fade: FADE.change });
  }
  return plan;
}

/**
 * The beds' ducking gain for the number of ducking one-shots that play.
 *
 * @param ducking - one-shots playing now that duck the beds
 * @returns 1 (no ducking) or {@link DUCK_GAIN}
 */
export function duckGain(ducking: number): number {
  return ducking > 0 ? DUCK_GAIN : 1;
}

/**
 * A short text of a soundscape for logs and change checks ("on 0.70/0.80 rain:0.80,drips:0.50").
 *
 * @param s - the soundscape, or null (no game)
 * @returns the signature
 */
export function soundSignature(s: Soundscape | null): string {
  if (!s) return 'none';
  return `${s.on ? 'on' : 'off'} ${s.master.toFixed(3)}/${s.shots.toFixed(3)} ${s.beds.map((b) => `${b.sound}:${b.volume.toFixed(3)}`).join(',')}`;
}
