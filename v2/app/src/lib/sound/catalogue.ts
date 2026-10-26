/**
 * The sound library's catalogue (`assets/sounds/index.json`, served at `/app/sounds/`): what
 * beds and one-shots exist, their files, lengths and licences, and which effects one-shot each
 * one-shot sound goes with. Fetched once per page, on first use.
 *
 * @see ../../../../docs/sounds.md
 */

/** Where the sound library is served, with a trailing slash. */
export const SOUNDS_BASE = '/app/sounds/';

/** A sound's kind: an ambient loop or a one-shot. */
export type SoundKind = 'bed' | 'oneshot';

/** One sound of the library (an entry of `index.json`). */
export interface SoundEntry {
  /** Stable id (`rain`, `door-creak`) — what the game state names. */
  id: string;
  /** Ambient loop or one-shot. */
  kind: SoundKind;
  /** Name on the tablet ("Rain"). */
  name: string;
  /** Group on the tablet (`weather`, `places`, `nature`, `mood` for beds; `doors`, `magic`, … for one-shots). */
  group: string;
  /** The file, relative to the library (`beds/rain.ogg`). */
  file: string;
  /** Length in seconds. */
  seconds: number;
  /** Length in samples at `rate` — a bed's exact loop length. */
  samples: number;
  /** Sample rate of the file. */
  rate: number;
  /** Channels of the file. */
  channels: number;
  /** File size. */
  bytes: number;
  /** Integrated loudness after normalising (LUFS). */
  lufs: number;
  /** Search words. */
  tags: string[];
  /** One-shots: effects ids it sounds with ("Effects play their sound"). */
  effects?: string[];
  /** One-shots: whether the beds duck under it (default true). */
  duck?: boolean;
  /** Who made it. */
  author: string;
  /** Where it came from (the page its licence was checked on). */
  source: string;
  /** The licence. */
  licence: { id: string; url: string };
  /** The credit line to show (CC-BY), or empty. */
  attribution: string;
}

/** The whole catalogue file. */
export interface SoundIndex {
  /** Format version (1). */
  version: number;
  /** Every sound. */
  sounds: SoundEntry[];
}

/** The catalogue with lookups. */
export interface SoundCatalogue {
  /** Every sound, in the file's order. */
  readonly sounds: readonly SoundEntry[];
  /** The beds. */
  readonly beds: readonly SoundEntry[];
  /** The one-shots. */
  readonly oneShots: readonly SoundEntry[];
  /**
   * One sound by id.
   *
   * @param id - the library id
   * @returns the entry, or undefined
   */
  get(id: string): SoundEntry | undefined;
  /**
   * The one-shot sound that goes with an effects one-shot.
   *
   * @param effectId - the effect's catalogue id (`fireball`)
   * @returns the sound, or undefined when none goes with it
   */
  forEffect(effectId: string): SoundEntry | undefined;
  /**
   * A sound's file URL.
   *
   * @param entry - the sound
   * @returns the URL under the library's base
   */
  url(entry: SoundEntry): string;
}

/**
 * The catalogue of a parsed `index.json`.
 *
 * @param index - the file's content
 * @param base - where the library is served (trailing slash)
 * @returns the catalogue
 * @throws Error when the file is not a catalogue
 */
export function makeCatalogue(index: unknown, base = SOUNDS_BASE): SoundCatalogue {
  const file = index as Partial<SoundIndex> | null;
  if (!file || !Array.isArray(file.sounds)) throw new Error('not a sound catalogue');
  const sounds = file.sounds.filter((s) => typeof s?.id === 'string' && typeof s.file === 'string' && (s.kind === 'bed' || s.kind === 'oneshot'));
  const byId = new Map(sounds.map((s) => [s.id, s]));
  const byEffect = new Map<string, SoundEntry>();
  for (const s of sounds) for (const e of s.effects ?? []) if (!byEffect.has(e)) byEffect.set(e, s);
  return {
    sounds,
    beds: sounds.filter((s) => s.kind === 'bed'),
    oneShots: sounds.filter((s) => s.kind === 'oneshot'),
    get: (id) => byId.get(id),
    forEffect: (effectId) => byEffect.get(effectId),
    url: (entry) => base + entry.file,
  };
}

let loading: Promise<SoundCatalogue> | null = null;

/**
 * The library's catalogue, fetched once per page (a failed fetch is tried again next time).
 *
 * @param base - where the library is served
 * @returns the catalogue
 * @throws Error when it can't be fetched or read
 */
export function loadSoundCatalogue(base = SOUNDS_BASE): Promise<SoundCatalogue> {
  if (!loading) {
    loading = fetch(base + 'index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`sound catalogue: HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((json) => makeCatalogue(json, base));
    loading.catch(() => (loading = null));
  }
  return loading;
}
