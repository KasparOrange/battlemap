/**
 * The Effects tab's device-local state (never synced): the catalogue once loaded, the chosen
 * effect and its quick settings (shape, size, tint), the browser's filter, favourites and recent
 * (remembered on this device), "Aim first" or "At once", the aimed area waiting to be cast or
 * placed, and the placed effect selected for removal.
 */
import type { PickerEffect } from './catalog.ts';
import { pushRecent, readIds, RECENT_MAX, FAVOURITES_MAX, toggleFavourite } from './prefs.ts';
import { shapesFor, type AreaShape, type Aim } from './shapes.ts';

const KEY = 'battlemap.companion.effects';

/** The quick settings of one effect, remembered per effect. */
export interface EffectSettings {
  /** The area's shape (casts and areas). */
  shape: AreaShape;
  /** The area's size in feet (radius, length or side). */
  feet: number;
  /** Spots and auras: squares across. */
  squares: number;
  /** A tint, or null for the art's own colours. */
  tint: string | null;
}

/** The browser's groups (weather has its own section). */
export type BrowseGroup = 'cast' | 'area' | 'aura' | 'life';

interface Saved {
  favourites: string[];
  recent: string[];
  aimFirst: boolean;
  group: BrowseGroup;
  settings: Record<string, EffectSettings>;
  weatherOpen: boolean;
}

function load(): Saved {
  const fallback: Saved = { favourites: ['fireball', 'cloudkill', 'wall-torch'], recent: [], aimFirst: true, group: 'cast', settings: {}, weatherOpen: true };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw) return fallback;
    const settings: Record<string, EffectSettings> = {};
    for (const [id, s] of Object.entries(raw.settings ?? {}).slice(-60)) {
      if (s && typeof s.feet === 'number' && typeof s.squares === 'number') settings[id] = { shape: s.shape, feet: s.feet, squares: s.squares, tint: typeof s.tint === 'string' ? s.tint : null };
    }
    return {
      favourites: Array.isArray(raw.favourites) ? readIds(raw.favourites, FAVOURITES_MAX) : fallback.favourites,
      recent: readIds(raw.recent, RECENT_MAX),
      aimFirst: raw.aimFirst !== false,
      group: raw.group === 'area' || raw.group === 'aura' || raw.group === 'life' ? raw.group : 'cast',
      settings,
      weatherOpen: raw.weatherOpen !== false,
    };
  } catch {
    return fallback;
  }
}

/** The tablet-local Effects tab state. */
class EffectsLocal {
  /** Every effect of the picker catalogue (null until loaded). */
  catalog = $state.raw<PickerEffect[] | null>(null);
  /** Loading the catalogue failed (the panel offers a retry). */
  failed = $state(false);
  /** The armed effect: a finger on the map casts or places it. */
  chosenId = $state<string | null>(null);
  /** The browser's group. */
  group = $state<BrowseGroup>('cast');
  /** The search text. */
  query = $state('');
  /** A damage-type chip, or null. */
  damage = $state<string | null>(null);
  /** Starred effects. */
  favourites = $state.raw<string[]>([]);
  /** Recently used, newest first. */
  recent = $state.raw<string[]>([]);
  /** A tap aims and a second tap (or the footer) fires; false = a tap fires at once. */
  aimFirst = $state(true);
  /** The area aimed and not yet cast or placed. */
  aim = $state.raw<Aim | null>(null);
  /** The last direction a cone or line pointed. */
  lastAngle = $state<number | null>(null);
  /** The area just cast (the map shows it fading for a moment). */
  fired = $state.raw<{ aim: Aim; at: number } | null>(null);
  /** The placed effect selected on the map or in the list. */
  selectedId = $state<string | null>(null);
  /** The Weather & mood section is open. */
  weatherOpen = $state(true);
  /** Per-effect quick settings. */
  settings = $state.raw<Record<string, EffectSettings>>({});

  constructor() {
    const s = load();
    this.favourites = s.favourites;
    this.recent = s.recent;
    this.aimFirst = s.aimFirst;
    this.group = s.group;
    this.settings = s.settings;
    this.weatherOpen = s.weatherOpen;
  }

  /** The armed effect, or null. */
  get chosen(): PickerEffect | null {
    return this.byId(this.chosenId);
  }

  /** An effect of the catalogue by id. */
  byId(id: string | null): PickerEffect | null {
    if (!id || !this.catalog) return null;
    return this.catalog.find((e) => e.id === id) ?? null;
  }

  /**
   * The quick settings of an effect: remembered ones, else its D&D defaults.
   *
   * @param e - the effect
   * @returns its settings
   */
  settingsFor(e: PickerEffect): EffectSettings {
    const saved = this.settings[e.id];
    const shapes = shapesFor(e.shape);
    const art = Math.round(Math.max(e.size?.w ?? e.squares, e.size?.h ?? 0, 0.5) * 2) / 2;
    return {
      shape: saved && shapes.includes(saved.shape) ? saved.shape : shapes[0]!,
      feet: saved?.feet ?? e.feet ?? 10,
      squares: saved?.squares ?? art,
      tint: saved?.tint ?? null,
    };
  }

  /**
   * Changes an effect's quick settings (and redraws an aimed area of it).
   *
   * @param e - the effect
   * @param patch - what changed
   */
  setSettings(e: PickerEffect, patch: Partial<EffectSettings>): void {
    const next = { ...this.settingsFor(e), ...patch };
    this.settings = { ...this.settings, [e.id]: next };
    if (this.aim && this.chosenId === e.id) this.aim = { ...this.aim, shape: next.shape, feet: next.feet };
    this.save();
  }

  /**
   * Arms an effect (or disarms it when it is the armed one); drops a waiting aim.
   *
   * @param id - the effect
   */
  choose(id: string | null): void {
    this.chosenId = this.chosenId === id ? null : id;
    this.aim = null;
    if (this.chosenId) this.selectedId = null;
  }

  /** Stars or unstars an effect. */
  toggleFavourite(id: string): void {
    this.favourites = toggleFavourite(this.favourites, id);
    this.save();
  }

  /** Notes an effect as used now. */
  used(id: string): void {
    this.recent = pushRecent(this.recent, id);
    this.save();
  }

  /** Remembers what this device keeps. */
  save(): void {
    try {
      const saved: Saved = { favourites: this.favourites, recent: this.recent, aimFirst: this.aimFirst, group: this.group, settings: this.settings, weatherOpen: this.weatherOpen };
      globalThis.localStorage?.setItem(KEY, JSON.stringify(saved));
    } catch {
      // private mode: not remembered, no harm
    }
  }
}

/** The one instance. */
export const effectsLocal = new EffectsLocal();
