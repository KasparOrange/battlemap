/**
 * The table on the TV: the renderer's players' view (`createTableView(host, { profile:
 * 'players' })` from `$lib/render`) behind TV mode's screens. This file is TV mode's only
 * contact with the renderer, so a change of its seam touches one place.
 */
import type { RootState } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { createRenderer } from '../render/pixi.ts';

/** What TV mode uses of the renderer's table view. */
export interface TvTableView {
  /** Draws this state (cheap when nothing it shows changed). */
  update(state: RootState): void;
  /** Drops textures it can rebuild (the shell's `memory` event). */
  dropTextures(): void;
  /** Frees everything. */
  destroy(): void;
}

/**
 * Starts the players' view of the table in `host`.
 *
 * @param host - the element it fills
 * @param log - the logger
 * @returns the view
 */
export async function openTableView(host: HTMLElement, log: Logger): Promise<TvTableView> {
  // Until the renderer's scene seam lands this is the bare Pixi canvas (black, render on demand).
  const r = await createRenderer(host, { log, maxRenderHeight: 1080 });
  return {
    update: () => r.scheduler.invalidate(),
    dropTextures: () => {},
    destroy: () => r.destroy(),
  };
}
