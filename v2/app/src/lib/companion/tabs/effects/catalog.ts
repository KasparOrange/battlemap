/**
 * The Effects tab's catalogue: `picker.json` from the effects library (built by
 * `assets/effects/tools/picker_index.mjs`, served as `/app/effects/picker.json`), its types,
 * and the browser's pure filters — groups, search over names / tags / spells / damage types,
 * damage-type chips. Loading is in {@link loadCatalog}; everything else is pure and tested.
 *
 * @see ../../../../../docs/effects.md "The Effects tab"
 */
import type { AreaShape } from './shapes.ts';

/** How the tab uses an effect: cast once, place on an area, follow a token, dress the map, weather. */
export type EffectGroup = 'cast' | 'area' | 'aura' | 'life' | 'weather';

/** The browser's groups in panel order, with their words. */
export const GROUPS: ReadonlyArray<{ id: Exclude<EffectGroup, 'weather'>; label: string; hint: string }> = [
  { id: 'cast', label: 'Cast', hint: 'Plays once' },
  { id: 'area', label: 'Areas', hint: 'Stays on the map' },
  { id: 'aura', label: 'Auras', hint: 'Follows a token' },
  { id: 'life', label: 'Map life', hint: 'Torches, fires, water' },
];

/** The intensity knob of a weather effect: which param it drives and its library value. */
export interface WeatherKnob {
  /** The param (`uDensity`, `intensity`, `opacity`, …). */
  param: string;
  /** Order among the weather switches. */
  order: number;
  /** The manifest's value of that param (100 % intensity). */
  base: number;
}

/** One effect as the picker knows it. */
export interface PickerEffect {
  /** The library id (folder name). */
  id: string;
  /** Its name. */
  name: string;
  /** The library's category. */
  category: string;
  /** The tab's group. */
  group: EffectGroup;
  /** The technique (sheet, texture, particles, shader, …). */
  technique: string;
  /** Plays once (a cast) rather than looping. */
  once: boolean;
  /** How long a one-shot plays, seconds. */
  seconds: number;
  /** Search words. */
  tags: string[];
  /** D&D damage types. */
  damage: string[];
  /** Spell names it fits. */
  spells: string[];
  /** Thumbnail path inside the library. */
  thumb: string;
  /** A filmstrip of 8 frames for a moving preview (sheets only), or null. */
  strip: string | null;
  /** The art's nominal size in squares. */
  squares: number;
  /** The drawn size in squares. */
  size: { w: number; h: number } | null;
  /** White art meant to be tinted. */
  tint: boolean;
  /** Under (`ground`) or over (`air`) the fog. */
  layer: string;
  /** A beam that stretches from caster to target. */
  beam: boolean;
  /** The D&D shape it takes, or null for spot effects. */
  shape: AreaShape | null;
  /** The shape's default size in feet. */
  feet: number | null;
  /** A line's width in feet, when not 5. */
  width: number | null;
  /** The weather knob (global effects only). */
  weather: WeatherKnob | null;
  /** GPU bytes while it plays. */
  gpuBytes: number;
  /** May ship in a paid product. */
  commercial: boolean;
}

/** The whole picker file. */
export interface PickerCatalog {
  /** File version. */
  version: number;
  /** Every effect. */
  effects: PickerEffect[];
}

/** The damage types a DM filters by, in chip order. */
export const DAMAGE_TYPES = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic'] as const;

/** The colour each damage type tints its preview and chip with. */
export const DAMAGE_COLORS: Record<string, string> = {
  fire: '#ff7a3d',
  cold: '#8fd3ff',
  lightning: '#c9b8ff',
  thunder: '#7fa6ff',
  acid: '#9be15d',
  poison: '#5fcf6f',
  necrotic: '#9b7bd1',
  radiant: '#ffe08a',
  force: '#d28cff',
  psychic: '#ff8ad8',
};

/**
 * Normalises text for search: lower case, no accents, apostrophes gone.
 *
 * @param s - any text
 * @returns the search form
 */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
}

/**
 * Whether an effect matches a search: every word of the query starts a word of its name, tags,
 * spells, damage types or group.
 *
 * @param e - the effect
 * @param query - what the DM typed
 * @returns true for a match (an empty query matches all)
 */
export function matches(e: PickerEffect, query: string): boolean {
  const words = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold([e.name, e.id, ...e.tags, ...e.spells, ...e.damage, e.group].join(' ')).split(/[^a-z0-9]+/).filter(Boolean);
  return words.every((w) => hay.some((h) => h.startsWith(w)));
}

/** What the browser shows. */
export interface BrowseFilter {
  /** The group (ignored while searching: a search looks in every group). */
  group: Exclude<EffectGroup, 'weather'>;
  /** The search text. */
  query: string;
  /** A damage type chip, or null. */
  damage: string | null;
}

/**
 * The effects the browser lists: a search runs over every group but weather; without one, the
 * chosen group. A damage chip narrows both. Spells come first when searching, then by name.
 *
 * @param all - the catalogue
 * @param f - the filter
 * @returns the effects in show order
 */
export function browse(all: readonly PickerEffect[], f: BrowseFilter): PickerEffect[] {
  const searching = f.query.trim() !== '';
  const list = all.filter((e) => e.group !== 'weather' && (searching ? matches(e, f.query) : e.group === f.group) && (!f.damage || e.damage.includes(f.damage)));
  if (!searching) return list;
  const rank = (e: PickerEffect) => GROUPS.findIndex((g) => g.id === e.group);
  return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * The damage types that occur in a list (only those get a chip).
 *
 * @param list - effects
 * @returns damage types in chip order
 */
export function damageIn(list: readonly PickerEffect[]): string[] {
  const seen = new Set(list.flatMap((e) => e.damage));
  return DAMAGE_TYPES.filter((d) => seen.has(d));
}

/**
 * A short line under an effect's name: its spell size or art size and what it does.
 *
 * @param e - the effect
 * @returns e.g. "20 ft · once" or "2 sq · loop"
 */
export function sizeWords(e: PickerEffect): string {
  const size = e.feet ? `${e.feet} ft` : `${Math.round(Math.max(e.size?.w ?? e.squares, e.size?.h ?? 0) * 10) / 10} sq`;
  return e.once ? `${size} · once` : size;
}

/**
 * Parses the picker file.
 *
 * @param raw - the fetched JSON
 * @returns the catalogue
 * @throws Error when the file is not a picker catalogue
 */
export function parseCatalog(raw: unknown): PickerCatalog {
  const c = raw as Partial<PickerCatalog> | null;
  if (!c || !Array.isArray(c.effects)) throw new Error('not a picker catalogue');
  return { version: c.version ?? 1, effects: c.effects.filter((e) => typeof e?.id === 'string' && typeof e.name === 'string') };
}

let loading: Promise<PickerCatalog> | null = null;

/**
 * Loads `picker.json` once per page (the promise is shared; a failure lets the next call retry).
 *
 * @param baseUrl - the library's URL, ending in `/` (default `/app/effects/`)
 * @returns the catalogue
 * @throws Error when it can't be fetched or parsed
 */
export function loadCatalog(baseUrl = '/app/effects/'): Promise<PickerCatalog> {
  if (!loading) {
    loading = fetch(`${baseUrl}picker.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(parseCatalog)
      .catch((e: unknown) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/**
 * The URL of a file in the library.
 *
 * @param path - a path inside the library (`fireball/thumb.webp`)
 * @param baseUrl - the library's URL
 * @returns the URL
 */
export function libraryUrl(path: string, baseUrl = '/app/effects/'): string {
  return baseUrl + path;
}
