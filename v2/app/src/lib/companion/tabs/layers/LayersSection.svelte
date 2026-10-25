<!--
  LayersSection — DM-only pictures over the map (parity §12): a DM version of the map, notes,
  secrets. The TV keeps the list with the game and never loads the pictures. A master eye in
  the header (this tablet only), rows top first with an eye, the opacity (sent on release)
  and a menu to move or delete (Undo in the notice), and "Add pictures" (PNG, JPEG, WebP;
  several at once, each uploaded with progress). Every edit sends the whole list.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { newId, type DmLayer, type FileRef } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import '../../library/app-services.ts';
  import { services } from '../../library/services.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import ProgressBar from '../../../ui/ProgressBar.svelte';
  import Section from '../../../ui/Section.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { addedText, addLayer, moveLayer, removeLayer, restoreLayer, topFirst, updateLayer } from './layers-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const layers = $derived(ctx.map.layers);
  let uploading = $state<{ value: number | null; label: string; detail?: string } | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  let opacity = $state<Record<string, number>>({});

  const EXT: Record<string, FileRef['ext']> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

  function send(list: DmLayer[]): void {
    ctx.dispatch({ type: 'layers.set', layers: list });
  }

  async function add(files: File[]): Promise<void> {
    let added = 0;
    const skipped: string[] = [];
    for (const [i, f] of files.entries()) {
      const ext = EXT[(f.name.split('.').pop() ?? '').toLowerCase()];
      if (!ext || f.size === 0) {
        skipped.push(f.name);
        continue;
      }
      try {
        const label = files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${f.name}` : `Uploading ${f.name}`;
        uploading = { value: 0, label };
        const ref = await services().uploadFile(f, { ext, format: 'asis' }, (value, _l, detail) => (uploading = { value, label, detail }));
        send(addLayer(ctx.map.layers, newId(), f.name.replace(/\.[^.]+$/, ''), ref));
        added++;
        log.info('companion', 'DM layer added', { name: f.name, bytes: f.size, hash: ref.hash });
      } catch (e) {
        log.warn('companion', 'DM layer not uploaded', { name: f.name, error: String(e) });
        skipped.push(f.name);
      }
    }
    uploading = null;
    if (added || skipped.length) notify(addedText(added, skipped), { kind: skipped.length ? 'warning' : 'success' });
  }

  function picked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void add(files);
  }

  function remove(l: DmLayer): void {
    const r = removeLayer(ctx.map.layers, l.id);
    if (!r.removed) return;
    send(r.list);
    const removed = r.removed;
    notify(`Removed “${l.name}”`, { action: { label: 'Undo', run: () => send(restoreLayer(ctx.map.layers, removed, r.index)) } });
  }

  function menu(l: DmLayer, id: string): void {
    if (id === 'up' || id === 'down') send(moveLayer(ctx.map.layers, l.id, id));
    else if (id === 'delete') remove(l);
  }
</script>

<Section title="DM layers · only you see them" description="Pictures over the map — a DM version, notes, secrets. The TV never shows them.">
  {#snippet trailing()}
    <ToggleSwitch ariaLabel="Show DM layers on this tablet" checked={ctx.showDmLayers} onchange={(on) => (ctx.showDmLayers = on)} />
  {/snippet}
  {#if layers.length > 0}
    <ul class="rows" data-testid="dm-layers">
      {#each topFirst(layers) as l, i (l.id)}
        <li>
          <ListRow title={l.name} sub="{Math.round((opacity[l.id] ?? l.opacity) * 100)} %" dim={!l.visible || !ctx.showDmLayers}>
            {#snippet leading()}<img class="th" src={ctx.fileUrl(l.file)} alt="" />{/snippet}
            {#snippet trailing()}
              <IconButton
                icon={l.visible ? 'reveal' : 'hide'}
                label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                variant="quiet"
                on={l.visible}
                onclick={() => send(updateLayer(ctx.map.layers, l.id, { visible: !l.visible }))}
              />
              <IconButton
                icon="more"
                label="More for {l.name}"
                variant="quiet"
                menu={[
                  { id: 'up', label: 'Move up', icon: 'arrow-up', disabled: i === 0 },
                  { id: 'down', label: 'Move down', icon: 'arrow-down', disabled: i === layers.length - 1 },
                  { id: 'delete', label: 'Delete layer', icon: 'delete', danger: true, divider: true },
                ]}
                onmenu={(id) => menu(l, id)}
              />
            {/snippet}
          </ListRow>
          <div class="slider">
            <Slider
              label="Opacity of {l.name}"
              min={0}
              max={100}
              value={Math.round((opacity[l.id] ?? l.opacity) * 100)}
              format={(v) => `${v} %`}
              oninput={(v) => (opacity[l.id] = v / 100)}
              onchange={(v) => {
                send(updateLayer(ctx.map.layers, l.id, { opacity: v / 100 }));
                delete opacity[l.id];
              }}
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if uploading}
    <ProgressBar value={uploading.value ?? undefined} label={uploading.label} detail={uploading.detail} />
  {:else}
    <Button label="Add pictures" icon="image-add" variant="flat" onclick={() => picker?.click()} />
  {/if}
  <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple hidden onchange={picked} data-testid="layer-input" />
</Section>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--g);
  }

  .slider {
    padding: 0 var(--g);
  }

  .th {
    width: 48px;
    height: 36px;
    object-fit: cover;
    border-radius: var(--r-sm);
  }
</style>
