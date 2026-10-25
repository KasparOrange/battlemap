/**
 * What a finger on the map does in the Fog tab (parity CV-04/05, FG-04 … FG-07):
 *
 * - Brush: a tap reveals / hides the stamp under the finger (v1 bug: that tap never reached the
 *   TV — here it is a `fog.apply` like any other); a drag stamps every square it passes, one
 *   `fog.apply` per square entered, the whole stroke one gesture (one undo step).
 * - Room: a tap fills the room under the finger, stopped by walls and closed doors.
 * - Circle: a tap fills a circle of the chosen radius, stopped by walls and closed doors; with
 *   "Preview first" it is the live circle the radius stepper can still resize.
 * - Room and Circle have no drag: a drag pans the view.
 */
import { bitIsSet, maskToBytes } from '@battlemap/shared';
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import { BrushStroke, cellUnder, circleRevealCells, roomCells } from './cells.ts';
import { fogLocal } from './local.svelte.ts';

/**
 * Sends squares to reveal or hide.
 *
 * @param ctx - the game context
 * @param cells - cell indices
 * @param gesture - the gesture they belong to
 * @param live - live-circle handling
 * @returns whether it was sent
 */
function send(ctx: GameContext, all: number[], gesture: string, live?: 'start' | 'replace'): boolean {
  const cells = ctx.game.previewFirst ? all : unchanged(ctx, all);
  if (cells.length === 0) return false;
  return ctx.dispatch({ type: 'fog.apply', cells, value: fogLocal.value, gesture, ...(live ? { live } : {}) });
}

/** Drops squares that already are as asked (no command for a stroke over revealed ground). */
function unchanged(ctx: GameContext, cells: number[]): number[] {
  const { cols, rows } = ctx.map.info.grid;
  const bytes = maskToBytes(ctx.map.fog.revealed, cols * rows);
  const want = fogLocal.value === 'reveal';
  return cells.filter((c) => bitIsSet(bytes, c) !== want);
}

/**
 * Redraws the circle waiting in the preview at the current radius (the stepper's − / +).
 *
 * @param ctx - the game context
 * @returns true when a waiting circle was redrawn
 */
export function resizeLiveCircle(ctx: GameContext): boolean {
  const last = fogLocal.lastCircle;
  const live = ctx.map.fog.live;
  if (!last || !live || live.gesture !== last.gesture || !ctx.game.previewFirst) return false;
  const cells = circleRevealCells(ctx.map, ctx.geometry, last.cell, fogLocal.circle);
  return ctx.dispatch({ type: 'fog.apply', cells, value: last.value, gesture: last.gesture, live: 'replace' });
}

/**
 * The Fog tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function fogTool(ctx: GameContext): MapTool {
  return {
    tap(at) {
      const map = ctx.map;
      const { cols, rows } = map.info.grid;
      const gesture = ctx.newGesture();
      switch (fogLocal.tool) {
        case 'brush': {
          const cells = new BrushStroke(at, fogLocal.brush, cols, rows).first();
          if (send(ctx, cells, gesture)) log.info('companion', 'Fog brush tap', { cells: cells.length, value: fogLocal.value });
          return;
        }
        case 'room': {
          const cells = roomCells(map, ctx.geometry, at);
          if (send(ctx, cells, gesture)) log.info('companion', 'Fog room', { cells: cells.length, value: fogLocal.value, walls: !!ctx.geometry });
          return;
        }
        case 'circle': {
          const cell = cellUnder(at, cols, rows);
          if (cell === null) return;
          const cells = circleRevealCells(map, ctx.geometry, cell, fogLocal.circle);
          const preview = ctx.game.previewFirst;
          if (send(ctx, cells, gesture, preview ? 'start' : undefined)) {
            fogLocal.lastCircle = preview ? { gesture, cell, value: fogLocal.value } : null;
            log.info('companion', 'Fog circle', { cells: cells.length, radius: fogLocal.circle, value: fogLocal.value, preview });
          }
          return;
        }
      }
    },

    begin(from, now): ToolDrag | null {
      if (fogLocal.tool !== 'brush') return null;
      const { cols, rows } = ctx.map.info.grid;
      const gesture = ctx.newGesture();
      const stroke = new BrushStroke(from, fogLocal.brush, cols, rows);
      send(ctx, stroke.first(), gesture);
      send(ctx, stroke.moveTo(now), gesture);
      return {
        move: (at) => {
          send(ctx, stroke.moveTo(at), gesture);
        },
        end: (at) => {
          send(ctx, stroke.moveTo(at), gesture);
          log.info('companion', 'Fog brush stroke', { cells: stroke.touched, value: fogLocal.value });
        },
        cancel: () => log.info('companion', 'Fog brush stroke cut short', { cells: stroke.touched }),
      };
    },
  };
}
