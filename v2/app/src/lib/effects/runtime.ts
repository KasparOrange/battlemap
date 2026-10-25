/**
 * The effects runtime — the seam the renderer drives:
 * `createEffectsRuntime(slots, { profile, scheduler, log }) → { update(effects, shots, now), destroy() }`.
 *
 * - **Diffing.** `update` takes the map's lasting effects (`MapPlay.effects`) and the live
 *   one-shots (`live.shots`): lasting effects start, move, change params and stop to match
 *   ({@link planPlaced}); each one-shot id plays once, shots already over are skipped
 *   ({@link ShotTracker}).
 * - **Loading.** Files come from the {@link EffectRegistry} when an effect first runs and go
 *   back when it stops (ref-counted, cached within a byte budget).
 * - **Slots.** Ground effects under the fog, air effects above it, screen-space pictures on
 *   top, auras inside their token's container (and gone while the token isn't drawn), weather
 *   shaders as a filter on the map's container.
 * - **Frames.** The runtime advances its instances from Pixi's `onRender` of a node in each
 *   slot (so a frame drawn for any reason moves them), and holds one render lease on the
 *   scheduler while anything animates: idle = no lease = no frames.
 * - **Budget.** Each instance's cost is estimated from its manifest; heavy scenes and slow
 *   frames step a degrade level (fewer particles, slower flipbooks, no crossfade, smaller
 *   filters); the `effects` quality setting (`off` / `low` / `full`) sets the floor.
 *
 * @see ../../../../docs/architecture.md "effects runtime"
 */
import { Container, Matrix, Point, type Renderer, type Texture } from 'pixi.js';
import type { EffectAnchor, OneShot, PlacedEffect } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { degradeFor, estimateCost, floorLevel, FrameGovernor, MAX_DEGRADE, sumCosts, TABLE_SQUARES, type CostEstimate, type EffectsQuality } from './budget.ts';
import { planPlaced, runningRecord, ShotTracker, type RunningPlaced } from './diff.ts';
import type { EffectInstance, FrameContext } from './instances/base.ts';
import { createInstance } from './instances/create.ts';
import { builtinSeconds, createBuiltin, isBuiltin } from './instances/screen.ts';
import { ShaderInstance } from './instances/shader.ts';
import { isOneShot, playSeconds } from './manifest.ts';
import { hashSeed } from './particle-sim.ts';
import { pixiTextureIO } from './pixi-assets.ts';
import { EffectRegistry, type EffectBundle } from './registry.ts';

/** Where effects draw — given by the renderer (`docs/architecture.md` "rendering", layer order). */
export interface EffectSlots {
  /** `fx.ground`: world space, under the fog. */
  ground: Container;
  /** `fx.air`: world space, above the fog. */
  air: Container;
  /** `fx.screen`: screen space, on top of everything. */
  screen: Container;
  /**
   * A token's container (origin at the token's centre, world units), or null while the token
   * isn't drawn — hidden on the players' screen, removed, or waiting in the list.
   */
  token(id: string): Container | null;
  /** Where weather shaders go as a filter: the map's container (they read the map). */
  filterTarget?: Container | null;
  /** World units per square in `ground`/`air`/token containers (default 1). */
  unitsPerSquare?: number;
  /** Offsets the whole world by screen px (the `screen-shake` one-shot); (0, 0) puts it back. */
  shake?(dx: number, dy: number): void;
}

/** Options of {@link createEffectsRuntime}. */
export interface EffectsRuntimeOptions {
  /** Which screen: the players' TV or the DM's companion. */
  profile: 'players' | 'dm';
  /** The render-on-demand loop (leases while effects animate). */
  scheduler: { hold(name: string): () => void; invalidate(): void };
  /** The logger (area `effects`). */
  log: Logger;
  /** Where the library is served (default `/app/effects/`). */
  baseUrl?: string;
  /** A registry to use (tests, a shared one); default: made here with Pixi's loader. */
  registry?: EffectRegistry<Texture>;
  /** Texture byte budget — the renderer hands its share of the screen's budget (rv#17); default 28 MB on the TV (32 minus fog/tokens/text), 92 MB on the companion. */
  budgetBytes?: number;
  /** The quality setting at start (default `full`). */
  quality?: EffectsQuality;
  /** Epoch-ms clock for shot ages (default `Date.now`). */
  now?: () => number;
  /** Monotonic ms clock that animations run on (default `performance.now`; tests step it). */
  frameClock?: () => number;
}

/** What the runtime reports (the bench, the log). */
export interface EffectsStats {
  /** Running lasting effects. */
  placed: number;
  /** Playing one-shots. */
  shots: number;
  /** Instances that animate. */
  animating: number;
  /** Effects still loading. */
  loading: number;
  /** Their estimated cost together. */
  cost: CostEstimate;
  /** Texture bytes held by the registry (in use + cached). */
  textureBytes: number;
  /** Texture bytes in use. */
  textureBytesInUse: number;
  /** Current degrade level (0 = full). */
  degrade: number;
  /** Smoothed frame interval while animating, ms. */
  frameMs: number;
  /** Frames the runtime advanced. */
  frames: number;
  /** The quality setting. */
  quality: EffectsQuality;
}

/** The running runtime. */
export interface EffectsRuntime {
  /**
   * Matches what runs to the state. Call on every state change of the map on the table.
   *
   * @param effects - the map's lasting effects (`MapPlay.effects`)
   * @param shots - the live one-shots (`live.shots`)
   * @param now - this screen's clock, epoch ms
   * @param enabled - the game's `effects` setting (default true)
   */
  update(effects: readonly PlacedEffect[], shots: readonly OneShot[], now: number, enabled?: boolean): void;
  /**
   * Sets this screen's quality: `off` stops everything, `low` starts degraded.
   *
   * @param q - the setting
   */
  setQuality(q: EffectsQuality): void;
  /** What runs and what it costs. */
  stats(): EffectsStats;
  /** Frees cached textures no running effect uses (a map left the table). */
  dropUnused(): void;
  /**
   * The running effects' cost in the renderer's terms (its bench reads it).
   *
   * @returns draw calls, texture bytes held, instances
   */
  cost(): { drawCalls: number; textureBytes: number; instances: number };
  /** The registry (the companion's picker reads the catalogue from it). */
  readonly registry: EffectRegistry<Texture>;
  /** Stops everything, frees everything. */
  destroy(): void;
}

/** One running (or loading) effect. */
interface Running {
  id: string;
  effect: string;
  kind: 'placed' | 'shot';
  anchor: EffectAnchor;
  params: PlacedEffect['params'];
  record: RunningPlaced | null;
  bundle: EffectBundle<Texture> | null;
  inst: EffectInstance | null;
  /** The frame clock at t = 0. */
  startedAt: number;
  speed: number;
  /** A placed one-shot replays after a pause. */
  replay: boolean;
  /** Cancelled while loading. */
  cancelled: boolean;
  /** Finished, waiting to restart (placed) or to be removed (shot). */
  idle: boolean;
  /** The container it is parented to. */
  parent: Container | null;
  cost: CostEstimate;
}

const LIGHT_IDS = /torch|brazier|campfire|candle|lantern|light|bonfire|fire-pit/;
const REPLAY_PAUSE_S = 1;

/**
 * Starts the effects runtime on the renderer's slots.
 *
 * @param slots - where effects draw
 * @param opts - profile, scheduler, logger and limits
 * @returns the runtime
 */
export function createEffectsRuntime(slots: EffectSlots, opts: EffectsRuntimeOptions): EffectsRuntime {
  const log = opts.log;
  const ups = slots.unitsPerSquare ?? 1;
  const clock = opts.now ?? (() => Date.now());
  const frameClock = opts.frameClock ?? (() => performance.now());
  const ownRegistry = !opts.registry;
  const registry =
    opts.registry ??
    new EffectRegistry<Texture>({
      baseUrl: opts.baseUrl ?? '/app/effects/',
      budgetBytes: opts.budgetBytes ?? (opts.profile === 'players' ? 28 : 92) * 1024 * 1024,
      log,
      ...pixiTextureIO(),
    });
  const running = new Map<string, Running>();
  const tracker = new ShotTracker();
  const pendingShots = new Set<string>();
  const governor = new FrameGovernor();
  let quality: EffectsQuality = opts.quality ?? 'full';
  governor.setFloor(floorLevel(quality));
  let costLevel = 0;
  let release: (() => void) | null = null;
  let lastTick = -1;
  let frames = 0;
  let destroyed = false;
  let warnedNoTarget = false;
  const lights = new Float32Array(32);
  let lightCount = 0;
  let effectsOn = true;
  let lastEnabled = true;
  let lastEffects: readonly PlacedEffect[] = [];
  let lastShots: readonly OneShot[] = [];

  // Per-frame scratch (no allocation in the loop).
  const m = new Matrix();
  const p0 = new Point();
  const p1 = new Point();
  const ctx: FrameContext = {
    degrade: degradeFor(governor.level),
    view: { x: 0, y: 0, w: 34, h: 19 },
    squarePx: 56,
    originX: 0,
    originY: 0,
    screenW: 1920,
    screenH: 1080,
    resolution: 1,
  };

  // The clock nodes: Pixi calls onRender on them during every render.
  const clocks = [slots.ground, slots.air, slots.screen].map((slot) => {
    const node = new Container({ label: 'fx:clock' });
    node.onRender = (r: Renderer) => tick(r);
    slot.addChild(node);
    return node;
  });

  function keyOf(kind: Running['kind'], id: string): string {
    return `${kind}:${id}`;
  }

  function slotFor(r: Running): Container | null {
    const man = r.bundle!.manifest;
    if (r.anchor.kind === 'token') return slots.token(r.anchor.tokenId);
    if (man.technique === 'texture' && r.anchor.kind === 'global') return slots.screen;
    const layer = r.params.layer === 'ground' || r.params.layer === 'air' ? r.params.layer : man.layer;
    return layer === 'ground' ? slots.ground : slots.air;
  }

  function start(r: Running): void {
    running.set(keyOf(r.kind, r.id), r);
    if (isBuiltin(r.effect)) {
      const inst = createBuiltin(r.effect, r.params, (dx, dy) => slots.shake?.(dx, dy));
      r.inst = inst;
      r.cost = inst.cost;
      r.startedAt = frameClock();
      r.parent = slots.screen;
      slots.screen.addChild(inst.root);
      log.info('effects', 'Shot playing', { id: r.id, effect: r.effect });
      syncLease();
      opts.scheduler.invalidate();
      return;
    }
    const t0 = performance.now();
    registry.acquire(r.effect).then(
      (bundle) => {
        if (r.cancelled || destroyed) {
          registry.release(r.effect);
          return;
        }
        r.bundle = bundle;
        try {
          const inst = createInstance({
            bundle,
            anchor: r.anchor,
            params: r.params,
            seed: hashSeed(r.id),
            unitsPerSquare: ups,
            filterTarget: slots.filterTarget ?? null,
            phase: 0,
          });
          if (inst instanceof ShaderInstance && !inst.attached && !warnedNoTarget) {
            warnedNoTarget = true;
            log.warn('effects', 'Weather shader without a filter target — not drawn', { effect: r.effect });
          }
          r.inst = inst;
          r.cost = inst.cost;
          r.replay = r.kind === 'placed' && isOneShot(bundle.manifest, partManifests(bundle));
          r.startedAt = frameClock();
          reparent(r);
          refreshLights();
          refreshBudget();
          log.info('effects', r.kind === 'shot' ? 'Shot playing' : 'Effect started', {
            id: r.id,
            effect: r.effect,
            anchor: r.anchor.kind,
            technique: bundle.manifest.technique,
            ms: Math.round(performance.now() - t0),
            drawCalls: inst.cost.drawCalls,
            textureBytes: inst.cost.textureBytes,
          });
          syncLease();
          opts.scheduler.invalidate();
        } catch (err) {
          log.error('effects', 'Effect could not start', { id: r.id, effect: r.effect, error: String(err) });
          stop(r);
        }
      },
      (err: unknown) => {
        log.error('effects', 'Effect could not load', { id: r.id, effect: r.effect, error: String(err) });
        // A lasting effect keeps its record so the same state doesn't retry every update (a
        // change of the effect retries); a shot is simply over.
        if (r.kind === 'shot') running.delete(keyOf(r.kind, r.id));
      },
    );
  }

  function stop(r: Running): void {
    r.cancelled = true;
    running.delete(keyOf(r.kind, r.id));
    if (r.inst) {
      r.inst.destroy();
      r.inst = null;
    }
    if (r.bundle) {
      registry.release(r.effect);
      r.bundle = null;
    }
    refreshLights();
    refreshBudget();
    syncLease();
    opts.scheduler.invalidate();
  }

  function reparent(r: Running): void {
    if (!r.inst || !r.bundle) return;
    const want = slotFor(r);
    if (want === r.parent) return;
    if (want) want.addChild(r.inst.root);
    else r.inst.root.removeFromParent();
    r.parent = want;
  }

  function partManifests(b: EffectBundle<Texture>): Map<string, EffectBundle<Texture>['manifest']> {
    const out = new Map<string, EffectBundle<Texture>['manifest']>();
    const walk = (x: EffectBundle<Texture>) => {
      for (const [id, pb] of x.parts) {
        out.set(id, pb.manifest);
        walk(pb);
      }
    };
    walk(b);
    return out;
  }

  /** The light pools of the night shader: placed fire and light effects at points. */
  function refreshLights(): void {
    lightCount = 0;
    for (const r of running.values()) {
      if (lightCount >= 8) break;
      if (r.kind !== 'placed' || r.anchor.kind !== 'point' || !LIGHT_IDS.test(r.effect)) continue;
      const radius = typeof r.params.light === 'number' ? r.params.light : 4;
      lights.set([r.anchor.x, r.anchor.y, radius, 1], lightCount * 4);
      lightCount++;
    }
    for (const r of running.values()) if (r.inst instanceof ShaderInstance && r.inst.usesLights) r.inst.setLights(lights, lightCount);
  }

  /** A degrade floor from what the scene asks for, before any frame is slow. */
  function refreshBudget(): void {
    const cost = sumCosts([...running.values()].map((r) => r.cost));
    let filters = 0;
    for (const r of running.values()) if (r.bundle?.manifest.shader?.apply === 'filter') filters++;
    let level = 0;
    if (cost.fillSquares > TABLE_SQUARES * 3 || cost.particles > 1500 || filters > 1) level = 1;
    if (cost.fillSquares > TABLE_SQUARES * 6 || cost.particles > 3000 || filters > 2) level = 2;
    if (level !== costLevel) {
      log.info('effects', 'Scene budget level', { level, fillSquares: Math.round(cost.fillSquares), particles: cost.particles, filters, drawCalls: cost.drawCalls });
      costLevel = level;
    }
    ctx.degrade = degradeFor(Math.min(MAX_DEGRADE, Math.max(governor.level, costLevel)));
  }

  function animatingCount(): number {
    let n = 0;
    for (const r of running.values()) if (r.inst && !r.idle && r.inst.animates && r.parent) n++;
    // A finished placed one-shot waits for its replay: that needs frames too.
    for (const r of running.values()) if (r.inst && r.idle && r.replay) n++;
    return n;
  }

  function syncLease(): void {
    const need = !destroyed && animatingCount() > 0;
    if (need && !release) release = opts.scheduler.hold('effects');
    else if (!need && release) {
      release();
      release = null;
      opts.scheduler.invalidate();
    }
  }

  function measure(r: Renderer): void {
    ctx.screenW = r.screen.width;
    ctx.screenH = r.screen.height;
    ctx.resolution = r.resolution;
    slots.ground.getGlobalTransform(m, false);
    ctx.squarePx = Math.hypot(m.a, m.b) * ups;
    ctx.originX = m.tx;
    ctx.originY = m.ty;
    // The visible rect in squares: the screen's corners mapped back into the ground slot.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 4; i++) {
      p0.set(i & 1 ? ctx.screenW : 0, i & 2 ? ctx.screenH : 0);
      m.applyInverse(p0, p1);
      if (p1.x < minX) minX = p1.x;
      if (p1.y < minY) minY = p1.y;
      if (p1.x > maxX) maxX = p1.x;
      if (p1.y > maxY) maxY = p1.y;
    }
    ctx.view.x = minX / ups;
    ctx.view.y = minY / ups;
    ctx.view.w = Math.max(1, (maxX - minX) / ups);
    ctx.view.h = Math.max(1, (maxY - minY) / ups);
  }

  function tick(r: Renderer): void {
    const now = frameClock();
    if (destroyed || now - lastTick < 2) return;
    const dtMs = lastTick < 0 ? 16.7 : now - lastTick;
    lastTick = now;
    if (running.size === 0) return;
    frames++;
    measure(r);
    if (release && governor.frame(dtMs)) {
      log.warn('effects', 'Frame budget level', { level: governor.level, avgMs: Math.round(governor.avgMs * 10) / 10 });
    }
    ctx.degrade = degradeFor(Math.min(MAX_DEGRADE, Math.max(governor.level, costLevel)));
    const dt = Math.min(0.1, dtMs / 1000);
    let changed = false;
    for (const run of running.values()) {
      const inst = run.inst;
      if (!inst) continue;
      if (run.anchor.kind === 'token') {
        const before = run.parent;
        reparent(run);
        if (before !== run.parent) changed = true;
      }
      if (!run.parent) {
        // A shot on a token that isn't drawn has nothing to show.
        if (run.kind === 'shot') {
          run.idle = true;
          changed = true;
        }
        continue;
      }
      const t = ((now - run.startedAt) / 1000) * run.speed;
      if (run.idle) {
        if (run.replay && t > 0) {
          run.idle = false;
          inst.root.visible = true;
        } else continue;
      }
      if (!inst.update(Math.max(0, t), dt, ctx)) {
        run.idle = true;
        changed = true;
        if (run.replay) run.startedAt = now + REPLAY_PAUSE_S * 1000;
      }
    }
    if (changed) {
      for (const run of [...running.values()]) {
        if (run.kind === 'shot' && run.idle) {
          log.debug('effects', 'Shot ended', { id: run.id, effect: run.effect });
          stop(run);
        }
      }
      syncLease();
    }
  }

  function startShot(shot: OneShot, now: number): void {
    if (isBuiltin(shot.effect)) {
      const verdict = tracker.judge(shot, now, builtinSeconds(shot.effect, shot.params) * 1000);
      if (verdict === 'play') start(newRunning('shot', shot.id, shot.effect, shot.anchor, shot.params));
      return;
    }
    pendingShots.add(shot.id);
    registry.manifestTree(shot.effect).then(
      ({ manifest, parts }) => {
        pendingShots.delete(shot.id);
        if (destroyed) return;
        const verdict = tracker.judge(shot, now, playSeconds(manifest, parts) * 1000);
        if (verdict !== 'play') {
          log.debug('effects', 'Shot skipped', { id: shot.id, effect: shot.effect, verdict, ageMs: now - shot.at });
          return;
        }
        if (!effectsOn) return;
        start(newRunning('shot', shot.id, shot.effect, shot.anchor, shot.params));
      },
      (err: unknown) => {
        pendingShots.delete(shot.id);
        tracker.remember(shot.id);
        log.error('effects', 'Shot could not load', { id: shot.id, effect: shot.effect, error: String(err) });
      },
    );
  }

  function newRunning(kind: Running['kind'], id: string, effect: string, anchor: EffectAnchor, params: PlacedEffect['params']): Running {
    const speed = typeof params.speed === 'number' && params.speed > 0 ? params.speed : 1;
    return {
      id,
      effect,
      kind,
      anchor,
      params,
      record: null,
      bundle: null,
      inst: null,
      startedAt: frameClock(),
      speed,
      replay: false,
      cancelled: false,
      idle: false,
      parent: null,
      cost: { drawCalls: 0, textureBytes: 0, fillSquares: 0, particles: 0 },
    };
  }

  function update(effects: readonly PlacedEffect[], shots: readonly OneShot[], now: number, enabled = true): void {
    if (destroyed) return;
    lastEffects = effects;
    lastShots = shots;
    lastEnabled = enabled;
    const on = enabled && quality !== 'off';
    if (on !== effectsOn) log.info('effects', on ? 'Effects on' : 'Effects off', { quality, enabled });
    effectsOn = on;
    if (!on) {
      for (const r of [...running.values()]) stop(r);
      // Shots made while off never play later.
      for (const s of shots) tracker.remember(s.id);
      return;
    }
    // Lasting effects.
    const records = new Map<string, RunningPlaced>();
    for (const r of running.values()) if (r.kind === 'placed' && r.record) records.set(r.id, r.record);
    const plan = planPlaced(records, effects);
    for (const id of plan.stop) {
      const r = running.get(keyOf('placed', id));
      if (r) stop(r);
    }
    for (const placed of plan.start) {
      const r = newRunning('placed', placed.id, placed.effect, placed.anchor, placed.params);
      r.record = runningRecord(placed);
      start(r);
    }
    for (const ch of plan.change) {
      const r = running.get(keyOf('placed', ch.placed.id));
      if (!r) continue;
      r.anchor = ch.placed.anchor;
      r.params = ch.placed.params;
      r.record = runningRecord(ch.placed);
      r.speed = typeof r.params.speed === 'number' && r.params.speed > 0 ? r.params.speed : 1;
      if (r.inst) {
        r.inst.setParams(r.anchor, r.params);
        reparent(r);
        if (r.bundle) r.cost = estimateCost(r.bundle.manifest, partManifests(r.bundle));
      }
    }
    if (plan.start.length || plan.stop.length || plan.change.length) {
      refreshLights();
      opts.scheduler.invalidate();
    }
    // One-shots.
    const wall = now || clock();
    for (const s of shots) {
      if (tracker.has(s.id) || pendingShots.has(s.id)) continue;
      startShot(s, wall);
    }
  }

  log.info('effects', 'Effects runtime ready', { profile: opts.profile, quality, unitsPerSquare: ups, filterTarget: Boolean(slots.filterTarget) });

  return {
    registry,
    update,
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      governor.setFloor(floorLevel(q));
      log.info('effects', 'Quality set', { quality: q });
      update(lastEffects, lastShots, clock(), lastEnabled);
    },
    stats() {
      let shotsN = 0;
      let placedN = 0;
      let loading = 0;
      for (const r of running.values()) {
        if (!r.inst) loading++;
        else if (r.kind === 'shot') shotsN++;
        else placedN++;
      }
      const cost = sumCosts([...running.values()].map((r) => r.cost));
      return {
        placed: placedN,
        shots: shotsN,
        animating: animatingCount(),
        loading,
        cost,
        textureBytes: registry.bytes,
        textureBytesInUse: registry.bytesInUse,
        degrade: ctx.degrade.level,
        frameMs: Math.round(governor.avgMs * 10) / 10,
        frames,
        quality,
      };
    },
    cost() {
      let instances = 0;
      for (const r of running.values()) if (r.inst) instances++;
      return { drawCalls: sumCosts([...running.values()].map((r) => r.cost)).drawCalls, textureBytes: registry.bytes, instances };
    },
    dropUnused() {
      registry.dropUnused();
    },
    destroy() {
      if (destroyed) return;
      for (const r of [...running.values()]) stop(r);
      destroyed = true;
      if (release) {
        release();
        release = null;
      }
      for (const c of clocks) c.destroy();
      if (ownRegistry) registry.destroy();
      log.info('effects', 'Effects runtime destroyed');
    },
  };
}
