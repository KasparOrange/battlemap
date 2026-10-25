/**
 * The Effects tab's actions on the game: cast the aimed spell, place an area or a spot, give a
 * token an aura (or take it away), remove one effect or all of them (each with an Undo in its
 * notice — the reducer keeps no undo steps for effects, so Undo puts them back with `fx.place`),
 * switch the weather and fire the screen buttons. Everything is logged; a refused command
 * already shows a notice (`ctx.dispatch`).
 */
import { newId, type PlacedEffect } from '@battlemap/shared';
import type { GameContext } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import { notify } from '../../../ui/notice.svelte.ts';
import type { PickerEffect } from './catalog.ts';
import { areaFor, auraFor, isWeather, screenShot, shotFor, spotFor, weatherFor, weatherId, type ScreenKind } from './commands.ts';
import { effectsLocal } from './local.svelte.ts';
import { coveredSquares, type Aim } from './shapes.ts';

/** How long the map shows a cast area after it fired, ms. */
export const FIRED_MS = 900;

/**
 * Casts the armed one-shot, or places the armed area effect, in the aimed area.
 *
 * @param ctx - the game context
 * @param aim - the area (default: the waiting aim)
 * @returns whether it was sent
 */
export function commitAim(ctx: GameContext, aim: Aim | null = effectsLocal.aim): boolean {
  const e = effectsLocal.chosen;
  if (!e || !aim) return false;
  const { tint } = effectsLocal.settingsFor(e);
  const squares = coveredSquares(aim, ctx.map.info.grid.cols, ctx.map.info.grid.rows).length;
  if (e.once) {
    const shot = shotFor(e, aim, newId(), ctx.serverNow(), tint); // the server's clock (rv#16)
    if (!ctx.dispatch({ type: 'fx.trigger', shot })) return false;
    log.info('companion', 'Effect cast', { effect: e.id, shape: aim.shape, feet: aim.feet, squares, x: aim.origin.x, y: aim.origin.y });
  } else {
    const placed = areaFor(e, aim, newId(), tint);
    if (!ctx.dispatch({ type: 'fx.place', effect: placed })) return false;
    log.info('companion', 'Effect placed', { effect: e.id, shape: aim.shape, feet: aim.feet, squares });
    notify(`${e.name} placed`, undoRemove(ctx, placed));
  }
  effectsLocal.fired = { aim, at: Date.now() };
  effectsLocal.aim = null;
  effectsLocal.lastAngle = aim.angle;
  effectsLocal.used(e.id);
  return true;
}

/**
 * Places the armed spot effect (a torch, a campfire) where the finger is.
 *
 * @param ctx - the game context
 * @param e - the effect
 * @param at - the spot, squares
 * @returns whether it was sent
 */
export function placeSpot(ctx: GameContext, e: PickerEffect, at: { x: number; y: number }): boolean {
  const s = effectsLocal.settingsFor(e);
  // quarter squares: torches sit on walls, candles on tables
  const spot = { x: Math.round(at.x * 4) / 4, y: Math.round(at.y * 4) / 4 };
  const placed = spotFor(e, spot, newId(), s.squares, s.tint);
  if (!ctx.dispatch({ type: 'fx.place', effect: placed })) return false;
  log.info('companion', 'Effect placed at a spot', { effect: e.id, x: spot.x, y: spot.y, squares: s.squares });
  effectsLocal.used(e.id);
  return true;
}

/**
 * Gives the token under the finger the armed aura, or takes it away when it has it.
 *
 * @param ctx - the game context
 * @param e - the aura
 * @param at - the finger, squares
 * @returns whether something was sent
 */
export function toggleAuraAt(ctx: GameContext, e: PickerEffect, at: { x: number; y: number }): boolean {
  const token = ctx.map.tokens.find((t) => t.placed && t.col === Math.floor(at.x) && t.row === Math.floor(at.y));
  if (!token) {
    notify('Tap a token to give it the aura.');
    return false;
  }
  const has = ctx.map.effects.find((p) => p.effect === e.id && p.anchor.kind === 'token' && p.anchor.tokenId === token.id);
  if (has) {
    if (!ctx.dispatch({ type: 'fx.remove', id: has.id })) return false;
    log.info('companion', 'Aura removed', { effect: e.id, token: token.id });
    notify(`${e.name} taken off ${token.name || 'the token'}`, undoPlace(ctx, [has]));
    return true;
  }
  const s = effectsLocal.settingsFor(e);
  const placed = auraFor(e, token.id, newId(), s.squares, s.tint);
  if (!ctx.dispatch({ type: 'fx.place', effect: placed })) return false;
  log.info('companion', 'Aura placed', { effect: e.id, token: token.id, hidden: token.hidden });
  notify(token.hidden ? `${e.name} on ${token.name || 'the token'} — hidden with it` : `${e.name} on ${token.name || 'the token'}`);
  effectsLocal.used(e.id);
  return true;
}

/**
 * Removes one placed effect, with Undo.
 *
 * @param ctx - the game context
 * @param id - the effect
 */
export function removeEffect(ctx: GameContext, id: string): void {
  const p = ctx.map.effects.find((e) => e.id === id);
  if (!p || !ctx.dispatch({ type: 'fx.remove', id })) return;
  if (effectsLocal.selectedId === id) effectsLocal.selectedId = null;
  log.info('companion', 'Effect removed', { effect: p.effect, id });
  notify(`${effectsLocal.byId(p.effect)?.name ?? 'Effect'} removed`, undoPlace(ctx, [p]));
}

/**
 * Removes every placed effect but the weather, with one Undo for all.
 *
 * @param ctx - the game context
 */
export function clearAll(ctx: GameContext): void {
  const gone = ctx.map.effects.filter((p) => !isWeather(p));
  if (gone.length === 0) {
    notify('No effects on this map.');
    return;
  }
  for (const p of gone) ctx.dispatch({ type: 'fx.remove', id: p.id });
  effectsLocal.selectedId = null;
  log.info('companion', 'Effects cleared', { count: gone.length });
  notify(gone.length === 1 ? '1 effect cleared' : `${gone.length} effects cleared`, undoPlace(ctx, gone));
}

/**
 * Turns a weather effect on (or changes its intensity) or off.
 *
 * @param ctx - the game context
 * @param e - the weather effect
 * @param on - on or off
 * @param percent - intensity, 100 = the library's look
 */
export function setWeather(ctx: GameContext, e: PickerEffect, on: boolean, percent = 100): void {
  const id = weatherId(e.id);
  const there = ctx.map.effects.some((p) => p.id === id);
  if (on) {
    if (ctx.dispatch({ type: 'fx.place', effect: weatherFor(e, percent) })) log.info('companion', there ? 'Weather intensity' : 'Weather on', { effect: e.id, percent });
  } else if (there && ctx.dispatch({ type: 'fx.remove', id })) {
    log.info('companion', 'Weather off', { effect: e.id });
  }
}

/**
 * Fires a screen button: Flash, Shake or Fade.
 *
 * @param ctx - the game context
 * @param kind - which
 */
export function screenButton(ctx: GameContext, kind: ScreenKind): void {
  if (ctx.dispatch({ type: 'fx.trigger', shot: screenShot(kind, newId(), ctx.serverNow()) })) log.info('companion', 'Screen effect', { kind });
}

/** Notice options whose Undo puts effects back. */
function undoPlace(ctx: GameContext, effects: readonly PlacedEffect[]) {
  return {
    kind: 'success' as const,
    action: {
      label: 'Undo',
      run: () => {
        for (const p of effects) ctx.dispatch({ type: 'fx.place', effect: p });
        log.info('companion', 'Effects put back', { count: effects.length });
      },
    },
  };
}

/** Notice options whose Undo takes a just-placed effect away. */
function undoRemove(ctx: GameContext, placed: PlacedEffect) {
  return {
    kind: 'success' as const,
    action: {
      label: 'Undo',
      run: () => {
        if (ctx.dispatch({ type: 'fx.remove', id: placed.id })) log.info('companion', 'Effect placement undone', { effect: placed.effect });
      },
    },
  };
}
