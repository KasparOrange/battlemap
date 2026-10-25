/**
 * `TableScene` — the one scene graph both screens draw, built from `RootState`; the view
 * profile decides what differs (`docs/architecture.md` "one scene, two view profiles"). It owns
 * the layers in their order, diffs each state part by reference (the reducer shares unchanged
 * branches), places the camera (the TV's from `tvView`, the DM's own), and asks the scheduler
 * for a frame only when something on screen changed.
 *
 * Layer order, bottom to top: map · fx.ground · grid · drawings · tokens · fog · doors · fx.air
 * · dmLayers · tools · dmFrame — then in screen space: tableMask · fx.screen.
 */
import { Container } from 'pixi.js';
import {
  check, defaultSettings, MapGeometry as MapGeometrySchema, tableGrid, tvView, windowSquares,
  type Camera, type Game, type MapGeometry, type MapPlay, type Point, type Rect, type RootState, type TableState, type TvView,
} from '@battlemap/shared';
import { clampDmCamera, fitDmCamera, NO_INSETS, panCamera, sameCamera, screenToSquares, squaresToScreen, SQUARE, visibleSquares, worldTransform, zoomCameraAt, type Insets, type Size } from './camera.ts';
import { DmLayers, PlayersFrame } from './dm-layers.ts';
import { DoorsLayer } from './doors-layer.ts';
import { DrawingsLayer } from './drawings-layer.ts';
import { FogLayer } from './fog-layer.ts';
import { GridLayer } from './grid-layer.ts';
import { hitsAt, type Hit } from './hit.ts';
import { MapLayer } from './map-layer.ts';
import type { TableRenderer } from './pixi.ts';
import { TableMask } from './table-mask.ts';
import { DM_BUDGET, effectsBudget, TV_BUDGET, type TextureBudget } from './tiles.ts';
import { TokensLayer } from './tokens-layer.ts';
import { ToolsLayer } from './tools-layer.ts';
import type { CameraChange, EffectSlots, EffectsRuntime, FileLoader, TableViewOptions, ViewProfile } from './types.ts';

/** The named containers of the scene, bottom to top. */
export interface SceneSlots {
  map: Container;
  fxGround: Container;
  grid: Container;
  drawings: Container;
  tokens: Container;
  fog: Container;
  doors: Container;
  fxAir: Container;
  dmLayers: Container;
  tools: Container;
  dmFrame: Container;
  tableMask: Container;
  fxScreen: Container;
}

/** The settings the fog layer gets while no game is open (follows every new settings field). */
const NO_SETTINGS = defaultSettings();

/** The scene of one screen. */
export class TableScene {
  /** The layer containers. */
  readonly slots: SceneSlots;
  private readonly profile: ViewProfile;
  private readonly dm: boolean;
  private readonly mapLayer: MapLayer;
  private readonly grid: GridLayer;
  private readonly drawings: DrawingsLayer;
  private readonly tokens: TokensLayer;
  private readonly fog: FogLayer;
  private readonly doorsLayer: DoorsLayer;
  private readonly tools: ToolsLayer;
  private readonly dmLayers: DmLayers | null;
  private readonly frame: PlayersFrame | null;
  private readonly mask: TableMask | null;
  private effects: EffectsRuntime | null = null;
  /** The screen's texture budget (map, and everything else). */
  readonly budget: TextureBudget;

  private state: RootState | null = null;
  private map: MapPlay | null = null;
  private game: Game | null = null;
  private tv: TvView | null = null;
  private dmCam: Camera | null = null;
  /** The camera the last fit gave (a resize refits while `dmCam` is still this one). */
  private fittedCam: Camera | null = null;
  private insets: Insets = NO_INSETS;
  private cam: Camera | null = null;
  private readonly cameraListeners = new Set<(c: Camera, why: CameraChange) => void>();
  private size: Size = { width: 1, height: 1 };
  private shakeX = 0;
  private shakeY = 0;
  private geometry: MapGeometry | null = null;
  private geometryKey = '';
  private frameRect: Rect | null = null;
  private readonly stopTicker: () => void;
  private readonly stopResize: () => void;

  /**
   * @param r - the renderer (canvas, loop, world container)
   * @param opts - profile, logger, files, effects
   * @param files - the file loader to use
   */
  constructor(private readonly r: TableRenderer, private readonly opts: TableViewOptions, private readonly files: FileLoader) {
    this.profile = opts.profile;
    this.dm = opts.profile === 'dm';
    const world = r.world;
    const named = (label: string, parent: Container = world) => {
      const c = new Container({ label });
      parent.addChild(c);
      return c;
    };
    this.slots = {
      map: named('map'),
      fxGround: named('fx.ground'),
      grid: named('grid'),
      drawings: named('drawings'),
      tokens: named('tokens'),
      fog: named('fog'),
      doors: named('doors'),
      fxAir: named('fx.air'),
      dmLayers: named('dmLayers'),
      tools: named('tools'),
      dmFrame: named('dmFrame'),
      tableMask: named('tableMask', r.app.stage),
      fxScreen: named('fx.screen', r.app.stage),
    };
    const budget = this.dm ? DM_BUDGET : TV_BUDGET;
    this.budget = budget;
    const invalidate = () => r.scheduler.invalidate();
    this.mapLayer = new MapLayer(this.slots.map, {
      files,
      budget,
      wantedPxPerSquare: () => (this.dm ? Infinity : this.tableGridPpi()),
      preferTableCopy: !this.dm,
      mipmaps: this.dm,
      log: opts.log,
      onEvent: (e) => opts.onEvent?.(e),
      invalidate,
      upload: (t) => r.app.renderer.texture.initSource(t.source),
    });
    this.grid = new GridLayer(this.slots.grid, this.dm ? 1 : 1.5);
    this.drawings = new DrawingsLayer(this.slots.drawings);
    this.tokens = new TokensLayer(this.slots.tokens, this.dm);
    this.fog = new FogLayer(this.slots.fog, this.dm ? { opacity: 0.7, deep: 0.9, tints: true } : { opacity: 1, deep: 1, tints: false }, r.scheduler);
    this.doorsLayer = new DoorsLayer(this.slots.doors, this.dm, r.scheduler);
    this.tools = new ToolsLayer(this.slots.tools, this.dm);
    this.dmLayers = this.dm
      ? new DmLayers(this.slots.dmLayers, files, opts.log, invalidate, {
        upload: (t) => r.app.renderer.texture.initSource(t.source),
        onFailed: (id, error) => opts.onEvent?.({ type: 'layer-failed', id, error }),
      })
      : null;
    this.frame = this.dm ? new PlayersFrame(this.slots.dmFrame) : null;
    this.mask = this.dm ? null : new TableMask(this.slots.tableMask);
    if (opts.effects) {
      try {
        this.effects = opts.effects(this.effectSlots(), { profile: this.profile, scheduler: r.scheduler, log: opts.log, budgetBytes: effectsBudget(budget), ...(opts.now ? { now: opts.now } : {}) });
      } catch (e) {
        opts.log.error('render', 'Effects runtime failed to start', { error: String(e) });
      }
    }
    this.stopTicker = r.scheduler.onFrame(() => this.checkSize());
    this.stopResize = r.onResize(() => this.checkSize()); // a fitted camera refits before the next frame
    this.size = this.hostSize();
  }

  /** The slots handed to the effects runtime. */
  private effectSlots(): EffectSlots {
    return {
      ground: this.slots.fxGround,
      air: this.slots.fxAir,
      screen: this.slots.fxScreen,
      unitsPerSquare: SQUARE,
      filterTarget: this.slots.map,
      token: (id) => this.tokens.fxOf(id),
      viewport: () => this.size,
      camera: () => this.cam,
      shake: (dx, dy) => {
        this.shakeX = dx;
        this.shakeY = dy;
        this.applyCamera();
      },
    };
  }

  /** The TV's px per inch (= per square on the table) for the map density. */
  private tableGridPpi(): number {
    return this.tv?.grid.ppi ?? this.size.width / 34.5;
  }

  private hostSize(): Size {
    const s = this.r.app.screen;
    return { width: Math.max(1, s.width), height: Math.max(1, s.height) };
  }

  /** Before each frame: a resized host re-places the camera. */
  private checkSize(): void {
    const s = this.r.app.screen;
    if (s.width === this.size.width && s.height === this.size.height) return;
    this.size = this.hostSize();
    this.reframeDm();
    this.placeCamera('resize');
  }

  /** After the host or the panels changed: refit a still-fitted DM camera, else clamp it. */
  private reframeDm(): void {
    const lim = this.limits();
    if (!this.dm || !this.dmCam || !lim) return;
    if (this.fittedCam && this.dmCam === this.fittedCam) {
      this.dmCam = this.fittedCam = fitDmCamera(lim, this.dmCam.quarterTurns);
    } else {
      this.dmCam = clampDmCamera(this.dmCam, lim);
    }
  }

  /**
   * Draws a state.
   *
   * @param state - the replicated state (the prediction on the companion)
   */
  update(state: RootState): void {
    const prev = this.state;
    if (state === prev) return;
    this.state = state;
    const game = state.game;
    const map = game ? (game.maps[game.activeMapId] ?? null) : null;
    const newMap = (map?.info.id ?? null) !== (this.map?.info.id ?? null) || game?.id !== this.game?.id;
    const prevMap = this.map;
    const prevGame = this.game;
    this.game = game;
    this.map = map;
    let changed = newMap;

    this.mapLayer.set(map?.info ?? null);
    this.loadGeometry(map);
    if (map && game) {
      const { cols, rows } = map.info.grid;
      changed = this.grid.set(map.showGrid, cols, rows) || changed;
      changed = this.drawings.set(map.strokes, state.live.stroke) || changed;
      changed = this.tokens.set(map.tokens) || changed;
      changed = this.fog.set(map.fog, cols, rows, game.settings, newMap) || changed;
      changed = this.doorsLayer.set(this.geometry, map.info.drawDoors, map.doorsOpen, map.fog, cols, rows, newMap) || changed;
      changed = this.tools.set(map.disc, map.ruler, state.live.measure) || changed;
      if (this.dmLayers) changed = this.dmLayers.set(map.layers, map.info) || changed;
    } else {
      this.grid.set(false, 1, 1);
      this.drawings.set(null, null);
      this.tokens.set(null);
      this.fog.set(null, 1, 1, game?.settings ?? NO_SETTINGS, true);
      this.doorsLayer.set(null, false, [], null, 1, 1, true);
      this.tools.set(null, null, null);
      this.dmLayers?.set(null, null);
    }

    // The first fit reads the host's size now: the ResizeObserver reports a settling layout only
    // after the next layout, and a fit on the older size looked half as wide on a phone (qa#8).
    if (newMap && this.dm) this.r.syncSize();
    if (newMap && this.dm && map) this.dmCam = this.fittedCam = fitDmCamera(this.limits()!);
    if (newMap || state.table !== prev?.table || map?.view !== prevMap?.view) {
      this.placeCamera(newMap ? 'map' : 'state');
      changed = true;
    }

    if (this.effects) {
      const on = !!game?.settings.effects && !!map;
      const prevOn = !!prevGame?.settings.effects && !!prevMap;
      if (newMap || map?.effects !== prevMap?.effects || state.live.shots !== prev?.live.shots || map?.tokens !== prevMap?.tokens || on !== prevOn) {
        try {
          this.effects.update(on ? map!.effects : [], on ? state.live.shots : [], (this.opts.now ?? Date.now)());
        } catch (e) {
          this.opts.log.error('render', 'Effects update failed', { error: String(e) });
        }
      }
      if (newMap || game?.settings !== prevGame?.settings) this.syncMapLights();
    }
    if (changed) this.r.scheduler.invalidate();
  }

  /** Loads the map's walls-and-doors file when it changes (doors, walls, door hits). */
  private loadGeometry(map: MapPlay | null): void {
    const ref = map?.info.geometry ?? null;
    const key = ref ? ref.hash : '';
    if (key === this.geometryKey) return;
    this.geometryKey = key;
    this.geometry = null;
    if (!ref) return;
    const t0 = performance.now();
    this.files(ref)
      .then((b) => b.text())
      .then((text) => {
        if (this.geometryKey !== key) return;
        const parsed = check(MapGeometrySchema, JSON.parse(text));
        if (!parsed.ok) throw new Error(`not a map geometry file: ${parsed.error}`);
        const g = parsed.value;
        this.geometry = g;
        this.opts.log.info('render', 'Geometry loaded', { doors: g.doors.length, walls: g.walls.length, lights: g.lights.length, ms: Math.round(performance.now() - t0) });
        this.opts.onEvent?.({ type: 'geometry-loaded', doors: g.doors.length, walls: g.walls.length, lights: g.lights.length });
        const m = this.map;
        if (m) this.doorsLayer.set(this.geometry, m.info.drawDoors, m.doorsOpen, m.fog, m.info.grid.cols, m.info.grid.rows, true);
        this.onGeometry();
        this.r.scheduler.invalidate();
      })
      .catch((e: unknown) => {
        if (this.geometryKey !== key) return;
        this.opts.log.warn('render', 'Geometry failed', { error: String(e), file: `${ref.hash}.${ref.ext}` });
        this.opts.onEvent?.({ type: 'geometry-failed', error: String(e) });
      });
  }

  /** The geometry arrived: things drawn from it (map lights) follow. */
  private onGeometry(): void {
    this.syncMapLights();
  }

  /** Hands the map's lights to the effects while the game's switch is on (RD-120). */
  private syncMapLights(): void {
    const on = !!this.game && !!this.map && mapLightsOn(this.game.settings);
    try {
      this.effects?.setMapLights?.(on ? (this.geometry?.lights ?? null) : null);
    } catch (e) {
      this.opts.log.error('render', 'Map lights failed', { error: String(e) });
    }
  }

  /** The TV's view from the state (the host size stands in for a viewport not yet reported). */
  private tvViewOf(table: TableState, map: MapPlay): TvView | null {
    const t = table.viewport ? table : { ...table, viewport: this.size };
    return tvView(t, map);
  }

  /**
   * Works out the camera for the profile, puts it on the world and tells the listeners when it
   * changed.
   *
   * @param why - the cause, for the listeners
   */
  private placeCamera(why: CameraChange): void {
    const map = this.map;
    const state = this.state;
    this.tv = map && state ? this.tvViewOf(state.table, map) : null;
    const before = this.cam;
    this.cam = !map ? null : this.dm ? this.dmCam : (this.tv?.camera ?? null);
    const cam = this.cam;
    if (cam && !sameCamera(before, cam)) {
      for (const l of this.cameraListeners) {
        try {
          l(cam, why);
        } catch (e) {
          this.opts.log.error('render', 'Camera listener failed', { error: String(e) });
        }
      }
    }
    this.frameRect = this.dm && this.tv ? playersRect(this.tv) : null;
    if (this.mask && state) {
      const vp = state.table.viewport ?? this.size;
      const grid = this.tv?.grid ?? tableGrid(vp, state.table.widthInches, state.table.overscanPercent);
      const offset = { x: (this.size.width - vp.width) / 2, y: (this.size.height - vp.height) / 2 };
      this.mask.set(grid, state.table, !!map && map.view.mode === 'table', offset);
    }
    this.applyCamera();
  }

  private applyCamera(): void {
    const cam = this.cam;
    const w = this.r.world;
    if (!cam) {
      w.position.set(this.shakeX, this.shakeY);
      w.pivot.set(0, 0);
      w.rotation = 0;
      w.scale.set(1);
      this.r.scheduler.invalidate();
      return;
    }
    const t = worldTransform(cam, this.size);
    w.position.set(t.x + this.shakeX, t.y + this.shakeY);
    w.pivot.set(t.pivotX, t.pivotY);
    w.rotation = t.rotation;
    w.scale.set(t.scale);
    this.tokens.setCameraRotation(t.rotation);
    this.tools.setCameraRotation(t.rotation);
    this.frame?.set(this.frameRect, cam.zoom);
    const v = visibleSquares(cam, this.size);
    this.mapLayer.cull(v.x0, v.y0, v.x1, v.y1);
    this.r.scheduler.invalidate();
  }

  /** DM camera limits for the map on the table, or null. */
  private limits(): { cols: number; rows: number; view: Size; insets: Insets } | null {
    return this.map ? { cols: this.map.info.grid.cols, rows: this.map.info.grid.rows, view: this.size, insets: this.insets } : null;
  }

  /**
   * Listens to changes of the camera in use.
   *
   * @param cb - called with the new camera and the cause
   * @returns a function that stops listening
   */
  onCameraChange(cb: (c: Camera, why: CameraChange) => void): () => void {
    this.cameraListeners.add(cb);
    return () => this.cameraListeners.delete(cb);
  }

  /**
   * DM: host px covered by panels; a fitted camera refits into what is left.
   *
   * @param insets - covered px per side
   */
  setDmInsets(insets: Insets): void {
    const i = this.insets;
    if (i.top === insets.top && i.right === insets.right && i.bottom === insets.bottom && i.left === insets.left) return;
    this.insets = { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left };
    this.reframeDm();
    this.placeCamera('resize');
  }

  /** @returns the host size in CSS px */
  viewport(): Size {
    return this.size;
  }

  /** @returns the active map's geometry, or null until loaded */
  mapGeometry(): MapGeometry | null {
    return this.geometry;
  }

  /**
   * DM: the token with the selection ring.
   *
   * @param id - the token's id, or null
   */
  setSelectedToken(id: string | null): void {
    if (this.dm && this.tokens.setSelected(id)) this.r.scheduler.invalidate();
  }

  /**
   * Sets the DM's camera (clamped). Ignored on the TV.
   *
   * @param c - the camera
   */
  setDmCamera(c: Camera, why: CameraChange = 'set'): void {
    if (!this.dm) return;
    const lim = this.limits();
    const next = lim ? clampDmCamera(c, lim) : c;
    if (this.dmCam && sameCamera(this.dmCam, next)) return;
    this.dmCam = next;
    this.placeCamera(why);
  }

  /** @returns the DM's camera, or null */
  dmCamera(): Camera | null {
    return this.dmCam;
  }

  /**
   * Pans the DM's camera.
   *
   * @param dx - screen px
   * @param dy - screen px
   */
  panBy(dx: number, dy: number): void {
    if (this.dmCam) this.setDmCamera(panCamera(this.dmCam, dx, dy));
  }

  /**
   * Zooms the DM's camera around a point.
   *
   * @param factor - zoom multiplier
   * @param at - host point in CSS px
   */
  zoomAt(factor: number, at: Point): void {
    if (this.dmCam) this.setDmCamera(zoomCameraAt(this.dmCam, this.size, factor, at));
  }

  /** The DM's camera shows the whole map. */
  fitDmCamera(): void {
    this.r.syncSize();
    const lim = this.limits();
    if (!this.dm || !lim) return;
    this.dmCam = this.fittedCam = fitDmCamera(lim, this.dmCam?.quarterTurns ?? 0);
    this.placeCamera('fit');
  }

  /** @returns the camera in use, or null */
  camera(): Camera | null {
    return this.cam;
  }

  /**
   * @param p - host point, CSS px
   * @returns the point in squares, or null
   */
  screenToSquares(p: Point): Point | null {
    return this.cam ? screenToSquares(this.cam, this.size, p) : null;
  }

  /**
   * @param p - point in squares
   * @returns the host point in CSS px, or null
   */
  squaresToScreen(p: Point): Point | null {
    return this.cam ? squaresToScreen(this.cam, this.size, p) : null;
  }

  /**
   * Everything under a host point, highest priority first.
   *
   * @param p - host point, CSS px
   * @returns the hits
   */
  hits(p: Point): Hit[] {
    const q = this.screenToSquares(p);
    if (!q || !this.map || !this.cam) return [];
    return hitsAt({ map: this.map, doors: this.doorsLayer.doors, dm: this.dm, zoom: this.cam.zoom, frame: this.frameRect }, q);
  }

  /**
   * DM: the master eye of the DM layers (this device only).
   *
   * @param on - whether DM layers show
   */
  setDmLayersShown(on: boolean): void {
    if (this.slots.dmLayers.visible === on) return;
    this.slots.dmLayers.visible = on;
    this.r.scheduler.invalidate();
  }

  /**
   * DM: the walls debug view (this device only).
   *
   * @param on - whether walls show
   */
  setWallsShown(on: boolean): void {
    this.doorsLayer.setWalls(on);
    this.r.scheduler.invalidate();
  }

  /** Texture bytes by part. */
  textureBytes(): { map: number; fog: number; tokens: number; layers: number; effects: number; total: number } {
    const map = this.mapLayer.bytes;
    const fog = this.fog.bytes;
    const tokens = this.tokens.bytes;
    const layers = this.dmLayers?.bytes ?? 0;
    const effects = this.effects?.cost?.().textureBytes ?? 0;
    return { map, fog, tokens, layers, effects, total: map + fog + tokens + layers + effects };
  }

  /** Placed tokens on screen. */
  get tokenCount(): number {
    return this.tokens.count;
  }

  /** The map's decoded density. */
  get mapPxPerSquare(): number {
    return this.mapLayer.pxPerSquare;
  }

  /**
   * Frees what can be rebuilt: DM layers (reloaded on the next state), the map (reloaded at
   * three quarters of its density).
   *
   * @returns bytes freed (roughly)
   */
  dropTextures(): number {
    const before = this.textureBytes().total;
    this.dmLayers?.drop();
    if (this.map) this.dmLayers?.set(this.map.layers, this.map.info);
    this.mapLayer.drop(0.75);
    this.r.scheduler.invalidate();
    return before - this.textureBytes().total;
  }

  /** The memory pressure is gone: the map reloads at its full density. */
  restoreDensity(): void {
    this.mapLayer.restoreDensity();
  }

  /**
   * After a lost WebGL context came back: the map's bitmaps were closed after upload, so the
   * map and the DM layers load again (same density); buffers and canvases re-upload by themselves.
   */
  reloadTextures(): void {
    this.dmLayers?.drop();
    if (this.map) this.dmLayers?.set(this.map.layers, this.map.info);
    this.mapLayer.drop(1);
    this.r.scheduler.invalidate();
  }

  /** Frees everything. */
  destroy(): void {
    this.stopTicker();
    this.stopResize();
    this.cameraListeners.clear();
    this.effects?.destroy();
    this.mapLayer.destroy();
    this.grid.destroy();
    this.drawings.destroy();
    this.tokens.destroy();
    this.fog.destroy();
    this.doorsLayer.destroy();
    this.tools.destroy();
    this.dmLayers?.destroy();
    this.frame?.destroy();
    this.mask?.destroy();
  }
}

/**
 * What the players see, in squares: the one-inch window in table mode, else the visible area
 * of the TV mapped through its camera (a bounding box when turned).
 *
 * @param tv - the TV's view
 * @returns the rectangle in squares
 */
export function playersRect(tv: TvView): Rect {
  if (tv.layout) return windowSquares(tv.layout);
  const v = tv.grid.visible;
  const view = { width: tv.grid.width, height: tv.grid.height };
  const a = screenToSquares(tv.camera, view, { x: v.x, y: v.y });
  const b = screenToSquares(tv.camera, view, { x: v.x + v.width, y: v.y + v.height });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/**
 * Whether the game shows the map's own lights (`GameSettings.mapLights`, default off — RD-120).
 * Read defensively until the shared schema carries the field.
 *
 * @param settings - the game's settings
 * @returns true when on
 */
export function mapLightsOn(settings: Game['settings']): boolean {
  return (settings as Game['settings'] & { mapLights?: unknown }).mapLights === true;
}
