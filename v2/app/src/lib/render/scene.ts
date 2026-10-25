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
import { tvView, type Camera, type Door, type Game, type MapPlay, type Point, type RootState, type TableState, type TvView } from '@battlemap/shared';
import { clampDmCamera, fitDmCamera, panCamera, screenToSquares, squaresToScreen, SQUARE, visibleSquares, worldTransform, zoomCameraAt, type Size } from './camera.ts';
import { FogLayer } from './fog-layer.ts';
import { GridLayer } from './grid-layer.ts';
import { hitsAt, type Hit } from './hit.ts';
import { MapLayer } from './map-layer.ts';
import type { TableRenderer } from './pixi.ts';
import { DM_BUDGET, TV_BUDGET } from './tiles.ts';
import { TokensLayer } from './tokens-layer.ts';
import type { EffectSlots, EffectsRuntime, FileLoader, TableViewOptions, ViewProfile } from './types.ts';

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

/** The scene of one screen. */
export class TableScene {
  /** The layer containers. */
  readonly slots: SceneSlots;
  private readonly profile: ViewProfile;
  private readonly dm: boolean;
  private readonly mapLayer: MapLayer;
  private readonly grid: GridLayer;
  private readonly fog: FogLayer;
  private readonly tokens: TokensLayer;
  private effects: EffectsRuntime | null = null;

  private state: RootState | null = null;
  private map: MapPlay | null = null;
  private game: Game | null = null;
  private tv: TvView | null = null;
  private dmCam: Camera | null = null;
  private cam: Camera | null = null;
  private size: Size = { width: 1, height: 1 };
  private shakeX = 0;
  private shakeY = 0;
  private doors: readonly Door[] = [];
  /** DM walls debug view (drawn by the doors layer). */
  wallsShown = false;
  private readonly stopTicker: () => void;

  /**
   * @param r - the renderer (canvas, loop, world container)
   * @param opts - profile, logger, files, effects
   * @param files - the file loader to use
   */
  constructor(private readonly r: TableRenderer, private readonly opts: TableViewOptions, files: FileLoader) {
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
    this.mapLayer = new MapLayer(this.slots.map, {
      files,
      budget,
      wantedPxPerSquare: () => (this.dm ? Infinity : this.tableGridPpi()),
      preferTableCopy: !this.dm,
      mipmaps: this.dm,
      log: opts.log,
      onEvent: (e) => opts.onEvent?.(e),
      invalidate: () => r.scheduler.invalidate(),
      upload: (t) => r.app.renderer.texture.initSource(t.source),
    });
    this.grid = new GridLayer(this.slots.grid, this.dm ? 1 : 1.5);
    this.tokens = new TokensLayer(this.slots.tokens, this.dm);
    this.fog = new FogLayer(this.slots.fog, this.dm ? { opacity: 0.7, deep: 0.9, tints: true } : { opacity: 1, deep: 1, tints: false }, r.scheduler);
    if (opts.effects) {
      try {
        this.effects = opts.effects(this.effectSlots(), { profile: this.profile, scheduler: r.scheduler, log: opts.log });
      } catch (e) {
        opts.log.error('render', 'Effects runtime failed to start', { error: String(e) });
      }
    }
    this.stopTicker = r.scheduler.onFrame(() => this.checkSize());
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
    if (this.dmCam && this.map) this.dmCam = clampDmCamera(this.dmCam, this.limits()!);
    this.placeCamera();
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
    if (map && game) {
      const { cols, rows } = map.info.grid;
      changed = this.grid.set(map.showGrid, cols, rows) || changed;
      changed = this.fog.set(map.fog, cols, rows, game.settings, newMap) || changed;
      changed = this.tokens.set(map.tokens) || changed;
    } else {
      this.grid.set(false, 1, 1);
      this.fog.set(null, 1, 1, game?.settings ?? { fogStyle: 'standard', fogEdgeInset: 0, fogFade: true, effects: true }, true);
      this.tokens.set(null);
    }

    if (newMap && this.dm && map) this.dmCam = fitDmCamera(this.limits()!);
    if (newMap || state.table !== prev?.table || map?.view !== prevMap?.view) {
      this.placeCamera();
      changed = true;
    }

    if (this.effects) {
      const on = !!game?.settings.effects && !!map;
      const prevOn = !!prevGame?.settings.effects && !!prevMap;
      if (newMap || map?.effects !== prevMap?.effects || state.live.shots !== prev?.live.shots || map?.tokens !== prevMap?.tokens || on !== prevOn) {
        try {
          this.effects.update(on ? map!.effects : [], on ? state.live.shots : [], Date.now());
        } catch (e) {
          this.opts.log.error('render', 'Effects update failed', { error: String(e) });
        }
      }
    }
    if (changed) this.r.scheduler.invalidate();
  }

  /** The TV's view from the state (the host size stands in for a viewport not yet reported). */
  private tvViewOf(table: TableState, map: MapPlay): TvView | null {
    const t = table.viewport ? table : { ...table, viewport: this.size };
    return tvView(t, map);
  }

  /** Works out the camera for the profile and puts it on the world. */
  private placeCamera(): void {
    const map = this.map;
    const state = this.state;
    this.tv = map && state ? this.tvViewOf(state.table, map) : null;
    this.cam = !map ? null : this.dm ? this.dmCam : (this.tv?.camera ?? null);
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
    const v = visibleSquares(cam, this.size);
    this.mapLayer.cull(v.x0, v.y0, v.x1, v.y1);
    this.r.scheduler.invalidate();
  }

  /** DM camera limits for the map on the table, or null. */
  private limits(): { cols: number; rows: number; view: Size } | null {
    return this.map ? { cols: this.map.info.grid.cols, rows: this.map.info.grid.rows, view: this.size } : null;
  }

  /**
   * Sets the DM's camera (clamped). Ignored on the TV.
   *
   * @param c - the camera
   */
  setDmCamera(c: Camera): void {
    if (!this.dm) return;
    const lim = this.limits();
    this.dmCam = lim ? clampDmCamera(c, lim) : c;
    this.placeCamera();
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
    const lim = this.limits();
    if (this.dm && lim) this.setDmCamera(fitDmCamera(lim, this.dmCam?.quarterTurns ?? 0));
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
    return hitsAt({ map: this.map, doors: this.doors, dm: this.dm, zoom: this.cam.zoom, frame: null }, q);
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
    this.wallsShown = on;
    this.r.scheduler.invalidate();
  }

  /** Texture bytes by part. */
  textureBytes(): { map: number; fog: number; tokens: number; layers: number; effects: number; total: number } {
    const map = this.mapLayer.bytes;
    const fog = this.fog.bytes;
    const tokens = this.tokens.bytes;
    const layers = 0;
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
   * Frees what can be rebuilt; the map reloads at three quarters of its density.
   *
   * @returns bytes freed (roughly)
   */
  dropTextures(): number {
    const before = this.textureBytes().total;
    this.mapLayer.drop(0.75);
    this.r.scheduler.invalidate();
    return before - this.textureBytes().total;
  }

  /** Frees everything. */
  destroy(): void {
    this.stopTicker();
    this.effects?.destroy();
    this.mapLayer.destroy();
    this.grid.destroy();
    this.fog.destroy();
    this.tokens.destroy();
  }
}
