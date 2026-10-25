/**
 * What the Effects tab sends, as pure builders: a one-shot (`fx.trigger` → `OneShot`) for a cast,
 * a lasting effect (`fx.place` → `PlacedEffect`) for an area, a spot on the map, a token's aura
 * or the weather, and the built-in screen shots (flash, shake, fade). Plus the hit test that
 * finds a placed effect under a finger and the move of one. All anchors are in squares
 * (protocol.md "units are squares"); the params are the ones the runtime reads
 * (`app/src/lib/effects/README.md` "Params"). Tested in `effects-logic.test.ts`.
 */
import type { EffectParams, OneShot, PlacedEffect, Token } from '@battlemap/shared';
import type { Pt } from '../../../effects/anchors.ts';
import type { PickerEffect } from './catalog.ts';
import { aimRegion, feetToSquares, insidePolygon, type Aim } from './shapes.ts';

/** Ids of weather effects: one per library effect, so a switch is idempotent. */
export const WEATHER_PREFIX = 'weather-';

/** The id of a weather effect's placed instance. */
export function weatherId(effectId: string): string {
  return WEATHER_PREFIX + effectId;
}

/** Whether a placed effect is one of the weather switches. */
export function isWeather(p: PlacedEffect): boolean {
  return p.anchor.kind === 'global' && p.id.startsWith(WEATHER_PREFIX);
}

/** The params every placement carries: a tint when chosen. */
function look(tint: string | null): EffectParams {
  return tint ? { color: tint } : {};
}

/** The middle of an aimed area (where a particle burst sits). */
export function aimMiddle(aim: Aim): Pt {
  if (aim.shape === 'circle' || aim.shape === 'cube') return aim.origin;
  const r = (aim.angle * Math.PI) / 180;
  const half = feetToSquares(aim.feet) / 2;
  return { x: aim.origin.x + Math.cos(r) * half, y: aim.origin.y + Math.sin(r) * half };
}

/** The anchor and params of an effect fitted into an aimed area. */
function fitted(e: PickerEffect, aim: Aim): Pick<PlacedEffect, 'anchor' | 'params'> {
  if (e.technique === 'particles') {
    // particle recipes emit around a point: give them the area's width
    const m = aimMiddle(aim);
    const across = aim.shape === 'circle' ? 2 * feetToSquares(aim.feet) : feetToSquares(aim.feet);
    return { anchor: { kind: 'point', x: m.x, y: m.y }, params: { size: round(across) } };
  }
  return { anchor: { kind: 'region', points: aimRegion(aim).map((p) => ({ x: round(p.x), y: round(p.y) })) }, params: { shape: aim.shape } };
}

/**
 * A cast: the one-shot for an aimed area.
 *
 * @param e - the effect
 * @param aim - where and how big
 * @param id - a new id (each screen plays an id once)
 * @param now - epoch ms
 * @param tint - a colour, or null
 * @returns the shot
 */
export function shotFor(e: PickerEffect, aim: Aim, id: string, now: number, tint: string | null): OneShot {
  const f = fitted(e, aim);
  return { id, effect: e.id, anchor: f.anchor, params: { ...f.params, ...look(tint) }, at: now };
}

/**
 * A lasting area effect (a cloud, a web, a wall of fire) for an aimed area.
 *
 * @param e - the effect
 * @param aim - where and how big
 * @param id - a new id
 * @param tint - a colour, or null
 * @returns the placed effect
 */
export function areaFor(e: PickerEffect, aim: Aim, id: string, tint: string | null): PlacedEffect {
  const f = fitted(e, aim);
  return { id, effect: e.id, anchor: f.anchor, params: { ...f.params, ...look(tint) }, on: true };
}

/**
 * A lasting effect at a spot (a torch, a campfire, a candle).
 *
 * @param e - the effect
 * @param at - the spot, squares
 * @param id - a new id
 * @param squares - how many squares across it is drawn
 * @param tint - a colour, or null
 * @returns the placed effect
 */
export function spotFor(e: PickerEffect, at: Pt, id: string, squares: number, tint: string | null): PlacedEffect {
  return { id, effect: e.id, anchor: { kind: 'point', x: round(at.x), y: round(at.y) }, params: { size: round(squares), ...look(tint) }, on: true };
}

/**
 * An aura on a token: it follows the token and hides with it.
 *
 * @param e - the effect
 * @param tokenId - the token
 * @param id - a new id
 * @param squares - how many squares across
 * @param tint - a colour, or null
 * @returns the placed effect
 */
export function auraFor(e: PickerEffect, tokenId: string, id: string, squares: number, tint: string | null): PlacedEffect {
  return { id, effect: e.id, anchor: { kind: 'token', tokenId }, params: { size: round(squares), ...look(tint) }, on: true };
}

/** The highest value an intensity param may reach. */
const KNOB_CAP: Record<string, number> = { uDarkness: 0.95, opacity: 1, uStrength: 1.4, uDensity: 1.6, intensity: 3 };

/**
 * The weather's value at an intensity.
 *
 * @param e - a weather effect
 * @param percent - 100 = the library's look
 * @returns the param and its value
 */
export function weatherParam(e: PickerEffect, percent: number): EffectParams {
  const knob = e.weather ?? { param: 'opacity', base: 1, order: 0 };
  const cap = KNOB_CAP[knob.param] ?? Math.max(1, knob.base * 2);
  return { [knob.param]: round(Math.min(cap, Math.max(0, (knob.base * percent) / 100))) };
}

/**
 * A weather switch turned on (or its intensity changed): a global effect with a fixed id.
 *
 * @param e - the weather effect
 * @param percent - intensity, 100 = the library's look
 * @returns the placed effect
 */
export function weatherFor(e: PickerEffect, percent: number): PlacedEffect {
  return { id: weatherId(e.id), effect: e.id, anchor: { kind: 'global' }, params: { ...weatherParam(e, percent), intensityPercent: percent }, on: true };
}

/** The screen buttons. */
export type ScreenKind = 'flash' | 'shake' | 'fade';

/**
 * A screen one-shot from the runtime's built-ins (`screen-flash`, `screen-shake`); Fade is a
 * slow black flash (dark at once, back over two and a half seconds).
 *
 * @param kind - which button
 * @param id - a new id
 * @param now - epoch ms
 * @returns the shot
 */
export function screenShot(kind: ScreenKind, id: string, now: number): OneShot {
  const global = { kind: 'global' } as const;
  switch (kind) {
    case 'flash': return { id, effect: 'screen-flash', anchor: global, params: { color: '#fff6e0', opacity: 0.85, duration: 0.6 }, at: now };
    case 'shake': return { id, effect: 'screen-shake', anchor: global, params: { amplitude: 14, duration: 0.7 }, at: now };
    case 'fade': return { id, effect: 'screen-flash', anchor: global, params: { color: '#000000', opacity: 1, duration: 2.5 }, at: now };
  }
}

/**
 * The placed effect under a finger (weather excluded), the newest first: inside its area, near
 * its spot (half its size, at least 0.6 squares) or on its token's square.
 *
 * @param effects - the map's lasting effects
 * @param tokens - the map's tokens
 * @param p - the finger, squares
 * @returns the effect, or null
 */
export function effectAt(effects: readonly PlacedEffect[], tokens: readonly Token[], p: Pt): PlacedEffect | null {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    const a = e.anchor;
    if (a.kind === 'region' && insidePolygon(p, a.points)) return e;
    if (a.kind === 'point') {
      const size = typeof e.params.size === 'number' ? e.params.size : 1;
      if (Math.hypot(p.x - a.x, p.y - a.y) <= Math.max(0.6, size / 2)) return e;
    }
    if (a.kind === 'token') {
      const t = tokens.find((t) => t.id === a.tokenId && t.placed);
      if (t && Math.floor(p.x) === t.col && Math.floor(p.y) === t.row) return e;
    }
  }
  return null;
}

/**
 * Moves a placed effect by an offset (areas and spots; auras and weather stay).
 *
 * @param e - the effect
 * @param dx - squares
 * @param dy - squares
 * @returns the moved effect
 */
export function moved(e: PlacedEffect, dx: number, dy: number): PlacedEffect {
  const a = e.anchor;
  if (a.kind === 'region') return { ...e, anchor: { kind: 'region', points: a.points.map((p) => ({ x: round(p.x + dx), y: round(p.y + dy) })) } };
  if (a.kind === 'point') return { ...e, anchor: { kind: 'point', x: round(a.x + dx), y: round(a.y + dy) } };
  return e;
}

/**
 * Where a placed effect sits, for its list row: "around C7", "on Thorin", "whole map".
 *
 * @param e - the effect
 * @param tokens - the map's tokens (for an aura's name)
 * @returns the words
 */
export function whereWords(e: PlacedEffect, tokens: readonly Token[]): string {
  const a = e.anchor;
  const cell = (x: number, y: number) => `${columnName(Math.floor(x))}${Math.floor(y) + 1}`;
  switch (a.kind) {
    case 'global': return 'Whole map';
    case 'token': return `On ${tokens.find((t) => t.id === a.tokenId)?.name || 'a token'}`;
    case 'point': return `At ${cell(a.x, a.y)}`;
    case 'region': {
      let x = 0;
      let y = 0;
      for (const p of a.points) {
        x += p.x;
        y += p.y;
      }
      return `Around ${cell(x / a.points.length, y / a.points.length)}`;
    }
  }
}

/** A column as letters (A … Z, AA …), like a chess board. */
export function columnName(col: number): string {
  let n = Math.max(0, col);
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Three decimals are plenty for squares (keeps the state small). */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
