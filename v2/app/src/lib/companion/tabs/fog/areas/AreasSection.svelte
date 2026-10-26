<!--
  AreasSection — the Fog panel's "Areas" section (roadmap S7): the map's prepared reveal areas,
  one row each — its name (or "Area n"), its size and what the players see of it, and one button
  that reveals it (hidden or partly shown) or hides it (fully shown) in one tap, with Undo in the
  notice. A tap on the row selects the area (gold on the map) and centres the view on it; "⋯"
  offers Edit squares, Rename… and Delete (as the Scenes list does). "New area"
  starts drawing one. Empty: one line on what areas are for.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { maskCells, type RevealArea } from '@battlemap/shared';
  import type { TabPanelProps } from '../../../game/tabs.ts';
  import Button from '../../../../ui/Button.svelte';
  import Dialog from '../../../../ui/Dialog.svelte';
  import Field from '../../../../ui/Field.svelte';
  import IconButton from '../../../../ui/IconButton.svelte';
  import ListRow from '../../../../ui/ListRow.svelte';
  import Section from '../../../../ui/Section.svelte';
  import { deleteArea, renameArea, startEditArea, startNewArea, toggleArea } from './actions.ts';
  import { areasLocal } from './local.svelte.ts';
  import { areaCentre, areaLabel, areaStates, areaSummary } from './logic.ts';

  let { ctx }: TabPanelProps = $props();

  const NONE: readonly RevealArea[] = [];
  // slices, so a token drag elsewhere doesn't re-run the list (rv#37)
  const areas = $derived(ctx.map.areas ?? NONE);
  const fog = $derived(ctx.map.fog);
  const grid = $derived(ctx.map.info.grid);
  const states = $derived(areaStates(areas, fog, grid.cols * grid.rows));

  let renameOpen = $state(false);
  let renaming = $state.raw<RevealArea | null>(null);
  let draft = $state('');

  function select(area: RevealArea): void {
    if (areasLocal.selected === area.id) {
      areasLocal.selected = null;
      return;
    }
    areasLocal.selected = area.id;
    const c = areaCentre(maskCells(area.cells, grid.cols * grid.rows), grid.cols);
    if (c) ctx.camera.jumpTo(c);
  }

  function onMenu(area: RevealArea, index: number, id: string): void {
    if (id === 'edit') startEditArea(ctx, area);
    else if (id === 'rename') {
      draft = area.name;
      renaming = area;
      renameOpen = true;
    } else if (id === 'delete') deleteArea(ctx, area, index);
  }

  function saveName(): void {
    const a = renaming;
    renaming = null;
    renameOpen = false;
    if (a) renameArea(ctx, a, draft);
  }

  const menu = [
    { id: 'edit', label: 'Edit squares', icon: 'edit' as const, description: 'Paint, fill rooms or outline' },
    { id: 'rename', label: 'Rename…', icon: 'scene' as const },
    { id: 'delete', label: 'Delete area', icon: 'delete' as const, danger: true, divider: true },
  ];
</script>

<Section title="Areas" description={areas.length ? 'One tap reveals or hides a whole area.' : undefined}>
  {#if areas.length === 0}
    <p class="empty" data-testid="areas-empty">Outline rooms in prep, reveal them with one tap at the table.</p>
  {:else}
    <ul class="rows" data-testid="area-list">
      {#each areas as a, i (a.id)}
        {@const s = states[i]!}
        {@const reveal = s.state !== 'revealed'}
        <li data-testid="area-row" data-area={a.id} data-state={s.state}>
          <ListRow title={areaLabel(a, i)} sub={areaSummary(s)} icon="room" selected={areasLocal.selected === a.id} onclick={() => select(a)}>
            {#snippet trailing()}
              <Button
                icon={reveal ? 'reveal' : 'hide'}
                label={reveal ? 'Reveal' : 'Hide'}
                tone={reveal ? 'reveal' : 'hide'}
                disabled={s.state === 'empty'}
                onclick={() => toggleArea(ctx, a, i, s.state)}
              />
              <IconButton icon="more" label="More for {areaLabel(a, i)}" variant="quiet" menu={menu} onmenu={(id) => onMenu(a, i, id)} />
            {/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {/if}
  <Button icon="add" label="New area" onclick={() => startNewArea(ctx)} />
</Section>

<Dialog bind:open={renameOpen} title="Rename area" icon="edit" size="sm" onclose={() => (renaming = null)}>
  <Field bind:value={draft} label="Name" kind="prose" placeholder="The crypt" enterkeyhint="done" onenter={saveName} />
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (renameOpen = false)} />
    <Button label="Rename" icon="check" variant="primary" onclick={saveName} />
  {/snippet}
</Dialog>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--g);
  }

  .empty {
    margin: 0;
    color: var(--t2);
    font-size: var(--fs-small);
    line-height: 1.45;
  }
</style>
