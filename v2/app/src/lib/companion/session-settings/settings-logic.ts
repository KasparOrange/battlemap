/**
 * The session settings' plain rules (parity §16): which settings the protocol has (a setting the
 * shared `GameSettings` doesn't know yet is never offered — v1 had four that did nothing, SS-04),
 * the presets, and which tool tabs a game hides. No DOM — tested under `bun test`.
 */
import { GameSettings, defaultSettings } from '@battlemap/shared';

/** Every setting this dialog can offer, including ones the protocol may not have yet. */
export interface SessionSettings {
  /** How fog is drawn. */
  fogStyle: GameSettings['fogStyle'];
  /** Fade squares in when they are revealed. */
  fogFade: boolean;
  /** Effects on the table. */
  effects: boolean;
  /** The Draw tab is offered (needs shared `GameSettings.drawTools`). */
  drawTools: boolean;
  /** The Measure tab is offered (needs shared `GameSettings.measureTools`). */
  measureTools: boolean;
}

/** A setting's name. */
export type SettingKey = keyof SessionSettings;

/**
 * Whether the protocol's `GameSettings` has a field (so `game.settings` / `game.new` carry it).
 *
 * @param key - the setting
 * @returns true when the TV would keep it
 */
export function supported(key: SettingKey): boolean {
  return key in GameSettings.entries;
}

/**
 * A game's settings as this dialog shows them: the stored ones, the defaults for the rest.
 *
 * @param stored - the game's settings (or a partial for a new game)
 * @returns every setting
 */
export function withDefaults(stored: Partial<SessionSettings> | null | undefined): SessionSettings {
  return { ...defaultSettings(), drawTools: true, measureTools: true, ...stored } as SessionSettings;
}

/**
 * Only the settings the protocol has — what may go into a command.
 *
 * @param s - settings (some or all)
 * @returns the supported part
 */
export function forProtocol(s: Partial<SessionSettings>): Partial<GameSettings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (v !== undefined && supported(k as SettingKey)) out[k] = v;
  return out as Partial<GameSettings>;
}

/** A preset: a name and the tool tabs it offers. */
export interface Preset {
  /** Its id. */
  id: 'table' | 'fog';
  /** What the DM reads. */
  label: string;
  /** One line under it. */
  hint: string;
  /** The tab settings it sets. */
  tools: Pick<SessionSettings, 'drawTools' | 'measureTools'>;
}

/** The presets (tabletop only: the old app's "Digital" preset belongs to the dormant digital mode). */
export const PRESETS: readonly Preset[] = [
  { id: 'table', label: 'Every tool', hint: 'Tokens, fog, drawing, measuring', tools: { drawTools: true, measureTools: true } },
  { id: 'fog', label: 'Fog only', hint: 'Tokens and fog — the fewest buttons', tools: { drawTools: false, measureTools: false } },
];

/**
 * The preset the settings match.
 *
 * @param s - the settings
 * @returns its id, or null when they match none (the DM switched single tabs)
 */
export function presetOf(s: SessionSettings): Preset['id'] | null {
  return PRESETS.find((p) => p.tools.drawTools === s.drawTools && p.tools.measureTools === s.measureTools)?.id ?? null;
}

/**
 * The tool tabs a game hides (the game screen leaves them out of the rail; a hidden chosen tab
 * falls back to Tokens — parity DP-04). Settings the protocol doesn't have hide nothing.
 *
 * @param stored - the game's settings
 * @returns tab ids (`draw`, `measure`)
 */
export function hiddenTabs(stored: Partial<SessionSettings> | null | undefined): Set<string> {
  const s = withDefaults(stored);
  const hidden = new Set<string>();
  if (supported('drawTools') && !s.drawTools) hidden.add('draw');
  if (supported('measureTools') && !s.measureTools) hidden.add('measure');
  return hidden;
}

/** The fog looks, as the DM reads them. */
export const FOG_STYLES: { id: GameSettings['fogStyle']; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'crisp edge' },
  { id: 'soft', label: 'Soft', hint: 'blurred edge' },
  { id: 'cloud', label: 'Cloud', hint: 'drifting' },
  { id: 'atmospheric', label: 'Deep', hint: 'darker far in' },
];
