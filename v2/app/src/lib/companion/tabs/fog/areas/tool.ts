/**
 * What a finger on the map does while a reveal area is being edited (the Fog tab hands it the
 * touch then — `claims` — so door taps don't toggle doors meanwhile):
 *
 * - Paint: a tap adds (or removes) the square under the finger, a drag every square it passes.
 * - Room: a tap adds (or removes) the room under the finger, stopped by walls and closed doors —
 *   the quickest way to outline "the crypt" on a map with walls.
 * - Outline: each tap sets a corner, snapped to the nearest square corner; a tap near the first
 *   corner closes the outline and adds (or removes) the squares whose centres lie inside. A drag
 *   pans the view.
 *
 * Nothing is sent: the squares collect in the draft until Save (`AreaFooter`).
 */
import type { GameContext, MapTool, ToolDrag } from '../../../game/tabs.ts';
import { log } from '../../../../log.ts';
import { BrushStroke, cellUnder, roomCells } from '../cells.ts';
import { areasLocal } from './local.svelte.ts';
import { closesOutline, editCells, polygonCells, snapCorner } from './logic.ts';

/** Adds or removes squares from the draft, as the Add | Remove switch says. */
function touch(cells: readonly number[]): void {
  const d = areasLocal.draft;
  if (!d || cells.length === 0) return;
  const next = editCells(d.cells, cells, areasLocal.add);
  if (next !== d.cells) areasLocal.patch({ cells: next });
}

/**
 * Closes the outline in progress: its squares go into the draft, the outline starts over.
 *
 * @param ctx - the game context
 * @returns how many squares it covered (0 when there was no outline of 3 corners)
 */
export function closeOutline(ctx: GameContext): number {
  const d = areasLocal.draft;
  if (!d || d.poly.length < 3) return 0;
  const { cols, rows } = ctx.map.info.grid;
  const cells = polygonCells(d.poly, cols, rows);
  touch(cells);
  areasLocal.patch({ poly: [] });
  log.info('companion', 'Area outline closed', { corners: d.poly.length, cells: cells.length, add: areasLocal.add });
  return cells.length;
}

/**
 * The area editing tool.
 *
 * @param ctx - the game context
 * @returns the tool (claims every touch while a draft is open)
 */
export function areaTool(ctx: GameContext): MapTool {
  return {
    claims: () => areasLocal.draft !== null,

    tap(at) {
      const d = areasLocal.draft;
      if (!d) return;
      const { cols, rows } = ctx.map.info.grid;
      switch (areasLocal.tool) {
        case 'paint': {
          const cell = cellUnder(at, cols, rows);
          if (cell !== null) touch([cell]);
          return;
        }
        case 'room':
          touch(roomCells(ctx.map, ctx.geometry, at));
          return;
        case 'outline': {
          const corner = snapCorner(at, cols, rows);
          if (closesOutline(d.poly, corner)) {
            closeOutline(ctx);
            return;
          }
          const last = d.poly[d.poly.length - 1];
          if (last && last.x === corner.x && last.y === corner.y) return; // the same corner twice
          areasLocal.patch({ poly: [...d.poly, corner] });
          return;
        }
      }
    },

    begin(from, now): ToolDrag | null {
      if (!areasLocal.draft || areasLocal.tool !== 'paint') return null;
      const { cols, rows } = ctx.map.info.grid;
      const stroke = new BrushStroke(from, 0, cols, rows);
      touch(stroke.first());
      touch(stroke.moveTo(now));
      return {
        move: (at) => touch(stroke.moveTo(at)),
        end: (at) => touch(stroke.moveTo(at)),
        cancel: () => {},
      };
    },
  };
}
