/**
 * The renderer's seam: `createTableView(host, { profile, log })` puts a WebGL table into a host
 * element and draws whatever `RootState` it is given — the TV's table (`players`) or the DM's
 * view (`dm`). TV mode, the companion and the effects runtime code against this file only.
 *
 * It returns at once; `ready` resolves when WebGL runs. `update()` calls before that are kept
 * (the latest state wins) and drawn when ready. Nothing renders while nothing changes.
 *
 * ```ts
 * const view = createTableView(stage, { profile: 'dm', log, files: (ref) => files.get(ref), effects: createEffectsRuntime });
 * view.update(session.state);              // on every state change
 * const sq = view.screenToSquares({ x, y });
 * const hit = view.hitTest({ x, y });       // { kind: 'token', id } | { kind: 'door', index } | …
 * view.panBy(dx, dy); view.zoomAt(1.1, { x, y });
 * ```
 *
 * @see ../../../../docs/architecture.md "rendering", "work packages" (seams)
 * @see ../../../../docs/render.md for how it is built and what it costs
 */
import type { Camera, FileRef, Point, RootState } from '@battlemap/shared';
import { onShellEvent } from '../shell.ts';
import type { Hit } from './hit.ts';
import { createRenderer, type TableRenderer } from './pixi.ts';
import { TableScene } from './scene.ts';
import type { FileLoader, RenderStats, TableView, TableViewOptions } from './types.ts';

export type { EffectSlots, EffectsFactory, EffectsRuntime, FileLoader, RenderStats, TableView, TableViewEvent, TableViewOptions, ViewProfile } from './types.ts';
export type { Hit } from './hit.ts';
export type { DmCamera, Size } from './camera.ts';
export { SQUARE, clampDmCamera, fitDmCamera, panCamera, screenToSquares, squaresToScreen, zoomCameraAt } from './camera.ts';
export type { RenderScheduler } from './scheduler.ts';

/**
 * The default file loader: `GET <serverUrl>/files/<hash>.<ext>`.
 *
 * @param serverUrl - the server's base URL (no trailing slash), default the page's origin
 * @returns a loader
 */
export function httpFiles(serverUrl?: string): FileLoader {
  const base = serverUrl ?? (typeof location !== 'undefined' ? location.origin : '');
  return async (ref: FileRef) => {
    const res = await fetch(`${base}/files/${ref.hash}.${ref.ext}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${ref.hash}.${ref.ext}`);
    return res.blob();
  };
}

/**
 * Creates the table view in a host element (the canvas fills it).
 *
 * @param host - the element to fill (give it a size; `touch-action: none` for gestures)
 * @param opts - profile (`players` | `dm`), logger, and optionally files, effects, events
 * @returns the view — usable at once, drawing once `ready` resolves
 */
export function createTableView(host: HTMLElement, opts: TableViewOptions): TableView {
  const { log } = opts;
  const files = opts.files ?? httpFiles(opts.serverUrl);
  let renderer: TableRenderer | null = null;
  let scene: TableScene | null = null;
  let pending: RootState | null = null;
  let pendingCam: Camera | null = null;
  let destroyed = false;
  let gpu: string | null = null;
  const stopShell = opts.listenToShell === false ? () => {} : onShellEvent((e) => {
    if (e.type !== 'memory') return;
    const level = Number((e as { level?: unknown }).level ?? 0);
    if (level >= 10) view.dropTextures(level);
  });

  const ready = createRenderer(host, {
    log,
    maxRenderHeight: opts.profile === 'players' ? 1080 : undefined,
    maxResolution: 2,
    background: opts.profile === 'players' ? 0x000000 : 0x161616,
  }).then((r) => {
    if (destroyed) {
      r.destroy();
      return;
    }
    renderer = r;
    gpu = r.gpu;
    scene = new TableScene(r, opts, files);
    if (pending) scene.update(pending);
    if (pendingCam) scene.setDmCamera(pendingCam);
    pending = null;
    pendingCam = null;
  });
  ready.catch((e: unknown) => {
    log.error('render', 'Table view failed to start', { error: String(e), profile: opts.profile });
    opts.onEvent?.({ type: 'renderer-failed', error: String(e) });
  });

  const view: TableView & { dropTextures(level?: number): void } = {
    ready,
    get scheduler() {
      return renderer?.scheduler ?? null;
    },
    update(state) {
      if (scene) scene.update(state);
      else pending = state;
    },
    setDmCamera(c) {
      if (scene) scene.setDmCamera(c);
      else pendingCam = c;
    },
    dmCamera: () => scene?.dmCamera() ?? null,
    panBy: (dx, dy) => scene?.panBy(dx, dy),
    zoomAt: (f, at) => scene?.zoomAt(f, at),
    fitDmCamera: () => scene?.fitDmCamera(),
    camera: () => scene?.camera() ?? null,
    screenToSquares: (p: Point) => scene?.screenToSquares(p) ?? null,
    squaresToScreen: (p: Point) => scene?.squaresToScreen(p) ?? null,
    hitTest: (p: Point): Hit | null => scene?.hits(p)[0] ?? null,
    hits: (p: Point) => scene?.hits(p) ?? [],
    setDmLayersShown: (on) => scene?.setDmLayersShown(on),
    setWallsShown: (on) => scene?.setWallsShown(on),
    dropTextures(level: number = 0) {
      if (!scene) return;
      const freed = scene.dropTextures();
      const freedMb = Math.round(freed / 2 ** 20);
      log.warn('render', 'Textures dropped', { level, freedMb });
      opts.onEvent?.({ type: 'textures-dropped', level, freedMb });
    },
    stats(): RenderStats {
      const t = scene?.textureBytes() ?? { map: 0, fog: 0, tokens: 0, layers: 0, effects: 0, total: 0 };
      return {
        frames: renderer?.scheduler.frames ?? 0,
        lastFrameMs: renderer?.scheduler.lastRenderMs ?? 0,
        textures: t,
        tokens: scene?.tokenCount ?? 0,
        mapPxPerSquare: scene?.mapPxPerSquare ?? 0,
        gpu,
      };
    },
    destroy() {
      destroyed = true;
      stopShell();
      scene?.destroy();
      renderer?.destroy();
      scene = null;
      renderer = null;
    },
  };
  return view;
}
