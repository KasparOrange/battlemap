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
 * view.setDmCamera(pinchCamera(start, view.viewport(), a0, b0, a1, b1));
 * view.setDmInsets({ top: 0, right: 360, bottom: 0, left: 0 }); // the side panel
 * const stop = view.onCameraChange((cam, why) => …);   // the camera's one owner is this view
 * ```
 *
 * **One camera owner, one hit test** (rv#8, rv#32): the DM camera lives here (maths in
 * `camera.ts`: pure, importable under `bun test`); the companion keeps none of its own. Hit tests
 * are `hits`/`hitTest` (`hit.ts`). See `TableView` in `types.ts` for the contract.
 *
 * @see ../../../../docs/architecture.md "rendering", "work packages" (seams)
 * @see ../../../../docs/render.md for how it is built and what it costs
 */
import type { Camera, FileRef, Point, RootState } from '@battlemap/shared';
import type { Insets } from './camera.ts';
import { onShellEvent } from '../shell.ts';
import { isMemoryPressure, RESTORE_AFTER_MS } from './memory.ts';
import type { Hit } from './hit.ts';
import { createRenderer, type TableRenderer } from './pixi.ts';
import { TableScene } from './scene.ts';
import type { CameraChange, FileLoader, RenderStats, TableView, TableViewOptions } from './types.ts';

export type { CameraChange, EffectSlots, EffectsFactory, EffectsRuntime, FileLoader, RenderStats, TableView, TableViewEvent, TableViewOptions, ViewProfile } from './types.ts';
export type { Hit, HitInput } from './hit.ts';
export { hitsAt, GRAB_PX } from './hit.ts';
export type { DmCamera, DmLimits, Insets, Size } from './camera.ts';
export {
  SQUARE, DM_MAX_ZOOM, DM_MIN_FIT_FACTOR, FIT_MARGIN_PX, NO_INSETS,
  clampDmCamera, fitDmCamera, fitZoomFor, panCamera, pinchCamera, sameCamera, screenToSquares, squaresToScreen, visibleSquares, zoomCameraAt,
} from './camera.ts';
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
  let pendingInsets: Insets | null = null;
  let pendingSelected: string | null | undefined;
  const pendingListeners = new Set<(c: Camera, why: CameraChange) => void>();
  let destroyed = false;
  let gpu: string | null = null;
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  const stopShell = opts.listenToShell === false ? () => {} : onShellEvent((e) => {
    if (e.type !== 'memory') return;
    const level = Number((e as { level?: unknown }).level ?? 0);
    if (!isMemoryPressure(level)) {
      log.debug('render', 'Memory note ignored', { level });
      return;
    }
    view.dropTextures(level);
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
    const canvas = r.app.canvas;
    canvas.addEventListener('webglcontextlost', () => log.warn('render', 'WebGL context lost', { profile: opts.profile }));
    canvas.addEventListener('webglcontextrestored', () => {
      log.info('render', 'WebGL context restored — reloading the map', { profile: opts.profile });
      scene?.reloadTextures();
    });
    for (const l of pendingListeners) scene.onCameraChange(l);
    if (pendingInsets) scene.setDmInsets(pendingInsets);
    if (pending) scene.update(pending);
    if (pendingCam) scene.setDmCamera(pendingCam);
    if (pendingSelected !== undefined) scene.setSelectedToken(pendingSelected);
    pending = null;
    pendingCam = null;
  });
  ready.catch((e: unknown) => {
    log.error('render', 'Table view failed to start', { error: String(e), profile: opts.profile });
    opts.onEvent?.({ type: 'renderer-failed', error: String(e) });
  });

  const view: TableView = {
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
    setDmInsets(insets) {
      if (scene) scene.setDmInsets(insets);
      else pendingInsets = insets;
    },
    onCameraChange(cb) {
      if (scene) return scene.onCameraChange(cb);
      pendingListeners.add(cb);
      return () => {
        pendingListeners.delete(cb);
        scene?.onCameraChange(cb)();
      };
    },
    viewport: () => scene?.viewport() ?? { width: host.clientWidth || 1, height: host.clientHeight || 1 },
    geometry: () => scene?.mapGeometry() ?? null,
    setSelectedToken(id) {
      if (scene) scene.setSelectedToken(id);
      else pendingSelected = id;
    },
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
      // rv#3: sharpness comes back once the pressure has been gone a while
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
        if (!scene) return;
        log.info('render', 'Memory calm again — the map gets its full density back', { afterMs: RESTORE_AFTER_MS });
        scene.restoreDensity();
      }, RESTORE_AFTER_MS);
    },
    stats(): RenderStats {
      const t = scene?.textureBytes() ?? { map: 0, fog: 0, tokens: 0, layers: 0, effects: 0, total: 0 };
      return {
        frames: renderer?.scheduler.frames ?? 0,
        lastFrameMs: renderer?.scheduler.lastRenderMs ?? 0,
        textures: t,
        budget: { map: scene?.budget.mapBytes ?? 0, other: scene?.budget.otherBytes ?? 0 },
        tokens: scene?.tokenCount ?? 0,
        mapPxPerSquare: scene?.mapPxPerSquare ?? 0,
        gpu,
      };
    },
    destroy() {
      destroyed = true;
      stopShell();
      if (restoreTimer) clearTimeout(restoreTimer);
      scene?.destroy();
      renderer?.destroy();
      scene = null;
      renderer = null;
    },
  };
  return view;
}
