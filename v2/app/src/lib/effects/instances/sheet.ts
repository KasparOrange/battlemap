/**
 * Frame-sheet techniques: `sheet` (a flipbook, looping or once, optional crossfade), `set`
 * (one still variant per placement) and `layers` (one picture per layer, each turning or
 * breathing on its own — the layered magic circle).
 *
 * Frames are sub-textures of the shared atlas, made once per atlas and reused by every copy.
 * Under load the flipbook steps at a lower rate (frames skipped, duration kept) and slow loops
 * stop crossfading ({@link Degrade}).
 *
 * @see ../../../../../docs/effects.md "Techniques"
 */
import { Rectangle, Sprite, Texture, type Container } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import { nominalSquares, placementFor, type Placement } from '../anchors.ts';
import { estimateCost, type CostEstimate } from '../budget.ts';
import type { EffectManifest } from '../manifest.ts';
import { evalLayer, motionState, sheetFrame } from '../motion.ts';
import { hexColor } from '../particle-sim.ts';
import type { EffectBundle } from '../registry.ts';
import { applyPlacement, makeRoot, numParam, pixiBlend, type CreateContext, type EffectInstance, type FrameContext } from './base.ts';

const frameCache = new WeakMap<Texture, Map<string, Texture[]>>();

/**
 * The frames of a sheet as sub-textures of its atlases (made once per loaded atlas).
 *
 * @param bundle - the effect's files
 * @returns one texture per frame
 * @throws Error when an atlas is missing from the bundle
 */
export function framesOf(bundle: EffectBundle<Texture>): Texture[] {
  const s = bundle.manifest.sheet;
  if (!s) return [];
  const atlases = s.atlases.map((a) => {
    const t = bundle.textures.get(a.file);
    if (!t) throw new Error(`${bundle.manifest.id}: atlas ${a.file} not loaded`);
    return t;
  });
  const first = atlases[0]!;
  let byEffect = frameCache.get(first);
  if (!byEffect) {
    byEffect = new Map();
    frameCache.set(first, byEffect);
  }
  const hit = byEffect.get(bundle.manifest.id);
  if (hit) return hit;
  const frames = s.frames.map(([ai, x, y]) => new Texture({ source: atlases[ai]!.source, frame: new Rectangle(x, y, s.frameW, s.frameH) }));
  byEffect.set(bundle.manifest.id, frames);
  return frames;
}

/** The tint a placement asks for: `params.color`, else the manifest's `motion.color`. */
export function tintOf(m: EffectManifest, params: EffectParams): number | null {
  const c = typeof params.color === 'string' ? params.color : m.motion?.color;
  return c ? hexColor(c) : null;
}

/** Sizes a sprite to the manifest's drawn size (squares) and anchors it. */
function sizeSprite(sprite: Sprite, m: EffectManifest, p: Placement): void {
  sprite.anchor.set(p.ax, p.ay);
  const w = m.size?.w ?? nominalSquares(m);
  const h = m.size?.h ?? nominalSquares(m);
  sprite.width = w;
  sprite.height = h;
}

/** Placement of a global sheet: centred on the view, covering it. */
function coverView(m: EffectManifest, ctx: FrameContext, out: Placement): void {
  const w = m.size?.w ?? nominalSquares(m);
  const h = m.size?.h ?? nominalSquares(m);
  const s = Math.max(ctx.view.w / w, ctx.view.h / h) * (w / nominalSquares(m));
  out.x = ctx.view.x + ctx.view.w / 2;
  out.y = ctx.view.y + ctx.view.h / 2;
  out.sx = s;
  out.sy = s;
  out.ax = 0.5;
  out.ay = 0.5;
  out.angle = 0;
}

/** A flipbook. */
class SheetInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates = true;
  private readonly frames: Texture[];
  private readonly a: Sprite;
  private readonly b: Sprite;
  private readonly fps: number;
  private readonly loop: boolean;
  private readonly crossfade: boolean;
  private readonly idx: [number, number, number] = [0, 0, 0];
  private placement: Placement;
  private anchor: EffectAnchor;
  private opacity = 1;

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    const s = m.sheet!;
    this.frames = framesOf(c.bundle);
    this.fps = s.fps ?? 12;
    this.loop = Boolean(s.loop);
    this.crossfade = Boolean(s.crossfade) && this.loop;
    this.root = makeRoot(m.id);
    this.a = new Sprite(this.frames[0]);
    this.b = new Sprite(this.frames[0]);
    this.a.blendMode = pixiBlend(m.blend);
    this.b.blendMode = pixiBlend(m.blend);
    this.b.visible = false;
    this.root.addChild(this.a, this.b);
    this.anchor = c.anchor;
    this.placement = placementFor(m, c.anchor, c.params);
    this.cost = estimateCost(m, undefined, this.placement.sx);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const m = this.c.bundle.manifest;
    this.anchor = anchor;
    this.placement = placementFor(m, anchor, params);
    sizeSprite(this.a, m, this.placement);
    sizeSprite(this.b, m, this.placement);
    const tint = tintOf(m, params);
    this.a.tint = tint ?? 0xffffff;
    this.b.tint = tint ?? 0xffffff;
    this.opacity = numParam(params, 'opacity', 1);
    this.root.alpha = this.opacity;
    applyPlacement(this.root, this.placement, this.c.unitsPerSquare);
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    if (this.anchor.kind === 'global') {
      coverView(this.c.bundle.manifest, ctx, this.placement);
      applyPlacement(this.root, this.placement, this.c.unitsPerSquare);
    }
    const eff = Math.min(this.fps, ctx.degrade.maxSheetFps);
    const tq = eff < this.fps ? Math.floor(t * eff) / eff : t;
    sheetFrame(this.frames.length, this.fps, this.loop, tq, this.idx);
    if (this.idx[0] < 0) {
      this.root.visible = false;
      return false;
    }
    this.a.texture = this.frames[this.idx[0]]!;
    const fade = this.crossfade && ctx.degrade.crossfade;
    this.b.visible = fade;
    if (fade) {
      this.b.texture = this.frames[this.idx[1]]!;
      this.b.alpha = this.idx[2];
    }
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** One still variant of a set. */
class SetInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates = false;
  private readonly sprite: Sprite;
  private readonly frames: Texture[];

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    this.frames = framesOf(c.bundle);
    this.root = makeRoot(m.id);
    this.sprite = new Sprite(this.frames[0]);
    this.sprite.blendMode = pixiBlend(m.blend);
    this.root.addChild(this.sprite);
    this.cost = estimateCost(m);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const m = this.c.bundle.manifest;
    const n = this.frames.length;
    const v = typeof params.variant === 'number' ? Math.abs(Math.round(params.variant)) % n : this.c.seed % n;
    this.sprite.texture = this.frames[v]!;
    const p = placementFor(m, anchor, params);
    // A seeded quarter-turn variety unless the DM turned it.
    if (typeof params.rotation !== 'number') p.angle = ((this.c.seed >>> 4) % 4) * (Math.PI / 2);
    sizeSprite(this.sprite, m, p);
    const tint = tintOf(m, params);
    this.sprite.tint = tint ?? 0xffffff;
    this.root.alpha = numParam(params, 'opacity', 1);
    applyPlacement(this.root, p, this.c.unitsPerSquare);
  }

  update(): boolean {
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A layered picture: every layer turns or breathes on its own. */
class LayersInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates = true;
  private readonly sprites: Sprite[] = [];
  private readonly pose = motionState();

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    const frames = framesOf(c.bundle);
    this.root = makeRoot(m.id);
    for (const layer of m.layers ?? []) {
      const s = new Sprite(frames[layer.frame] ?? frames[0]);
      s.blendMode = pixiBlend(m.blend);
      this.sprites.push(s);
      this.root.addChild(s);
    }
    this.cost = estimateCost(m);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const m = this.c.bundle.manifest;
    const p = placementFor(m, anchor, params);
    const tint = tintOf(m, params);
    for (const s of this.sprites) {
      sizeSprite(s, m, p);
      s.tint = tint ?? 0xffffff;
    }
    this.root.alpha = numParam(params, 'opacity', 1);
    applyPlacement(this.root, p, this.c.unitsPerSquare);
  }

  update(t: number): boolean {
    const layers = this.c.bundle.manifest.layers ?? [];
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]!;
      evalLayer(layers[i]!, t, this.pose);
      s.rotation = this.pose.rot;
      // The sprite's own scale maps texture px to squares; the breath multiplies it.
      const size = this.c.bundle.manifest.size;
      s.scale.set(((size?.w ?? 1) / s.texture.frame.width) * this.pose.scale, ((size?.h ?? 1) / s.texture.frame.height) * this.pose.scale);
    }
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * Makes a `sheet`, `set` or `layers` instance.
 *
 * @param c - the creation context
 * @returns the instance
 */
export function createSheetInstance(c: CreateContext): EffectInstance {
  const m = c.bundle.manifest;
  if (m.technique === 'layers') return new LayersInstance(c);
  if (m.technique === 'set' || m.sheet?.variants) return new SetInstance(c);
  return new SheetInstance(c);
}
