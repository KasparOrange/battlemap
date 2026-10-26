<!--
  HandoutsSection — pictures and short letters the DM shows the players on the TV, kept per game.
  A tap on a row shows it at the table's edge (the map stays — the default, because a full-screen
  card covers the minis' area); the row's full-screen button shows it as a pause card over the
  whole TV; a tap on the one showing takes it off. "Reads upright for" turns it to a table side
  (this tablet remembers; a showing handout turns at once). Add a picture (uploaded with
  progress), a picture from this map's DM layers, or write a letter. ⋯ edits, renames, deletes
  (Undo in the notice).

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { MAX_HANDOUTS, newId, type FileRef, type Handout, type HandoutShown, type TableSide } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { api } from '../../../api/index.ts';
  import { files as fileCache } from '../../../storage/index.ts';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import Icon from '../../../ui/Icon.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import ProgressBar from '../../../ui/ProgressBar.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import HandoutDialog from './HandoutDialog.svelte';
  import { momentsLocal } from './local.svelte.ts';
  import { handoutSub, pictureName, SIDES } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const EXT: Record<string, FileRef['ext']> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

  const list = $derived(ctx.game.handouts ?? []);
  const shown = $derived(ctx.game.handoutShown ?? null);
  const full = $derived(list.length >= MAX_HANDOUTS);
  let uploading = $state<{ value: number | null; label: string; detail?: string } | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  let dialogOpen = $state(false);
  let editing = $state<{ handout: Handout; isNew: boolean }>({ handout: blankLetter(), isNew: true });

  function blankLetter(): Handout {
    return { id: newId(), name: '', kind: 'letter', file: null, text: '' };
  }

  function show(next: HandoutShown | null): void {
    if (ctx.dispatch({ type: 'handout.show', shown: next })) log.info('companion', next ? 'Handout shown' : 'Handout off the TV', next ?? {});
  }

  function tapRow(h: Handout): void {
    if (shown?.id === h.id) show(null);
    else show({ id: h.id, place: 'edge', side: momentsLocal.side });
  }

  function fullScreen(h: Handout): void {
    if (shown?.id === h.id && shown.place === 'full') show(null);
    else show({ id: h.id, place: 'full', side: momentsLocal.side });
  }

  function setSide(id: string): void {
    const side = id as TableSide;
    momentsLocal.side = side;
    momentsLocal.save();
    if (shown && shown.side !== side) show({ ...shown, side });
  }

  function save(h: Handout, what: string): boolean {
    const ok = ctx.dispatch({ type: 'handout.save', handout: h });
    if (ok) log.info('companion', `Handout ${what}`, { id: h.id, kind: h.kind, chars: h.text.length });
    return ok;
  }

  function writeLetter(): void {
    editing = { handout: blankLetter(), isNew: true };
    dialogOpen = true;
  }

  function edit(h: Handout): void {
    editing = { handout: h, isNew: false };
    dialogOpen = true;
  }

  function saved(h: Handout): void {
    if (!save(h, editing.isNew ? 'written' : 'edited')) return;
    if (editing.isNew) notify(`Added “${h.name}” — tap it to show it on the TV`, { kind: 'success' });
  }

  function remove(h: Handout): void {
    const index = list.findIndex((x) => x.id === h.id);
    if (!ctx.dispatch({ type: 'handout.remove', id: h.id })) return;
    log.info('companion', 'Handout deleted', { id: h.id });
    notify(`Deleted “${h.name}”`, { action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'handout.save', handout: h, index }) } });
  }

  function menu(h: Handout, id: string): void {
    if (id === 'edge') show({ id: h.id, place: 'edge', side: momentsLocal.side });
    else if (id === 'full') show({ id: h.id, place: 'full', side: momentsLocal.side });
    else if (id === 'edit') edit(h);
    else if (id === 'delete') remove(h);
  }

  async function upload(files: File[]): Promise<void> {
    let added = 0;
    for (const [i, f] of files.entries()) {
      if (list.length + added >= MAX_HANDOUTS) {
        notify(`A game keeps ${MAX_HANDOUTS} handouts at most`, { kind: 'warning' });
        break;
      }
      const ext = EXT[(f.name.split('.').pop() ?? '').toLowerCase()];
      if (!ext || f.size === 0) {
        notify(`“${f.name}” is not a picture (PNG, JPEG or WebP)`, { kind: 'warning' });
        continue;
      }
      const label = files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${f.name}` : `Uploading ${f.name}`;
      try {
        uploading = { value: 0, label };
        const res = await api.uploadFile(f, { ext, format: 'asis' }, (loaded, total) =>
          (uploading = { value: total ? loaded / total : null, label, detail: `${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB` }));
        void fileCache.put(res, f).catch(() => {}); // this tablet never downloads its own upload
        const file: FileRef = { hash: res.hash, ext: res.ext, bytes: res.bytes };
        if (save({ id: newId(), name: pictureName(f.name), kind: 'picture', file, text: '' }, 'picture added')) added++;
      } catch (e) {
        log.warn('companion', 'Handout picture not uploaded', { name: f.name, error: String(e) });
        notify(`“${f.name}” didn't upload — try again`, { kind: 'error' });
      }
    }
    uploading = null;
    if (added) notify(added === 1 ? 'Picture added — tap it to show it on the TV' : `${added} pictures added`, { kind: 'success' });
  }

  function picked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void upload(files);
  }

  let layersOpen = $state(false);

  function fromLayer(id: string): void {
    const l = ctx.map.layers.find((x) => x.id === id);
    if (!l) return;
    layersOpen = false;
    if (save({ id: newId(), name: l.name.slice(0, 120) || 'Picture', kind: 'picture', file: l.file, text: '' }, 'from a DM layer')) {
      notify(`Added “${l.name}” — tap it to show it on the TV`, { kind: 'success' });
    }
  }
</script>

<Section title="Handouts" description="A picture or a letter on the TV — at the table's edge, or full screen as a pause.">
  {#if list.length > 0}
    <ul class="rows" data-testid="handouts">
      {#each list as h (h.id)}
        {@const on = shown?.id === h.id}
        <li>
          <ListRow
            title={h.name}
            sub={handoutSub(h)}
            selected={on}
            onclick={() => tapRow(h)}
          >
            {#snippet leading()}
              {#if h.kind === 'picture' && h.file}<img class="th" src={ctx.fileUrl(h.file)} alt="" />{:else}<span class="th letter"><Icon name="edit" /></span>{/if}
            {/snippet}
            {#snippet trailing()}
              {#if on}<Badge text={shown?.place === 'full' ? 'Full screen' : 'On the TV'} tone="ok" />{/if}
              <IconButton
                icon={on && shown?.place === 'full' ? 'fullscreen-exit' : 'fullscreen'}
                label={on && shown?.place === 'full' ? `Back to the map` : `Show ${h.name} full screen`}
                variant="quiet"
                on={on && shown?.place === 'full'}
                onclick={() => fullScreen(h)}
              />
              <IconButton
                icon="more"
                label="More for {h.name}"
                variant="quiet"
                menu={[
                  { id: 'edge', label: 'Show at the table’s edge', icon: 'image' },
                  { id: 'full', label: 'Show full screen (pause)', icon: 'fullscreen' },
                  { id: 'edit', label: h.kind === 'letter' ? 'Edit the letter…' : 'Rename, caption…', icon: 'edit', divider: true },
                  { id: 'delete', label: 'Delete', icon: 'delete', danger: true, divider: true },
                ]}
                onmenu={(id) => menu(h, id)}
              />
            {/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">No handouts yet. Add a picture or write a letter; the list stays with this game.</p>
  {/if}

  {#if shown}
    <Button label="Back to the map" icon="map" onclick={() => show(null)} block />
  {/if}

  <p class="lbl">Reads upright for the players at the</p>
  <Segmented label="Reads upright for the players at the" options={SIDES} value={shown?.side ?? momentsLocal.side} onchange={setSide} block />

  {#if uploading}
    <ProgressBar value={uploading.value ?? undefined} label={uploading.label} detail={uploading.detail} />
  {/if}
  <div class="add">
    <Button label="Add a picture" icon="image-add" variant="flat" disabled={full || uploading !== null} onclick={() => picker?.click()} />
    <Button label="Write a letter" icon="edit" variant="flat" disabled={full} onclick={writeLetter} />
    {#if ctx.map.layers.length > 0}
      <Button label="From DM layers" icon="layers" variant="flat" on={layersOpen} disabled={full} onclick={() => (layersOpen = !layersOpen)} />
    {/if}
  </div>
  {#if layersOpen && ctx.map.layers.length > 0}
    <ul class="rows" data-testid="handout-layers">
      {#each ctx.map.layers as l (l.id)}
        <li>
          <ListRow title={l.name} sub="Add as a picture handout" onclick={() => fromLayer(l.id)}>
            {#snippet leading()}<img class="th" src={ctx.fileUrl(l.file)} alt="" />{/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {/if}
  <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onchange={picked} data-testid="handout-file" />
</Section>

<HandoutDialog bind:open={dialogOpen} handout={editing.handout} isNew={editing.isNew} onsave={saved} />

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--g);
  }

  .th {
    display: block;
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--hair);
  }

  .th.letter {
    display: grid;
    place-items: center;
    background: var(--m2);
    color: var(--accent-text);
  }

  .empty,
  .lbl {
    margin: 0;
    color: var(--t2);
    font-size: var(--fs-small);
    line-height: 1.45;
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g);
  }
</style>
