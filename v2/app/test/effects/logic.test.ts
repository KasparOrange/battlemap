/**
 * The effects runtime's pure logic: the ref-counted texture cache, diffing of lasting effects,
 * one-shot de-duplication, the frame governor and cost estimates, anchors, motion, particles.
 */
import { describe, expect, test } from 'bun:test';
import type { OneShot, PlacedEffect } from '@battlemap/shared';
import { circleRegion, coneRegion, lineRegion, placementFor } from '../../src/lib/effects/anchors.ts';
import { degradeFor, estimateCost, FrameGovernor, MAX_DEGRADE } from '../../src/lib/effects/budget.ts';
import { RefCache } from '../../src/lib/effects/cache.ts';
import { planPlaced, runningRecord, ShotTracker, signature } from '../../src/lib/effects/diff.ts';
import type { EffectManifest, ParticleSpec } from '../../src/lib/effects/manifest.ts';
import { evalMotion, motionState, sheetFrame } from '../../src/lib/effects/motion.ts';
import { ParticleSim, mixColor, type ParticleSample } from '../../src/lib/effects/particle-sim.ts';

const placed = (id: string, effect = 'torch', params: PlacedEffect['params'] = {}, on = true): PlacedEffect => ({
  id,
  effect,
  anchor: { kind: 'point', x: 1, y: 2 },
  params,
  on,
});

describe('ref cache', () => {
  function make(budget: number) {
    const freed: string[] = [];
    let loads = 0;
    const cache = new RefCache<string>({
      budgetBytes: budget,
      load: async (k) => {
        loads++;
        return { value: `tex:${k}`, bytes: 10 };
      },
      free: (k) => freed.push(k),
    });
    return { cache, freed, loads: () => loads };
  }

  test('loads once for concurrent users and counts references', async () => {
    const { cache, loads } = make(100);
    const [a, b] = await Promise.all([cache.acquire('a'), cache.acquire('a')]);
    expect(a).toBe('tex:a');
    expect(b).toBe('tex:a');
    expect(loads()).toBe(1);
    expect(cache.refs('a')).toBe(2);
  });

  test('keeps unused resources until the budget needs room, least recently used first', async () => {
    const { cache, freed } = make(25);
    await cache.acquire('a');
    await cache.acquire('b');
    cache.release('a');
    cache.release('b');
    expect(freed).toEqual([]);
    expect(cache.bytes).toBe(20);
    await cache.acquire('c'); // 30 > 25 → the oldest unused (a) goes
    expect(freed).toEqual(['a']);
    expect(cache.has('b')).toBe(true);
    expect(cache.bytes).toBe(20);
  });

  test('never frees what is in use, even over budget', async () => {
    const { cache, freed } = make(15);
    await cache.acquire('a');
    await cache.acquire('b');
    expect(freed).toEqual([]);
    expect(cache.overBudget).toBe(true);
    cache.release('a');
    expect(freed).toEqual(['a']);
  });

  test('a failed load takes no reference and retries next time', async () => {
    let fail = true;
    const cache = new RefCache<string>({
      budgetBytes: 100,
      load: async () => {
        if (fail) throw new Error('404');
        return { value: 'ok', bytes: 1 };
      },
      free: () => {},
    });
    await expect(cache.acquire('x')).rejects.toThrow('404');
    expect(cache.refs('x')).toBe(0);
    fail = false;
    expect(await cache.acquire('x')).toBe('ok');
  });
});

describe('diffing lasting effects', () => {
  test('starts new, stops gone and paused ones, changes moved ones in place', () => {
    const running = new Map([
      ['a', runningRecord(placed('a'))],
      ['b', runningRecord(placed('b'))],
      ['c', runningRecord(placed('c'))],
    ]);
    const moved = { ...placed('b'), anchor: { kind: 'point' as const, x: 5, y: 5 } };
    const plan = planPlaced(running, [placed('a'), moved, placed('c', 'torch', {}, false), placed('d')]);
    expect(plan.start.map((p) => p.id)).toEqual(['d']);
    expect(plan.stop).toEqual(['c']);
    expect(plan.change).toEqual([{ placed: moved, anchor: true, params: false }]);
  });

  test('a different catalogue entry restarts; equal params in another key order do nothing', () => {
    const running = new Map([['a', runningRecord(placed('a', 'torch', { x: 1, y: 2 }))]]);
    expect(planPlaced(running, [placed('a', 'torch', { y: 2, x: 1 })])).toEqual({ start: [], change: [], stop: [] });
    const plan = planPlaced(running, [placed('a', 'brazier')]);
    expect(plan.stop).toEqual(['a']);
    expect(plan.start.map((p) => p.effect)).toEqual(['brazier']);
  });

  test('signature ignores key order', () => {
    expect(signature({ a: 1, b: [1, 2] })).toBe(signature({ b: [1, 2], a: 1 }));
  });
});

describe('one-shots', () => {
  const shot = (id: string, at: number): OneShot => ({ id, effect: 'fireball', anchor: { kind: 'global' }, params: {}, at });

  test('each id plays once', () => {
    const t = new ShotTracker();
    expect(t.judge(shot('s1', 1000), 1100, 3000)).toBe('play');
    expect(t.judge(shot('s1', 1000), 1200, 3000)).toBe('seen');
  });

  test('shots already over when they arrive are skipped (a reconnecting TV)', () => {
    const t = new ShotTracker(64, 1500);
    expect(t.judge(shot('old', 0), 10_000, 3000)).toBe('stale');
    expect(t.judge(shot('late', 0), 4000, 3000)).toBe('play'); // within length + grace
    expect(t.judge(shot('old', 0), 10_000, 3000)).toBe('seen');
  });

  test('remembers a bounded number of ids', () => {
    const t = new ShotTracker(3);
    for (const id of ['a', 'b', 'c', 'd']) t.remember(id);
    expect(t.has('a')).toBe(false);
    expect(t.has('d')).toBe(true);
  });
});

describe('budget', () => {
  test('the governor steps up on slow frames, back down on fast ones, within its floor', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 40; i++) g.frame(33);
    expect(g.level).toBe(1);
    for (let i = 0; i < 40; i++) g.frame(33);
    expect(g.level).toBe(2);
    for (let i = 0; i < 80; i++) g.frame(33);
    expect(g.level).toBe(MAX_DEGRADE);
    for (let i = 0; i < 700; i++) g.frame(16.7);
    expect(g.level).toBe(0);
    g.setFloor(1);
    expect(g.level).toBe(1);
    for (let i = 0; i < 400; i++) g.frame(16.7);
    expect(g.level).toBe(1);
  });

  test('gaps (idle, hidden tab) are not slow frames', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 100; i++) g.frame(5000);
    expect(g.level).toBe(0);
  });

  test('degrade levels save particles, flipbook rate, crossfade, filter resolution', () => {
    expect(degradeFor(0)).toMatchObject({ particles: 1, crossfade: true, filterResolution: 1 });
    expect(degradeFor(2).particles).toBeLessThan(degradeFor(1).particles);
    expect(degradeFor(9).level).toBe(MAX_DEGRADE);
  });

  test('cost estimates follow the technique', () => {
    const sheet = { id: 's', technique: 'sheet', size: { w: 2, h: 2 }, squares: 2, gpuBytes: 100, sheet: { crossfade: true, frames: [] } } as unknown as EffectManifest;
    expect(estimateCost(sheet)).toEqual({ drawCalls: 2, textureBytes: 100, fillSquares: 8, particles: 0 });
    const rain = { id: 'r', technique: 'shader', squares: null, gpuBytes: 0, shader: { apply: 'filter' } } as unknown as EffectManifest;
    expect(estimateCost(rain).fillSquares).toBe(34 * 19);
  });
});

describe('anchors', () => {
  const art = { id: 'a', squares: 8, size: { w: 8, h: 8 }, anchor: [0.5, 0.5] } as unknown as EffectManifest;

  test('a circle region centres the art and scales it to the diameter', () => {
    const p = placementFor(art, { kind: 'region', points: circleRegion(10, 6, 4) }, { shape: 'circle' });
    expect(p.x).toBeCloseTo(10, 1);
    expect(p.y).toBeCloseTo(6, 1);
    expect(p.sx).toBeCloseTo(1, 1);
  });

  test('a cone starts at the apex and points at the far edge', () => {
    const cone = { id: 'c', squares: 3, size: { w: 3, h: 3 }, anchor: [0, 0.5] } as unknown as EffectManifest;
    const p = placementFor(cone, { kind: 'region', points: coneRegion(2, 2, 90, 6) }, { shape: 'cone' });
    expect(p.x).toBe(2);
    expect(p.angle).toBeCloseTo(Math.PI / 2, 3);
    expect(p.sx).toBeCloseTo(2, 3);
  });

  test('a beam stretches its start→end marks over the line', () => {
    const bolt = { id: 'b', squares: 20, size: { w: 20, h: 1 }, anchor: [0.5, 0.5], beam: { start: 0.05, end: 0.95 } } as unknown as EffectManifest;
    const p = placementFor(bolt, { kind: 'region', points: lineRegion(0, 0, 9, 0, 1) }, { shape: 'line' });
    expect(p.ax).toBe(0.05);
    expect(p.sx).toBeCloseTo(9 / 18, 5);
    expect(p.sy).toBeCloseTo(1, 5);
    expect(p.x).toBeCloseTo(0, 5);
  });

  test('a point takes size in squares or a scale', () => {
    expect(placementFor(art, { kind: 'point', x: 1, y: 1 }, { size: 4 }).sx).toBe(0.5);
    expect(placementFor(art, { kind: 'point', x: 1, y: 1 }, { scale: 2 }).sx).toBe(2);
  });
});

describe('motion', () => {
  test('a one-shot texture ends, fades in and grows', () => {
    const s = motionState();
    evalMotion({ once: 1, fadeIn: 0.5, grow: { from: 0.5, duration: 1 } }, 0.25, s);
    expect(s.alive).toBe(true);
    expect(s.alpha).toBeCloseTo(0.5, 3);
    expect(s.scale).toBeGreaterThan(0.5);
    evalMotion({ once: 1 }, 1.5, s);
    expect(s.alive).toBe(false);
  });

  test('sheet frames loop, one-shots end', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(sheetFrame(10, 10, true, 1.25, out)).toEqual([2, 3, expect.closeTo(0.5, 5)]);
    expect(sheetFrame(10, 10, false, 0.95, out)[0]).toBe(9);
    expect(sheetFrame(10, 10, false, 1.01, out)[0]).toBe(-1);
  });
});

describe('particles', () => {
  const spec: ParticleSpec = {
    textures: [{ file: 'p.webp', w: 32, h: 32 }],
    emitter: 'point',
    radius: 0.3,
    rate: 20,
    max: 30,
    life: [1, 2],
    speed: [0.5, 1],
    angle: [-100, -80],
    gravity: [0, -0.2],
    size: [0.1, 0.2],
    alpha: [0, 1, 0],
    colors: ['#ff0000', '#0000ff'],
  };

  test('is deterministic per seed and never exceeds its maximum', () => {
    const a = new ParticleSim(spec, 42);
    const b = new ParticleSim(spec, 42);
    for (let i = 1; i <= 300; i++) {
      a.step(i / 60, 1 / 60);
      b.step(i / 60, 1 / 60);
      expect(a.live).toBeLessThanOrEqual(30);
    }
    const sa: ParticleSample = { x: 0, y: 0, rot: 0, size: 0, alpha: 0, color: 0, tex: 0, flip: false };
    const sb = { ...sa };
    let compared = 0;
    for (let i = 0; i < a.capacity; i++) if (a.sample(i, 5, sa) && b.sample(i, 5, sb)) {
      expect(sa).toEqual(sb);
      compared++;
    }
    expect(compared).toBeGreaterThan(5);
  });

  test('density thins the emitter (the degrade level)', () => {
    const full = new ParticleSim(spec, 1);
    const thin = new ParticleSim(spec, 1);
    thin.density = 0.35;
    for (let i = 1; i <= 300; i++) {
      full.step(i / 60, 1 / 60);
      thin.step(i / 60, 1 / 60);
    }
    expect(thin.live).toBeLessThanOrEqual(Math.floor(30 * 0.35));
    expect(full.live).toBeGreaterThan(thin.live);
  });

  test('a burst fires once and is done when every particle died', () => {
    const burst = new ParticleSim({ ...spec, rate: undefined, burst: 12, max: 12 }, 3);
    burst.step(0, 0);
    expect(burst.live).toBe(12);
    burst.step(0.5, 0.5);
    expect(burst.live).toBe(12);
    expect(burst.done(2.5)).toBe(true);
  });

  test('colours mix from birth to death', () => {
    expect(mixColor(0xff0000, 0x0000ff, 0.5)).toBe(0x7f007f);
  });
});
