/**
 * The companion's side of the renderer seam (architecture.md "seams"): the map view draws the
 * state through `createTableView(host, { profile: 'dm', log })` from `lib/render`. Until the
 * renderer package publishes that (`lib/render/index.ts`), a Canvas 2D sketch of the DM view
 * (`sketch-view.ts`) stands in, so the screen, its gestures and its tests work today. The
 * renderer is found at build time with `import.meta.glob`, so its arrival needs no edit here.
 *
 * The companion owns the DM camera (pinch, pan, fit — `input/camera.ts`) and hands it to the
 * view; hit tests are done on the state (`input/hits.ts`), not by the view.
 */
import type { Camera, FileRef, MapGeometry, RootState } from '@battlemap/shared';
import type { Logger } from '../../log.ts';
import { createSketchView } from './sketch-view.ts';

/** What the game screen needs from a table view. */
export interface TableViewHandle {
  /** Draws a new state (reference checks decide what changed). */
  update(state: RootState): void;
  /** Moves the DM camera. */
  setDmCamera(camera: Camera): void;
  /** Extra DM-only things the sketch draws (the real renderer ignores what it does itself). */
  setOverlay?(overlay: DmOverlay): void;
  /** The host was resized. */
  resize?(): void;
  /** Frees everything. */
  destroy(): void;
}

/** Things the companion knows that are not in the state. */
export interface DmOverlay {
  /** The map's walls and doors (door markers). */
  geometry: MapGeometry | null;
  /** The selected token's id (a ring). */
  selectedToken: string | null;
}

/** Options for {@link openTableView}. */
export interface OpenOptions {
  /** The logger. */
  log: Logger;
  /** URL of a file on the server (the sketch loads the map picture itself). */
  fileUrl: (ref: FileRef) => string;
  /** The server's base URL (the renderer's file loader). */
  serverUrl: string;
  /** A map picture failed to load (the DM must hear of it). */
  onMapFailed?: (error: string) => void;
}

/** The renderer module's shape as far as the companion uses it. */
interface RenderModule {
  createTableView?: (host: HTMLElement, options: {
    profile: 'dm' | 'players';
    log: Logger;
    serverUrl?: string;
    onEvent?: (e: { type: string; error?: string }) => void;
  }) => TableViewHandle & { ready?: Promise<void> };
}

const renderModules = import.meta.glob<RenderModule>('../../render/index.ts');

/**
 * Opens the DM view on a host element: the real renderer when it exists, else the sketch.
 *
 * @param host - the element to draw into (fills it)
 * @param options - logger and file URLs
 * @returns the view
 */
export async function openTableView(host: HTMLElement, options: OpenOptions): Promise<TableViewHandle> {
  const load = Object.values(renderModules)[0];
  if (load) {
    try {
      const mod = await load();
      if (mod.createTableView) {
        const view = mod.createTableView(host, {
          profile: 'dm',
          log: options.log,
          serverUrl: options.serverUrl,
          onEvent: (e) => {
            if (e.type.includes('fail') && e.type !== 'renderer-failed') options.onMapFailed?.(e.error ?? e.type);
          },
        });
        try {
          await view.ready;
          options.log.info('companion', 'Table view: renderer');
          return view;
        } catch (e) {
          view.destroy();
          throw e;
        }
      }
    } catch (e) {
      options.log.error('companion', 'Renderer failed — using the sketch view', { error: String(e) });
    }
  }
  options.log.info('companion', 'Table view: sketch (renderer not published yet)');
  return createSketchView(host, options.fileUrl);
}
