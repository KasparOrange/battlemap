/**
 * Sound in TV mode: the TV plays the open game's soundscape and its one-shot sounds to the room
 * (the tablet never does — it only previews). Fed every state the TV draws; cheap when nothing
 * about sound changed.
 *
 * - `game.sound` → {@link SoundEngine.apply} (crossfades, stop all, volumes).
 * - `live.sounds` → one-shots, each id once; the first state only seeds (a reloaded TV doesn't
 *   replay the last door slam).
 * - With `fxSounds` on, an effects one-shot (`live.shots`) plays the sound that goes with it
 *   (`catalogue.forEffect`: fireball → whoosh, lightning → crack, …).
 * - Autoplay: the context is resumed on every key and pointer press until it runs.
 * - The shell's memory warnings drop decoded sounds that aren't playing.
 * - The test hook: `window.__battlemapSound` with `?debug=1` (`graph()`, `catalogue()`).
 *
 * @see ../../../../docs/features.md "Sound"
 */
import type { RootState } from '@battlemap/shared';
import { debugEnabled } from '../debug-hook.ts';
import type { Logger } from '../log.ts';
import { isMemoryPressure } from '../render/memory.ts';
import { onShellEvent } from '../shell.ts';
import { loadSoundCatalogue, type SoundCatalogue } from './catalogue.ts';
import { SoundEngine, type SoundGraph } from './engine.ts';
import { ShotGate } from './voices.ts';

/** TV mode's sound. */
export interface TvSound {
  /** Plays what this state asks for. */
  update(state: RootState): void;
  /** Stops everything. */
  destroy(): void;
}

/** What `window.__battlemapSound` offers (`?debug=1` only; read by `e2e/feature-sound.e2e.ts`). */
export interface SoundHook {
  /** The audio graph now. */
  graph(): SoundGraph;
  /** The catalogue's ids by kind (loads it). */
  catalogue(): Promise<{ beds: string[]; oneShots: string[] }>;
}

/** Options of {@link createTvSound}. */
export interface TvSoundOptions {
  /** The logger. */
  log: Logger;
  /** The engine to use (tests); default a real one at full ceiling. */
  engine?: SoundEngine;
  /** The catalogue loader (tests). */
  catalogue?: () => Promise<SoundCatalogue>;
  /**
   * The clock shots are aged by, epoch ms — pass `Connection.serverNow()`: the companion stamps
   * shots with the server's clock and device clocks differ (rv#16). Default `Date.now`.
   */
  now?: () => number;
}

/**
 * Starts TV mode's sound.
 *
 * @param opts - logger (and test seams)
 * @returns the sound, fed with {@link TvSound.update}
 */
export function createTvSound(opts: TvSoundOptions): TvSound {
  const log = opts.log;
  const catalogue = opts.catalogue ?? (() => loadSoundCatalogue());
  const engine = opts.engine ?? new SoundEngine({ log, catalogue });
  const soundGate = new ShotGate();
  const fxGate = new ShotGate();
  let lastSounds: unknown = null;
  let lastShots: unknown = null;
  let lastGame: string | null = null;

  const unlock = () => {
    if (engine.locked()) void engine.unlock();
  };
  addEventListener('keydown', unlock, true);
  addEventListener('pointerdown', unlock, true);
  const stopShell = onShellEvent((e) => {
    if (e.type !== 'memory') return;
    const level = Number((e as { level?: unknown }).level ?? 0);
    if (isMemoryPressure(level)) engine.trim(level);
  });

  if (debugEnabled) {
    const hook: SoundHook = {
      graph: () => engine.snapshot(),
      catalogue: async () => {
        const c = await catalogue();
        return { beds: c.beds.map((s) => s.id), oneShots: c.oneShots.map((s) => s.id) };
      },
    };
    (globalThis as unknown as { __battlemapSound?: SoundHook }).__battlemapSound = hook;
  }

  return {
    update(state) {
      const game = state.game;
      if ((game?.id ?? null) !== lastGame) {
        lastGame = game?.id ?? null;
        log.info('sound', game ? 'Game sound' : 'No game: silence', game ? { game: game.id, on: game.sound.on, beds: game.sound.beds.length } : {});
      }
      engine.apply(game?.sound ?? null);
      if (engine.locked() && game?.sound.on) log.count?.('sound', 'Audio waits for a key press (autoplay)');
      const now = (opts.now ?? Date.now)();
      if (state.live.sounds !== lastSounds) {
        lastSounds = state.live.sounds;
        for (const shot of soundGate.take(state.live.sounds, now)) void engine.playShot(shot.sound, shot.volume, shot.id);
      }
      if (state.live.shots !== lastShots) {
        lastShots = state.live.shots;
        const fresh = fxGate.take(state.live.shots, now);
        if (fresh.length && game?.sound.on && game.sound.fxSounds) {
          void catalogue().then((c) => {
            for (const shot of fresh) {
              const sound = c.forEffect(shot.effect);
              if (sound) void engine.playShot(sound.id, 1, shot.id);
            }
          }, (e: unknown) => log.warn('sound', 'No catalogue for effect sounds', { error: String(e) }));
        }
      }
    },
    destroy() {
      removeEventListener('keydown', unlock, true);
      removeEventListener('pointerdown', unlock, true);
      stopShell();
      engine.destroy();
    },
  };
}
