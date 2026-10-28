/**
 * The TV's tile sets of big maps (`docs/render.md` "Tile streaming for big maps"): asked of the
 * server once (`GET /api/tiles/…`, which cuts the picture on the first call), then kept in the
 * device's settings (`tiles:<hash>:<level>`) so the map streams from the file cache without the
 * server later (offline play, a box restart). A set never changes — the picture is addressed by
 * its content — so a kept one is always good.
 */
import type { FileRef, TileManifest } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { isTileManifest } from '../render/tile-window.ts';
import type { TvSettingsStore } from './ports.ts';

/** Settings key of a picture's tile set at a level. */
export function tileSetKey(picture: FileRef, level: number): string {
  return `tiles:${picture.hash}:${level}`;
}

/** What {@link deviceTileSets} needs. */
export interface DeviceTileSetsDeps {
  /** The device's settings. */
  settings: TvSettingsStore;
  /** Asks the server (`api.tileSet`); null when it has none. */
  fetch: (picture: FileRef, level: number) => Promise<TileManifest | null>;
  /** The logger. */
  log: Logger;
}

/**
 * A tile-set loader that keeps every set it got on the device.
 *
 * @param deps - settings, the server call, logger
 * @returns the loader for `createTableView({ tileSets })`
 */
export function deviceTileSets(deps: DeviceTileSetsDeps): (picture: FileRef, level: number) => Promise<TileManifest | null> {
  return async (picture, level) => {
    const key = tileSetKey(picture, level);
    try {
      const kept = await deps.settings.get<unknown>(key);
      if (isTileManifest(kept)) return kept;
    } catch (e) {
      deps.log.warn('tv', 'Kept tile set unreadable', { key, error: String(e) });
    }
    const got = await deps.fetch(picture, level);
    if (got) {
      try {
        await deps.settings.put(key, got);
        deps.log.info('tv', 'Tile set kept on the device', { key, tiles: got.tiles.length });
      } catch (e) {
        deps.log.warn('tv', 'Tile set not kept', { key, error: String(e) });
      }
    }
    return got;
  };
}
