/**
 * "TV follows the tablet" (parity CA-05): while on, the TV's view goes where the DM's camera
 * goes — on the one-inch table the window moves (whole squares), otherwise the TV's free
 * camera takes the middle. At most one command per 80 ms, the latest wins. Device-local, off
 * at start, never synced; it keeps running while the DM uses other tabs.
 */
import { startFor, tvView } from '@battlemap/shared';
import type { GameContext } from '../../game/tabs.ts';
import { throttle } from '../../input/throttle.ts';
import { log } from '../../../log.ts';

class Follow {
  /** Whether the TV follows. */
  on = $state(false);
  private stop: (() => void) | null = null;

  /**
   * Sends the DM's view to the TV once ("Show my view on the TV").
   *
   * @param ctx - the game context
   * @returns false when nothing was sent
   */
  showOnce(ctx: GameContext): boolean {
    const cmd = followCommand(ctx);
    return cmd ? ctx.dispatch(cmd) : false;
  }

  /**
   * Turns following on or off.
   *
   * @param ctx - the game context
   * @param on - the wish
   */
  set(ctx: GameContext, on: boolean): void {
    this.stop?.();
    this.stop = null;
    this.on = on;
    log.info('companion', on ? 'TV follows the tablet' : 'TV stays where it is');
    if (!on) return;
    const send = throttle(80, (cmd: NonNullable<ReturnType<typeof followCommand>>) => ctx.dispatch(cmd));
    this.stop = $effect.root(() => {
      $effect(() => {
        void ctx.camera.get();
        const cmd = followCommand(ctx);
        if (cmd) send.push(cmd);
      });
      return () => send.cancel();
    });
  }
}

/** The command that puts the TV on the DM camera's middle, or null when it's there already. */
function followCommand(ctx: GameContext) {
  const s = ctx.session.view;
  const game = s?.game;
  if (!s || !game) return null;
  const map = game.maps[game.activeMapId];
  if (!map) return null;
  const cam = ctx.camera.get();
  const view = tvView(s.table, map);
  if (view?.layout) {
    const w = startFor(view.layout, { x: cam.centerX, y: cam.centerY });
    if (w.col === map.view.col && w.row === map.view.row) return null;
    return { type: 'view.window' as const, col: w.col, row: w.row };
  }
  const zoom = map.view.free?.zoom ?? view?.camera.zoom ?? 32;
  return { type: 'view.free' as const, x: cam.centerX, y: cam.centerY, zoom };
}

/** The one follow switch of this tablet. */
export const tvFollow = new Follow();
