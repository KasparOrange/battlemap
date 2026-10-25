/**
 * What a finger on the map does in the Tokens tab — and in every panel tab without a tool of its
 * own (parity CV-04/05, TK-02/05, TK-13):
 *
 * - a tap on a token selects it (a second tap on it deselects); v1 could only select in the list;
 * - a tap on an empty square places the armed token there, or — with nothing armed or selected
 *   — adds a new token; with a token selected it only clears the selection;
 * - a drag that starts on a token moves it square by square (one `token.move` per square
 *   entered, one gesture = one undo step); a drag elsewhere pans the view.
 */
import { tokenAt } from '../../input/hits.ts';
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import { notify } from '../../../ui/notice.svelte.ts';
import { makeToken, squareFree, tokenName } from './logic.ts';
import { tokensLocal } from './local.svelte.ts';

/**
 * The Tokens tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function tokensTool(ctx: GameContext): MapTool {
  const inside = (col: number, row: number) => col >= 0 && row >= 0 && col < ctx.map.info.grid.cols && row < ctx.map.info.grid.rows;

  return {
    claims: (at) => tokenAt(ctx.map.tokens, at) !== null,

    tap(at) {
      const map = ctx.map;
      const hit = tokenAt(map.tokens, at);
      if (hit) {
        ctx.selectedToken = ctx.selectedToken === hit.id ? null : hit.id;
        return;
      }
      const col = Math.floor(at.x);
      const row = Math.floor(at.y);
      if (!inside(col, row)) return;
      const armed = tokensLocal.armed ? map.tokens.find((t) => t.id === tokensLocal.armed) : undefined;
      if (armed) {
        tokensLocal.armed = null;
        if (ctx.dispatch({ type: 'token.move', id: armed.id, col, row, gesture: ctx.newGesture() })) {
          log.info('companion', 'Token placed', { id: armed.id, col, row });
          ctx.selectedToken = armed.id;
        }
        return;
      }
      if (ctx.selectedToken) {
        ctx.selectedToken = null;
        return;
      }
      if (!squareFree(map.tokens, col, row)) return;
      const token = makeToken(map.tokens, '', { col, row });
      if (ctx.dispatch({ type: 'token.add', token })) log.info('companion', 'Token added', { id: token.id, col, row });
    },

    begin(from): ToolDrag | null {
      const token = tokenAt(ctx.map.tokens, from);
      if (!token) return null;
      const gesture = ctx.newGesture();
      let col = token.col;
      let row = token.row;
      ctx.selectedToken = token.id;
      const moveTo = (x: number, y: number) => {
        const c = Math.floor(x);
        const r = Math.floor(y);
        if ((c === col && r === row) || !inside(c, r) || !squareFree(ctx.map.tokens, c, r, token.id)) return;
        col = c;
        row = r;
        ctx.dispatch({ type: 'token.move', id: token.id, col, row, gesture });
      };
      return {
        move: (at) => moveTo(at.x, at.y),
        end: (at) => {
          moveTo(at.x, at.y);
          if (col !== token.col || row !== token.row) log.info('companion', 'Token moved', { id: token.id, col, row });
        },
        cancel: () => {},
      };
    },
  };
}

/**
 * Arms a token that is not on the map: the next tap on an empty square places it.
 *
 * @param ctx - the game context
 * @param id - the token
 */
export function armToken(ctx: GameContext, id: string): void {
  const token = ctx.map.tokens.find((t) => t.id === id);
  if (!token) return;
  tokensLocal.armed = id;
  notify(`Tap the map where ${tokenName(token)} stands.`);
}
