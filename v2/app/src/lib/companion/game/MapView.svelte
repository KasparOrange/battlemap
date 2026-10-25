<!--
  MapView — the map on the companion: the DM's view of the table (renderer seam, or the sketch
  until the renderer is published) with the companion's gestures on it — one finger is the
  chosen tab's tool, two move the DM's own camera (input/). Fills its parent.

  Props:
  - ctx: GameScreenContext — the game screen's context (state, camera, geometry, selection)
  - tool: () => MapTool — the chosen tab's tool, read on every gesture
  - doors: () => boolean — whether door taps work in the chosen tab
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { log } from '../../log.ts';
  import { bindPointers, MapInputController } from '../input/map-input.ts';
  import type { GameScreenContext } from './context.svelte.ts';
  import { openTableView, type TableViewHandle } from './table-view.ts';
  import type { MapTool } from './tabs.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameScreenContext;
    /** The chosen tab's tool. */
    tool: () => MapTool;
    /** Whether door taps work in the chosen tab. */
    doors: () => boolean;
  }

  let { ctx, tool, doors }: Props = $props();

  let host = $state<HTMLDivElement>();
  let view = $state.raw<TableViewHandle | null>(null);

  $effect(() => {
    const state = ctx.session.view;
    if (view && state) view.update(state);
  });
  $effect(() => {
    const cam = ctx.cam;
    view?.setDmCamera(cam);
  });
  $effect(() => {
    view?.setOverlay?.({ geometry: ctx.geometry, selectedToken: ctx.selectedToken });
  });

  onMount(() => {
    const el = host!;
    let gone = false;
    const controller = new MapInputController({
      map: () => (ctx.session.view?.game ? ctx.map : null),
      geometry: () => ctx.geometry,
      camera: () => ctx.cam,
      setCamera: (c) => ctx.setCamera(c),
      viewport: () => ctx.viewport,
      tool,
      doors,
      dispatch: (c) => ctx.dispatch(c),
      log,
    });
    const unbind = bindPointers(el, controller);
    const measure = () => {
      const r = el.getBoundingClientRect();
      ctx.setViewport({ width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
      view?.resize?.();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    openTableView(el, { log, fileUrl: (ref) => ctx.fileUrl(ref) })
      .then((v) => {
        if (gone) v.destroy();
        else view = v;
      })
      .catch((e: unknown) => log.error('companion', 'Map view failed', { error: String(e) }));
    return () => {
      gone = true;
      unbind();
      observer.disconnect();
      view?.destroy();
      view = null;
    };
  });
</script>

<div class="map-view" bind:this={host} data-testid="map-view"></div>

<style>
  .map-view {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    cursor: crosshair;
  }
</style>
