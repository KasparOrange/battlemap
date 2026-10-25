<!--
  AimLayer — the Effects tab's DM-only drawing over the companion's map (the tab's `overlay`, mounted by the game screen):
  the aimed area before it is cast or placed (outline in the effect's damage colour, the squares
  it covers lightly filled, its size and square count), the area just cast fading out, and the
  outline of the selected placed effect. Pointer events pass through to the map. Redraws only
  when the aim, the selection or the camera changed.

  Props:
  - ctx: GameContext — the game screen's context (map, camera)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Camera, Point } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { squaresToScreen } from '../../../render/camera.ts';
  import { DAMAGE_COLORS } from './catalog.ts';
  import { FIRED_MS } from './actions.ts';
  import { effectsLocal } from './local.svelte.ts';
  import { aimRegion, coveredSquares, shapeWords, type Aim } from './shapes.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  let svg = $state<SVGSVGElement>();
  let size = $state({ width: 1, height: 1 });
  let cam = $state.raw<Camera | null>(null);

  onMount(() => {
    const host = svg!.parentElement!;
    const measure = () => {
      const w = Math.round(host.clientWidth);
      const h = Math.round(host.clientHeight);
      if (w !== size.width || h !== size.height) size = { width: w, height: h };
    };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    cam = ctx.camera.get();
    const control = ctx.camera as { onChange?: (fn: (c: Camera) => void) => () => void };
    const stop = control.onChange?.((c) => (cam = c));
    return () => {
      ro.disconnect();
      stop?.();
    };
  });

  // follow a camera that is reactive (the older context) as well as onChange
  $effect(() => {
    const c = ctx.camera.get();
    if (c && (!cam || c.centerX !== cam.centerX || c.centerY !== cam.centerY || c.zoom !== cam.zoom || c.quarterTurns !== cam.quarterTurns)) cam = c;
  });

  const chosen = $derived(effectsLocal.chosen);
  const color = $derived(chosen?.damage.map((d) => DAMAGE_COLORS[d]).find(Boolean) ?? 'var(--accent)');

  function pts(list: readonly Point[]): string {
    if (!cam) return '';
    return list.map((p) => { const s = squaresToScreen(cam!, size, p); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(' ');
  }

  function squaresPath(aim: Aim): string {
    if (!cam) return '';
    const { cols, rows } = ctx.map.info.grid;
    let d = '';
    for (const [c, r] of coveredSquares(aim, cols, rows)) {
      const a = squaresToScreen(cam, size, { x: c + 0.06, y: r + 0.06 });
      const b = squaresToScreen(cam, size, { x: c + 0.94, y: r + 0.06 });
      const e = squaresToScreen(cam, size, { x: c + 0.94, y: r + 0.94 });
      const f = squaresToScreen(cam, size, { x: c + 0.06, y: r + 0.94 });
      d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}L${e.x.toFixed(1)} ${e.y.toFixed(1)}L${f.x.toFixed(1)} ${f.y.toFixed(1)}Z`;
    }
    return d;
  }

  const aim = $derived(effectsLocal.aim);
  const aimView = $derived.by(() => {
    if (!aim || !cam) return null;
    const poly = aimRegion(aim);
    const top = poly.reduce((best, p) => (p.y < best.y ? p : best), poly[0]!);
    const label = squaresToScreen(cam, size, { x: aim.shape === 'circle' || aim.shape === 'cube' ? aim.origin.x : top.x, y: top.y });
    const n = coveredSquares(aim, ctx.map.info.grid.cols, ctx.map.info.grid.rows).length;
    const origin = squaresToScreen(cam, size, aim.origin);
    return { outline: pts(poly), squares: squaresPath(aim), label, text: `${shapeWords(aim.shape, aim.feet)} · ${n} ${n === 1 ? 'square' : 'squares'}`, origin };
  });

  const fired = $derived(effectsLocal.fired);
  const firedView = $derived(fired && cam ? { key: fired.at, outline: pts(aimRegion(fired.aim)) } : null);
  $effect(() => {
    if (!fired) return;
    const t = setTimeout(() => {
      if (effectsLocal.fired === fired) effectsLocal.fired = null;
    }, FIRED_MS);
    return () => clearTimeout(t);
  });

  const selected = $derived(effectsLocal.selectedId ? ctx.map.effects.find((e) => e.id === effectsLocal.selectedId) ?? null : null);
  const selectedView = $derived.by(() => {
    if (!selected || !cam) return null;
    const a = selected.anchor;
    const r = (sq: number) => Math.max(14, (sq / 2) * cam!.zoom);
    if (a.kind === 'region') return { kind: 'poly' as const, outline: pts(a.points) };
    if (a.kind === 'point') {
      const c = squaresToScreen(cam, size, a);
      return { kind: 'circle' as const, x: c.x, y: c.y, r: r(typeof selected.params.size === 'number' ? selected.params.size : 1) };
    }
    if (a.kind === 'token') {
      const t = ctx.map.tokens.find((t) => t.id === a.tokenId && t.placed);
      if (!t) return null;
      const c = squaresToScreen(cam, size, { x: t.col + 0.5, y: t.row + 0.5 });
      return { kind: 'circle' as const, x: c.x, y: c.y, r: r(typeof selected.params.size === 'number' ? selected.params.size : 2) };
    }
    return null;
  });
</script>

<svg bind:this={svg} class="aim" width={size.width} height={size.height} data-testid="effects-aim" aria-hidden="true" style:--aim={color}>
  {#if firedView}
    {#key firedView.key}
      <polygon class="fired" points={firedView.outline} />
    {/key}
  {/if}
  {#if selectedView}
    {#if selectedView.kind === 'poly'}
      <polygon class="selected" points={selectedView.outline} />
    {:else}
      <circle class="selected" cx={selectedView.x} cy={selectedView.y} r={selectedView.r} />
    {/if}
  {/if}
  {#if aimView}
    <g data-testid="effects-aim-area">
      <path class="squares" d={aimView.squares} />
      <polygon class="outline" points={aimView.outline} />
      <circle class="origin" cx={aimView.origin.x} cy={aimView.origin.y} r="4" />
      <text class="label" x={aimView.label.x} y={aimView.label.y - 12} text-anchor="middle">{aimView.text}</text>
    </g>
  {/if}
</svg>

<style>
  .aim {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }

  .squares {
    fill: color-mix(in srgb, var(--aim) 22%, transparent);
  }

  .outline {
    fill: color-mix(in srgb, var(--aim) 8%, transparent);
    stroke: var(--aim);
    stroke-width: 2.5;
    stroke-dasharray: 9 6;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--aim) 60%, transparent));
  }

  .origin {
    fill: var(--aim);
    stroke: var(--bg);
    stroke-width: 2;
  }

  .label {
    font: 600 var(--fs-small) / 1 var(--font-value);
    fill: var(--t);
    paint-order: stroke;
    stroke: color-mix(in srgb, var(--bg) 85%, transparent);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .selected {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 4 5;
  }

  .fired {
    fill: color-mix(in srgb, var(--aim) 30%, transparent);
    stroke: var(--aim);
    stroke-width: 3;
    animation: fired var(--fired-ms, 900ms) var(--ease-close, ease-out) forwards;
  }

  @keyframes fired {
    to {
      opacity: 0;
    }
  }
</style>
