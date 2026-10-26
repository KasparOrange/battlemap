/**
 * Sound (roadmap S1): the TV plays a soundscape — up to three ambient beds mixed by volume —
 * and one-shot sounds to the room; the tablet mixes it and can preview quietly. Web Audio only,
 * lazy, memory-capped (`docs/features.md` "Sound", `docs/sounds.md`).
 */
export { loadSoundCatalogue, makeCatalogue, SOUNDS_BASE, type SoundCatalogue, type SoundEntry, type SoundKind } from './catalogue.ts';
export { SoundEngine, type SoundGraph } from './engine.ts';
export { FADE, volumeGain } from './mix.ts';
export { createTvSound, type SoundHook, type TvSound } from './tv-sound.ts';
