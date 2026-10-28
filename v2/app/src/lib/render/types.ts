/**
 * Types of the renderer's seam (`index.ts`) and of the effects slots — the contract other
 * packages code against. No Pixi values here beyond types.
 *
 * @see ../../../../docs/architecture.md "work packages" (seams), "effects runtime"
 */
import type { Container } from 'pixi.js';
import type { Camera, FileRef, Light, MapGeometry, OneShot, PlacedEffect, Point, TileManifest } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { Insets, Size } from './camera.ts';
import type { Hit } from './hit.ts';
import type { MapLoadEvent } from './map-layer.ts';
import type { RenderScheduler } from './scheduler.ts';
import type { TileStreamStats } from './tile-stream.ts';

/** `players`: the TV (the table). `dm`: the companion (the DM's view). */
export type ViewProfile = 'players' | 'dm';

/** Fetches a file by ref (pass the storage cache's `files.get`). */
export type FileLoader = (ref: FileRef) => Promise<Blob>;

/**
 * Gets the tile set of a big map picture (`GET /api/tiles/…`, kept on the device for offline
 * play), or null when there is none — the map is then decoded whole.
 */
export type TileSetLoader = (picture: FileRef, level: number) => Promise<TileManifest | null>;

/**
 * The layer slots the effects runtime draws into. World slots are in world units —
 * `unitsPerSquare` units per map square, (0, 0) the map's top-left corner; screen slots in CSS px.
 */
export interface EffectSlots {
  /** Effects on the ground, under grid, tokens and fog (torch glow, water shimmer). */
  readonly ground: Container;
  /** Effects above the fog (weather, a burst the players must see). */
  readonly air: Container;
  /** Screen space, above everything (flash, fade to black, vignette). */
  readonly screen: Container;
  /** World units per square in `ground`, `air` and token containers (`SQUARE`). */
  readonly unitsPerSquare: number;
  /** The map picture's container — where weather shaders may sit as a filter (costly on the box). */
  readonly filterTarget: Container | null;
  /**
   * The effects container of a token on screen: origin at the token's centre, moves and hides
   * with it. Null when the token is not shown (not placed, hidden on the TV, another map).
   */
  token(id: string): Container | null;
  /** The host size in CSS px (for screen effects). */
  viewport(): Size;
  /** The camera now (centre in squares, px per square, quarter turns), null without a map. */
  camera(): Camera | null;
  /** Offsets the whole world by screen px (screen shake); (0, 0) puts it back. */
  shake(dx: number, dy: number): void;
}

/** What the effects runtime hands back. */
export interface EffectsRuntime {
  /**
   * Brings the running effects in line with the state (an empty list when effects are off).
   *
   * @param effects - the active map's lasting effects
   * @param shots - the recent one-shots
   * @param now - epoch ms (skips shots already over)
   */
  update(effects: readonly PlacedEffect[], shots: readonly OneShot[], now: number): void;
  /** What the running effects cost (for the bench). */
  cost?(): { drawCalls?: number; textureBytes: number; instances?: number };
  /** The map's own light pools (RD-120): the geometry's lights while the game's switch is on, else null. */
  setMapLights?(lights: readonly Light[] | null): void;
  /** What runs; the renderer reads only the screen's effects quality (S4: wisps reveal at `full`). */
  stats?(): { quality: 'off' | 'low' | 'full' };
  /** Stops everything, frees textures. */
  destroy(): void;
}

/** Creates the effects runtime — `createEffectsRuntime` from `$lib/effects`. */
export type EffectsFactory = (
  slots: EffectSlots,
  ctx: {
    profile: ViewProfile;
    scheduler: RenderScheduler;
    log: Logger;
    /** Texture bytes the effects may hold: the screen's "everything else" budget minus fog, tokens and text (rv#17). */
    budgetBytes: number;
    /** The clock shots are aged by (the view's `now` option), epoch ms. */
    now?: () => number;
  },
) => EffectsRuntime;

/** Things the view reports (show a notice, a spinner). */
export type TableViewEvent =
  | MapLoadEvent
  | { type: 'renderer-failed'; error: string }
  | { type: 'textures-dropped'; level: number; freedMb: number }
  | { type: 'geometry-loaded'; doors: number; walls: number; lights: number }
  | { type: 'geometry-failed'; error: string }
  | { type: 'layer-failed'; id: string; error: string };

/**
 * Why the camera in use changed: `map` a new map was fitted, `fit` `fitDmCamera()`, `set` a
 * caller's `setDmCamera`/`panBy`/`zoomAt`, `resize` the host or the panels changed, `state` the
 * TV's camera followed the state.
 */
export type CameraChange = 'map' | 'fit' | 'set' | 'resize' | 'state';

/** Options of `createTableView`. */
export interface TableViewOptions {
  /** Which screen this is. */
  profile: ViewProfile;
  /** The logger (area `render`). */
  log: Logger;
  /** Fetches files (default: `GET <serverUrl>/files/<hash>.<ext>`). */
  files?: FileLoader;
  /** The server's base URL for the default file loader (default: the page's origin). */
  serverUrl?: string;
  /**
   * TV: gets tile sets for big maps (default: `GET <serverUrl>/api/tiles/…`, no device copy).
   * Ignored on the DM profile, which decodes every map whole.
   */
  tileSets?: TileSetLoader;
  /** TV: after a streamed map's window is loaded, fetch its whole tile set into the file cache. */
  warmTileCache?: boolean;
  /** The effects runtime's factory; without it the slots stay empty. */
  effects?: EffectsFactory;
  /** Gets load progress and failures (map loading, shown, failed). */
  onEvent?: (e: TableViewEvent) => void;
  /** Whether to drop textures on the shell's `memory` event (default true). */
  listenToShell?: boolean;
  /**
   * The clock one-shots are aged by, epoch ms — pass `Connection.serverNow()` so a shot stamped
   * by the companion with the server's clock plays once and in time on the TV (rv#16: device
   * clocks differ). Default `Date.now`.
   */
  now?: () => number;
}

/** Numbers for the bench and diagnostics. */
export interface RenderStats {
  /** Frames drawn since start. */
  frames: number;
  /** CPU ms of the last frame (tickers + render). */
  lastFrameMs: number;
  /** Texture bytes the renderer holds, by part. */
  textures: { map: number; fog: number; tokens: number; layers: number; effects: number; total: number };
  /** The screen's texture budget: map, and everything else (fog, tokens, effects). */
  budget: { map: number; other: number };
  /** Placed tokens on screen. */
  tokens: number;
  /** The map's decoded density, px per square. */
  mapPxPerSquare: number;
  /** A streamed map's tiles (TV, big maps), else null. */
  mapStream: TileStreamStats | null;
  /** The GPU (unmasked renderer string) when the browser tells. */
  gpu: string | null;
}

/**
 * The table view: one per screen.
 *
 * **Camera — this view is its one owner** (rv#8). On the DM profile it fits every new map by
 * itself (into the host minus `setDmInsets`), clamps every camera it is given with
 * `clampDmCamera`, refits on a resize while the camera is still the fitted one, and tells
 * `onCameraChange` listeners after every change. The companion keeps no camera of its own: a
 * gesture reads `dmCamera()`, computes the next one with the pure helpers of `render/camera.ts`
 * (`panCamera`, `zoomCameraAt`, `pinchCamera`) and hands it to `setDmCamera` — or calls
 * `panBy`/`zoomAt` directly. On the TV the camera is the state's (`tvView`); the DM setters do
 * nothing there.
 *
 * **Hit testing — `hits`/`hitTest` are the one** (`render/hit.ts`, rv#32): host CSS px in,
 * highest priority first, with the doors of the geometry file this view loaded.
 */
export interface TableView {
  /** Resolves when the renderer is running (rejects when WebGL can't start). */
  readonly ready: Promise<void>;
  /** Draws a state (cheap when little changed — reference checks per part). */
  update(state: import('@battlemap/shared').RootState): void;
  /** Sets the DM's camera (clamped); `dm` profile only. Kept until ready. */
  setDmCamera(c: Camera): void;
  /** The DM's camera now (null before a map). */
  dmCamera(): Camera | null;
  /** Pans the DM's camera by a finger movement in screen px. */
  panBy(dx: number, dy: number): void;
  /** Zooms the DM's camera by a factor around a host point (CSS px). */
  zoomAt(factor: number, at: Point): void;
  /** The DM's camera shows the whole map again (in the free part of the host). */
  fitDmCamera(): void;
  /**
   * Host px covered by the companion's panels; fitting uses what is left. Refits when the camera
   * is still the fitted one, else only clamps.
   */
  setDmInsets(insets: Insets): void;
  /** The camera in use (TV's from the state, or the DM's). */
  camera(): Camera | null;
  /**
   * Listens to changes of the camera in use (after clamping). Called synchronously.
   *
   * @returns a function that stops listening
   */
  onCameraChange(cb: (camera: Camera, why: CameraChange) => void): () => void;
  /** The host size in CSS px (what screen points are relative to). */
  viewport(): Size;
  /** A host point (CSS px) → squares; null without a camera. */
  screenToSquares(p: Point): Point | null;
  /** Squares → a host point (CSS px); null without a camera. */
  squaresToScreen(p: Point): Point | null;
  /** The highest-priority thing under a host point (CSS px), or null. */
  hitTest(p: Point): Hit | null;
  /** Everything under a host point (CSS px), highest priority first. */
  hits(p: Point): Hit[];
  /** The active map's walls, doors and lights (from its geometry file), null until loaded. */
  geometry(): MapGeometry | null;
  /** DM: the token drawn with a selection ring (device-local), null for none. */
  setSelectedToken(id: string | null): void;
  /** DM: the master eye of the DM layers (device-local, default on). */
  setDmLayersShown(on: boolean): void;
  /** DM: the walls debug view (device-local, default off). */
  setWallsShown(on: boolean): void;
  /**
   * Frees every texture it can rebuild (Android is low on memory); the map reloads leaner and
   * gets its full density back with the next map or once the pressure is gone.
   *
   * @param level - the shell's trim level, for the log (0 when asked by hand)
   */
  dropTextures(level?: number): void;
  /** Numbers for the bench. */
  stats(): RenderStats;
  /** The render loop (bench, effects). Null until ready. */
  readonly scheduler: RenderScheduler | null;
  /** Stops and frees everything. */
  destroy(): void;
}
