/**
 * The `particles` technique: a {@link ParticleSim} drawn with Pixi's `ParticleContainer` (one
 * per sprite texture — a container needs one texture source), from a pool made once: every
 * frame the live slots are copied into the pool in order and the rest are hidden, so nothing
 * is allocated per frame. `screen` emitters cover the visible map (squares, so embers stay put
 * when the camera moves) with rates per 100 visible squares²; the degrade level thins them.
 *
 * @see ../../../../../docs/effects.md "Techniques" (`particles`)
 */
import { Particle, ParticleContainer, type Container, type Texture } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import { placementFor } from '../anchors.ts';
import { estimateCost, type CostEstimate } from '../budget.ts';
import { ParticleSim, type ParticleSample } from '../particle-sim.ts';
import { applyPlacement, makeRoot, numParam, pixiBlend, type CreateContext, type EffectInstance, type FrameContext } from './base.ts';

/** RGB 0xrrggbb + alpha → the BGR + alpha word Pixi's particles read. */
function particleColor(rgb: number, alpha: number): number {
  const bgr = ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
  return bgr + (((alpha * 255) | 0) << 24);
}

/** An emitter. */
class ParticlesInstance implements EffectInstance {
  readonly root: Container;
  readonly cost: CostEstimate;
  readonly animates = true;
  private sim: ParticleSim | null = null;
  private readonly textures: Texture[];
  private readonly containers: ParticleContainer[] = [];
  private pools: Particle[][] = [];
  private readonly sample: ParticleSample = { x: 0, y: 0, rot: 0, size: 0, alpha: 0, color: 0, tex: 0, flip: false };
  private readonly used: number[];
  private intensity = 1;
  private sizeFactor = 1;

  constructor(private readonly c: CreateContext) {
    const m = c.bundle.manifest;
    const spec = m.particles!;
    this.textures = spec.textures.map((t) => {
      const tex = c.bundle.textures.get(t.file);
      if (!tex) throw new Error(`${m.id}: particle texture ${t.file} not loaded`);
      return tex;
    });
    this.root = makeRoot(m.id);
    for (const tex of this.textures) {
      const pc = new ParticleContainer({
        texture: tex,
        dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false },
      });
      pc.blendMode = pixiBlend(m.blend);
      this.containers.push(pc);
      this.root.addChild(pc);
    }
    this.used = this.textures.map(() => 0);
    this.cost = estimateCost(m);
    this.setParams(c.anchor, c.params);
  }

  setParams(anchor: EffectAnchor, params: EffectParams): void {
    const m = this.c.bundle.manifest;
    this.intensity = numParam(params, 'intensity', 1);
    if (this.sim) this.sim.intensity = this.intensity;
    this.root.alpha = numParam(params, 'opacity', 1);
    if (anchor.kind === 'global') {
      this.root.position.set(0, 0);
      this.root.rotation = 0;
      this.root.scale.set(this.c.unitsPerSquare);
      this.sizeFactor = numParam(params, 'scale', 1);
      return;
    }
    // The emitter (and its particles) scale with the placement; recipes don't turn.
    const p = placementFor(m, anchor, params);
    p.angle = 0;
    applyPlacement(this.root, p, this.c.unitsPerSquare);
    this.sizeFactor = 1;
  }

  private build(ctx: FrameContext): ParticleSim {
    const spec = this.c.bundle.manifest.particles!;
    const factor = spec.emitter === 'screen' ? Math.max(0.2, (ctx.view.w * ctx.view.h) / 100) : 1;
    const sim = new ParticleSim(spec, this.c.seed, factor);
    sim.intensity = this.intensity;
    sim.density = ctx.degrade.particles;
    this.pools = this.textures.map((tex, i) => {
      const pool: Particle[] = [];
      for (let k = 0; k < sim.capacity; k++) {
        const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
        pool.push(p);
        this.containers[i]!.addParticle(p);
      }
      return pool;
    });
    sim.warm(this.c.phase, spec.emitter === 'screen' ? ctx.view : undefined);
    return sim;
  }

  update(t: number, dt: number, ctx: FrameContext): boolean {
    const spec = this.c.bundle.manifest.particles!;
    const screen = spec.emitter === 'screen';
    const sim = (this.sim ??= this.build(ctx));
    sim.density = ctx.degrade.particles;
    if (screen) sim.setScreenFactor(Math.max(0.2, (ctx.view.w * ctx.view.h) / 100));
    sim.step(t, dt, screen ? ctx.view : undefined);
    for (let k = 0; k < this.used.length; k++) this.used[k] = 0;
    const s = this.sample;
    for (let i = 0; i < sim.capacity; i++) {
      if (!sim.sample(i, t, s)) continue;
      const pool = this.pools[s.tex]!;
      const n = this.used[s.tex]!;
      if (n >= pool.length) continue;
      this.used[s.tex] = n + 1;
      const p = pool[n]!;
      const tex = this.textures[s.tex]!;
      const sc = (s.size * this.sizeFactor) / tex.frame.width;
      p.x = s.x;
      p.y = s.y;
      p.rotation = s.rot;
      p.scaleX = s.flip ? -sc : sc;
      p.scaleY = sc;
      p.color = particleColor(s.color, s.alpha);
    }
    for (let k = 0; k < this.pools.length; k++) {
      const pool = this.pools[k]!;
      for (let n = this.used[k]!; n < pool.length; n++) {
        const p = pool[n]!;
        if (p.scaleX !== 0) {
          p.scaleX = 0;
          p.scaleY = 0;
          p.color = 0;
        }
      }
    }
    if (sim.done(t)) {
      this.root.visible = false;
      return false;
    }
    return true;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * Makes a `particles` instance.
 *
 * @param c - the creation context
 * @returns the instance
 */
export function createParticlesInstance(c: CreateContext): EffectInstance {
  return new ParticlesInstance(c);
}
