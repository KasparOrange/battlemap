<!--
  MapView — the map on the companion: the renderer's DM view of the table (`render/`,
  `createTableView(host, { profile: 'dm' })`) with the companion's gestures on it — one finger is
  the chosen tab's tool, two move the DM's own camera (input/). The view owns the camera and the
  hit tests; files come from the device's cache (what this tablet uploaded is never downloaded
  again). While a map loads a small card says so over the map; failures become notices. Fills
  its parent.

  Props:
  - ctx: GameScreenContext — the game screen's context (state, camera, geometry, selection)
  - tool: () => MapTool — the chosen tab's tool, read on every gesture
  - doors: () => boolean — whether door taps work in the chosen tab
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { log } from '../../log.ts';
  import type { TableView, TableViewEvent } from '../../render/index.ts';
  import { files } from '../../storage/index.ts';
  import { wallsDebug } from '../session-settings/walls-debug.svelte.ts';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import { bindPointers, MapInputController } from '../input/map-input.ts';
  import type { GameScreenContext } from './context.svelte.ts';
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
  let view = $state.raw<TableView | null>(null);
  let failed = $state(false);

  $effect(() => {
    const state = ctx.session.view;
    if (view && state) untrack(() => ctx.draw(state));
  });
  $effect(() => {
    view?.setSelectedToken(ctx.selectedToken);
  });
  $effect(() => {
    view?.setDmLayersShown(ctx.showDmLayers);
  });
  $effect(() => {
    view?.setWallsShown(wallsDebug.on);
  });

  /** What the view reports: loading card, walls for the fog tools, failures as notices. */
  function onEvent(e: TableViewEvent): void {
    switch (e.type) {
      case 'map-loading':
        ctx.mapLoading = e.name;
        return;
      case 'map-shown':
        ctx.mapLoading = null;
        ctx.mapShown();
        return;
      case 'map-failed':
        ctx.mapLoading = null;
        log.warn('companion', 'Map picture not loaded', { error: e.error });
        notify("Couldn't load the map picture — check the connection.", { kind: 'error' });
        return;
      case 'geometry-loaded':
        if (view) ctx.geometry = view.geometry();
        return;
      case 'geometry-failed':
        notify("Couldn't load this map's walls and doors — Room and Circle ignore walls for now.", { kind: 'error' });
        return;
      case 'layer-failed':
        notify("A DM layer didn't load — hide and show it to try again.", { kind: 'warning' });
        return;
      case 'renderer-failed':
        failed = true;
        notify("This device can't draw the map (WebGL didn't start).", { kind: 'error' });
        return;
      default:
        return;
    }
  }

  onMount(() => {
    const el = host!;
    let gone = false;
    const controller = new MapInputController({
      map: () => (ctx.session.view?.game ? ctx.map : null),
      table: () => ctx.session.view?.table ?? null,
      view: () => view,
      tool,
      doors,
      dispatch: (c) => ctx.dispatch(c),
      log,
    });
    const unbind = bindPointers(el, controller);
    if (new URL(location.href).searchParams.get('debug') === '1') {
      // e2e hook: where a map point is on the page (client px), and the camera the view shows
      (window as unknown as Record<string, unknown>).__bmMap = {
        toClient: (x: number, y: number) => {
          const r = el.getBoundingClientRect();
          const p = view?.squaresToScreen({ x, y }) ?? { x: 0, y: 0 };
          return { x: r.left + p.x, y: r.top + p.y };
        },
        camera: () => view?.dmCamera() ?? null,
      };
    }
    void (async () => {
      const t0 = performance.now();
      const [{ createTableView }, { createEffectsRuntime }] = await Promise.all([import('../../render/index.ts'), import('../../effects/index.ts')]);
      if (gone) return;
      const v = createTableView(el, {
        profile: 'dm',
        log,
        files: (ref) => files.get(ref),
        effects: (slots, c) => createEffectsRuntime(slots, c),
        now: () => ctx.serverNow(), // one-shots are stamped with the server's clock
        onEvent,
      });
      try {
        await v.ready;
      } catch {
        v.destroy();
        return; // 'renderer-failed' told the DM
      }
      if (gone) {
        v.destroy();
        return;
      }
      view = v;
      ctx.attach(v);
      log.info('companion', 'Map view running', { ms: Math.round(performance.now() - t0) });
    })().catch((e: unknown) => {
      failed = true;
      log.error('companion', 'Map view failed', { error: String(e) });
      notify("The map view didn't start — reload the page.", { kind: 'error' });
    });
    return () => {
      gone = true;
      unbind();
      view?.destroy();
      view = null;
    };
  });
</script>

<div class="map-view" bind:this={host} data-testid="map-view"></div>
{#if ctx.mapLoading || (!view && !failed)}
  <div class="loading" role="status">
    <Spinner size="1rem" />
    <span>{ctx.mapLoading ? `Loading “${ctx.mapLoading}”…` : 'Starting the map…'}</span>
  </div>
{/if}

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

  .loading {
    position: absolute;
    left: 50%;
    top: var(--g);
    transform: translateX(-50%);
    z-index: var(--z-chrome);
    display: flex;
    align-items: center;
    gap: var(--g);
    padding: calc(var(--g) / 2) var(--g2) calc(var(--g) / 2) var(--g);
    border-radius: 999px;
    background: var(--m3);
    box-shadow: var(--elev-float), inset 0 0 0 1px var(--hair);
    font: var(--fw-label) var(--fs-small) / 1.2 var(--font-body);
    color: var(--t2);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
