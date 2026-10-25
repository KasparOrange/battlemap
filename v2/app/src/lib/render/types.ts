/**
 * Types of the renderer's seam (`index.ts`) and of the effects slots — the contract other
 * packages code against. No Pixi values here beyond types.
 *
 * @see ../../../../docs/architecture.md "work packages" (seams), "effects runtime"
 */
import type { Container } from 'pixi.js';
import type { Camera, FileRef, OneShot, PlacedEffect, Point } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { Size } from './camera.ts';
import type { Hit } from './hit.ts';
import type { MapLoadEvent } from './map-layer.ts';
import type { RenderScheduler } from './scheduler.ts';

/** `players`: the TV (the table). `dm`: the companion (the DM's view). */
export type ViewProfile = 'players' | 'dm';

/** Fetches a file by ref (pass the storage cache's `files.get`). */
export type FileLoader = (ref: FileRef) => Promise<Blob>;

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
  /** Stops everything, frees textures. */
  destroy(): void;
}

/** Creates the effects runtime — `createEffectsRuntime` from `$lib/effects`. */
export type EffectsFactory = (slots: EffectSlots, ctx: { profile: ViewProfile; scheduler: RenderScheduler; log: Logger }) => EffectsRuntime;

/** Things the view reports (show a notice, a spinner). */
export type TableViewEvent = MapLoadEvent | { type: 'renderer-failed'; error: string } | { type: 'textures-dropped'; level: number; freedMb: number };

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
  /** The effects runtime's factory; without it the slots stay empty. */
  effects?: EffectsFactory;
  /** Gets load progress and failures (map loading, shown, failed). */
  onEvent?: (e: TableViewEvent) => void;
  /** Whether to drop textures on the shell's `memory` event (default true). */
  listenToShell?: boolean;
}

/** Numbers for the bench and diagnostics. */
export interface RenderStats {
  /** Frames drawn since start. */
  frames: number;
  /** CPU ms of the last frame (tickers + render). */
  lastFrameMs: number;
  /** Texture bytes the renderer holds, by part. */
  textures: { map: number; fog: number; tokens: number; layers: number; effects: number; total: number };
  /** Placed tokens on screen. */
  tokens: number;
  /** The map's decoded density, px per square. */
  mapPxPerSquare: number;
  /** The GPU (unmasked renderer string) when the browser tells. */
  gpu: string | null;
}

/** The table view: one per screen. */
export interface TableView {
  /** Resolves when the renderer is running (rejects when WebGL can't start). */
  readonly ready: Promise<void>;
  /** Draws a state (cheap when little changed — reference checks per part). */
  update(state: import('@battlemap/shared').RootState): void;
  /** Sets the DM's camera (clamped); `dm` profile only. */
  setDmCamera(c: Camera): void;
  /** The DM's camera now (null before a map). */
  dmCamera(): Camera | null;
  /** Pans the DM's camera by a finger movement in screen px. */
  panBy(dx: number, dy: number): void;
  /** Zooms the DM's camera by a factor around a screen point. */
  zoomAt(factor: number, at: Point): void;
  /** The DM's camera shows the whole map again. */
  fitDmCamera(): void;
  /** The camera in use (TV's from the state, or the DM's). */
  camera(): Camera | null;
  /** A host point (CSS px) → squares; null without a camera. */
  screenToSquares(p: Point): Point | null;
  /** Squares → a host point (CSS px); null without a camera. */
  squaresToScreen(p: Point): Point | null;
  /** The highest-priority thing under a host point, or null. */
  hitTest(p: Point): Hit | null;
  /** Everything under a host point, highest priority first. */
  hits(p: Point): Hit[];
  /** DM: the master eye of the DM layers (device-local, default on). */
  setDmLayersShown(on: boolean): void;
  /** DM: the walls debug view (device-local, default off). */
  setWallsShown(on: boolean): void;
  /** Frees every texture it can rebuild (Android is low on memory); the map reloads leaner. */
  dropTextures(): void;
  /** Numbers for the bench. */
  stats(): RenderStats;
  /** The render loop (bench, effects). Null until ready. */
  readonly scheduler: RenderScheduler | null;
  /** Stops and frees everything. */
  destroy(): void;
}
