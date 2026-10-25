/**
 * The table on the TV: the renderer's players' view (`createTableView(host, { profile:
 * 'players' })` from `$lib/render`) behind TV mode's screens, with the effects runtime in its
 * slots and map files from the device's cache. This file is TV mode's only contact with the
 * renderer, so a change of its seam touches one place. The view drops textures by itself on the
 * shell's `memory` event.
 */
import type { FileRef, RootState } from '@battlemap/shared';
import { createEffectsRuntime } from '../effects/index.ts';
import { attachRenderStats } from '../debug-hook.ts';
import type { Logger } from '../log.ts';
import { createTableView, type TableViewEvent } from '../render/index.ts';

/** What TV mode uses of the renderer's table view. */
export interface TvTableView {
  /** Draws this state (cheap when nothing it shows changed). */
  update(state: RootState): void;
  /** Frees everything. */
  destroy(): void;
}

/** Options of {@link openTableView}. */
export interface TvTableViewOptions {
  /** The logger. */
  log: Logger;
  /** Loads a file (the device's cache, fetched from the server when missing). */
  files: (ref: FileRef) => Promise<Blob>;
  /** Map loading, shown, failed; the renderer failing. */
  onEvent: (e: TableViewEvent) => void;
}

/**
 * Starts the players' view of the table in `host`.
 *
 * @param host - the element it fills
 * @param options - logger, file loader, events
 * @returns the view (usable at once; it draws once WebGL runs)
 */
export function openTableView(host: HTMLElement, options: TvTableViewOptions): TvTableView {
  const view = createTableView(host, {
    profile: 'players',
    log: options.log,
    files: options.files,
    effects: (slots, ctx) => createEffectsRuntime(slots, ctx),
    onEvent: options.onEvent,
  });
  view.ready.catch((e: unknown) => options.onEvent({ type: 'renderer-failed', error: String(e) }));
  attachRenderStats(() => view.stats()); // the test hook (`?debug=1` only)
  return view;
}
