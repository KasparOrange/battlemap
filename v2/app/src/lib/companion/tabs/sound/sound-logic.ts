/**
 * The Sound tab's pure rules (no Svelte, no IO), unit-tested: how a tap on a bed changes the
 * mix, how the pads are ordered, what the tab's summary line says, and the commands it sends.
 *
 * @see ../../../../../docs/features.md "Sound"
 */
import { MAX_BEDS, type Command, type SoundBed, type Soundscape } from '@battlemap/shared';
import type { SoundEntry } from '../../../sound/catalogue.ts';

/** The volume a bed joins the mix with (the slider's start). */
export const NEW_BED_VOLUME = 0.7;

/** The groups of beds, in the order the tab shows them, with their headings. */
export const BED_GROUPS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'places', title: 'Places' },
  { id: 'nature', title: 'Nature' },
  { id: 'weather', title: 'Weather' },
  { id: 'mood', title: 'Mood' },
];

/** What a tap on a bed tile does to the mix. */
export type BedToggle =
  | { kind: 'added'; beds: SoundBed[] }
  | { kind: 'removed'; beds: SoundBed[] }
  | { kind: 'full' };

/**
 * A tap on a bed: in the mix → out; not in it → in at {@link NEW_BED_VOLUME}, unless
 * {@link MAX_BEDS} already play (then nothing changes and the tab says so).
 *
 * @param beds - the mix now
 * @param sound - the bed's library id
 * @returns the new mix, or `full`
 */
export function toggleBed(beds: readonly SoundBed[], sound: string): BedToggle {
  if (beds.some((b) => b.sound === sound)) return { kind: 'removed', beds: beds.filter((b) => b.sound !== sound) };
  if (beds.length >= MAX_BEDS) return { kind: 'full' };
  return { kind: 'added', beds: [...beds, { sound, volume: NEW_BED_VOLUME }] };
}

/**
 * The mix with one bed's volume changed (other beds untouched; an unknown bed: unchanged).
 *
 * @param beds - the mix now
 * @param sound - the bed's library id
 * @param volume - 0…1
 * @returns the new mix
 */
export function setBedVolume(beds: readonly SoundBed[], sound: string, volume: number): SoundBed[] {
  const v = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
  return beds.map((b) => (b.sound === sound ? { ...b, volume: v } : b));
}

/**
 * The `sound.set` of a change: only the fields given.
 *
 * @param change - the fields to change
 * @returns the command
 */
export function soundSet(change: Partial<Soundscape>): Command {
  return { type: 'sound.set', ...change } as Command;
}

/**
 * The `sound.play` of a pad press.
 *
 * @param sound - the one-shot's library id
 * @param id - a new shot id
 * @param at - the server's clock, epoch ms (rv#16: the TV ages shots by it)
 * @returns the command
 */
export function soundPlay(sound: string, id: string, at: number): Command {
  return { type: 'sound.play', shot: { id, sound, volume: 1, at } };
}

/**
 * The one-shot pads in order: favourites first (in the order they were starred), then the
 * rest by the library's order.
 *
 * @param shots - the library's one-shots
 * @param favourites - the starred ids (this device)
 * @returns the pads, each with whether it is starred
 */
export function padOrder(shots: readonly SoundEntry[], favourites: readonly string[]): Array<{ entry: SoundEntry; favourite: boolean }> {
  const byId = new Map(shots.map((s) => [s.id, s]));
  const fav = favourites.map((id) => byId.get(id)).filter((s): s is SoundEntry => !!s);
  const starred = new Set(fav.map((s) => s.id));
  return [...fav.map((entry) => ({ entry, favourite: true })), ...shots.filter((s) => !starred.has(s.id)).map((entry) => ({ entry, favourite: false }))];
}

/**
 * The beds of one group, in the library's order.
 *
 * @param beds - the library's beds
 * @param group - a {@link BED_GROUPS} id; beds of an unknown group go with `mood`
 * @returns the beds of that group
 */
export function bedsOf(beds: readonly SoundEntry[], group: string): SoundEntry[] {
  const known = new Set(BED_GROUPS.map((g) => g.id));
  return beds.filter((b) => (known.has(b.group) ? b.group : 'mood') === group);
}

/**
 * The tab's summary line: what plays on the TV now.
 *
 * @param sound - the game's soundscape
 * @param name - a bed's name by id (the library's, or the id when unknown)
 * @returns e.g. "Playing: Rain, Campfire" · "Off — 2 beds ready" · "Silent"
 */
export function soundLine(sound: Soundscape, name: (id: string) => string): string {
  const names = sound.beds.map((b) => name(b.sound));
  if (sound.on) return names.length ? `Playing: ${names.join(', ')}` : 'On — no ambience, one-shots play';
  if (names.length) return `Off — ${names.length === 1 ? names[0] : `${names.length} beds`} ready`;
  return 'Silent';
}

/**
 * A volume as the slider shows it.
 *
 * @param v - 0…1
 * @returns "70 %"
 */
export function percent(v: number): string {
  return `${Math.round(v * 100)} %`;
}
