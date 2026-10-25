/**
 * The map picture: loaded by content hash, decoded once at the density the screen needs
 * (`planDecode` — the TV's ppi within its 128 MB budget, never below 32 px per square), cropped
 * to the grid's rectangle on the way, cut into tiles ≤ 2048 px (TV) / 4096 px (DM) with a
 * one-pixel apron, uploaded one tile per frame, and laid onto the squares. A #0B0B0B rectangle
 * sits under the picture over the whole map, so partial edge squares read dark. A load that
 * finishes after a newer one discards itself; the old map's textures are destroyed when the
 * new one shows.
 */
import { Container, ImageSource, Rectangle, Sprite, Texture, Graphics } from 'pixi.js';
import type { MapInfo } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SQUARE } from './camera.ts';
import { IMAGE_HEAD_BYTES, imageSize } from './image-size.ts';
import { planDecode, planTiles, type DecodePlan, type TextureBudget } from './tiles.ts';
import type { FileLoader } from './types.ts';

/** What happened to a map load (for notices and logs). */
export type MapLoadEvent =
  | { type: 'map-loading'; mapId: string; name: string }
  | { type: 'map-shown'; mapId: string; ms: number; pxPerSquare: number; tiles: number; bytes: number }
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
    },
  ) {
    this.container.addChild(this.back);
    parent.addChild(this.container);
  }

  /** Texture bytes of the shown map. */
  get bytes(): number {
    return this.bytesHeld;
  }

  /** The decoded density, px per square (0 before a map shows). */
  get pxPerSquare(): number {
    return this.plan?.pxPerSquare ?? 0;
  }

  /**
   * Shows a map (loads it when it is another picture or grid), or nothing for null.
   *
   * @param info - the map, or null
   */
  set(info: MapInfo | null): void {
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

  private async load(info: MapInfo, seq: number): Promise<void> {
    const t0 = performance.now();
    const { log, budget } = this.opts;
    const ref = this.opts.preferTableCopy && info.tableCopy ? info.tableCopy : info.picture;
    this.opts.onEvent({ type: 'map-loading', mapId: info.id, name: info.name });
    log.info('render', 'Map loading', { mapId: info.id, file: `${ref.hash}.${ref.ext}`, bytes: ref.bytes, tableCopy: ref !== info.picture });
    const made: ImageBitmap[] = [];
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
        budgetBytes: budget.mapBytes * this.densityFactor,
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
      const built: Tile[] = [];
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
        this.opts.upload(texture);
        await nextFrame();
        if (seq !== this.loadSeq) {
          texture.destroy(true);
          return;
        }
        const sprite = new Sprite({ texture, label: 'map-tile' });
        const x0 = plan.x + tp.x * sx;
        const y0 = plan.y + tp.y * sy;
        sprite.position.set(x0 * SQUARE, y0 * SQUARE);
        sprite.width = tp.fw * sx * SQUARE;
        sprite.height = tp.fh * sy * SQUARE;
        built.push({ sprite, texture, x0, y0, x1: x0 + tp.fw * sx, y1: y0 + tp.fh * sy });
      }
      // Swap: the new tiles in, the old ones out.
      this.destroyTiles();
      for (const t of built) this.container.addChild(t.sprite);
      this.tiles = built;
      this.plan = plan;
      this.bytesHeld = plan.bytes * (this.opts.mipmaps ? 4 / 3 : 1);
      // The bitmaps are on the GPU now; free their memory (a lost context reloads the map).
      for (const b of made) b.close();
      made.length = 0;
      this.opts.invalidate();
      const ms = Math.round(performance.now() - t0);
      log.info('render', 'Map shown', {
        mapId: info.id,
        ms,
        fetchMs: Math.round(tFetch - t0),
        decodeMs: Math.round(tDecode - tFetch),
        uploadMs: Math.round(performance.now() - tDecode),
        sourceW: size.width,
        sourceH: size.height,
        decodedW: plan.dw,
        decodedH: plan.dh,
        pxPerSquare: Math.round(plan.pxPerSquare * 10) / 10,
        tiles: built.length,
        mb: Math.round(this.bytesHeld / 2 ** 20),
      });
      this.opts.onEvent({ type: 'map-shown', mapId: info.id, ms, pxPerSquare: plan.pxPerSquare, tiles: built.length, bytes: this.bytesHeld });
    } catch (e) {
      for (const b of made) b.close();
      if (seq !== this.loadSeq) return;
      log.error('render', 'Map failed', { mapId: info.id, error: String(e) });
      this.opts.onEvent({ type: 'map-failed', mapId: info.id, error: String(e) });
    }
  }

  private destroyTiles(): void {
    for (const t of this.tiles) {
      t.sprite.destroy();
      t.texture.destroy(true);
    }
    this.tiles = [];
    this.bytesHeld = 0;
  }

  private clear(): void {
    this.loadSeq++;
    this.destroyTiles();
    this.plan = null;
    this.back.clear();
  }

  /** Frees everything. */
  destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }
}

/** What makes a map's picture different: the file used and the grid on it. */
function keyOf(info: MapInfo, preferTableCopy: boolean): string {
  const ref = preferTableCopy && info.tableCopy ? info.tableCopy : info.picture;
  const g = info.grid;
  return `${info.id}|${ref.hash}|${g.x},${g.y},${g.cellW},${g.cellH},${g.cols},${g.rows},${g.pictureW},${g.pictureH}`;
}

/** Resolves on the next animation frame (uploads one tile per frame). */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
