<!--
  Bench — the renderer bench page (bench.html). Runs named scenes of `lib/render/bench-scenes.ts`
  (and the effects package's `effectsBenchScenes`, when it exports them) through the real table
  view and measures each: fps average and 1 % low (rAF deltas), frame-time p95/max, CPU ms per
  frame (tickers + render, the bench's own state building excluded), draw calls per frame
  (counted on the WebGL context), GPU ms when the driver has a timer query, texture MB (the
  renderer's own accounting), JS heap and its growth, and idle frames after the scene stops
  (must be 0). One summary line per scene goes to the log (area `bench`), so a run on the TV
  box can be read from MwLog afterwards; `window.__bench` holds the results for Playwright.

  URL: `?scene=all|<id>[,<id>]` `&profile=players|dm` `&seconds=8` `&warmup=1` `&fx=all|none|<id>`.
  No props.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { RootState } from '@battlemap/shared';
  import { log } from './lib/log.ts';
  import { createTableView, type EffectsFactory, type TableView, type ViewProfile } from './lib/render/index.ts';
  import { activeMap, benchFiles, benchMap, benchScenes, gameOn, showcase, withMap, type BenchScene } from './lib/render/bench-scenes.ts';

  /** One scene's numbers. */
  interface Result {
    id: string;
    name: string;
    frames: number;
    fpsAvg: number;
    fpsLow1: number;
    frameP95Ms: number;
    frameMaxMs: number;
    cpuAvgMs: number;
    cpuP95Ms: number;
    drawCalls: number;
    gpuMs: number | null;
    textureMb: number;
    heapMb: number | null;
    heapGrowthMbPerS: number | null;
    idleFrames: number;
    loadMs: number;
    error?: string;
  }

  interface FxScene {
    id: string;
    name: string;
    placed(map: { cols: number; rows: number }): import('@battlemap/shared').PlacedEffect[];
    shotEveryMs: number;
    shots(map: { cols: number; rows: number }, beat: number, now: number): import('@battlemap/shared').OneShot[];
  }
  interface FxModule {
    createEffectsRuntime?: EffectsFactory;
    effectsBenchScenes?: readonly FxScene[];
  }

  const fxModules = import.meta.glob<FxModule>('./lib/effects/index.ts');

  const params = new URL(location.href).searchParams;
  const profile: ViewProfile = params.get('profile') === 'dm' ? 'dm' : 'players';
  const seconds = Number(params.get('seconds') ?? 8);
  const warmup = Number(params.get('warmup') ?? 1);
  const sceneParam = params.get('scene') ?? 'all';
  const fxParam = params.get('fx') ?? 'all';

  let host: HTMLDivElement | undefined = $state();
  let status = $state('starting the renderer…');
  let results: Result[] = $state([]);
  let gpuName = $state('');

  const w = window as unknown as { __bench?: { done: boolean; results: Result[]; gpu: string; profile: string; error?: string } };
  w.__bench = { done: false, results: [], gpu: '', profile };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Counts draw calls on the context (every draw entry point). */
  function countDraws(gl: WebGL2RenderingContext): { take(): number } {
    let n = 0;
    const g = gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const orig = g[name];
      if (typeof orig !== 'function') continue;
      g[name] = function (this: unknown, ...a: unknown[]) {
        n++;
        return orig.apply(this, a);
      };
    }
    return { take: () => { const v = n; n = 0; return v; } };
  }

  /** GPU time per frame via EXT_disjoint_timer_query_webgl2, when the driver has it. */
  function gpuTimer(gl: WebGL2RenderingContext) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    let active: WebGLQuery | null = null;
    const pending: WebGLQuery[] = [];
    const samples: number[] = [];
    return {
      available: !!ext,
      frame() {
        if (!ext) return;
        if (active) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(active);
          active = null;
        }
        while (pending.length && gl.getQueryParameter(pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
          const q = pending.shift()!;
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(ns / 1e6);
          gl.deleteQuery(q);
        }
        if (pending.length < 8) {
          active = gl.createQuery();
          if (active) gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
        }
      },
      stop() {
        if (ext && active) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.deleteQuery(active);
          active = null;
        }
      },
      take(): number | null {
        if (!samples.length) return null;
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        samples.length = 0;
        return avg;
      },
    };
  }

  function percentile(a: Float64Array, n: number, p: number): number {
    const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  }

  function heapMb(): number | null {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? m.usedJSHeapSize / 2 ** 20 : null;
  }

  const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

  /** Runs one scene through the view and measures it. */
  async function runScene(view: TableView, scene: BenchScene, draws: { take(): number }, gpu: ReturnType<typeof gpuTimer>, vp: { width: number; height: number }): Promise<Result> {
    status = `${scene.id}: loading…`;
    const sched = view.scheduler!;
    let state: RootState = scene.setup(profile, vp, params);
    const t0 = performance.now();
    let shown = !state.game;
    const shownWait = new Promise<void>((resolve) => {
      shownResolve = resolve;
      if (shown) resolve();
    });
    view.update(state);
    await Promise.race([shownWait, sleep(90_000)]);
    shown = true;
    const loadMs = performance.now() - t0;
    await sleep(300);

    const cap = Math.ceil((seconds + warmup + 2) * 240);
    const deltas = new Float64Array(cap);
    const cpu = new Float64Array(cap);
    const drawn = new Float64Array(cap);
    let count = 0;
    let measuring = false;
    let last = -1;
    let n = 0;
    let stepMs = 0;
    const start = performance.now();
    let measureStart = 0;
    let heapStart: number | null = null;
    const stop = sched.onFrame((now) => {
      gpu.frame();
      const dc = draws.take();
      if (measuring && last >= 0 && count < cap) {
        deltas[count] = now - last;
        cpu[count] = Math.max(0, sched.lastRenderMs - stepMs);
        drawn[count] = dc;
        count++;
      }
      last = now;
      const s0 = performance.now();
      const t = now - start;
      if (profile === 'dm' && state.game && (scene.id === 'big-map' || scene.id === 'everything')) {
        const m = activeMap(state).info.grid;
        view.setDmCamera({ centerX: m.cols / 2 + Math.cos(t / 3000) * m.cols * 0.3, centerY: m.rows / 2 + Math.sin(t / 3000) * m.rows * 0.3, zoom: 60, quarterTurns: 0 });
      }
      const next = scene.step(state, { t, n: n++ });
      if (next) {
        state = next;
        view.update(state);
      }
      stepMs = performance.now() - s0;
    });
    const release = sched.hold('bench');
    await sleep(warmup * 1000);
    gpu.take();
    measuring = true;
    measureStart = performance.now();
    heapStart = heapMb();
    status = `${scene.id}: measuring ${seconds} s…`;
    await sleep(seconds * 1000);
    measuring = false;
    const elapsed = (performance.now() - measureStart) / 1000;
    const heapEnd = heapMb();
    release();
    stop();
    const gpuMs = gpu.take();

    status = `${scene.id}: idle check…`;
    await sleep(1200);
    const f0 = sched.frames;
    await sleep(2000);
    const idleFrames = sched.frames - f0;

    let sum = 0;
    for (let i = 0; i < count; i++) sum += deltas[i]!;
    const sorted = Array.from(deltas.subarray(0, count)).sort((a, b) => b - a);
    const slow = sorted.slice(0, Math.max(1, Math.ceil(count / 100)));
    const slowAvg = slow.reduce((a, b) => a + b, 0) / slow.length;
    let cpuSum = 0;
    let dcSum = 0;
    for (let i = 0; i < count; i++) {
      cpuSum += cpu[i]!;
      dcSum += drawn[i]!;
    }
    const st = view.stats();
    return {
      id: scene.id,
      name: scene.name,
      frames: count,
      fpsAvg: round(count / elapsed),
      fpsLow1: round(1000 / slowAvg),
      frameP95Ms: round(percentile(deltas, count, 0.95)),
      frameMaxMs: round(sorted[0] ?? 0),
      cpuAvgMs: round(cpuSum / Math.max(1, count), 2),
      cpuP95Ms: round(percentile(cpu, count, 0.95), 2),
      drawCalls: round(dcSum / Math.max(1, count)),
      gpuMs: gpuMs === null ? null : round(gpuMs, 2),
      textureMb: round(st.textures.total / 2 ** 20),
      heapMb: heapEnd === null ? null : round(heapEnd),
      heapGrowthMbPerS: heapEnd === null || heapStart === null ? null : round((heapEnd - heapStart) / elapsed, 2),
      idleFrames,
      loadMs: Math.round(loadMs),
    };
  }

  let shownResolve: (() => void) | null = null;

  /** The effects package's scenes as bench scenes on a 40 × 30 map. */
  function fxScenes(list: readonly FxScene[]): BenchScene[] {
    const size = { cols: 40, rows: 30 };
    return list
      .filter((s) => fxParam === 'all' || fxParam.split(',').includes(s.id))
      .map((fx) => {
        let beat = 0;
        let lastBeat = 0;
        return {
          id: `fx:${fx.id}`,
          name: `Effects: ${fx.name}`,
          effects: true,
          setup: (_p, vp) => gameOn(benchMap('fxmap', 40, 30, 64), vp, (m) => ({ ...m, fog: { ...m.fog, on: false }, effects: fx.placed(size) })),
          step: (s, f) => {
            if (!fx.shotEveryMs || f.t - lastBeat < fx.shotEveryMs) return null;
            lastBeat = f.t;
            const shots = [...s.live.shots, ...fx.shots(size, beat++, Date.now())].slice(-8);
            return { ...withMap(s, (m) => m), live: { ...s.live, shots } };
          },
        } satisfies BenchScene;
      });
  }

  onMount(() => {
    let view: TableView | null = null;
    let cancelled = false;
    (async () => {
      const load = Object.values(fxModules)[0];
      const fx: FxModule = load ? await load().catch((e: unknown) => { log.warn('bench', 'Effects module failed to load', { error: String(e) }); return {}; }) : {};
      view = createTableView(host!, {
        profile,
        log,
        files: benchFiles(),
        effects: fx.createEffectsRuntime,
        listenToShell: false,
        onEvent: (e) => {
          if (e.type === 'map-shown' || e.type === 'map-failed') shownResolve?.();
          if (e.type === 'map-failed') log.error('bench', 'Map failed', { error: e.error });
        },
      });
      await view.ready;
      if (cancelled || !host) return;
      const st = view.stats();
      gpuName = st.gpu ?? 'unknown GPU';
      w.__bench!.gpu = gpuName;
      const gl = host!.querySelector('canvas')!.getContext('webgl2') as WebGL2RenderingContext;
      const draws = countDraws(gl);
      const gpu = gpuTimer(gl);
      const vp = { width: host!.clientWidth, height: host!.clientHeight };
      let scenes: BenchScene[] = sceneParam === 'all' ? [...benchScenes] : [...benchScenes, showcase].filter((s) => sceneParam.split(',').includes(s.id));
      if (fx.effectsBenchScenes && fxParam !== 'none' && (sceneParam === 'all' || sceneParam.startsWith('fx'))) scenes = [...scenes, ...fxScenes(fx.effectsBenchScenes)];
      log.info('bench', 'Bench start', { profile, seconds, scenes: scenes.map((s) => s.id), gpu: gpuName, width: vp.width, height: vp.height, dpr: devicePixelRatio, gpuTimer: gpu.available });
      for (const scene of scenes) {
        if (cancelled) return;
        try {
          const res = await runScene(view, scene, draws, gpu, vp);
          results = [...results, res];
          log.info('bench', `Scene ${res.id}`, { ...res, profile, gpu: gpuName });
        } catch (e) {
          const res = { id: scene.id, name: scene.name, error: String(e) } as Result;
          results = [...results, res];
          log.error('bench', `Scene ${scene.id} failed`, { error: String(e) });
        }
      }
      gpu.stop();
      w.__bench = { done: true, results: $state.snapshot(results), gpu: gpuName, profile }; // plain objects: DevTools returnByValue turns proxies into {}
      status = `done — ${results.length} scenes`;
      log.info('bench', 'Bench done', { profile, gpu: gpuName, scenes: results.length });
    })().catch((e: unknown) => {
      status = `bench failed: ${String(e)}`;
      w.__bench = { done: true, results, gpu: gpuName, profile, error: String(e) };
      log.error('bench', 'Bench failed', { error: String(e) });
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  });
</script>

<div class="stage" bind:this={host}></div>
<div class="panel">
  <p data-testid="bench-result">{status} · {profile} · {gpuName}</p>
  {#if results.length}
    <table>
      <thead><tr><th>scene</th><th>fps</th><th>1 % low</th><th>p95 ms</th><th>CPU ms</th><th>draws</th><th>GPU ms</th><th>tex MB</th><th>idle</th></tr></thead>
      <tbody>
        {#each results as r (r.id)}
          <tr><td>{r.id}</td><td>{r.fpsAvg}</td><td>{r.fpsLow1}</td><td>{r.frameP95Ms}</td><td>{r.cpuAvgMs}</td><td>{r.drawCalls}</td><td>{r.gpuMs ?? '–'}</td><td>{r.textureMb}</td><td>{r.idleFrames}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .stage { position: fixed; inset: 0; background: #000; }
  .panel { position: fixed; left: 12px; bottom: 12px; margin: 0; font: 13px system-ui, sans-serif; color: #ddd; background: rgba(0, 0, 0, 0.7); padding: 8px 10px; border-radius: 8px; }
  .panel p { margin: 0 0 6px; }
  table { border-collapse: collapse; }
  td, th { padding: 1px 8px; text-align: right; }
  td:first-child, th:first-child { text-align: left; }
</style>
