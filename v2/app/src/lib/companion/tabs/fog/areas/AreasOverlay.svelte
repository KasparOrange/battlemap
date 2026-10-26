<!--
  AreasOverlay — the Fog tab's DM-only drawing over the companion's map (the tab's `overlay`):
  every reveal area's outline (a dashed hairline round its squares) with its name at its centre,
  the selected area in gold, and while an area is drawn or edited its squares filled
  gold-translucent plus the outline in progress (corners, the line so far). Pointer events pass
  through to the map.

  Cheap by construction: outlines are SVG paths in map squares, built only when the areas or the
  draft change; the camera only rewrites one transform on the group (and the few labels'
  positions) — nothing is rebuilt per frame or per pan.

  Props:
  - ctx: GameContext — the game screen's context (map, camera)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { maskCells, type Camera, type Point, type RevealArea } from '@battlemap/shared';
  import type { GameContext } from '../../../game/tabs.ts';
  import { squaresToScreen } from '../../../../render/camera.ts';
  import { areasLocal } from './local.svelte.ts';
  import { areaCentre, areaLabel, boundaryLoops, loopsToPath } from './logic.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const NONE: readonly RevealArea[] = [];

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
    const stop = ctx.camera.onChange((c) => (cam = c));
    return () => {
      ro.disconnect();
      stop();
    };
  });

  $effect(() => {
    const c = ctx.camera.get();
    if (c && (!cam || c.centerX !== cam.centerX || c.centerY !== cam.centerY || c.zoom !== cam.zoom || c.quarterTurns !== cam.quarterTurns)) cam = c;
  });

  const areas = $derived(ctx.map.areas ?? NONE);
  const cols = $derived(ctx.map.info.grid.cols);
  const cells = $derived(ctx.map.info.grid.cols * ctx.map.info.grid.rows);
  const draft = $derived(areasLocal.draft);

  /** Outline and label anchor of every area, in squares — rebuilt only when the areas change. */
  const shapes = $derived(
    areas.map((a, i) => {
      const own = maskCells(a.cells, cells);
      return { id: a.id, d: loopsToPath(boundaryLoops(own, cols)), centre: areaCentre(own, cols), label: areaLabel(a, i) };
    }),
  );

  const draftPath = $derived(draft ? loopsToPath(boundaryLoops(draft.cells, cols)) : '');
  const polyPoints = $derived(draft ? draft.poly.map((p) => `${p.x},${p.y}`).join(' ') : '');

  /** Squares → host px as one SVG matrix (from where the corners (0,0), (1,0), (0,1) land). */
  const transform = $derived.by(() => {
    if (!cam) return '';
    const o = squaresToScreen(cam, size, { x: 0, y: 0 });
    const x = squaresToScreen(cam, size, { x: 1, y: 0 });
    const y = squaresToScreen(cam, size, { x: 0, y: 1 });
    return `matrix(${x.x - o.x} ${x.y - o.y} ${y.x - o.x} ${y.y - o.y} ${o.x} ${o.y})`;
  });

  function at(p: Point): Point {
    return cam ? squaresToScreen(cam, size, p) : { x: -999, y: -999 };
  }
</script>

<svg bind:this={svg} class="areas" width={size.width} height={size.height} data-testid="areas-overlay" aria-hidden="true">
  {#if cam}
    <g {transform}>
      {#each shapes as s (s.id)}
        {#if !(draft && draft.id === s.id)}
          <path class="outline" class:selected={areasLocal.selected === s.id} d={s.d} />
        {/if}
      {/each}
      {#if draft}
        <path class="draft" d={draftPath} data-testid="area-draft" />
        {#if draft.poly.length > 0}
          <polyline class="poly" points={polyPoints} />
          {#each draft.poly as p, i (i)}
            <circle class="corner" class:first={i === 0} cx={p.x} cy={p.y} r="0.14" />
          {/each}
        {/if}
      {/if}
    </g>
    {#each shapes as s (s.id)}
      {#if s.centre && !(draft && draft.id === s.id)}
        {@const p = at(s.centre)}
        <text class="label" class:selected={areasLocal.selected === s.id} x={p.x} y={p.y} text-anchor="middle" dominant-baseline="middle">{s.label}</text>
      {/if}
    {/each}
  {/if}
</svg>

<style>
  .areas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }

  .outline {
    fill: none;
    fill-rule: evenodd;
    stroke: var(--t2);
    stroke-width: 1.5;
    stroke-dasharray: 6 5;
    vector-effect: non-scaling-stroke;
  }

  .outline.selected {
    fill: color-mix(in srgb, var(--accent) 12%, transparent);
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-dasharray: none;
  }

  .draft {
    fill: color-mix(in srgb, var(--accent) 28%, transparent);
    fill-rule: evenodd;
    stroke: var(--accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .poly {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-dasharray: 8 5;
    vector-effect: non-scaling-stroke;
  }

  .corner {
    fill: var(--accent);
    stroke: var(--bg);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .corner.first {
    fill: var(--bg);
    stroke: var(--accent);
    stroke-width: 2.5;
  }

  .label {
    font: 600 var(--fs-small) / 1 var(--font-value);
    fill: var(--t);
    paint-order: stroke;
    stroke: color-mix(in srgb, var(--bg) 85%, transparent);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .label.selected {
    fill: var(--accent);
  }
</style>
