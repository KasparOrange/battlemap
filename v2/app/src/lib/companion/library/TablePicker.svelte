<!--
  TablePicker — the companion's first screen when it has no table yet: the tables (TVs) the
  server sees online, the one used last on top, a tap pairs. The TV's start screen shows its
  table's name and code, so the DM picks the matching row. Refreshes by itself every few
  seconds while shown (a TV switched on a moment ago appears without a tap).

  Props:
  - lastTable: string | null — the table this device joined before (marked "Last used")
  - onpick: (room: string) => void — a table was chosen
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { log } from '../../log.ts';
  import Button from '../../ui/Button.svelte';
  import Icon from '../../ui/Icon.svelte';
  import ListRow from '../../ui/ListRow.svelte';
  import Badge from '../../ui/Badge.svelte';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import DeveloperScreen from '../developer/DeveloperScreen.svelte';
  import { tableCode } from '../frame/table-code.ts';
  import { services, type TableRow } from './services.ts';

  interface Props {
    /** The table joined last time. */
    lastTable?: string | null;
    /** A table was chosen. */
    onpick: (room: string) => void;
  }

  let { lastTable = null, onpick }: Props = $props();

  let tables = $state<TableRow[] | null>(null);
  let loading = $state(false);
  let failed = $state(false);
  let developer = $state(false);

  /** Tables sorted: last used first, then by name. */
  const sorted = $derived(
    [...(tables ?? [])].sort((a, b) => Number(b.room === lastTable) - Number(a.room === lastTable) || a.tvName.localeCompare(b.tvName)),
  );


  /**
   * Loads the tables.
   *
   * @param quiet - a background refresh: no notice on failure (the screen says it)
   */
  async function load(quiet = false): Promise<void> {
    if (loading) return;
    loading = true;
    const t0 = performance.now();
    try {
      tables = await services().listTables();
      failed = false;
      if (!quiet) log.info('companion', 'Tables listed', { count: tables.length, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      if (!failed) log.warn('companion', 'Tables not listed', { error: String(e) });
      failed = true;
      if (!quiet) notify("Couldn't reach the server for the list of tables.", { kind: 'error' });
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(true), 4000);
    return () => clearInterval(timer);
  });
</script>

<main class="picker" data-testid="table-picker">
  <header>
    <span class="mark"><Icon name="candle" filled size="28px" /></span>
    <h1 class="bm-headline">battlemap</h1>
  </header>

  <section class="card bm-sf">
    <div class="head">
      <div>
        <h2>Pick your table</h2>
        <p class="sub">Pick the code your TV shows at the bottom of its start screen.</p>
      </div>
      <Button label="Refresh" icon="sync" variant="flat" loading={loading && tables !== null} onclick={() => void load()} />
    </div>

    {#if tables === null}
      <div class="state"><Spinner label="Looking for tables…" /></div>
    {:else if failed && tables.length === 0}
      <div class="state">
        <Icon name="wifi-off" size="32px" />
        <p>Can't reach the server. Check the Wi-Fi, then refresh.</p>
      </div>
    {:else if sorted.length === 0}
      <div class="state">
        <Icon name="tv" size="32px" />
        <p>No TV is online yet. Start battlemap on the TV in TV mode — it appears here by itself.</p>
      </div>
    {:else}
      <ul class="list" aria-label="Tables">
        {#each sorted as t (t.room)}
          <li>
            <ListRow
              title={t.tvName || 'TV'}
              sub={t.companions > 0 ? `${t.companions} ${t.companions === 1 ? 'tablet' : 'tablets'} connected` : 'Waiting for a tablet'}
              icon="tv"
              selected={t.room === lastTable}
              onclick={() => onpick(t.room)}
            >
              {#snippet trailing()}
                {#if t.room === lastTable}<Badge text="Last used" tone="accent" />{/if}
                <span class="code" title={t.room}>{tableCode(t.room)}</span>
              {/snippet}
            </ListRow>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <Button label="Logs and diagnostics" icon="info" variant="flat" size="compact" onclick={() => (developer = true)} />
</main>

<DeveloperScreen open={developer} session={null} onclose={() => (developer = false)} />

<style>
  .picker {
    min-height: 100dvh;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--g2);
    padding: var(--g2);
    background: var(--bg);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--g);
    color: var(--accent);
  }

  h1 {
    margin: 0;
    color: var(--t);
  }

  .card {
    width: min(100%, var(--dialog-w));
    padding: var(--g2);
    border-radius: var(--r);
    display: grid;
    gap: var(--g2);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--g);
  }

  h2 {
    margin: 0;
    font: var(--fw-title, 600) var(--fs-title) / 1.2 var(--font-title);
    color: var(--t);
  }

  .sub {
    margin: calc(var(--g) / 2) 0 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .state {
    display: grid;
    justify-items: center;
    gap: var(--g);
    padding: var(--g2) var(--g);
    text-align: center;
    color: var(--t2);
  }

  .state p {
    margin: 0;
    max-width: 32ch;
  }

  .list {
    list-style: none;
    margin: 0 calc(var(--g) * -1);
    padding: 0;
    display: grid;
    gap: 2px;
  }

  /* the code is what the DM matches with the TV's screen: a mono chip, easy to read */
  .code {
    padding: calc(var(--g) / 2) var(--g);
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    font: 600 var(--fs-value) / 1 var(--font-value);
    letter-spacing: 0.12em;
    color: var(--accent-text);
  }
</style>
