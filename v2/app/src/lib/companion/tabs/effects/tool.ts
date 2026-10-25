/**
 * What a finger on the map does in the Effects tab — decided by the armed effect:
 *
 * - **Cast** (one-shots) and **Areas** (lasting): with "Aim first" a tap shows the area where it
 *   will land (snapped to the grid); a tap inside it, or the footer's Cast / Place, fires it; a
 *   tap elsewhere moves it. A drag aims live: circles and cubes follow the finger, cones and
 *   lines start where the finger went down and point where it is. With "At once" the tap (or
 *   the end of the drag) fires straight away.
 * - **Auras**: a tap on a token gives it the aura, a second tap takes it away.
 * - **Map life**: every tap places one (torches along a wall, candles on a table).
 * - **Nothing armed**: a tap selects the placed effect under the finger (the footer offers
 *   Remove), a drag on the selected one moves it; elsewhere the map pans.
 */
import type { Point } from '@battlemap/shared';
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { throttle } from '../../input/throttle.ts';
import { log } from '../../../log.ts';
import { commitAim, placeSpot, toggleAuraAt } from './actions.ts';
import { effectAt, moved } from './commands.ts';
import { effectsLocal } from './local.svelte.ts';
import { ensureOverlay } from './overlay.ts';
import { aimAt, aimContains, angleTo, snapOrigin, type Aim } from './shapes.ts';

/** Fx moves sent per second while dragging a placed effect. */
const MOVES_PER_SECOND = 12;

/** A new aim for the armed effect at a point. */
function aimHere(ctx: GameContext, at: Point): Aim | null {
  const e = effectsLocal.chosen;
  if (!e) return null;
  const s = effectsLocal.settingsFor(e);
  const { cols, rows } = ctx.map.info.grid;
  return aimAt(s.shape, s.feet, (e.width ?? 5), at, effectsLocal.lastAngle, { x: cols / 2, y: rows / 2 });
}

/**
 * The Effects tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function effectsTool(ctx: GameContext): MapTool {
  return {
    claims(at) {
      if (effectsLocal.chosenId) return false;
      return effectAt(ctx.map.effects, ctx.map.tokens, at) !== null;
    },

    tap(at) {
      ensureOverlay(ctx);
      const e = effectsLocal.chosen;
      if (!e) {
        const hit = effectAt(ctx.map.effects, ctx.map.tokens, at);
        effectsLocal.selectedId = hit && hit.id !== effectsLocal.selectedId ? hit.id : null;
        if (hit) log.info('companion', 'Effect selected', { effect: hit.effect, id: hit.id, on: effectsLocal.selectedId !== null });
        return;
      }
      switch (e.group) {
        case 'cast':
        case 'area': {
          const waiting = effectsLocal.aim;
          if (effectsLocal.aimFirst && waiting && aimContains(waiting, at)) {
            commitAim(ctx, waiting);
            return;
          }
          const aim = aimHere(ctx, at);
          if (!aim) return;
          if (effectsLocal.aimFirst) {
            effectsLocal.aim = aim;
            log.info('companion', 'Effect aimed', { effect: e.id, shape: aim.shape, feet: aim.feet, x: aim.origin.x, y: aim.origin.y });
          } else {
            commitAim(ctx, aim);
          }
          return;
        }
        case 'aura':
          toggleAuraAt(ctx, e, at);
          return;
        case 'life':
          placeSpot(ctx, e, at);
          return;
        default:
          return;
      }
    },

    begin(from, now): ToolDrag | null {
      ensureOverlay(ctx);
      const e = effectsLocal.chosen;
      if (!e) return moveSelected(ctx, from);
      if (e.group !== 'cast' && e.group !== 'area') return null;
      const first = aimHere(ctx, from);
      if (!first) return null;
      const pointing = first.shape === 'cone' || first.shape === 'line';
      const follow = (at: Point): Aim =>
        pointing
          ? { ...first, angle: Math.hypot(at.x - first.origin.x, at.y - first.origin.y) > 0.3 ? angleTo(first.origin, at) : first.angle }
          : { ...first, origin: snapOrigin(first.shape, at, first.feet) };
      effectsLocal.aim = follow(now);
      return {
        move: (at) => {
          effectsLocal.aim = follow(at);
        },
        end: (at) => {
          const aim = follow(at);
          effectsLocal.aim = aim;
          effectsLocal.lastAngle = aim.angle;
          if (!effectsLocal.aimFirst) commitAim(ctx, aim);
        },
        cancel: () => {
          effectsLocal.aim = null;
        },
      };
    },
  };
}

/** A drag that moves the selected placed effect, or null when the finger isn't on it. */
function moveSelected(ctx: GameContext, from: Point): ToolDrag | null {
  const hit = effectAt(ctx.map.effects, ctx.map.tokens, from);
  if (!hit || (hit.anchor.kind !== 'region' && hit.anchor.kind !== 'point')) return null;
  effectsLocal.selectedId = hit.id;
  const live = throttle(1000 / MOVES_PER_SECOND, (at: Point) => {
    ctx.dispatch({ type: 'fx.place', effect: moved(hit, at.x - from.x, at.y - from.y) });
  });
  return {
    move: (at) => live.push(at),
    end: (at) => {
      live.push(at);
      live.flush();
      log.info('companion', 'Effect moved', { effect: hit.effect, dx: at.x - from.x, dy: at.y - from.y });
    },
    cancel: () => {
      live.cancel();
      ctx.dispatch({ type: 'fx.place', effect: hit });
    },
  };
}
