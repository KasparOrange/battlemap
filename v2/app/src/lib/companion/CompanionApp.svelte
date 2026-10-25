<!--
  CompanionApp — companion mode (skeleton): picks a table (the server's list of tables with a
  TV online, remembered for next time), joins its room, and offers a few test actions that go
  through the whole path — calibrate, reset, start a test game, reveal all. The companion UI
  package replaces it with the real screens (tabs, map, tools).
  No props: it reads the page's configuration (lib/config.ts, mode companion).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { newId, wholeGrid, type MapInfo } from '@battlemap/shared';
  import { appConfig, rememberTable, type AppConfig } from '../config.ts';
  import { log } from '../log.ts';
  import { CompanionSession } from '../state/sessions.svelte.ts';
  import Button from '../ui/Button.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { notify } from '../ui/notice.svelte.ts';

  const config: AppConfig = appConfig();

  /** A table the server knows (`GET /api/tables`). */
  interface TableRow { room: string; tvName: string; companions: number }

  const tableId = config.tableId;
  const session = tableId ? new CompanionSession(config, tableId) : null;
  let tables = $state<TableRow[] | null>(null);
  let loadingTables = $state(false);

  const view = $derived(session?.view ?? null);

  /** Loads the list of tables with a TV online. */
  async function loadTables(): Promise<void> {
    loadingTables = true;
    const t0 = performance.now();
    try {
      const r = await fetch(`${config.serverUrl}/api/tables`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tables = ((await r.json()) as { tables: TableRow[] }).tables;
      log.info('companion', 'Tables listed', { count: tables.length, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      log.warn('companion', 'Tables not listed', { error: String(e) });
      notify("Couldn't reach the server for the list of tables.", { kind: 'error' });
    } finally {
      loadingTables = false;
    }
  }

  /** Joins a table: remembered, then the page reloads with `?table=`. */
  function join(room: string): void {
    rememberTable(room);
    const url = new URL(location.href);
    url.searchParams.set('table', room);
    location.href = url.toString();
  }

  /** A made-up picture map for trying the path end to end. */
  function testMap(): MapInfo {
    return {
      id: newId(), name: 'Test map', kind: 'picture', picture: { hash: '0000000000000000', ext: 'png', bytes: 0 },
      tableCopy: null, geometry: null, grid: wholeGrid(30, 20, 3000, 2000), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
    };
  }

  function startTestGame(): void {
    session?.request({ type: 'game.new', game: { id: newId(), name: 'Test game', createdAt: new Date().toISOString(), map: testMap() } });
  }

  onMount(() => {
    if (session) session.start();
    else void loadTables();
    return () => session?.stop();
  });
</script>

<main class="companion">
  {#if !session}
    <h2>Pick a table</h2>
    {#if loadingTables}
      <Spinner />
    {:else if tables && tables.length === 0}
      <p>No TV is online. Start TV mode on the box, then refresh.</p>
    {/if}
    {#each tables ?? [] as t (t.room)}
      <Button label={t.tvName} hint={t.room} icon="tv" onclick={() => join(t.room)} />
    {/each}
    <Button label="Refresh" icon="sync" variant="flat" loading={loadingTables} onclick={() => void loadTables()} />
  {:else}
    <p data-testid="companion-status">
      {session.connection} · TV {session.tvOnline ? 'online' : 'away'} · {session.ready ? 'ready' : 'not ready'} · rev {session.rev}
      · width {view?.table.widthInches ?? '?'} in · game {view?.game?.name ?? 'none'}
    </p>
    <div class="actions">
      <Button label="Calibrate 40 in" icon="measure" onclick={() => session.dispatch({ type: 'table.calibrate', widthInches: 40 })} />
      <Button label="Back to auto" icon="undo" onclick={() => session.dispatch({ type: 'table.reset' })} />
      <Button label="Start a test game" icon="play" onclick={startTestGame} />
      {#if view?.game}
        <Button label="Reveal all" icon="reveal" onclick={() => session.dispatch({ type: 'fog.all', value: 'reveal' })} />
      {/if}
    </div>
  {/if}
</main>

<style>
  .companion { padding: 24px; display: grid; gap: 16px; align-content: start; max-width: 720px; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  p { margin: 0; }
</style>
