/**
 * The TV's windowed loader of a big map's tile set (`TileManifest`, cut by the server): a small
 * preview of the whole map lies underneath, and only the 512 px tiles under the screen, a ring
 * of half a screen around it (leaning a quarter screen into the pan direction) are fetched (through the device's
 * file cache), decoded at the TV's density and uploaded — one upload per frame, as the
 * whole-picture path does. Tiles that leave the window (grown by one tile) are freed two frames
 * later (qa#21). The box never decodes the whole picture. After the first window is complete,
 * the rest of the set can be fetched into the file cache in the background (offline play).
 *
 * @see ./tile-window.ts for the maths, ../../../../docs/render.md "Tile streaming for big maps"
 */
import { Container, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FileRef, RasterGrid, TileManifest } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SQUARE } from './camera.ts';
import {
  NO_PAN, panDirection, planWindow, tileGeometry, tileRect, tileSquares,
  type PanDirection, type SquareRect, type TileGeometry, type WindowPlan,
} from './tile-window.ts';
import type { FileLoader } from './types.ts';

/** A failed tile is tried this many times (over later views), then given up. */
const MAX_TRIES = 3;

/** Fetches and decodes at once. */
const IN_FLIGHT = 2;

/** One loaded tile. */
interface LoadedTile {
  sprite: Sprite;
  texture: Texture;
  bytes: number;
}

/** What the stream needs. */
export interface TileStreamOptions {
  /** The map (for logs). */
  mapId: string;
  /** The tile set. */
  manifest: TileManifest;
  /** The map's grid on its original picture. */
  grid: RasterGrid;
  /** Loads a file (the device's cache, fetched when missing). */
  files: FileLoader;
  /** px per square the textures get (the TV's density × the memory factor). */
  pxPerSquare: number;
  /** Uploads a texture now. */
  upload: (t: Texture) => void;
  /** Asks for a frame. */
  invalidate: () => void;
  /** The logger. */
  log: Logger;
  /** After the first window: fetch the whole set into the file cache (TV: offline play). */
  warmCache: boolean;
}

/** Counters for `stats()` and tests. */
export interface TileStreamStats {
  /** Tiles in the set. */
  total: number;
  /** Tiles on the GPU. */
  loaded: number;
  /** Fetching or decoding. */
  inFlight: number;
  /** Waiting. */
  queued: number;
  /** Tiles under the screen not on the GPU yet (0 = no blurry square). */
  visibleMissing: number;
  /** Tiles fetched and decoded since the map came. */
  decoded: number;
  /** Tiles freed since the map came. */
  freed: number;
  /** Texture bytes (tiles + preview). */
  bytes: number;
}

/** A big map's tiles around the TV's window. */
export class TileStream {
  /** Holds the preview and the tiles (the map layer adds it on the swap). */
  readonly container = new Container({ label: 'map-stream' });
  private readonly g: TileGeometry;
  /** Decoded px per tile-space px. */
  private readonly scale: number;
  private readonly tiles = new Map<number, LoadedTile>();
  private readonly inFlight = new Set<number>();
  private readonly tries = new Map<number, number>();
  private queue: number[] = [];
  private plan: WindowPlan | null = null;
  private lastView: SquareRect | null = null;
  private dir: PanDirection = NO_PAN;
  private preview: LoadedTile | null = null;
  private tileBytesHeld = 0;
  private decoded = 0;
  private freed = 0;
  private destroyed = false;
  private warmStarted = false;
  private gate: Promise<void> = Promise.resolve();
  private settledWaiters: { visibleOnly: boolean; resolve: () => void }[] = [];

  /** @param opts - manifest, grid, loader, density, upload, logger */
  constructor(private readonly opts: TileStreamOptions) {
    this.g = tileGeometry(opts.manifest, opts.grid);
    this.scale = Math.min(1, opts.pxPerSquare / this.g.pxPerSquare);
  }

  /** The textures' px per square. */
  get pxPerSquare(): number {
    return this.g.pxPerSquare * this.scale;
  }

  /** Texture bytes held. */
  get bytes(): number {
    return this.tileBytesHeld + (this.preview?.bytes ?? 0);
  }

  /** Tiles on the GPU. */
  get loadedCount(): number {
    return this.tiles.size;
  }

  /** Counters. */
  stats(): TileStreamStats {
    let visibleMissing = 0;
    for (const i of this.plan?.visible ?? []) if (!this.tiles.has(i) && !this.gaveUp(i)) visibleMissing++;
    return {
      total: this.opts.manifest.tiles.length,
      loaded: this.tiles.size,
      inFlight: this.inFlight.size,
      queued: this.queue.length,
      visibleMissing,
      decoded: this.decoded,
      freed: this.freed,
      bytes: this.bytes,
    };
  }

  /**
   * Loads the preview (it lies under every tile, so a tile not there yet reads blurry, never
   * black).
   *
   * @throws when the preview can't be fetched or decoded
   */
  async loadPreview(): Promise<void> {
    const m = this.opts.manifest;
    const blob = await this.opts.files(m.preview);
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
    try {
      if (this.destroyed) return;
      const texture = this.texture(bitmap, `map-preview ${this.opts.mapId}`, new Rectangle(0, 0, bitmap.width, bitmap.height));
      const sprite = new Sprite({ texture, label: 'map-preview' });
      sprite.position.set(this.g.originX * SQUARE, this.g.originY * SQUARE);
      sprite.width = m.width * this.g.sqPerPxX * SQUARE;
      sprite.height = m.height * this.g.sqPerPxY * SQUARE;
      this.opts.upload(texture);
      this.container.addChildAt(sprite, 0);
      this.preview = { sprite, texture, bytes: bitmap.width * bitmap.height * 4 };
    } finally {
      bitmap.close();
    }
  }

  /**
   * The screen moved (or the map came): plans the window, frees tiles that left it, queues the
   * missing ones (visible first) and starts loading.
   *
   * @param view - the screen in squares
   */
  setView(view: SquareRect): void {
    if (this.destroyed) return;
    this.dir = panDirection(this.lastView, view, this.dir);
    this.lastView = view;
    const plan = planWindow(this.opts.manifest, this.g, view, this.dir);
    this.plan = plan;
    const leaving: LoadedTile[] = [];
    for (const [i, t] of this.tiles) {
      if (plan.keep.has(i)) continue;
      leaving.push(t);
      this.tiles.delete(i);
      this.tileBytesHeld -= t.bytes;
    }
    if (leaving.length) {
      this.freed += leaving.length;
      retire(leaving);
      this.opts.invalidate();
    }
    this.queue = plan.load.filter((i) => !this.tiles.has(i) && !this.inFlight.has(i) && !this.gaveUp(i));
    this.opts.log.debug('render', 'Map window', { mapId: this.opts.mapId, view: rounded(view), dir: this.dir, queued: this.queue.length, freed: leaving.length, loaded: this.tiles.size });
    this.pump();
    this.checkSettled();
  }

  /**
   * Resolves when nothing is queued or loading (the window is complete or given up on), or with
   * `visibleOnly` as soon as every tile under the screen is on the GPU.
   *
   * @param visibleOnly - don't wait for the ring and the lookahead
   * @returns the promise
   */
  settled(visibleOnly = false): Promise<void> {
    if (this.isSettled(visibleOnly)) return Promise.resolve();
    return new Promise((resolve) => this.settledWaiters.push({ visibleOnly, resolve }));
  }

  /** Frees everything (two frames later, unless `now`). */
  destroy(now = false): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const all = [...this.tiles.values(), ...(this.preview ? [this.preview] : [])];
    this.tiles.clear();
    this.preview = null;
    this.tileBytesHeld = 0;
    this.queue = [];
    if (now) freeTiles(all);
    else retire(all);
    this.container.removeFromParent();
    for (const w of this.settledWaiters.splice(0)) w.resolve();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.container.destroyed) this.container.destroy({ children: false });
    }));
  }

  private gaveUp(i: number): boolean {
    return (this.tries.get(i) ?? 0) >= MAX_TRIES;
  }

  private isSettled(visibleOnly = false): boolean {
    if (visibleOnly && this.plan && this.stats().visibleMissing === 0) return true;
    return this.queue.length === 0 && this.inFlight.size === 0;
  }

  private checkSettled(): void {
    const still = this.settledWaiters.filter((w) => !this.isSettled(w.visibleOnly));
    for (const w of this.settledWaiters) if (!still.includes(w)) w.resolve();
    this.settledWaiters = still;
    if (!this.isSettled()) return;
    if (this.opts.warmCache && !this.warmStarted && this.plan) {
      this.warmStarted = true;
      void this.warm();
    }
  }

  private pump(): void {
    while (!this.destroyed && this.inFlight.size < IN_FLIGHT && this.queue.length > 0) {
      const i = this.queue.shift()!;
      if (this.tiles.has(i) || this.inFlight.has(i)) continue;
      this.inFlight.add(i);
      void this.loadTile(i).finally(() => {
        this.inFlight.delete(i);
        this.pump();
        this.checkSettled();
      });
    }
  }

  private async loadTile(i: number): Promise<void> {
    const m = this.opts.manifest;
    const r = tileRect(m, i % m.cols, Math.floor(i / m.cols));
    const ref = m.tiles[i]!;
    let bitmap: ImageBitmap | null = null;
    try {
      const blob = await this.opts.files(ref);
      if (!this.wanted(i)) return;
      const resize = this.scale < 0.999;
      bitmap = await createImageBitmap(blob, resize
        ? { resizeWidth: Math.max(1, Math.round(r.fw * this.scale)), resizeHeight: Math.max(1, Math.round(r.fh * this.scale)), resizeQuality: 'medium', premultiplyAlpha: 'premultiply' }
        : { premultiplyAlpha: 'premultiply' });
      if (!this.wanted(i)) return;
      // one upload per frame, like the whole-picture path
      const turn = this.gate.then(nextFrame);
      this.gate = turn;
      await turn;
      if (!this.wanted(i)) return;
      const kx = bitmap.width / r.fw;
      const ky = bitmap.height / r.fh;
      const frame = new Rectangle((r.cx - r.fx) * kx, (r.cy - r.fy) * ky, r.cw * kx, r.ch * ky);
      const texture = this.texture(bitmap, `map-tile ${this.opts.mapId} #${i}`, frame);
      const sprite = new Sprite({ texture, label: 'map-tile' });
      const s = tileSquares(this.g, r);
      sprite.position.set(s.x0 * SQUARE, s.y0 * SQUARE);
      sprite.width = (s.x1 - s.x0) * SQUARE;
      sprite.height = (s.y1 - s.y0) * SQUARE;
      this.opts.upload(texture);
      this.container.addChild(sprite);
      const bytes = bitmap.width * bitmap.height * 4;
      this.tiles.set(i, { sprite, texture, bytes });
      this.tileBytesHeld += bytes;
      this.decoded++;
      this.opts.invalidate();
    } catch (e) {
      const n = (this.tries.get(i) ?? 0) + 1;
      this.tries.set(i, n);
      this.opts.log.warn('render', 'Map tile failed', { mapId: this.opts.mapId, tile: i, file: `${ref.hash}.${ref.ext}`, tries: n, error: String(e) });
    } finally {
      bitmap?.close();
    }
  }

  /** Whether a tile is still worth having (the stream lives and the window keeps it). */
  private wanted(i: number): boolean {
    return !this.destroyed && !!this.plan?.keep.has(i);
  }

  private texture(bitmap: ImageBitmap, label: string, frame: Rectangle): Texture {
    const source = new ImageSource({ resource: bitmap, alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: false, scaleMode: 'linear', label });
    return new Texture({ source, frame });
  }

  /** Fetches the rest of the set into the file cache, one file at a time, behind the window. */
  private async warm(): Promise<void> {
    const t0 = performance.now();
    const refs: FileRef[] = this.opts.manifest.tiles;
    let fetched = 0;
    for (let i = 0; i < refs.length; i++) {
      if (this.destroyed) return;
      while (!this.isSettled() && !this.destroyed) await new Promise((r) => setTimeout(r, 250));
      if (this.tiles.has(i)) continue;
      try {
        await this.opts.files(refs[i]!);
        fetched++;
      } catch (e) {
        this.opts.log.warn('render', 'Map tile not cached', { mapId: this.opts.mapId, tile: i, error: String(e) });
      }
    }
    this.opts.log.info('render', 'Map tiles cached for offline play', { mapId: this.opts.mapId, tiles: refs.length, fetched, ms: Math.round(performance.now() - t0) });
  }
}

/** A view rounded for logs. */
function rounded(v: SquareRect): number[] {
  return [v.x0, v.y0, v.x1, v.y1].map((n) => Math.round(n * 10) / 10);
}

/** Destroys sprites and textures (GPU memory back). */
function freeTiles(tiles: readonly LoadedTile[]): void {
  for (const t of tiles) {
    if (t.sprite.destroyed) continue;
    t.sprite.destroy();
    t.texture.destroy(true);
  }
}

/** Takes tiles off at once and frees them after two frames (the next render no longer binds them). */
function retire(tiles: readonly LoadedTile[]): void {
  if (tiles.length === 0) return;
  for (const t of tiles) t.sprite.removeFromParent();
  requestAnimationFrame(() => requestAnimationFrame(() => freeTiles(tiles)));
}

/** Resolves on the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
