/**
 * The effects demo page's script (development only): a minimal table stage — floor, effect
 * slots, two tokens — with the real effects runtime on it, driven by the URL. Used to look at
 * effects (alpha, blend, loop seams, scale in squares) and to time scenes in Chromium.
 *
 * @see ./index.html for the query parameters
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { OneShot, PlacedEffect } from '@battlemap/shared';
import { log } from '../../log.ts';
import { createRenderer } from '../../render/pixi.ts';
import { circleRegion } from '../anchors.ts';
import { effectsBenchScenes } from '../bench.ts';
import type { EffectsQuality } from '../budget.ts';
import { createEffectsRuntime, type EffectSlots } from '../runtime.ts';

const Q = new URLSearchParams(location.search);
const COLS = 34;
const ROWS = 19;
/** World units per square (the renderer's `SQUARE`). */
const UNIT = 64;

/** A dark stone floor with a square grid, drawn once. */
function floorTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = COLS * UNIT;
  c.height = ROWS * UNIT;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a342c';
  g.fillRect(0, 0, c.width, c.height);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${110 + rnd() * 60},${100 + rnd() * 50},${80 + rnd() * 40},${0.06 + rnd() * 0.1})`;
    g.beginPath();
    g.arc(rnd() * c.width, rnd() * c.height, 4 + rnd() * 30, 0, 7);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 2;
  for (let x = 0; x <= COLS; x++) {
    g.beginPath();
    g.moveTo(x * UNIT, 0);
    g.lineTo(x * UNIT, c.height);
    g.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    g.beginPath();
    g.moveTo(0, y * UNIT);
    g.lineTo(c.width, y * UNIT);
    g.stroke();
  }
  return Texture.from(c);
}

/** One effect per cell of a grid over the table, for `?only=`. */
function cells(ids: string[]): PlacedEffect[] {
  const cols = Math.ceil(Math.sqrt(ids.length * (COLS / ROWS)));
  const rows = Math.ceil(ids.length / cols);
  const w = COLS / cols;
  const h = ROWS / rows;
  return ids.map((id, i) => {
    const x = (i % cols) * w + w / 2;
    const y = Math.floor(i / cols) * h + h / 2;
    const r = Math.min(w, h) * 0.42;
    return { id: `cell-${i}`, effect: id, anchor: { kind: 'region', points: circleRegion(x, y, r, 24) }, params: { shape: 'circle' }, on: true };
  });
}

async function main(): Promise<void> {
  const host = document.getElementById('stage')!;
  const info = document.getElementById('info')!;
  const r = await createRenderer(host, { log, maxRenderHeight: 1080 });
  const world = r.world;
  const map = new Container({ label: 'map' });
  map.addChild(new Sprite(floorTexture()));
  const slots: EffectSlots = {
    ground: new Container({ label: 'fx.ground' }),
    air: new Container({ label: 'fx.air' }),
    screen: new Container({ label: 'fx.screen' }),
    unitsPerSquare: UNIT,
    filterTarget: map,
    token: (id) => tokenFx.get(id) ?? null,
  };
  const tokens = new Container({ label: 'tokens' });
  const tokenFx = new Map<string, Container>();
  for (const [id, x, y, colour] of [
    ['t1', 6.5, 9.5, 0x3d7bff],
    ['t2', 27.5, 9.5, 0xd2452f],
  ] as const) {
    const t = new Container({ label: id });
    t.position.set(x * UNIT, y * UNIT);
    const fx = new Container({ label: `${id}.fx` });
    t.addChild(fx, new Graphics().circle(0, 0, UNIT * 0.42).fill({ color: colour }).stroke({ color: 0xffffff, width: 4 }));
    tokens.addChild(t);
    tokenFx.set(id, fx);
  }
  world.addChild(map, slots.ground, tokens, slots.air);
  r.app.stage.addChild(slots.screen);

  const fit = () => {
    const s = Math.min(r.app.screen.width / (COLS * UNIT), r.app.screen.height / (ROWS * UNIT));
    world.scale.set(s);
    world.position.set((r.app.screen.width - COLS * UNIT * s) / 2, (r.app.screen.height - ROWS * UNIT * s) / 2);
    r.scheduler.invalidate();
  };
  fit();
  new ResizeObserver(fit).observe(host);

  if (Q.get('sync') === '1' && r.gl) {
    const gl = r.gl;
    const render = r.app.render.bind(r.app);
    r.app.render = ((...a: Parameters<typeof render>) => {
      render(...a);
      gl.finish();
    }) as typeof render;
  }

  const rt = createEffectsRuntime(slots, { profile: 'players', scheduler: r.scheduler, log, quality: (Q.get('quality') as EffectsQuality) ?? 'full' });
  const scene = effectsBenchScenes.find((s) => s.id === Q.get('scene'));
  const only = Q.get('only')?.split(',').filter(Boolean) ?? [];
  let placed: PlacedEffect[] = scene ? scene.placed({ cols: COLS, rows: ROWS }) : cells(only);
  if (Q.get('aura')) placed = [...placed, { id: 'aura', effect: Q.get('aura')!, anchor: { kind: 'token', tokenId: 't1' }, params: {}, on: true }];
  let shots: OneShot[] = [];
  let beat = 0;
  const fire = () => {
    if (!scene || !scene.shotEveryMs) return;
    shots = [...shots, ...scene.shots({ cols: COLS, rows: ROWS }, beat++, Date.now())].slice(-8);
    rt.update(placed, shots, Date.now());
  };
  rt.update(placed, shots, Date.now());
  fire();
  if (scene?.shotEveryMs) setInterval(fire, scene.shotEveryMs);

  // Timing probe: frame intervals and render CPU time over a window.
  const probe = { intervals: [] as number[], render: [] as number[], last: 0, on: false };
  r.scheduler.onFrame((now) => {
    if (!probe.on) return;
    if (probe.last) probe.intervals.push(now - probe.last);
    probe.last = now;
    probe.render.push(r.scheduler.lastRenderMs);
  });
  const pct = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]! * 10) / 10 : 0;
  };
  const w = window as unknown as Record<string, unknown>;
  w.fx = {
    stats: () => rt.stats(),
    frames: () => r.scheduler.frames,
    shoot: (shot: OneShot) => {
      shots = [...shots, shot].slice(-8);
      rt.update(placed, shots, Date.now());
    },
    /** Frame cost independent of the display rate: n frames drawn back to back, each finished on the GPU. */
    frameCost: (n: number) => {
      const gl = r.gl;
      const times: number[] = [];
      for (let i = 0; i < n; i++) {
        const until = performance.now() + 2.5; // the runtime advances once per ≥ 2 ms
        while (performance.now() < until) {
          /* wait */
        }
        const t0 = performance.now();
        r.app.render();
        gl?.finish();
        times.push(performance.now() - t0);
      }
      return { n, p50: pct(times, 0.5), p95: pct(times, 0.95), max: pct(times, 1) };
    },
    measure: (ms: number) =>
      new Promise((done) => {
        probe.intervals = [];
        probe.render = [];
        probe.last = 0;
        probe.on = true;
        setTimeout(() => {
          probe.on = false;
          done({ frames: probe.intervals.length, intervalP50: pct(probe.intervals, 0.5), intervalP95: pct(probe.intervals, 0.95), renderP50: pct(probe.render, 0.5), renderP95: pct(probe.render, 0.95), stats: rt.stats() });
        }, ms);
      }),
  };
  setInterval(() => {
    const s = rt.stats();
    info.textContent = `${scene?.name ?? only.join(', ')} · ${s.placed} placed, ${s.shots} shots, ${s.loading} loading · ${s.cost.drawCalls} draws · ${(s.textureBytes / 1048576).toFixed(1)} MB · degrade ${s.degrade} · ${s.frameMs} ms`;
  }, 500);
  w.ready = true;
}

main().catch((e: unknown) => {
  document.getElementById('info')!.textContent = `failed: ${String(e)}`;
  log.error('effects', 'Demo failed', { error: String(e) });
});
