/**
 * Sound in the game state (roadmap S1): the soundscape the TV plays to the room — up to three
 * ambient beds mixed by volume, a one-shot layer, a master volume — and one-shot sounds as live
 * shots. What a sound *is* (its file, loudness, loop points) is the sound library's business
 * (`assets/sounds/`); the state only names library ids.
 *
 * @see ../../../docs/features.md "Sound"
 */
import * as v from 'valibot';
import { Id, Num } from './basics.ts';

/** A sound library id (`rain`, `door-creak`): lower case, digits and dashes. */
export const SoundId = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{0,47}$/));

/** A volume from 0 (silent) to 1 (full). */
export const Volume = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

/** One ambient bed in the mix: which loop, how loud. */
export const SoundBed = v.object({
  /** The library id of the loop. */
  sound: SoundId,
  /** Its volume in the mix (before the master). */
  volume: Volume,
});
/** One ambient bed; see the schema of the same name. */
export type SoundBed = v.InferOutput<typeof SoundBed>;

/** Most ambient beds that play at once. */
export const MAX_BEDS = 3;

/**
 * The beds of a mix: at most `MAX_BEDS` (each library id once — `sound.set` refuses a list that
 * names one twice; a schema `check` would not survive the JSON Schema the Rust server embeds).
 */
export const SoundBeds = v.pipe(v.array(SoundBed), v.maxLength(MAX_BEDS));

/**
 * A game's soundscape. Saved with the game, so a TV that reloads comes back with the same mix.
 * `on: false` is "Stop all": everything fades out, the beds stay listed to play again.
 */
export const Soundscape = v.object({
  /** Whether the TV plays anything (beds and one-shots). */
  on: v.boolean(),
  /** The master volume (all layers). */
  master: Volume,
  /** The one-shot layer's volume. */
  shots: Volume,
  /** The ambient beds, in the order the DM picked them. */
  beds: SoundBeds,
  /** Effects one-shots (a fireball) play their matching sound too. Off by default. */
  fxSounds: v.optional(v.boolean(), false),
});
/** A game's soundscape; see the schema of the same name. */
export type Soundscape = v.InferOutput<typeof Soundscape>;

/**
 * A one-shot sound (a door slam, thunder). Not saved; the live state keeps the last
 * `MAX_SOUND_SHOTS` so the TV plays each id once.
 */
export const SoundShot = v.object({
  /** Made by the companion that triggered it — the TV plays each id once. */
  id: Id,
  /** The library id. */
  sound: SoundId,
  /** Its own volume (before the one-shot layer and the master). */
  volume: v.optional(Volume, 1),
  /** When it was triggered (sender's clock, epoch ms) — the TV skips shots that are long over. */
  at: Num,
});
/** A one-shot sound; see the schema of the same name. */
export type SoundShot = v.InferOutput<typeof SoundShot>;

/** How many recent one-shot sounds the live state keeps. */
export const MAX_SOUND_SHOTS = 8;

/** The sound a scene carries: its beds (the mix starts playing when the scene is applied). */
export const SceneSound = v.object({
  /** The beds, as they were mixed when the scene was saved. */
  beds: SoundBeds,
});
/** A scene's sound; see the schema of the same name. */
export type SceneSound = v.InferOutput<typeof SceneSound>;

/**
 * The soundscape of a game that never touched sound: silent, master 70 %, one-shots 80 %.
 *
 * @returns a new soundscape
 */
export function defaultSoundscape(): Soundscape {
  return { on: false, master: 0.7, shots: 0.8, beds: [], fxSounds: false };
}

/**
 * The sound a scene saved now would carry: the beds while the TV plays some, else none (a scene
 * saved in silence leaves the sound alone when it is applied).
 *
 * @param sound - the game's soundscape
 * @returns the scene's sound, or undefined
 */
export function captureSceneSound(sound: Soundscape): SceneSound | undefined {
  return sound.on && sound.beds.length > 0 ? { beds: sound.beds } : undefined;
}
