/**
 * "TV follows the tablet" (parity CA-05): while on, the TV's view goes where the DM's camera
 * goes — on the one-inch table the window moves (whole squares), otherwise the TV's free camera
 * takes the middle. At most one command per 80 ms, the latest wins. Device-local, off at start,
 * never synced; it keeps running while the DM uses other tabs and stops with the game screen.
 *
 * rv#1: it listens to the camera only (never to the state it changes), and sends nothing when
 * the TV already shows that spot — an echo can't trigger the next command, the TV stays idle
 * and its autosave runs.
 */
import { tvView, type Camera, type RootState } from '@battlemap/shared';
import type { GameContext } from '../../game/tabs.ts';
import { throttle } from '../../input/throttle.ts';
import { log } from '../../../log.ts';
import { windowAt } from './view-logic.ts';

/** How often following sends at most, in ms (v1: 80). */
export const FOLLOW_MS = 80;

/** What following sends. */
export type FollowCommand = { type: 'view.window'; col: number; row: number } | { type: 'view.free'; x: number; y: number; zoom: number };

/**
 * The command that puts the TV on the DM camera's middle, or null when it shows that already.
 *
 * @param state - the predicted state
 * @param cam - the DM camera
 * @returns the command, or null
 */
export function followCommand(state: RootState | null, cam: Camera | null): FollowCommand | null {
  const game = state?.game;
  const map = game?.maps[game.activeMapId];
  if (!state || !map || !cam) return null;
  const view = tvView(state.table, map);
  if (view?.layout) {
    const w = windowAt(view, map, { x: cam.centerX, y: cam.centerY }); // clamped; null: the map fits
    if (!w || (w.col === view.layout.col && w.row === view.layout.row)) return null;
    return { type: 'view.window', col: w.col, row: w.row };
  }
  const zoom = map.view.free?.zoom ?? view?.camera.zoom ?? 32;
  const free = map.view.free;
  if (map.view.mode === 'free' && free && Math.abs(free.x - cam.centerX) < 1e-3 && Math.abs(free.y - cam.centerY) < 1e-3) return null;
  return { type: 'view.free', x: cam.centerX, y: cam.centerY, zoom };
}

/** Following for one game screen. */
export class TvFollow {
  /** Whether the TV follows. */
  on = $state(false);
  private stop: (() => void) | null = null;
  private gameId: string | null = null;

  /** @param ctx - the game screen's context (following stops when it closes) */
  constructor(private readonly ctx: GameContext) {
    ctx.onDispose(() => this.set(false));
  }

  /**
   * Sends the DM's view to the TV once ("Show my view on the TV").
   *
   * @returns false when nothing was sent (the TV shows it already)
   */
  showOnce(): boolean {
    const cmd = followCommand(this.ctx.session.view, this.ctx.camera.get());
    return cmd ? this.ctx.dispatch(cmd) : false;
  }

  /**
   * Turns following on or off.
   *
   * @param on - the wish
   */
  set(on: boolean): void {
    this.stop?.();
    this.stop = null;
    if (this.on !== on) log.info('companion', on ? 'TV follows the tablet' : 'TV stays where it is');
    this.on = on;
    if (!on) return;
    const ctx = this.ctx;
    this.gameId = ctx.session.view?.game?.id ?? null;
    const send = throttle(FOLLOW_MS, (cmd: FollowCommand) => ctx.dispatch(cmd));
    const off = ctx.camera.onChange((cam) => {
      const state = ctx.session.view;
      if ((state?.game?.id ?? null) !== this.gameId) {
        this.set(false); // another game came: following was for the last one
        return;
      }
      const cmd = followCommand(state, cam);
      if (cmd) send.push(cmd);
    });
    this.stop = () => {
      off();
      send.cancel();
    };
    const first = followCommand(ctx.session.view, ctx.camera.get());
    if (first) send.push(first);
  }
}

const perScreen = new WeakMap<GameContext, TvFollow>();

/**
 * The follow switch of a game screen (one per screen, so a reopened game starts with it off).
 *
 * @param ctx - the game screen's context
 * @returns its follow switch
 */
export function followOf(ctx: GameContext): TvFollow {
  let f = perScreen.get(ctx);
  if (!f) {
    f = new TvFollow(ctx);
    perScreen.set(ctx, f);
  }
  return f;
}
