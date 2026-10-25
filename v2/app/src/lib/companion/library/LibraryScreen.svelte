<!--
  LibraryScreen — the companion outside a game (design.md "Library"): a toolbar of controls
  (menu, the search omnibar, Games | Maps, Upload), then either the TV's games — the Continue
  card first and prominent, the rest newest first, each with Rename / Delete — or the shared
  map library, where a card starts a new game on that map. Upload picks a file, runs the
  import (squares dialog, grid editor) and starts a game on it. Opening anything shows the
  TV's own progress (`tv.status`); the game screen takes over when the TV's snapshot has a game.

  Props:
  - session: CompanionSession — the joined table
  - onchangetable: () => void — "Change table" in the menu
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { newId, tableGrid, type GameSettings, type GameSummary, type LibraryEntry, type MapInfo } from '@battlemap/shared';
  import { log } from '../../log.ts';
  import type { CompanionSession } from '../../state/sessions.svelte.ts';
  import Badge from '../../ui/Badge.svelte';
  import Button from '../../ui/Button.svelte';
  import Card from '../../ui/Card.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Field from '../../ui/Field.svelte';
  import Icon from '../../ui/Icon.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import SearchField from '../../ui/SearchField.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import MapImport from '../dialogs/MapImport.svelte';
  import { defaultGameName, gameMeta, groupGames } from './library-logic.ts';
  import DeveloperScreen from '../developer/DeveloperScreen.svelte';
  import { peerMessage } from '../frame/peer-message.ts';
  import SessionSettingsDialog from '../session-settings/SessionSettingsDialog.svelte';
  import { exportGame, GAME_FILE_ACCEPT, importGame } from './game-files.ts';
  import { services } from './services.ts';
  import SharedLibrary from './SharedLibrary.svelte';

  interface Props {
    /** The joined table's session. */
    session: CompanionSession;
    /** Back to the table picker. */
    onchangetable?: () => void;
  }

  let { session, onchangetable }: Props = $props();

  let games = $state.raw<GameSummary[] | null>(null);
  let view = $state<'games' | 'maps'>('games');
  let query = $state('');
  let opening = $state<string | null>(null);
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let importing = $state<File | null>(null);
  let renaming = $state<GameSummary | null>(null);
  let newName = $state('');
  let deleting = $state<GameSummary | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  let gamePicker: HTMLInputElement | undefined = $state();
  let developer = $state(false);
  /** A new game waiting for its settings (shared map → Session settings dialog). */
  let starting = $state.raw<{ map: MapInfo; name: string } | null>(null);
  /** The settings this device started its last new game with (Upload and play uses them too). */
  let lastSettings = $state.raw<Partial<GameSettings>>({});
  services().getSetting<Partial<GameSettings>>('newGameSettings', {}).then((v) => (lastSettings = v ?? {}), () => {});
  let shared: SharedLibrary | undefined = $state();

  const root = $derived(session.view);
  let wide = $state(typeof matchMedia === 'function' ? matchMedia('(min-width: 720px)').matches : true);

  $effect(() => {
    const mq = matchMedia('(min-width: 720px)');
    const on = () => (wide = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const groups = $derived(groupGames(games ?? [], query));
  const cont = $derived(groups.cont);
  const table = $derived.by(() => {
    const t = root?.table;
    const g = t?.viewport ? tableGrid(t.viewport, t.widthInches, t.overscanPercent) : null;
    return g ? { cols: g.cols, rows: g.rows } : null;
  });

  /** Asks the TV for its games. */
  function list(): void {
    if (session.ready) session.request({ type: 'lib.list' });
  }

  $effect(() => {
    if (session.ready) list();
  });

  $effect(() => {
    const m = peerMessage(session.lastMessage);
    if (!m) return;
    if (m.type === 'lib.listing') {
      // never read `games` here: each check makes a new array, so a tracked read re-ran this forever
      const listed = m.games;
      games = listed;
      log.info('companion', 'Games listed', { count: listed.length });
    } else if (m.type === 'tv.notice') {
      // the app shows the notice itself; a failed open means this list is stale (another
      // tablet deleted the game) — ask again, so the card goes
      const wasOpening = untrack(() => opening) !== null;
      endOpening();
      if (wasOpening && m.level === 'error') setTimeout(list, 300);
    }
  });

  /** Clears the "opening" guard (the TV answered, failed, or 30 s passed). */
  function endOpening(): void {
    opening = null;
    clearTimeout(openTimer);
  }

  /** One open at a time; the guard clears itself after 30 s (parity CL-10). */
  function startOpening(id: string): boolean {
    if (opening) return false;
    opening = id;
    clearTimeout(openTimer);
    openTimer = setTimeout(endOpening, 30_000);
    return true;
  }

  function openGame(g: GameSummary): void {
    if (!startOpening(g.id)) return;
    log.info('companion', 'Open game', { id: g.id, name: g.name });
    if (!session.request({ type: 'game.open', gameId: g.id })) endOpening();
    else notify(`Loading “${g.name}”…`);
  }

  /**
   * Starts a new game on a map.
   *
   * @param map - the first map
   * @param name - its name (default "Session N · date")
   * @param settings - its settings (default: the ones this device used last)
   */
  function newGameOn(map: MapInfo, name = defaultGameName(map.name, games ?? []), settings: Partial<GameSettings> = lastSettings): void {
    if (!startOpening(map.id)) return;
    log.info('companion', 'New game', { name, map: map.name, cols: map.grid.cols, rows: map.grid.rows, settings });
    const sent = session.request({ type: 'game.new', game: { id: newId(), name, createdAt: new Date().toISOString(), map, settings } });
    if (!sent) endOpening();
    else notify(`Starting “${name}”…`);
  }

  /** A shared map's card: the session settings first, then the game (parity CL-05). */
  function playShared(e: LibraryEntry): void {
    if (opening) return;
    starting = { map: { ...e.map, libraryId: e.map.id }, name: defaultGameName(e.map.name, games ?? []) };
  }

  function startWith(name: string, settings: Partial<GameSettings>): void {
    const s = starting;
    starting = null;
    if (!s) return;
    lastSettings = settings;
    void services().putSetting('newGameSettings', settings);
    newGameOn(s.map, name, settings);
  }

  function pickedGame(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void importGame(file, (gameId) => session.request({ type: 'game.open', gameId })).then(() => setTimeout(list, 600));
  }

  function saveRename(): void {
    const g = renaming;
    const name = newName.trim();
    if (!g || !name) return;
    if (root?.game?.id === g.id) session.dispatch({ type: 'game.rename', name });
    else session.request({ type: 'game.renameStored', gameId: g.id, name });
    log.info('companion', 'Rename game', { id: g.id, name });
    games = (games ?? []).map((x) => (x.id === g.id ? { ...x, name } : x));
    renaming = null;
    notify(`Renamed to “${name}”`, { kind: 'success' });
    setTimeout(list, 400);
  }

  function confirmDelete(): void {
    const g = deleting;
    if (!g) return;
    session.request({ type: 'game.delete', gameId: g.id });
    log.info('companion', 'Delete game', { id: g.id, name: g.name });
    games = (games ?? []).filter((x) => x.id !== g.id);
    deleting = null;
    notify(`“${g.name}” deleted`, { kind: 'success' });
  }

  function gameMenu(g: GameSummary, id: string): void {
    if (id === 'rename') {
      newName = g.name;
      renaming = g;
    } else if (id === 'delete') deleting = g;
    else if (id === 'export') void exportGame(g, root?.game ?? null);
  }

  function picked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) importing = file;
  }

  const thumb = (g: GameSummary) => (g.thumb ? services().fileUrl(g.thumb) : undefined);
  const MENU = [
    { id: 'rename', label: 'Rename', icon: 'edit' as const },
    { id: 'export', label: 'Export to a file', icon: 'upload' as const },
    { id: 'delete', label: 'Delete', icon: 'delete' as const, danger: true, divider: true },
  ];
</script>

{#snippet gameCard(g: GameSummary)}
  <Card title={g.name} meta={gameMeta(g)} image={thumb(g)} disabled={opening !== null && opening !== g.id} onclick={() => openGame(g)}>
    {#snippet badges()}
      {#if opening === g.id}<Spinner size="16px" />{:else if g.where === 'server'}<Badge text="Backup" />{/if}
    {/snippet}
    {#snippet actions()}
      <IconButton icon="more" label="More for {g.name}" variant="quiet" menu={MENU} onmenu={(id) => gameMenu(g, id)} />
    {/snippet}
  </Card>
{/snippet}

<main class="library" data-testid="library">
  <header class="toolbar" data-ctl="toolbar">
    <IconButton
      icon="menu"
      label="Menu"
      menu={[
        { id: 'refresh', label: 'Refresh the list', icon: 'sync' },
        { id: 'import', label: 'Import a game file', icon: 'download' },
        { id: 'table', label: 'Change table', icon: 'tv', divider: true },
        { id: 'dev', label: 'Logs and diagnostics', icon: 'info' },
      ]}
      onmenu={(id) => (id === 'table' ? onchangetable?.() : id === 'import' ? gamePicker?.click() : id === 'dev' ? (developer = true) : list())}
    />
    <div class="search">
      <SearchField bind:value={query} expanded={wide} label="Search games and maps" placeholder="Search games and maps" />
    </div>
    <Segmented
      label="Show"
      bind:value={view as string}
      options={[{ id: 'games', label: 'Games', icon: 'game' }, { id: 'maps', label: 'Maps', icon: 'library' }]}
    />
    <span class="status">
      {#if !session.tvOnline}<Badge text="TV not connected" icon="warning" tone="warn" />{/if}
    </span>
    <Button label="Upload" icon="upload" variant="primary" onclick={() => picker?.click()} />
    <input bind:this={picker} type="file" hidden onchange={picked} data-testid="upload-input" />
    <input bind:this={gamePicker} type="file" accept={GAME_FILE_ACCEPT} hidden onchange={pickedGame} data-testid="game-file-input" />
  </header>

  <div class="content bm-scroll">
    {#if view === 'games'}
      {#if games === null}
        <div class="state">
          {#if session.ready}<Spinner label="Asking the TV for its games…" />{:else}<Spinner label="Connecting to the TV…" />{/if}
        </div>
      {:else if games.length === 0}
        <div class="empty">
          <span class="empty-mark"><Icon name="map" size="36px" /></span>
          <h2 class="bm-headline">No games yet</h2>
          <p>Upload a map — a picture, a PDF or a .dd2vtt — or pick one from the shared maps to start the first game.</p>
          <div class="row">
            <Button label="Upload a map" icon="upload" onclick={() => picker?.click()} />
            <Button label="Shared maps" icon="library" onclick={() => (view = 'maps')} />
          </div>
        </div>
      {:else}
        <div class="grid" data-testid="games">
          {#if cont}
            <div class="cont">
              <Card
                title={cont.name}
                meta={gameMeta(cont)}
                image={thumb(cont)}
                prominent
                disabled={opening !== null && opening !== cont.id}
                onclick={() => openGame(cont)}
              >
                {#snippet badges()}
                  {#if opening === cont.id}<Spinner size="16px" />{:else}<Badge text="Continue" icon="play" tone="accent" />{/if}
                {/snippet}
                {#snippet actions()}
                  <IconButton icon="more" label="More for {cont.name}" variant="quiet" menu={MENU} onmenu={(id) => gameMenu(cont, id)} />
                {/snippet}
              </Card>
            </div>
          {/if}
          {#each groups.onTv as g (g.id)}
            {@render gameCard(g)}
          {/each}
        </div>
        {#if groups.backups.length > 0}
          <section class="backups" data-testid="backups" aria-labelledby="bm-backups-h">
            <h2 id="bm-backups-h" class="bm-eyebrow">Backups on the server</h2>
            <p class="hint">Not on this TV — saved by this or another TV. Opening one brings it onto this TV.</p>
            <div class="grid">
              {#each groups.backups as g (g.id)}
                {@render gameCard(g)}
              {/each}
            </div>
          </section>
        {/if}
        {#if query && !cont && groups.onTv.length === 0 && groups.backups.length === 0}<p class="state">No game matches “{query}”.</p>{/if}
      {/if}
    {:else}
      <SharedLibrary bind:this={shared} {query} busyId={opening} onpick={playShared} onfile={(f) => (importing = f)} />
    {/if}
  </div>
</main>

{#if importing}
  <MapImport
    file={importing}
    {table}
    commitLabel="Upload and play"
    ondone={(map) => {
      importing = null;
      void shared?.reload();
      newGameOn(map);
    }}
    oncancel={() => (importing = null)}
  />
{/if}

{#if starting}
  <SessionSettingsDialog open mode="new" name={starting.name} settings={lastSettings} onstart={startWith} onclose={() => (starting = null)} />
{/if}

<DeveloperScreen open={developer} {session} onclose={() => (developer = false)} />

<Dialog open={renaming !== null} title="Rename the game" icon="edit" size="sm" onclose={() => (renaming = null)}>
  <Field label="Name" bind:value={newName} onenter={saveRename} />
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (renaming = null)} />
    <Button label="Rename" icon="check" variant="primary" disabled={!newName.trim()} onclick={saveRename} />
  {/snippet}
</Dialog>

<Dialog
  open={deleting !== null}
  title="Delete this game?"
  description={deleting ? `“${deleting.name}” is deleted on the TV and in the backup: its fog, tokens and drawings are lost. The maps stay in the library.` : ''}
  icon="delete"
  size="sm"
  onclose={() => (deleting = null)}
>
  {#snippet footer()}
    <Button label="Keep it" variant="flat" onclick={() => (deleting = null)} />
    <Button label="Delete" icon="delete" variant="primary" tone="danger" onclick={confirmDelete} />
  {/snippet}
</Dialog>

<style>
  .library {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    --notice-bottom: var(--g2);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--g);
    padding: var(--g) var(--g2);
    border-bottom: 1px solid var(--hair);
    background: var(--m0);
  }

  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    max-width: 30rem;
  }

  .status {
    margin-left: auto;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--g2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--g2);
    align-items: start;
  }

  .cont {
    grid-column: span 2;
  }

  .backups {
    margin-top: calc(var(--g2) * 2);
    display: grid;
    gap: var(--g);
  }

  .backups h2 {
    margin: 0;
  }

  .hint {
    margin: 0 0 var(--g);
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .state {
    display: grid;
    place-items: center;
    padding: calc(var(--g2) * 3) var(--g);
    margin: 0;
    color: var(--t2);
  }

  .empty {
    max-width: 34rem;
    margin: calc(var(--g2) * 3) auto;
    display: grid;
    gap: var(--g2);
    justify-items: center;
    text-align: center;
  }

  .empty-mark {
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 12%, var(--m1));
    color: var(--accent-text);
  }

  .empty h2 {
    margin: 0;
  }

  .empty p {
    margin: 0;
    color: var(--t2);
  }

  .row {
    display: flex;
    gap: var(--g);
    flex-wrap: wrap;
    justify-content: center;
  }

  @media (max-width: 719px) {
    .toolbar {
      flex-wrap: wrap;
      padding: var(--g);
    }

    .search {
      order: 5;
      flex-basis: 100%;
      max-width: none;
    }

    .status:empty {
      display: none;
    }

    .content {
      padding: var(--g);
    }

    .grid {
      grid-template-columns: 1fr 1fr;
      gap: var(--g);
    }

    .cont {
      grid-column: 1 / -1;
    }
  }
</style>
