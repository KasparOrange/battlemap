/**
 * Mounts the Effects tab's aim layer ({@link AimLayer}) over the companion's map: an SVG that
 * draws the aimed area and the selected placed effect — DM-only, never in the state. The game
 * screen has no overlay slot for tabs, so the layer goes into the map view's host element
 * (`[data-testid="map-view"]`) and lives while the tab is in use: mounted on the tab's first
 * gesture or when its panel opens, dropped when the DM leaves the tab.
 */
import { mount, unmount } from 'svelte';
import type { GameContext } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import AimLayer from './AimLayer.svelte';

let current: { host: Element; app: Record<string, unknown> } | null = null;

/**
 * Makes sure the aim layer is over the map (again, if the map view was rebuilt).
 *
 * @param ctx - the game context
 */
export function ensureOverlay(ctx: GameContext): void {
  const host = globalThis.document?.querySelector('[data-testid="map-view"]');
  if (!host) return;
  if (current && current.host === host && host.querySelector('[data-testid="effects-aim"]')) return;
  dropOverlay();
  try {
    current = { host, app: mount(AimLayer, { target: host, props: { ctx } }) };
  } catch (e) {
    log.warn('companion', 'Effects aim layer not shown', { error: String(e) });
  }
}

/** Takes the aim layer off the map. */
export function dropOverlay(): void {
  if (!current) return;
  try {
    void unmount(current.app);
  } catch {
    // already gone with its host
  }
  current = null;
}
