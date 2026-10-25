/**
 * Sound (roadmap S1): `sound.set` changes the game's soundscape, `sound.play` keeps a one-shot
 * sound in the live state for the TV to play once. Neither makes an undo step.
 *
 * @see ../../../docs/features.md "Sound"
 */
import type { Game } from '../model/game.ts';
import type { RootState } from '../model/root.ts';
import { MAX_SOUND_SHOTS, type SoundBed, type Soundscape } from '../model/sound.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { ok, onGame, reject, type ApplyResult } from './result.ts';

/**
 * Whether two bed lists are the same mix (same sounds, order and volumes).
 *
 * @param a - one list
 * @param b - the other
 * @returns true when equal
 */
function sameBeds(a: readonly SoundBed[], b: readonly SoundBed[]): boolean {
  return a.length === b.length && a.every((x, i) => x.sound === b[i]!.sound && x.volume === b[i]!.volume);
}

/**
 * `sound.set`: the fields given replace the soundscape's, the rest stay; nothing changed = the
 * same state. Refused when the beds name one sound twice.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function soundSet(root: RootState, cmd: CommandOf<'sound.set'>): ApplyResult {
  if (cmd.beds && new Set(cmd.beds.map((b) => b.sound)).size !== cmd.beds.length) return reject('A sound is in the mix twice.');
  return onGame(root, (game): Game => {
    const s = game.sound;
    const next: Soundscape = {
      on: cmd.on ?? s.on,
      master: cmd.master ?? s.master,
      shots: cmd.shots ?? s.shots,
      beds: cmd.beds ?? s.beds,
      fxSounds: cmd.fxSounds ?? s.fxSounds,
    };
    if (next.on === s.on && next.master === s.master && next.shots === s.shots && next.fxSounds === s.fxSounds && sameBeds(next.beds, s.beds)) {
      return game;
    }
    return { ...game, sound: next };
  });
}

/**
 * `sound.play`: the shot joins the live list (the last `MAX_SOUND_SHOTS` kept, a repeated id
 * moves to the end). Kept even while the sound is off — the TV decides not to play it.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function soundPlay(root: RootState, cmd: CommandOf<'sound.play'>): ApplyResult {
  if (!root.game) return reject('No game is open.');
  const sounds = [...root.live.sounds.filter((s) => s.id !== cmd.shot.id), cmd.shot].slice(-MAX_SOUND_SHOTS);
  return ok({ ...root, live: { ...root.live, sounds } });
}
