<!--
  ViewPanel — the View tab (design.md "the tool tabs", parity §13 + §12): what the players
  see and the DM's own pictures. "Players see" switches the 1-inch table and the whole map;
  the overview map shows the TV's window (tap or drag it) with an arrow pad that moves it a
  square at a time (only on axes that pan); "On the TV" holds following the tablet, showing
  my view once, the TV's turn and its free zoom; the DM layers sit below (LayersSection).

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import LayersSection from '../layers/LayersSection.svelte';
  import { followOf } from './follow.svelte.ts';
  import OverviewMap from './OverviewMap.svelte';
  import { panReach, rotationLabel, viewOf, viewSentence } from './view-logic.ts';

  let { ctx }: TabPanelProps = $props();

  const follow = $derived(followOf(ctx));
  // The map as far as the view cares (its grid and view): other patches don't re-run this (rv#37).
  const info = $derived(ctx.map.info);
  const mapView = $derived(ctx.map.view);
  const map = $derived.by(() => {
    void info;
    void mapView;
    return untrack(() => ctx.map);
  });
  const table = $derived(ctx.state.table);
  const view = $derived(viewOf(table, map));
  const reach = $derived(panReach(view, map));
  const pans = $derived(reach.left || reach.right || reach.up || reach.down);
  const mode = $derived(map.view.mode === 'free' ? 'free' : map.view.mode);
  const turns = $derived(map.view.quarterTurns);

  function pan(dx: number, dy: number): void {
    ctx.dispatch({ type: 'view.pan', dx, dy });
  }

  function rotate(q: number): void {
    ctx.dispatch({ type: 'view.rotate', quarterTurns: (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3 });
  }

  function zoom(factor: number): void {
    const cam = view?.camera;
    if (!cam) {
      notify("The TV hasn't sent its view yet.", { kind: 'warning' });
      return;
    }
    ctx.dispatch({ type: 'view.free', x: cam.centerX, y: cam.centerY, zoom: cam.zoom * factor });
    log.info('companion', 'TV zoomed', { factor });
  }

  function showMine(): void {
    if (follow.showOnce()) notify('The TV shows your view.', { kind: 'success' });
    else notify('The TV shows that already.');
  }
</script>

<Section title="Players see">
  <Segmented
    label="What the TV shows"
    block
    value={mode === 'free' ? '' : mode}
    onchange={(id) => ctx.dispatch({ type: 'view.mode', mode: id as 'table' | 'fit' })}
    options={[
      { id: 'table', label: '1-inch table', icon: 'grid' },
      { id: 'fit', label: 'Whole map', icon: 'fit' },
    ]}
  />
  <p class="note" data-testid="view-sentence">{viewSentence(view, map)}</p>
  <div class="overview" class:pans>
    <OverviewMap {ctx} />
    {#if pans}
      <div class="pad" data-ctl="compact">
        <span></span><IconButton icon="arrow-up" label="Window up a square" variant="flat" disabled={!reach.up} onclick={() => pan(0, -1)} /><span></span>
        <IconButton icon="arrow-left" label="Window left a square" variant="flat" disabled={!reach.left} onclick={() => pan(-1, 0)} />
        <span class="mid">{view?.layout?.winCols} × {view?.layout?.winRows}</span>
        <IconButton icon="arrow-right" label="Window right a square" variant="flat" disabled={!reach.right} onclick={() => pan(1, 0)} />
        <span></span><IconButton icon="arrow-down" label="Window down a square" variant="flat" disabled={!reach.down} onclick={() => pan(0, 1)} /><span></span>
      </div>
    {/if}
  </div>
</Section>

<Section title="On the TV">
  <ToggleSwitch
    label="TV follows the tablet"
    description={mode === 'table' ? 'The window moves with your view, a square at a time.' : 'The TV moves with your view.'}
    checked={follow.on}
    onchange={(on) => {
      follow.set(on);
      notify(on ? 'TV follows the tablet' : 'TV stays where it is');
    }}
  />
  <Button label="Show my view on the TV" icon="tv" block onclick={showMine} />
  <div class="row">
    <span class="bm-eyebrow">Turn</span>
    <span data-ctl="compact" class="tools turn">
      <IconButton icon="rotate" label="Turn the TV's view left" variant="flat" onclick={() => rotate(turns - 1)} />
      <Button label={rotationLabel(turns)} variant="flat" size="compact" disabled={turns === 0} onclick={() => rotate(0)} />
      <IconButton icon="rotate" label="Turn the TV's view right" variant="flat" onclick={() => rotate(turns + 1)} />
    </span>
  </div>
  <div class="row">
    <span class="bm-eyebrow">Zoom (leaves the 1-inch table)</span>
    <span data-ctl="compact" class="tools">
      <IconButton icon="minus" label="TV zoom out" variant="flat" onclick={() => zoom(1 / 1.3)} />
      <IconButton icon="add" label="TV zoom in" variant="flat" onclick={() => zoom(1.3)} />
    </span>
  </div>
</Section>

<LayersSection {ctx} />

<style>
  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .overview {
    display: grid;
    gap: var(--g);
    align-items: center;
  }

  .overview.pans {
    grid-template-columns: 1fr auto;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 2px;
    align-items: center;
    justify-items: center;
  }

  .mid {
    font: var(--fw-meta) var(--fs-meta) / 1 var(--font-meta);
    color: var(--t3);
    white-space: nowrap;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--g);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: calc(var(--g) / 2);
  }

  .turn > :global(:first-child) {
    transform: scaleX(-1);
  }
</style>
