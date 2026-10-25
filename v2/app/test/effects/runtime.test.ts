/**
 * The effects runtime against the real library on disk (manifests, shader sources) with
 * stand-in textures and a headless Pixi scene graph: diffing, one-shot de-duplication and
 * staleness, render leases, the quality setting, token anchors, texture release — and every
 * one of the 150 effects instantiated and advanced through all its techniques.
 */
import { describe, expect, test } from 'bun:test';
import { Container, DOMAdapter, Texture, TextureSource, type Renderer } from 'pixi.js';
import type { OneShot, PlacedEffect } from '@battlemap/shared';
import type { Logger } from '../../src/lib/log.ts';
import { circleRegion, coneRegion, lineRegion } from '../../src/lib/effects/anchors.ts';
import { textureFiles, type EffectIndex, type EffectManifest } from '../../src/lib/effects/manifest.ts';
import { EffectRegistry } from '../../src/lib/effects/registry.ts';
import { createEffectsRuntime, type EffectsRuntime, type EffectSlots } from '../../src/lib/effects/runtime.ts';
import { effectsBenchScenes } from '../../src/lib/effects/index.ts';

// Headless: Pixi asks a test canvas for the shader precision; there is no DOM under bun.
DOMAdapter.set({ ...DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });

const LIB = new URL('../../../assets/effects/', import.meta.url).pathname;

const quiet: Logger = { debug() {}, info() {}, warn() {}, error: (_a, m, p) => console.error(m, p) };

function diskRegistry(budgetBytes = 64 * 1024 * 1024) {
  const freed: string[] = [];
  let loads = 0;
  const registry = new EffectRegistry<Texture>({
    baseUrl: LIB,
    budgetBytes,
    log: quiet,
    fetchJson: (url) => Bun.file(url).json() as Promise<unknown>,
    fetchText: (url) => Bun.file(url).text(),
    loadTexture: async (url) => {
      if (!(await Bun.file(url).exists())) throw new Error(`missing ${url}`);
      loads++;
      return new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
    },
    freeTexture: (url) => freed.push(url.slice(LIB.length)),
  });
  return { registry, freed, loads: () => loads };
}

function fakeScheduler() {
  let leases = 0;
  let invalidations = 0;
  return {
    hold: () => {
      leases++;
      let done = false;
      return () => {
        if (!done) leases--;
        done = true;
      };
    },
    invalidate: () => void invalidations++,
    get leases() {
      return leases;
    },
    get invalidations() {
      return invalidations;
    },
  };
}

function setup(opts: { budgetBytes?: number; now?: () => number } = {}) {
  const tokens = new Map<string, Container>();
  const world = new Container();
  const map = new Container({ label: 'map' });
  const slots: EffectSlots = {
    ground: new Container({ label: 'fx.ground' }),
    air: new Container({ label: 'fx.air' }),
    screen: new Container({ label: 'fx.screen' }),
    token: (id) => tokens.get(id) ?? null,
    filterTarget: map,
  };
  world.addChild(map, slots.ground, slots.air);
  const { registry, freed, loads } = diskRegistry(opts.budgetBytes);
  const scheduler = fakeScheduler();
  const rt = createEffectsRuntime(slots, { profile: 'players', scheduler, log: quiet, registry, now: opts.now });
  const renderer = { screen: { width: 1920, height: 1080 }, resolution: 1 } as unknown as Renderer;
  const clock = slots.ground.children.find((c) => c.label === 'fx:clock')!;
  let fakeNow = performance.now();
  /** Advances the runtime as if `ms` of frames were drawn. */
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) {
      // The runtime dedupes ticks closer than 2 ms; real frames are 16.7 ms apart.
      const until = performance.now() + 2.2;
      while (performance.now() < until) {
        /* wait */
      }
      clock.onRender!(renderer);
    }
    fakeNow = performance.now();
  };
  void fakeNow;
  return { rt, slots, tokens, map, scheduler, registry, freed, loads, frames };
}

/** Lets the registry's async loads land. */
const settle = () => new Promise((r) => setTimeout(r, 30));

const point = (id: string, effect: string, x = 5, y = 5, params: PlacedEffect['params'] = {}): PlacedEffect => ({ id, effect, anchor: { kind: 'point', x, y }, params, on: true });
const fxChildren = (c: Container) => c.children.filter((k) => k.label !== 'fx:clock');

describe('effects runtime', () => {
  test('starts, moves and stops lasting effects; the lease follows', async () => {
    const { rt, slots, scheduler, registry } = setup();
    rt.update([point('t1', 'torch-glow')], [], Date.now());
    await settle();
    expect(fxChildren(slots.ground).length).toBe(1);
    expect(scheduler.leases).toBe(1);
    rt.update([point('t1', 'torch-glow', 9, 9)], [], Date.now());
    expect(fxChildren(slots.ground)[0]!.position.x).toBe(9);
    rt.update([], [], Date.now());
    expect(fxChildren(slots.ground).length).toBe(0);
    expect(scheduler.leases).toBe(0);
    expect(registry.usersOf('torch-glow')).toBe(0);
    rt.destroy();
  });

  test('six copies share one texture; stopping keeps it cached until the budget needs room', async () => {
    const { rt, loads, registry, freed } = setup({ budgetBytes: 1 });
    rt.update(Array.from({ length: 6 }, (_, i) => point(`t${i}`, 'torch-glow', i, 1)), [], Date.now());
    await settle();
    expect(loads()).toBe(1);
    expect(registry.usersOf('torch-glow')).toBe(6);
    rt.update([], [], Date.now());
    // Budget of 1 byte: an unused texture is freed at once.
    expect(freed).toEqual(['torch-glow/texture.webp']);
    rt.destroy();
  });

  test('a still decal holds no lease (idle = 0 frames)', async () => {
    const { rt, slots, scheduler } = setup();
    rt.update([point('r', 'runes-arcane')], [], Date.now());
    await settle();
    expect(fxChildren(slots.ground).length).toBe(1);
    expect(scheduler.leases).toBe(0);
    rt.destroy();
  });

  test('each one-shot plays once, ends by itself and releases its lease', async () => {
    const { rt, slots, scheduler, frames, registry } = setup();
    const shot: OneShot = { id: 'boom', effect: 'explosion-puffs', anchor: { kind: 'point', x: 3, y: 3 }, params: {}, at: Date.now() };
    rt.update([], [shot], Date.now());
    rt.update([], [shot], Date.now());
    await settle();
    expect(fxChildren(slots.air).length).toBe(1);
    expect(scheduler.leases).toBe(1);
    rt.update([], [shot], Date.now()); // the same shot in a later snapshot
    await settle();
    expect(fxChildren(slots.air).length).toBe(1);
    frames(3);
    expect(rt.stats().shots).toBe(1);
    // Fast-forward: its particles live at most 1.4 s.
    await new Promise((r) => setTimeout(r, 1500));
    frames(2);
    expect(fxChildren(slots.air).length).toBe(0);
    expect(scheduler.leases).toBe(0);
    expect(registry.usersOf('explosion-puffs')).toBe(0);
    rt.destroy();
  });

  test('a shot already over when it arrives is skipped', async () => {
    const { rt, slots } = setup();
    rt.update([], [{ id: 'old', effect: 'fireball', anchor: { kind: 'point', x: 1, y: 1 }, params: {}, at: Date.now() - 60_000 }], Date.now());
    await settle();
    expect(fxChildren(slots.air).length).toBe(0);
    expect(rt.stats().shots).toBe(0);
    rt.destroy();
  });

  test('effects off: nothing runs, and shots made meanwhile never replay', async () => {
    const { rt, slots, scheduler } = setup();
    rt.update([point('t1', 'torch-glow')], [], Date.now());
    await settle();
    const shot: OneShot = { id: 's', effect: 'fireball', anchor: { kind: 'point', x: 1, y: 1 }, params: {}, at: Date.now() };
    rt.setQuality('off');
    rt.update([point('t1', 'torch-glow')], [shot], Date.now());
    await settle();
    expect(fxChildren(slots.ground).length).toBe(0);
    expect(scheduler.leases).toBe(0);
    rt.setQuality('full');
    rt.update([point('t1', 'torch-glow')], [shot], Date.now());
    await settle();
    expect(fxChildren(slots.ground).length).toBe(1);
    expect(fxChildren(slots.air).length).toBe(0);
    rt.update([], [], Date.now(), false); // the game's setting
    expect(fxChildren(slots.ground).length).toBe(0);
    rt.destroy();
  });

  test('an aura follows its token and is gone while the token is not drawn', async () => {
    const { rt, tokens, frames, scheduler } = setup();
    const aura: PlacedEffect = { id: 'a', effect: 'aura-frost', anchor: { kind: 'token', tokenId: 'tok' }, params: {}, on: true };
    rt.update([aura], [], Date.now());
    await settle();
    expect(scheduler.leases).toBe(0); // no token drawn → nothing animates
    const tok = new Container();
    tokens.set('tok', tok);
    frames(1);
    expect(tok.children.length).toBe(1);
    expect(scheduler.leases).toBe(1);
    tokens.delete('tok');
    frames(1);
    expect(tok.children.length).toBe(0);
    expect(scheduler.leases).toBe(0);
    rt.destroy();
  });

  test('weather shaders go on the filter target and come off again', async () => {
    const { rt, map } = setup();
    rt.update([{ id: 'w', effect: 'rain', anchor: { kind: 'global' }, params: { uDensity: 0.9 }, on: true }], [], Date.now());
    await settle();
    expect(map.filters?.length).toBe(1);
    rt.update([], [], Date.now());
    expect(map.filters?.length ?? 0).toBe(0);
    rt.destroy();
  });

  test('a heavy scene raises the degrade level before any frame is slow', async () => {
    const { rt } = setup();
    const scene = effectsBenchScenes.find((s) => s.id === 'heavy')!;
    rt.update(scene.placed({ cols: 34, rows: 19 }), [], Date.now());
    await settle();
    await settle();
    const s = rt.stats();
    expect(s.placed).toBeGreaterThan(15);
    expect(s.degrade).toBeGreaterThanOrEqual(1);
    expect(s.cost.drawCalls).toBeGreaterThan(20);
    rt.destroy();
  });

  test('every effect of the library starts and advances on every anchor its category uses', async () => {
    const { rt, frames, registry } = setup({ budgetBytes: 8 * 1024 * 1024 });
    const index = (await Bun.file(LIB + 'index.json').json()) as EffectIndex;
    const failures: string[] = [];
    for (const row of index.effects) {
      const anchors: PlacedEffect['anchor'][] =
        row.category === 'global'
          ? [{ kind: 'global' }]
          : row.category === 'aura'
            ? [{ kind: 'point', x: 4, y: 4 }]
            : [
                { kind: 'point', x: 4, y: 4 },
                { kind: 'region', points: circleRegion(6, 6, 3) },
              ];
      const list = anchors.map((anchor, i) => ({ id: `${row.id}-${i}`, effect: row.id, anchor, params: { shape: anchor.kind === 'region' ? 'circle' : '' }, on: true }));
      rt.update(list, [], Date.now());
      for (let k = 0; k < 100 && rt.stats().loading > 0; k++) await new Promise((r) => setTimeout(r, 5));
      frames(2);
      const s = rt.stats();
      if (s.placed !== list.length) failures.push(`${row.id}: ${s.placed}/${list.length} running`);
      rt.update([], [], Date.now());
      if (registry.usersOf(row.id) !== 0) failures.push(`${row.id}: not released`);
    }
    expect(failures).toEqual([]);
    expect(registry.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    rt.destroy();
  }, 30_000);

  test('cones and lines place their art along the shape', async () => {
    const { rt, slots } = setup();
    rt.update(
      [
        { id: 'c', effect: 'burning-hands', anchor: { kind: 'region', points: coneRegion(2, 2, 90, 3) }, params: { shape: 'cone' }, on: true },
        { id: 'l', effect: 'lightning-bolt', anchor: { kind: 'region', points: lineRegion(0, 5, 18, 5, 1) }, params: { shape: 'line' }, on: true },
      ],
      [],
      Date.now(),
    );
    await settle();
    const cone = slots.air.children.find((c) => c.label === 'fx:burning-hands');
    const line = slots.air.children.find((c) => c.label === 'fx:lightning-bolt');
    expect(cone!.rotation).toBeCloseTo(Math.PI / 2, 3);
    expect(cone!.position.x).toBe(2);
    expect(line!.position.x).toBe(0);
    expect(line!.scale.x).toBeCloseTo(18 / ((0.951 - 0.0501) * 19.98), 2);
    rt.destroy();
  });
});

describe('the library on disk', () => {
  test('every manifest names files that exist', async () => {
    const index = (await Bun.file(LIB + 'index.json').json()) as EffectIndex;
    expect(index.effects.length).toBe(index.count);
    const missing: string[] = [];
    for (const row of index.effects) {
      const m = (await Bun.file(LIB + row.manifest).json()) as EffectManifest;
      for (const f of textureFiles(m)) if (!(await Bun.file(LIB + f).exists())) missing.push(f);
      for (const p of m.parts ?? []) if (!index.effects.some((e) => e.id === p.id)) missing.push(`${m.id} part ${p.id}`);
    }
    expect(missing).toEqual([]);
  });

  test('the bench scenes name effects of the library', async () => {
    const index = (await Bun.file(LIB + 'index.json').json()) as EffectIndex;
    const ids = new Set(index.effects.map((e) => e.id));
    for (const scene of effectsBenchScenes) {
      const used = [...scene.placed({ cols: 34, rows: 19 }), ...scene.shots({ cols: 34, rows: 19 }, 0, 0)].map((e) => e.effect);
      for (const id of used) expect(ids.has(id)).toBe(true);
    }
  });
});

void (null as unknown as EffectsRuntime);
