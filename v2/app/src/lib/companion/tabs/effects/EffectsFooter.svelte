<!--
  EffectsFooter — the Effects tab's commit row: while an area is aimed, Cancel and the one gold
  action (Cast Fireball / Place Cloudkill, with the squares it covers); while a placed effect
  is selected, Done and Remove.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import type { TabPanelProps } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import { commitAim, removeEffect } from './actions.ts';
  import { effectsLocal } from './local.svelte.ts';
  import { coveredSquares } from './shapes.ts';

  let { ctx }: TabPanelProps = $props();

  const chosen = $derived(effectsLocal.chosen);
  const aim = $derived(effectsLocal.aim);
  /** The name without its "(cone)" or "— fire cone" tail, so the button fits a phone. */
  const short = $derived(chosen ? chosen.name.replace(/\s*[(—–].*$/, '') : '');
  const count = $derived(aim ? coveredSquares(aim, ctx.map.info.grid.cols, ctx.map.info.grid.rows).length : 0);
  const selected = $derived(effectsLocal.selectedId ? ctx.map.effects.find((e) => e.id === effectsLocal.selectedId) ?? null : null);
</script>

<div class="row">
  {#if aim && chosen}
    <Button variant="flat" icon="close" label="Cancel" onclick={() => (effectsLocal.aim = null)} />
    <Button variant="primary" icon={chosen.once ? 'wand' : 'pin'} label="{chosen.once ? 'Cast' : 'Place'} {short}" hint="{count} sq" block onclick={() => commitAim(ctx)} />
  {:else if selected}
    <Button variant="flat" icon="check" label="Done" onclick={() => (effectsLocal.selectedId = null)} />
    <Button icon="delete" tone="danger" label="Remove {effectsLocal.byId(selected.effect)?.name ?? 'effect'}" block onclick={() => removeEffect(ctx, selected.id)} />
  {/if}
</div>

<style>
  .row {
    display: flex;
    gap: var(--g);
  }

  .row :global(button:last-child) {
    flex: 1;
    min-width: 0;
  }
</style>
