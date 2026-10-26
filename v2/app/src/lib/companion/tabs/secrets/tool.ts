/**
 * What a finger on the map does in the Secrets tab: a tap on a secret (its square, or the map
 * door it makes secret) selects it; a tap anywhere else places the chosen kind there — with
 * "Secret door" chosen, a tap on one of the map's own doors makes that door secret, elsewhere it
 * places a door battlemap draws on the square. Door taps never toggle doors here (`doors: false`).
 * No drag: a drag pans the view.
 */
import { newId } from '@battlemap/shared';
import type { GameContext, MapTool } from '../../game/tabs.ts';
import { cellUnder } from '../fog/cells.ts';
import { placeSecret } from './actions.ts';
import { secretsLocal } from './local.svelte.ts';
import { doorSquare, makeSecret, secretAt } from './logic.ts';

/**
 * The Secrets tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function secretsTool(ctx: GameContext): MapTool {
  return {
    claims: () => true,

    tap(at) {
      const { cols, rows } = ctx.map.info.grid;
      const cell = cellUnder(at, cols, rows);
      if (cell === null) return;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const hit = ctx.hitsAt(at).find((h) => h.kind === 'door');
      const door = hit?.kind === 'door' && hit.index < ctx.map.info.doorCount ? hit.index : null;
      const secrets = ctx.map.secrets ?? [];
      const existing = secretAt(secrets, col, row, door);
      if (existing) {
        secretsLocal.selected = existing.id;
        return;
      }
      const kind = secretsLocal.place;
      if (kind === 'door' && door !== null) {
        const d = ctx.geometry?.doors[door];
        const sq = d ? doorSquare(d, cols, rows) : { col, row, vertical: false };
        placeSecret(ctx, makeSecret(newId(), 'door', sq.col, sq.row, door, sq.vertical));
        return;
      }
      placeSecret(ctx, makeSecret(newId(), kind, col, row));
    },
  };
}
