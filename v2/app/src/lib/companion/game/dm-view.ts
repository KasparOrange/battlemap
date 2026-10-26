/**
 * The companion's table view: the renderer's DM view with the device's file cache and the
 * effects runtime, made through the page's {@link viewKeeper} — by the game screen
 * (`MapView.svelte`), or ahead of it while the DM is on the library ({@link prewarmDmView}, qa#26).
 *
 * @see ./view-keeper.ts for why there is one view per page
 */
import { log } from '../../log.ts';
import type { TableView } from '../../render/index.ts';
import { files } from '../../storage/index.ts';
import { viewKeeper, type ViewHandlers } from './view-keeper.ts';

/** How long after the library shows the view is made at the latest, idle time or not (ms). */
export const PREWARM_DEADLINE_MS = 4000;

/** How long the library must have shown before the view is made (its first raster done), ms. */
export const PREWARM_DELAY_MS = 600;

/**
 * Makes the DM view in `host` (renderer and effects code load on first use).
 *
 * @param host - the element the canvas fills
 * @param h - the callbacks of whoever holds the view (the keeper's proxy)
 * @returns the view (its `ready` settles when WebGL runs or failed)
 */
export async function createDmView(host: HTMLElement, h: ViewHandlers): Promise<TableView> {
  const [{ createTableView }, { createEffectsRuntime }] = await Promise.all([import('../../render/index.ts'), import('../../effects/index.ts')]);
  return createTableView(host, {
    profile: 'dm',
    log,
    files: (ref) => files.get(ref),
    effects: (slots, c) => createEffectsRuntime(slots, c),
    now: h.now,
    onEvent: h.onEvent,
  });
}

/**
 * Makes the page's view ahead, in idle time a moment after the library shows — so opening a game
 * adopts a running view instead of starting WebGL then. Does nothing when a view is kept already
 * or the page runs with `?prewarm=0`.
 *
 * @returns cancels a prewarm that hasn't started yet
 */
export function prewarmDmView(): () => void {
  if (viewKeeper.holding) return () => {};
  try {
    if (new URL(location.href).searchParams.get('prewarm') === '0') return () => {};
  } catch {
    // no location (tests): go on
  }
  let idle: number | null = null;
  const start = () => {
    idle = null;
    if (viewKeeper.holding) return;
    const t0 = performance.now();
    void viewKeeper.prewarm(createDmView).then(() => {
      if (viewKeeper.holding) log.info('companion', 'Map view made ahead', { ms: Math.round(performance.now() - t0) });
    });
  };
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(start, { timeout: PREWARM_DEADLINE_MS });
    else start();
  }, PREWARM_DELAY_MS);
  return () => {
    clearTimeout(timer);
    if (idle !== null) cancelIdleCallback(idle);
  };
}
