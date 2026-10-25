/**
 * The instance factory — technique → instance — and the `composite` technique (other effects
 * placed together: a campfire = glow + stones + three flames + embers). A composite's parts
 * are full instances inside the composite's root, offset in squares, scaled and phased.
 *
 * @see ./base.ts for the contract
 */
import type { Container } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import { placementFor } from '../anchors.ts';
import { sumCosts, type CostEstimate } from '../budget.ts';
import { applyPlacement, makeRoot, numParam, type CreateContext, type EffectInstance, type FrameContext } from './base.ts';
import { createParticlesInstance } from './particles.ts';
import { createShaderInstance } from './shader.ts';
import { createSheetInstance } from './sheet.ts';
import { createTextureInstance } from './texture.ts';

/** A composite: its parts as instances. */
class CompositeInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates: boolean;
  private readonly parts: { inst: EffectInstance; phase: number; alive: boolean }[] = [];

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    this.root = makeRoot(m.id);
    for (const [i, part] of (m.parts ?? []).entries()) {
      const bundle = c.bundle.parts.get(part.id);
      if (!bundle) continue;
      const inst = createInstance({
        ...c,
        bundle,
        anchor: { kind: 'point', x: part.x, y: part.y },
        params: { scale: part.scale ?? 1 },
        seed: (c.seed + i * 7919) >>> 0,
        unitsPerSquare: 1,
        phase: part.phase ?? 0,
      });
      this.root.addChild(inst.root);
      this.parts.push({ inst, phase: part.phase ?? 0, alive: true });
    }
    this.cost = sumCosts(this.parts.map((p) => p.inst.cost));
    this.animates = this.parts.some((p) => p.inst.animates);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const p = placementFor(this.c.bundle.manifest, anchor, params);
    this.root.alpha = numParam(params, 'opacity', 1);
    applyPlacement(this.root, p, this.c.unitsPerSquare);
  }

  update(t: number, dt: number, ctx: FrameContext): boolean {
    let any = false;
    for (const part of this.parts) {
      if (!part.alive) continue;
      part.alive = part.inst.update(t + part.phase, dt, ctx);
      any ||= part.alive;
    }
    return any;
  }

  destroy(): void {
    for (const p of this.parts) p.inst.destroy();
    this.root.destroy({ children: true });
  }
}

/**
 * Makes the instance of an effect's technique.
 *
 * @param c - the creation context
 * @returns the instance
 * @throws Error when the manifest's technique block is missing or its files aren't loaded
 */
export function createInstance(c: CreateContext): EffectInstance {
  const m = c.bundle.manifest;
  switch (m.technique) {
    case 'sheet':
    case 'set':
    case 'layers':
      if (!m.sheet) throw new Error(`${m.id}: no sheet`);
      return createSheetInstance(c);
    case 'texture':
      if (!m.texture) throw new Error(`${m.id}: no texture`);
      return createTextureInstance(c);
    case 'particles':
      if (!m.particles) throw new Error(`${m.id}: no particle recipe`);
      return createParticlesInstance(c);
    case 'shader':
      if (!m.shader) throw new Error(`${m.id}: no shader`);
      return createShaderInstance(c);
    case 'composite':
      return new CompositeInstance(c);
  }
}
