<!--
  SpotlightSection — the Moments tab's first section: where the spotlight is (a mini, a square
  or off), how much the rest of the table dims (this tablet remembers the choice; a lit
  spotlight changes at once), and Put out. Placing it is a tap on the map in this tab.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import { momentsLocal } from './local.svelte.ts';
  import { DIM_OPTIONS, dimOption, spotlightText } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const spot = $derived(ctx.map.spotlight ?? null);
  const dimId = $derived(dimOption(spot?.dim ?? momentsLocal.dim));

  function setDim(id: string): void {
    const value = DIM_OPTIONS.find((o) => o.id === id)?.value ?? 0.3;
    momentsLocal.dim = value;
    momentsLocal.save();
    if (spot) ctx.dispatch({ type: 'spotlight.set', spotlight: { ...spot, dim: value } });
  }

  function putOut(): void {
    if (ctx.dispatch({ type: 'spotlight.set', spotlight: null })) log.info('companion', 'Spotlight out', { from: 'panel' });
  }
</script>

<Section title="Spotlight" description="Tap a mini or a square on the map — tap it again to put it out.">
  <div class="status" data-testid="spotlight-status">
    <span class="dot" class:on={spot !== null}></span>
    <span>{spotlightText(ctx.map)}</span>
  </div>
  <p class="lbl">Dim the rest of the table</p>
  <Segmented
    label="Dim the rest of the table"
    options={DIM_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
    value={dimId}
    onchange={setDim}
    block
  />
  <Button label="Put out" icon="close" variant="flat" disabled={!spot} onclick={putOut} block />
</Section>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: var(--g);
    min-height: var(--sq-compact);
    color: var(--t);
    font-size: var(--fs-body);
  }

  .lbl {
    margin: 0;
    color: var(--t2);
    font-size: var(--fs-small);
  }

  .dot {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--t3);
    flex: none;
  }

  .dot.on {
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
</style>
