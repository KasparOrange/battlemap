/**
 * The DM's own layers: DM-only pictures over the map (drawn above the fog, on the companion
 * only — the TV never fetches them), each laid on the squares with the map's picture grid
 * scaled to the layer's size, decoded at most 4096 px a side while visible and freed when
 * hidden; and the players' frame — the TV's window (or what the TV shows in fit/free mode)
 * outlined in gold with a grip tab, in screen-px widths at any DM zoom.
 */
import { Container, Graphics, ImageSource, Sprite, Texture } from 'pixi.js';
import type { DmLayer, MapInfo, Rect } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SQUARE } from './camera.ts';
import type { FileLoader } from './types.ts';

/** Largest side a DM layer is decoded at. */
export const LAYER_MAX_PX = 4096;

interface Shown {
  layer: DmLayer;
  sprite: Sprite | null;
  texture: Texture | null;
  loading: boolean;
  bytes: number;
}

/** DM-only picture layers. */
export class DmLayers {
  /** The container (the scene's dmLayers slot). */
  readonly container = new Container({ label: 'dm-layers' });
  private shown = new Map<string, Shown>();
  private layers: readonly DmLayer[] | null = null;
  private map: MapInfo | null = null;

  /**
   * @param parent - the scene's dmLayers slot
   * @param files - loads the pictures
   * @param log - logger
   * @param invalidate - asks for a frame when a picture arrives
   */
  constructor(parent: Container, private readonly files: FileLoader, private readonly log: Logger, private readonly invalidate: () => void) {
    parent.addChild(this.container);
  }

  /** Texture bytes held. */
  get bytes(): number {
    let n = 0;
    for (const s of this.shown.values()) n += s.bytes;
    return n;
  }

  /**
   * Shows a map's DM layers.
   *
   * @param layers - bottom first (null: none)
   * @param map - the map they lie on
   * @returns whether anything changed
   */
  set(layers: readonly DmLayer[] | null, map: MapInfo | null): boolean {
    if (layers === this.layers && map === this.map) return false;
    const mapChanged = map !== this.map;
    this.layers = layers;
    this.map = map;
    const keep = new Set<string>();
    let order = 0;
    for (const l of layers ?? []) {
      if (!l.visible || !map) continue;
      keep.add(l.id);
      let s = this.shown.get(l.id);
      if (s && s.layer.file.hash !== l.file.hash) {
        this.free(s);
        this.shown.delete(l.id);
        s = undefined;
      }
      if (!s) {
        s = { layer: l, sprite: null, texture: null, loading: true, bytes: 0 };
        this.shown.set(l.id, s);
        void this.load(s);
      }
      s.layer = l;
      if (s.sprite) {
        s.sprite.alpha = l.opacity;
        if (mapChanged) this.place(s.sprite, s.texture!);
        if (this.container.getChildIndex(s.sprite) !== Math.min(order, this.container.children.length - 1)) {
          this.container.setChildIndex(s.sprite, Math.min(order, this.container.children.length - 1));
        }
        order++;
      }
    }
    for (const [id, s] of this.shown) {
      if (keep.has(id)) continue;
      this.free(s);
      this.shown.delete(id);
    }
    return true;
  }

  private async load(s: Shown): Promise<void> {
    const ref = s.layer.file;
    try {
      const blob = await this.files(ref);
      const probe = await createImageBitmap(blob);
      const k = Math.min(1, LAYER_MAX_PX / Math.max(probe.width, probe.height));
      let bitmap = probe;
      if (k < 1) {
        bitmap = await createImageBitmap(probe, { resizeWidth: Math.round(probe.width * k), resizeHeight: Math.round(probe.height * k), resizeQuality: 'high' });
        probe.close();
      }
      if (this.shown.get(s.layer.id) !== s) {
        bitmap.close();
        return;
      }
      const texture = new Texture({ source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: true, label: `dm-layer ${s.layer.id}` }) });
      const sprite = new Sprite({ texture, label: 'dm-layer' });
      sprite.alpha = s.layer.opacity;
      s.texture = texture;
      s.sprite = sprite;
      s.bytes = Math.round(bitmap.width * bitmap.height * 4 * 4 / 3);
      s.loading = false;
      this.place(sprite, texture);
      // keep the list's order: insert by position among the loaded ones
      const ids = (this.layers ?? []).filter((l) => l.visible).map((l) => l.id);
      const before = ids.slice(0, ids.indexOf(s.layer.id)).filter((id) => this.shown.get(id)?.sprite).length;
      this.container.addChildAt(sprite, Math.min(before, this.container.children.length));
      this.invalidate();
      this.log.info('render', 'DM layer shown', { id: s.layer.id, w: bitmap.width, h: bitmap.height });
    } catch (e) {
      s.loading = false;
      this.log.warn('render', 'DM layer failed', { id: s.layer.id, error: String(e) });
    }
  }

  /** Lays a layer on the squares: the map's grid scaled from its picture to the layer. */
  private place(sprite: Sprite, texture: Texture): void {
    const g = this.map?.grid;
    if (!g) return;
    sprite.position.set((-g.x / g.cellW) * SQUARE, (-g.y / g.cellH) * SQUARE);
    sprite.width = (g.pictureW / g.cellW) * SQUARE;
    sprite.height = (g.pictureH / g.cellH) * SQUARE;
    void texture;
  }

  private free(s: Shown): void {
    s.sprite?.destroy();
    s.texture?.destroy(true);
    s.sprite = null;
    s.texture = null;
    s.bytes = 0;
  }

  /** Frees every picture (they reload when shown again). */
  drop(): void {
    for (const s of this.shown.values()) this.free(s);
    this.shown.clear();
    this.layers = null;
  }

  /** Frees everything. */
  destroy(): void {
    this.drop();
    this.container.destroy({ children: true });
  }
}

/** The players' frame on the DM's view. */
export class PlayersFrame {
  /** The outline (the scene's dmFrame slot). */
  readonly graphics = new Graphics({ label: 'players-frame' });
  private key = '';

  /** @param parent - the scene's dmFrame slot */
  constructor(parent: Container) {
    parent.addChild(this.graphics);
  }

  /**
   * Draws the frame.
   *
   * @param rect - what the players see, in squares (null: nothing)
   * @param zoom - the DM's px per square (line widths in screen px)
   * @returns whether anything changed
   */
  set(rect: Rect | null, zoom: number): boolean {
    const key = rect ? `${rect.x},${rect.y},${rect.width},${rect.height}|${zoom.toFixed(3)}` : '';
    if (key === this.key) return false;
    this.key = key;
    const g = this.graphics.clear();
    if (!rect) return true;
    const px = SQUARE / zoom; // world units per screen px
    const S = SQUARE;
    g.rect(rect.x * S, rect.y * S, rect.width * S, rect.height * S).stroke({ width: 3 * px, color: 0xd4a24a, alpha: 0.95 });
    const gw = 56 * px;
    const gh = 16 * px;
    const cx = (rect.x + rect.width / 2) * S;
    g.roundRect(cx - gw / 2, rect.y * S - gh, gw, gh, 6 * px).fill({ color: 0xd4a24a, alpha: 0.95 });
    for (const dx of [-10, 0, 10]) g.moveTo(cx + dx * px, rect.y * S - gh * 0.75).lineTo(cx + dx * px, rect.y * S - gh * 0.25);
    g.stroke({ width: 2 * px, color: 0x3a2808 });
    return true;
  }

  /** Frees it. */
  destroy(): void {
    this.graphics.destroy();
  }
}
