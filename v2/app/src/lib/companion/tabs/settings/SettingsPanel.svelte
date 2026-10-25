<!--
  SettingsPanel — the Game tab (design.md "the tool tabs", parity §14, §16): this game's maps
  (the one on the table marked; tap another to switch; add from the device or the shared
  library; rename or remove), this map's squares (fit the grid on the picture, set the scale
  by a known length, battlemap's grid lines on or off), the table (measure the TV), the game
  (name, effects — only settings that do something), this tablet (theme), and leaving the
  game. Game settings and device settings sit in separate sections (fluent rule 9).

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { tableGrid, type LibraryEntry, type MapInfo, type MapPlay, type RasterGrid } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import CalibrationDialog from '../../dialogs/CalibrationDialog.svelte';
  import GridEditor from '../../dialogs/grid-editor/GridEditor.svelte';
  import MapImport from '../../dialogs/MapImport.svelte';
  import { mapMeta } from '../../library/library-logic.ts';
  import SharedLibrary from '../../library/SharedLibrary.svelte';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import Field from '../../../ui/Field.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import Sheet from '../../../ui/Sheet.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { theme } from './theme.svelte.ts';

  let { ctx }: TabPanelProps = $props();

  const game = $derived(ctx.game);
  const map = $derived(ctx.map);
  const maps = $derived(game.mapOrder.map((id) => game.maps[id]).filter((m): m is MapPlay => !!m));
  const table = $derived.by(() => {
    const t = ctx.state.table;
    const g = t.viewport ? tableGrid(t.viewport, t.widthInches, t.overscanPercent) : null;
    return g ? { cols: g.cols, rows: g.rows } : null;
  });

  let calibrating = $state(false);
  let editor = $state<{ tool: 'fit' | 'length' } | null>(null);
  let importing = $state<File | null>(null);
  let sheet = $state(false);
  let renaming = $state<{ id: string; name: string; game: boolean } | null>(null);
  let picker: HTMLInputElement | undefined = $state();

  function switchTo(m: MapPlay): void {
    if (m.info.id === game.activeMapId) return;
    if (ctx.dispatch({ type: 'map.switch', mapId: m.info.id })) notify(`“${m.info.name}” is on the table`);
  }

  function addMap(info: MapInfo): void {
    if (game.maps[info.id]) {
      switchTo(game.maps[info.id]!);
      return;
    }
    if (ctx.dispatch({ type: 'map.add', map: info, activate: true })) {
      log.info('companion', 'Map added to the game', { name: info.name, id: info.id });
      notify(`“${info.name}” joined the game and is on the table`, { kind: 'success' });
    }
  }

  function addShared(e: LibraryEntry): void {
    sheet = false;
    addMap({ ...e.map, libraryId: e.map.id });
  }

  function mapMenu(m: MapPlay, id: string): void {
    if (id === 'rename') renaming = { id: m.info.id, name: m.info.name, game: false };
    else if (id === 'remove') {
      if (ctx.dispatch({ type: 'map.remove', mapId: m.info.id })) notify(`“${m.info.name}” left the game`);
    }
  }

  function saveRename(): void {
    const r = renaming;
    const name = r?.name.trim();
    if (!r || !name) return;
    ctx.dispatch(r.game ? { type: 'game.rename', name } : { type: 'map.rename', mapId: r.id, name });
    renaming = null;
  }

  function regrid(g: RasterGrid): void {
    const recount = g.cols !== map.info.grid.cols || g.rows !== map.info.grid.rows;
    editor = null;
    if (ctx.dispatch({ type: 'map.regrid', grid: g })) {
      notify(`Grid: ${g.cols} × ${g.rows} squares of ${g.cellW.toFixed(2)} px${recount ? ' — the fog of this map starts over' : ''}`, { kind: 'success' });
    }
  }

  function picked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) importing = file;
  }

  function leave(): void {
    log.info('companion', 'Leave the game', { id: game.id });
    if (ctx.session.request({ type: 'game.close' })) notify('Back to the library — the game is saved on the TV.');
  }
</script>

<Section title="Maps in this game" description="Each map keeps its own fog, doors, tokens and drawings.">
  <ul class="rows">
    {#each maps as m (m.info.id)}
      {@const on = m.info.id === game.activeMapId}
      <li>
        <ListRow title={m.info.name} sub={mapMeta(m.info)} selected={on} onclick={() => switchTo(m)}>
          {#snippet leading()}<img class="th" src={ctx.fileUrl(m.info.tableCopy ?? m.info.picture)} alt="" />{/snippet}
          {#snippet trailing()}
            {#if on}<Badge text="On the table" tone="accent" />{/if}
            <IconButton
              icon="more"
              label="More for {m.info.name}"
              variant="quiet"
              menu={[
                { id: 'rename', label: 'Rename', icon: 'edit' },
                { id: 'remove', label: 'Remove from the game', icon: 'delete', danger: true, divider: true, disabled: maps.length < 2 },
              ]}
              onmenu={(id) => mapMenu(m, id)}
            />
          {/snippet}
        </ListRow>
      </li>
    {/each}
  </ul>
  <div class="two">
    <Button label="From device" icon="upload" variant="flat" onclick={() => picker?.click()} />
    <Button label="Shared library" icon="library" variant="flat" onclick={() => (sheet = true)} />
  </div>
  <input bind:this={picker} type="file" hidden onchange={picked} />
</Section>

<Section title="This map's squares" description="{map.info.grid.cols} × {map.info.grid.rows} squares · one square = one inch on the table">
  {#if map.info.kind === 'picture'}
    <Button label="Fit the grid on the picture" icon="grid" iconEnd="chevron-right" block onclick={() => (editor = { tool: 'fit' })} />
    <Button label="Set the scale by a known length" icon="measure" variant="flat" block onclick={() => (editor = { tool: 'length' })} />
  {/if}
  <ToggleSwitch
    label="Draw a grid over the map"
    description="Off when the picture has its own grid lines."
    checked={map.showGrid}
    onchange={(on) => ctx.dispatch({ type: 'view.grid', on })}
  />
</Section>

<Section title="The table">
  <ListRow
    title="Measure the TV"
    sub="One square = one inch on this TV"
    value={table ? `${table.cols} × ${table.rows}` : '—'}
    icon="tv"
    chevron
    onclick={() => (calibrating = true)}
  />
</Section>

<Section title="This game">
  <ListRow title={game.name} sub="The game's name" icon="edit" chevron onclick={() => (renaming = { id: game.id, name: game.name, game: true })} />
  <ToggleSwitch
    label="Effects"
    description="Weather, torches and spell effects on the table."
    checked={game.settings.effects}
    onchange={(on) => ctx.dispatch({ type: 'game.settings', settings: { effects: on } })}
  />
</Section>

<Section title="This tablet">
  <Segmented
    label="Theme"
    block
    value={theme.value}
    onchange={(id) => theme.set(id as 'dark' | 'light')}
    options={[{ id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'light', label: 'Light', icon: 'sun' }]}
  />
</Section>

<Button label="Leave the game" icon="back" variant="flat" block onclick={leave} />

<CalibrationDialog open={calibrating} table={ctx.state.table} dispatch={(c) => ctx.dispatch(c)} onclose={() => (calibrating = false)} />

{#if editor}
  <GridEditor
    open
    src={ctx.fileUrl(map.info.picture)}
    start={map.info.grid}
    tool={editor.tool}
    {table}
    applyLabel="Apply"
    onapply={regrid}
    onclose={() => (editor = null)}
  />
{/if}

{#if importing}
  <MapImport
    file={importing}
    {table}
    commitLabel="Add to the game"
    ondone={(m) => {
      importing = null;
      addMap(m);
    }}
    oncancel={() => (importing = null)}
  />
{/if}

<div class="sheet-host" class:open={sheet}>
  <Sheet side={ctx.phone ? 'bottom' : 'right'} bind:open={sheet} modal title="Shared library" onclose={() => (sheet = false)}>
    {#if sheet}
      <SharedLibrary
        mode="add"
        columns="list"
        inGame={game.mapOrder}
        onpick={addShared}
        onfile={(f) => {
          sheet = false;
          importing = f;
        }}
      />
    {/if}
  </Sheet>
</div>

<Dialog open={renaming !== null} title={renaming?.game ? 'Rename the game' : 'Rename the map'} icon="edit" size="sm" onclose={() => (renaming = null)}>
  {#if renaming}<Field label="Name" bind:value={renaming.name} onenter={saveRename} />{/if}
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (renaming = null)} />
    <Button label="Rename" icon="check" variant="primary" disabled={!renaming?.name.trim()} onclick={saveRename} />
  {/snippet}
</Dialog>

<style>
  /* minmax(0, …): a long map name ellipsizes instead of pushing the badge past the panel (qa#5) */
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

  .rows > li {
    min-width: 0;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g);
  }

  .th {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--r-sm);
  }

  .sheet-host {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    pointer-events: none;
  }

  .sheet-host.open {
    pointer-events: auto;
  }
</style>
