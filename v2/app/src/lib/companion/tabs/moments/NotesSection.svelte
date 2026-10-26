<!--
  NotesSection — the DM's notes pinned to this map ("trap here", "DC 15 lock"), seen only on the
  tablet. Pinning is a long press on the map (any tab but Draw and Fog); here a row jumps the
  view to its pin, and ⋯ edits or deletes it (Undo in the notice). In this tab a pin can also be
  dragged to move it, and tapped to edit it.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import type { DmNote } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import Section from '../../../ui/Section.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { momentsLocal } from './local.svelte.ts';
  import { notePlace, notesInOrder } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const notes = $derived(notesInOrder(ctx.map.notes ?? []));

  function remove(n: DmNote): void {
    if (!ctx.dispatch({ type: 'note.remove', id: n.id })) return;
    log.info('companion', 'Note deleted', { id: n.id, from: 'list' });
    notify(`Deleted the note “${n.text.slice(0, 30)}”`, {
      action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'note.set', note: n, gesture: ctx.newGesture() }) },
    });
  }

  /** A new note in the middle of what the tablet shows (for a DM who doesn't know the long press yet). */
  function addHere(): void {
    const c = ctx.camera.get();
    const { cols, rows } = ctx.map.info.grid;
    momentsLocal.newNote(c ? Math.min(cols, Math.max(0, c.centerX)) : cols / 2, c ? Math.min(rows, Math.max(0, c.centerY)) : rows / 2);
  }
</script>

<Section title="DM notes · only you see them" description="Hold the map anywhere to pin a note. Drag a pin to move it, tap it to edit it.">
  {#if notes.length > 0}
    <ul class="rows" data-testid="notes">
      {#each notes as n (n.id)}
        <li>
          <ListRow title={n.text.split('\n')[0] ?? ''} sub={notePlace(n)} icon="pin" onclick={() => ctx.camera.jumpTo({ x: n.x, y: n.y })}>
            {#snippet trailing()}
              <IconButton
                icon="more"
                label="More for this note"
                variant="quiet"
                menu={[
                  { id: 'edit', label: 'Edit…', icon: 'edit' },
                  { id: 'delete', label: 'Delete', icon: 'delete', danger: true, divider: true },
                ]}
                onmenu={(id) => (id === 'edit' ? momentsLocal.editNote(n) : remove(n))}
              />
            {/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">No notes on this map yet.</p>
  {/if}
  <Button label="Pin a note in the middle" icon="pin" variant="flat" onclick={addHere} />
</Section>

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
  }
</style>
