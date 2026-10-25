/**
 * The `texture` technique: one picture moved by its motion recipe (turn, pulse, flicker, grow,
 * fade, sway, glow; `once` = a one-shot). The cheapest way to make art move. A recipe naming a
 * shader (`magic-circle.frag`) gets it as a filter on the sprite — counter-turning ring bands —
 * dropped at the highest degrade level. A global texture (a vignette) covers the screen.
 *
 * @see ../../../../../docs/effects.md "Techniques" (`texture`)
 */
import { Sprite, type Container } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import { nominalSquares, placementFor, type Placement } from '../anchors.ts';
import { estimateCost, type CostEstimate } from '../budget.ts';
import { evalMotion, motionAnimates, motionState } from '../motion.ts';
import { createEffectFilter, type EffectFilter } from '../shaders.ts';
import { applyPlacement, makeRoot, numParam, pixiBlend, type CreateContext, type EffectInstance, type FrameContext } from './base.ts';
import { tintOf } from './sheet.ts';

/** A picture with a motion recipe. */
class TextureInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates: boolean;
  private readonly sprite: Sprite;
  private readonly pose = motionState();
  private placement: Placement;
  private anchor: EffectAnchor;
  private opacity = 1;
  private band: EffectFilter | null = null;

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    const tex = c.bundle.textures.get(m.texture!.file);
    if (!tex) throw new Error(`${m.id}: texture not loaded`);
    this.root = makeRoot(m.id);
    this.sprite = new Sprite(tex);
    this.sprite.blendMode = pixiBlend(m.blend);
    this.root.addChild(this.sprite);
    this.animates = motionAnimates(m.motion) || c.anchor.kind === 'global';
    if (c.bundle.motionShader) {
      this.band = createEffectFilter(c.bundle.motionShader, {}, {}, c.params);
      this.sprite.filters = [this.band.filter];
    }
    this.cost = estimateCost(m);
    this.anchor = c.anchor;
    this.placement = placementFor(m, c.anchor, c.params);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const m = this.c.bundle.manifest;
    this.anchor = anchor;
    this.placement = placementFor(m, anchor, params);
    this.sprite.anchor.set(this.placement.ax, this.placement.ay);
    this.sprite.width = m.size?.w ?? nominalSquares(m);
    this.sprite.height = m.size?.h ?? nominalSquares(m);
    this.sprite.tint = tintOf(m, params) ?? 0xffffff;
    this.opacity = numParam(params, 'opacity', 1);
    this.pose.alpha = 1;
    this.root.alpha = this.opacity;
    applyPlacement(this.root, this.placement, this.c.unitsPerSquare);
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    const m = this.c.bundle.manifest;
    evalMotion(m.motion ?? {}, t, this.pose);
    if (!this.pose.alive) {
      this.root.visible = false;
      return false;
    }
    if (this.anchor.kind === 'global') {
      // Screen space: stretched over the whole screen.
      this.sprite.anchor.set(0.5, 0.5);
      this.root.position.set(ctx.screenW / 2, ctx.screenH / 2);
      this.root.rotation = 0;
      this.root.scale.set((ctx.screenW / (m.size?.w ?? 1)) * this.pose.scale, (ctx.screenH / (m.size?.h ?? 1)) * this.pose.scale);
    } else {
      applyPlacement(this.root, this.placement, this.c.unitsPerSquare, this.pose.scale, this.pose.rot);
    }
    this.root.alpha = this.opacity * this.pose.alpha;
    if (this.band) {
      const on = ctx.degrade.spriteShaders;
      if (on !== (this.sprite.filters?.length === 1)) this.sprite.filters = on ? [this.band.filter] : [];
      if (on) this.band.tick(t, ctx.squarePx, ctx.originX, ctx.originY);
    }
    return true;
  }

  destroy(): void {
    this.sprite.filters = [];
    this.band?.destroy();
    this.root.destroy({ children: true });
  }
}

/**
 * Makes a `texture` instance.
 *
 * @param c - the creation context
 * @returns the instance
 */
export function createTextureInstance(c: CreateContext): EffectInstance {
  return new TextureInstance(c);
}
