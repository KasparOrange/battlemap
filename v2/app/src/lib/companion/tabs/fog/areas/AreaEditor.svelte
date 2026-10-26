<!--
  AreaEditor — the Fog panel while a reveal area is drawn or edited (roadmap S7): its name, what
  a finger on the map does (Paint squares · Room · Outline, Add | Remove), how many squares it
  holds, and for an outline in progress its corners with Close outline / Start over. The map
  shows the draft gold (AreasOverlay); the commit row (Cancel · Save area) is AreaFooter.
  Nothing is sent before Save.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import type { TabPanelProps } from '../../../game/tabs.ts';
  import Button from '../../../../ui/Button.svelte';
  import Field from '../../../../ui/Field.svelte';
  import Section from '../../../../ui/Section.svelte';
  import Segmented from '../../../../ui/Segmented.svelte';
  import { areasLocal, type AreaEditTool } from './local.svelte.ts';
  import { closeOutline } from './tool.ts';

  let { ctx }: TabPanelProps = $props();

  const draft = $derived(areasLocal.draft);
  const walls = $derived(ctx.geometry !== null && ctx.geometry.walls.length > 0);
  const verb = $derived(areasLocal.add ? 'add' : 'take out');
  const hint = $derived(
    areasLocal.tool === 'paint' ? `Tap or drag over squares to ${verb}.`
    : areasLocal.tool === 'room' ? `Tap a room to ${verb} all of it — walls and closed doors stop it.`
    : `Tap corners on the grid; tap the first corner again to close the outline and ${verb} what is inside.`,
  );
  const size = $derived(draft ? (draft.cells.size === 1 ? '1 square' : `${draft.cells.size} squares`) : '');

  // another map came on the table while editing: the squares belong to the old one
  $effect(() => {
    if (draft && draft.mapId !== ctx.map.info.id) areasLocal.cancel();
  });

  function setName(v: string): void {
    areasLocal.patch({ name: v });
  }
</script>

{#if draft}
  <Section title={draft.isNew ? 'New area' : 'Edit area'} description="Players see nothing of this until you reveal it.">
    <Field value={draft.name} label="Name" kind="prose" placeholder="The crypt" oninput={setName} />
  </Section>

  <Section title="Squares" description={hint}>
    <Segmented
      label="How to mark squares"
      layout="tile"
      block
      value={areasLocal.tool}
      onchange={(id) => {
        areasLocal.tool = id as AreaEditTool;
        areasLocal.patch({ poly: [] });
      }}
      options={[
        { id: 'paint', label: 'Paint', icon: 'brush', hint: 'Tap or drag' },
        { id: 'room', label: 'Room', icon: 'room', hint: walls ? 'Tap a room' : 'Needs walls', disabled: !walls },
        { id: 'outline', label: 'Outline', icon: 'pin', hint: 'Tap corners' },
      ]}
    />
    <Segmented
      label="Add or take out"
      block
      value={areasLocal.add ? 'add' : 'remove'}
      onchange={(id) => (areasLocal.add = id === 'add')}
      options={[
        { id: 'add', label: 'Add', icon: 'add' },
        { id: 'remove', label: 'Take out', icon: 'minus' },
      ]}
    />
    <p class="count" data-testid="area-draft-count">{size}</p>
    {#if areasLocal.tool === 'outline' && draft.poly.length > 0}
      <div class="two">
        <Button icon="check" label="Close outline" disabled={draft.poly.length < 3} onclick={() => closeOutline(ctx)} />
        <Button icon="undo" label="Start over" variant="flat" onclick={() => areasLocal.patch({ poly: [] })} />
      </div>
    {/if}
  </Section>
{/if}

<style>
  .count {
    margin: 0;
    font: 600 var(--fs-small) / 1.3 var(--font-value);
    color: var(--t2);
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g);
  }

  .two :global(button) {
    width: 100%;
  }
</style>
