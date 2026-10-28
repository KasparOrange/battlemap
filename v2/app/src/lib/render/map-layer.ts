/**
 * The map picture: loaded by content hash, decoded once at the density the screen needs
 * (`planDecode` — the TV's ppi within its 128 MB budget, never below 32 px per square), cropped
 * to the grid's rectangle on the way, cut into tiles ≤ 2048 px (TV) / 4096 px (DM) with a
 * one-pixel apron, uploaded one tile per frame, and laid onto the squares. A #0B0B0B rectangle
 * sits under the picture over the whole map, so partial edge squares read dark. A load that
 * finishes after a newer one discards itself; the old map's textures are destroyed when the
 * new one shows.
 *
 * Big maps on the TV (over `budget.streamAboveBytes` at its density) are never decoded whole:
 * with a `tileSets` loader they stream the server's 512 px tile set around the screen
 * (`tile-stream.ts`); without a tile set they fall back to the path above.
 */
import { Container, ImageSource, Rectangle, Sprite, Texture, Graphics } from 'pixi.js';
import type { MapInfo } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SQUARE } from './camera.ts';
import { IMAGE_HEAD_BYTES, imageSize } from './image-size.ts';
import { planDecode, planTiles, type DecodePlan, type TextureBudget } from './tiles.ts';
import { TileStream, type TileStreamStats } from './tile-stream.ts';
import { shouldStream, tileLevel, type SquareRect } from './tile-window.ts';
import type { FileLoader, TileSetLoader } from './types.ts';

/** What happened to a map load (for notices and logs). */
export type MapLoadEvent =
  | { type: 'map-loading'; mapId: string; name: string }
  | { type: 'map-shown'; mapId: string; ms: number; pxPerSquare: number; tiles: number; bytes: number; fetchMs?: number; decodeMs?: number; uploadMs?: number }
  | { type: 'map-failed'; mapId: string; error: string };

/** One shown tile. */
interface Tile {
  sprite: Sprite;
  texture: Texture;
  /** Its rectangle in squares (for culling). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The map picture layer. */
export class MapLayer {
  /** The container (added to the scene's map slot). */
  readonly container = new Container({ label: 'map' });
  private readonly back = new Graphics({ label: 'map-back' });
  private tiles: Tile[] = [];
  private key = '';
  private loadSeq = 0;
  private bytesHeld = 0;
  private plan: DecodePlan | null = null;
  /** The density factor (lowered after a memory warning). */
  private densityFactor = 1;
  private current: MapInfo | null = null;
  /** A big map's tiles around the screen (instead of `tiles`), once shown. */
  private stream: TileStream | null = null;
  /** The stream of a load still waiting for its first window. */
  private pendingStream: TileStream | null = null;
  /** The screen in squares (the last `cull`). */
  private view: SquareRect | null = null;

  /**
   * @param parent - the scene's map slot
   * @param opts - how to load, what density and budget, where to report
   */
  constructor(
    parent: Container,
    private readonly opts: {
      files: FileLoader;
      budget: TextureBudget;
      /** px per square the screen wants (TV: ppi; DM: picture's own). */
      wantedPxPerSquare: () => number;
      /** Use the table copy when there is one (TV). */
      preferTableCopy: boolean;
      /** Mipmaps (the DM zooms far out; the TV draws near 1:1). */
      mipmaps: boolean;
      log: Logger;
      onEvent: (e: MapLoadEvent) => void;
      /** Asks for a frame (a tile became visible). */
      invalidate: () => void;
      /** Uploads a texture now (spreads uploads over frames). */
      upload: (t: Texture) => void;
      /** TV: tile sets of big maps (`budget.streamAboveBytes`); without it every map is decoded whole. */
      tileSets?: TileSetLoader;
      /** TV: fetch a streamed map's whole tile set into the file cache once its window is loaded. */
      warmTileCache?: boolean;
    },
  ) {
    this.container.addChild(this.back);
    parent.addChild(this.container);
  }

  /** Texture bytes of the shown map. */
  get bytes(): number {
    return this.stream ? this.stream.bytes : this.bytesHeld;
  }

  /** The decoded density, px per square (0 before a map shows). */
  get pxPerSquare(): number {
    return this.stream ? this.stream.pxPerSquare : (this.plan?.pxPerSquare ?? 0);
  }

  /** A streamed map's tile counters, or null when the map was decoded whole. */
  streamStats(): TileStreamStats | null {
    return this.stream?.stats() ?? null;
  }

  /**
   * Shows a map (loads it when it is another picture or grid), or nothing for null.
   *
   * @param info - the map, or null
   */
  set(info: MapInfo | null): void {
    // rv#3: a lowered density belongs to the map that was on when memory ran low
    if (info && this.current && info.id !== this.current.id) this.densityFactor = 1;
    const key = info ? keyOf(info, this.opts.preferTableCopy) + '@' + this.densityFactor : '';
    if (key === this.key) return;
    this.key = key;
    this.current = info;
    if (!info) {
      this.clear();
      this.opts.invalidate();
      return;
    }
    this.back.clear().rect(0, 0, info.grid.cols * SQUARE, info.grid.rows * SQUARE).fill(0x0b0b0b);
    void this.load(info, ++this.loadSeq);
  }

  /**
   * Hides tiles outside a rectangle of squares (fewer textures bound, cheaper batches).
   *
   * @param x0 - left in squares
   * @param y0 - top
   * @param x1 - right
   * @param y1 - bottom
   */
  cull(x0: number, y0: number, x1: number, y1: number): void {
    for (const t of this.tiles) t.sprite.visible = t.x1 >= x0 && t.x0 <= x1 && t.y1 >= y0 && t.y0 <= y1;
    const v = this.view;
    if (v && v.x0 === x0 && v.y0 === y0 && v.x1 === x1 && v.y1 === y1) return; // a shake, not a move
    this.view = { x0, y0, x1, y1 };
    this.stream?.setView(this.view);
    this.pendingStream?.setView(this.view);
  }

  /**
   * Frees the textures (Android asked for memory) and reloads the map at a lower density.
   *
   * @param factor - multiply the density by this (e.g. 0.75)
   */
  drop(factor: number): void {
    this.densityFactor = Math.max(0.25, this.densityFactor * factor);
    const info = this.current;
    this.clear();
    this.key = '';
    if (info) this.set(info);
  }

  /** Whether the map is held at less than its full density (after a memory drop). */
  get lowered(): boolean {
    return this.densityFactor < 1;
  }

  /** The memory pressure is gone: the map reloads at its full density (no-op when it has it). */
  restoreDensity(): void {
    if (this.densityFactor >= 1) return;
    this.densityFactor = 1;
    const info = this.current;
    this.key = '';
    if (info) this.set(info);
  }

  private async load(info: MapInfo, seq: number): Promise<void> {
    const t0 = performance.now();
    const { log, budget } = this.opts;
    const ref = this.opts.preferTableCopy && info.tableCopy ? info.tableCopy : info.picture;
    this.opts.onEvent({ type: 'map-loading', mapId: info.id, name: info.name });
    const wanted = this.opts.wantedPxPerSquare() * this.densityFactor;
    if (this.opts.tileSets && budget.streamAboveBytes !== undefined && shouldStream(info.grid, wanted, budget.streamAboveBytes)) {
      if (await this.loadStreamed(info, seq, wanted, t0)) return;
      if (seq !== this.loadSeq) return;
    }
    log.info('render', 'Map loading', { mapId: info.id, file: `${ref.hash}.${ref.ext}`, bytes: ref.bytes, tableCopy: ref !== info.picture });
    const made: ImageBitmap[] = [];
    const built: Tile[] = [];
    let handedOver = false;
    try {
      const blob = await this.opts.files(ref);
      if (seq !== this.loadSeq) return;
      const tFetch = performance.now();
      let size = imageSize(new Uint8Array(await blob.slice(0, IMAGE_HEAD_BYTES).arrayBuffer()));
      if (!size) {
        const probe = await createImageBitmap(blob);
        size = { width: probe.width, height: probe.height };
        probe.close();
      }
      const plan = planDecode({
        grid: info.grid,
        sourceW: size.width,
        sourceH: size.height,
        wantedPxPerSquare: this.opts.wantedPxPerSquare() * this.densityFactor,
        // mipmaps add a third: plan the base level so the whole chain stays in the budget
        budgetBytes: (budget.mapBytes * this.densityFactor) / (this.opts.mipmaps ? 4 / 3 : 1),
        floorPxPerSquare: budget.floorPxPerSquare * Math.min(1, this.densityFactor * 1.34),
        maxTile: budget.maxTile,
      });
      if (!plan) throw new Error('The grid does not touch the picture');
      const whole = await createImageBitmap(blob, plan.sx, plan.sy, plan.sw, plan.sh, {
        resizeWidth: plan.dw,
        resizeHeight: plan.dh,
        resizeQuality: plan.dw < plan.sw * 0.6 ? 'medium' : 'high',
        premultiplyAlpha: 'premultiply',
      });
      made.push(whole);
      if (seq !== this.loadSeq) return;
      const tDecode = performance.now();
      const tilePlans = planTiles(plan.dw, plan.dh, budget.maxTile);
      const sx = plan.w / plan.dw; // squares per decoded px
      const sy = plan.h / plan.dh;
      for (const tp of tilePlans) {
        const bitmap = tilePlans.length === 1 ? whole : await createImageBitmap(whole, tp.tx, tp.ty, tp.tw, tp.th);
        if (bitmap !== whole) made.push(bitmap);
        if (seq !== this.loadSeq) return;
        const source = new ImageSource({
          resource: bitmap,
          alphaMode: 'premultiplied-alpha',
          autoGenerateMipmaps: this.opts.mipmaps,
          scaleMode: 'linear',
          label: `map-tile ${info.id}`,
        });
        const texture = new Texture({ source, frame: new Rectangle(tp.fx, tp.fy, tp.fw, tp.fh) });
        const sprite = new Sprite({ texture, label: 'map-tile' });
        built.push({ sprite, texture, x0: 0, y0: 0, x1: 0, y1: 0 });
        this.opts.upload(texture);
        await nextFrame();
        if (seq !== this.loadSeq) return;
        const x0 = plan.x + tp.x * sx;
        const y0 = plan.y + tp.y * sy;
        sprite.position.set(x0 * SQUARE, y0 * SQUARE);
        sprite.width = tp.fw * sx * SQUARE;
        sprite.height = tp.fh * sy * SQUARE;
        const tile = built[built.length - 1]!;
        tile.x0 = x0;
        tile.y0 = y0;
        tile.x1 = x0 + tp.fw * sx;
        tile.y1 = y0 + tp.fh * sy;
      }
      // Swap: the new tiles in, the old ones out.
      this.destroyTiles();
      for (const t of built) this.container.addChild(t.sprite);
      this.tiles = built;
      handedOver = true;
      this.plan = plan;
      this.bytesHeld = plan.bytes * (this.opts.mipmaps ? 4 / 3 : 1);
      this.opts.invalidate();
      const ms = Math.round(performance.now() - t0);
      const fetchMs = Math.round(tFetch - t0);
      const decodeMs = Math.round(tDecode - tFetch);
      const uploadMs = Math.round(performance.now() - tDecode);
      log.info('render', 'Map shown', {
        mapId: info.id,
        ms,
        fetchMs,
        decodeMs,
        uploadMs,
        sourceW: size.width,
        sourceH: size.height,
        decodedW: plan.dw,
        decodedH: plan.dh,
        pxPerSquare: Math.round(plan.pxPerSquare * 10) / 10,
        tiles: built.length,
        mb: Math.round(this.bytesHeld / 2 ** 20),
      });
      this.opts.onEvent({ type: 'map-shown', mapId: info.id, ms, pxPerSquare: plan.pxPerSquare, tiles: built.length, bytes: this.bytesHeld, fetchMs, decodeMs, uploadMs });
    } catch (e) {
      if (seq !== this.loadSeq) return;
      log.error('render', 'Map failed', { mapId: info.id, error: String(e) });
      this.opts.onEvent({ type: 'map-failed', mapId: info.id, error: String(e) });
    } finally {
      // rv#2: a superseded or failed load frees what it made. The bitmaps go either way — once
      // uploaded they live on the GPU (a lost context reloads the map).
      for (const b of made) b.close();
      if (!handedOver && built.length > 0) {
        log.info('render', 'Map load superseded — freeing its tiles', { mapId: info.id, tiles: built.length });
        retire(built);
      }
    }
  }

  /**
   * A big map: its tile set from the server (or the device), the preview, then the tiles under
   * the screen; shown once those are on the GPU, the ring and lookahead keep loading after.
   *
   * @param info - the map
   * @param seq - this load's number (a newer load wins)
   * @param wanted - px per square the textures get
   * @param t0 - when the load started
   * @returns true when this path handled the load (shown or superseded); false = decode the
   *   whole picture instead (no tile set, or it failed)
   */
  private async loadStreamed(info: MapInfo, seq: number, wanted: number, t0: number): Promise<boolean> {
    const { log } = this.opts;
    const level = tileLevel(info.grid.cellW, wanted);
    log.info('render', 'Map loading as tiles', { mapId: info.id, file: `${info.picture.hash}.${info.picture.ext}`, level, pxPerSquare: Math.round(wanted * 10) / 10 });
    let manifest;
    try {
      manifest = await this.opts.tileSets!(info.picture, level);
    } catch (e) {
      log.warn('render', 'Tile set unavailable — decoding the whole picture', { mapId: info.id, level, error: String(e) });
      return seq !== this.loadSeq;
    }
    if (seq !== this.loadSeq) return true;
    if (!manifest || manifest.source.hash !== info.picture.hash) {
      log.info('render', 'No tile set — decoding the whole picture', { mapId: info.id, level });
      return false;
    }
    const tFetch = performance.now();
    const stream = new TileStream({
      mapId: info.id,
      manifest,
      grid: info.grid,
      files: this.opts.files,
      pxPerSquare: wanted,
      upload: this.opts.upload,
      invalidate: this.opts.invalidate,
      log,
      warmCache: this.opts.warmTileCache ?? false,
    });
    this.pendingStream = stream;
    let ready = false;
    try {
      await stream.loadPreview();
      if (seq !== this.loadSeq) return true;
      stream.setView(this.view ?? startView(info));
      await stream.settled(true);
      if (seq !== this.loadSeq) return true;
      ready = true;
    } catch (e) {
      if (seq !== this.loadSeq) return true;
      log.warn('render', 'Tiles failed — decoding the whole picture', { mapId: info.id, error: String(e) });
      return false;
    } finally {
      if (this.pendingStream === stream) this.pendingStream = null;
      // rv#2: a superseded or failed stream frees what it made
      if (!ready) stream.destroy();
    }
    // Swap: the stream in, the old map out.
    this.destroyTiles();
    this.container.addChild(stream.container);
    this.stream = stream;
    this.plan = null;
    this.opts.invalidate();
    const s = stream.stats();
    const ms = Math.round(performance.now() - t0);
    const fetchMs = Math.round(tFetch - t0);
    log.info('render', 'Map shown as tiles', {
      mapId: info.id, ms, fetchMs, level, setTiles: s.total, tiles: s.loaded, queued: s.queued + s.inFlight,
      pxPerSquare: Math.round(stream.pxPerSquare * 10) / 10, mb: Math.round(s.bytes / 2 ** 20),
    });
    this.opts.onEvent({ type: 'map-shown', mapId: info.id, ms, pxPerSquare: stream.pxPerSquare, tiles: s.loaded, bytes: s.bytes, fetchMs });
    return true;
  }

  /**
   * Takes the tiles off the screen and frees them once a frame without them was drawn (qa#21:
   * destroying a texture source still bound in the batcher's bind group warns and may draw
   * garbage for a frame).
   *
   * @param now - free at once (the whole view is going away)
   */
  private destroyTiles(now = false): void {
    for (const t of this.tiles) t.sprite.removeFromParent();
    if (now) freeTiles(this.tiles);
    else retire(this.tiles);
    if (this.tiles.length || this.stream) this.opts.invalidate();
    this.tiles = [];
    this.bytesHeld = 0;
    this.stream?.destroy(now);
    this.stream = null;
  }

  private clear(): void {
    this.loadSeq++;
    this.destroyTiles();
    this.plan = null;
    this.back.clear();
  }

  /** Frees everything. */
  destroy(): void {
    this.loadSeq++;
    this.destroyTiles(true);
    this.back.clear();
    this.container.destroy({ children: true });
  }
}

/** The TV's first view before the camera told one: 34 × 19 squares at the map's centre. */
function startView(info: MapInfo): SquareRect {
  const cx = info.grid.cols / 2;
  const cy = info.grid.rows / 2;
  return { x0: cx - 17, y0: cy - 9.5, x1: cx + 17, y1: cy + 9.5 };
}

/** What makes a map's picture different: the file used and the grid on it. */
function keyOf(info: MapInfo, preferTableCopy: boolean): string {
  const ref = preferTableCopy && info.tableCopy ? info.tableCopy : info.picture;
  const g = info.grid;
  return `${info.id}|${ref.hash}|${g.x},${g.y},${g.cellW},${g.cellH},${g.cols},${g.rows},${g.pictureW},${g.pictureH}`;
}

/** Destroys tiles' sprites and textures (GPU memory back). */
function freeTiles(tiles: readonly Tile[]): void {
  for (const t of tiles) {
    if (t.sprite.destroyed) continue;
    t.sprite.destroy();
    t.texture.destroy(true);
  }
}

/** Frees tiles after two animation frames — the next render has dropped them from its batches. */
function retire(tiles: readonly Tile[]): void {
  if (tiles.length === 0) return;
  const list = tiles.slice();
  for (const t of list) t.sprite.removeFromParent();
  requestAnimationFrame(() => requestAnimationFrame(() => freeTiles(list)));
}

/** Resolves on the next animation frame (uploads one tile per frame). */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
