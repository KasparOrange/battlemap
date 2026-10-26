<!--
  SecretsOverlay — the Secrets tab's DM-only drawing over the companion's map (the tab's
  `overlay`): a gold ring round the selected secret's square, so the DM sees which one the
  editor holds. The secrets themselves are drawn by the renderer (`render/secrets-layer.ts`) on
  every tab. Pointer events pass through; only the ring's position follows the camera.

  Props:
  - ctx: GameContext — the game screen's context (map, camera)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Camera } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { squaresToScreen } from '../../../render/camera.ts';
  import { secretsLocal } from './local.svelte.ts';

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

  const selected = $derived((ctx.map.secrets ?? []).find((s) => s.id === secretsLocal.selected) ?? null);
  const ring = $derived.by(() => {
    if (!selected || !cam) return null;
    const p = squaresToScreen(cam, size, { x: selected.col + 0.5, y: selected.row + 0.5 });
    return { x: p.x, y: p.y, r: Math.max(16, 0.62 * cam.zoom) };
  });
</script>

<svg bind:this={svg} class="secrets" width={size.width} height={size.height} data-testid="secrets-overlay" aria-hidden="true">
  {#if ring}
    <circle class="ring" cx={ring.x} cy={ring.y} r={ring.r} />
  {/if}
</svg>

<style>
  .secrets {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }

  .ring {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent));
  }
</style>
