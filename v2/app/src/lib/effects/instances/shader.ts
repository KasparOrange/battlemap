/**
 * The `shader` technique: procedural effects from the library's GLSL.
 *
 * - `apply: "filter"` (weather, light, mood): a Pixi filter on the renderer's filter target —
 *   the map's container — so the shader reads the map under it (rain darkens it, heat haze
 *   bends it). One full-screen pass each: the runtime's budget keeps these rare, and the
 *   degrade level lowers their resolution. The instance draws nothing itself.
 * - `apply: "mask"` (water, lava): a filled shape (the region's polygon, a circle at a point or
 *   around a token) with the filter on it — the shape's alpha is kept, its colour becomes
 *   moving water. Only the shape's pixels are shaded.
 *
 * @see ../../../../../docs/effects.md "Techniques" (`shader`)
 */
import { Graphics, type Container, type Filter, type Texture } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import { estimateCost, type CostEstimate } from '../budget.ts';
import { applyParams, createEffectFilter, type EffectFilter } from '../shaders.ts';
import { makeRoot, numParam, type CreateContext, type EffectInstance, type FrameContext } from './base.ts';

/** A shader effect. */
export class ShaderInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates = true;
  private readonly fx: EffectFilter;
  private readonly shape: Graphics | null = null;
  private readonly target: Container | null;
  private resolution = 0;

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    const spec = m.shader!;
    if (!c.bundle.shader) throw new Error(`${m.id}: shader sources not loaded`);
    const textures: Record<string, Texture> = {};
    for (const [name, t] of Object.entries(spec.textures)) {
      const tex = c.bundle.textures.get(t.file);
      if (!tex) throw new Error(`${m.id}: shader texture ${t.file} not loaded`);
      textures[name] = tex;
    }
    this.fx = createEffectFilter(c.bundle.shader, spec.uniforms, textures, c.params);
    this.root = makeRoot(m.id);
    this.cost = estimateCost(m);
    if (spec.apply === 'mask') {
      this.target = null;
      this.shape = new Graphics();
      this.root.addChild(this.shape);
      this.root.filters = [this.fx.filter];
      this.drawShape(c.anchor, c.params);
    } else {
      this.target = c.filterTarget;
      if (this.target) this.target.filters = [...(this.target.filters ?? []), this.fx.filter];
    }
  }

  /** Whether it has somewhere to draw (a filter shader needs the renderer's filter target). */
  get attached(): boolean {
    return this.shape !== null || this.target !== null;
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    applyParams(this.fx, params);
    if (this.shape) this.drawShape(anchor, params);
    this.root.alpha = numParam(params, 'opacity', 1);
  }

  /**
   * Sets the light pools of a shader that has them (`darkness.frag`): x, y, radius in squares
   * and strength 0..1, four numbers per light, at most 8.
   *
   * @param lights - packed lights
   * @param count - how many
   */
  setLights(lights: Float32Array, count: number): void {
    this.fx.set('uLights', lights);
    this.fx.set('uLightCount', count);
  }

  /** Whether the shader reads light pools. */
  get usesLights(): boolean {
    return this.c.bundle.shader?.fragment.includes('uLights') ?? false;
  }

  update(t: number, _dt: number, ctx: FrameContext): boolean {
    this.fx.tick(t, ctx.squarePx, ctx.originX, ctx.originY);
    const res = ctx.resolution * ctx.degrade.filterResolution;
    if (res !== this.resolution) {
      this.resolution = res;
      this.fx.filter.resolution = res;
    }
    return true;
  }

  destroy(): void {
    if (this.target) {
      const mine: Filter = this.fx.filter;
      this.target.filters = (this.target.filters ?? []).filter((f) => f !== mine);
    }
    this.root.filters = [];
    this.fx.destroy();
    this.root.destroy({ children: true });
  }

  private drawShape(anchor: EffectAnchor, params: EffectParams): void {
    const g = this.shape!;
    const u = this.c.unitsPerSquare;
    g.clear();
    if (anchor.kind === 'region') {
      g.poly(anchor.points.flatMap((p) => [p.x * u, p.y * u]));
    } else {
      const r = numParam(params, 'radius', numParam(params, 'size', 4) / 2) * u;
      const x = anchor.kind === 'point' ? anchor.x * u : 0;
      const y = anchor.kind === 'point' ? anchor.y * u : 0;
      g.circle(x, y, r);
    }
    g.fill({ color: 0xffffff, alpha: 1 });
  }
}

/**
 * Makes a `shader` instance.
 *
 * @param c - the creation context
 * @returns the instance
 */
export function createShaderInstance(c: CreateContext): ShaderInstance {
  return new ShaderInstance(c);
}
