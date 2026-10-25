<!--
  TablePicker — the companion's first screen when it has no table yet. Two groups, nearest first:

  - **Tables nearby** — TVs on this Wi-Fi that host the game themselves (LAN play: plays without
    internet). Inside the Android shell they are found by themselves (`discoverLanTables`); in a
    browser the DM types the short code the TV's start screen shows (`decodeLanCode`).
  - **Online tables** — TVs the battlemap server sees (refreshes every few seconds while shown).

  Every row says where its table runs ("On the TV" / "Online") and shows the code the TV shows, so
  the DM picks the matching one; the table used last is on top. A tap joins (`onpick`).

  Props:
  - lastTable: string | null — the table this device joined before (marked "Last used")
  - onpick: (room: string | null, serverUrl: string) => void — a table (or a table server whose
    table is picked there, room null) was chosen
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../api/index.ts';
  import { canDiscoverLan, decodeLanCode, discoverLanTables, isLanUrl } from '../../config.ts';
  import { log } from '../../log.ts';
  import type { LanTable } from '../../shell.ts';
  import Badge from '../../ui/Badge.svelte';
  import Button from '../../ui/Button.svelte';
  import Field from '../../ui/Field.svelte';
  import Icon from '../../ui/Icon.svelte';
  import ListRow from '../../ui/ListRow.svelte';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import DeveloperScreen from '../developer/DeveloperScreen.svelte';
  import { nearbyRows, serverRows, tablesAt, WHERE_LABEL, type PickerRow } from './picker-logic.ts';
  import { services, type TableRow } from './services.ts';

  interface Props {
    /** The table joined last time. */
    lastTable?: string | null;
    /** A table was chosen: its room (null = pick on that server) and its server. */
    onpick: (room: string | null, serverUrl: string) => void;
  }

  let { lastTable = null, onpick }: Props = $props();

  const discover = canDiscoverLan();
  /** This page itself talks to a TV's table server (opened from the TV's QR code). */
  const onTvServer = isLanUrl(api.serverUrl);

  let tables = $state.raw<TableRow[] | null>(null);
  let found = $state.raw<LanTable[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let developer = $state(false);
  let code = $state('');
  let codeError = $state('');
  let joining = $state(false);

  const nearby = $derived(nearbyRows(found, lastTable));
  const online = $derived(serverRows(tables ?? [], api.serverUrl, lastTable, nearby));

  /**
   * Loads the server's tables.
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
      if (!quiet) log.info('companion', 'Tables listed', { count: tables.length, server: api.serverUrl, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      if (!failed) log.warn('companion', 'Tables not listed', { server: api.serverUrl, error: String(e) });
      failed = true;
      tables ??= [];
      if (!quiet) notify("Couldn't reach the server for the list of tables.", { kind: 'error' });
    } finally {
      loading = false;
    }
  }

  function pick(row: PickerRow): void {
    log.info('companion', 'Table picked', { room: row.room, name: row.name, where: row.where, server: row.serverUrl });
    onpick(row.room, row.serverUrl);
  }

  /** The typed code: read it, ask that TV's server for its table, join it. */
  async function joinCode(): Promise<void> {
    if (joining) return;
    const url = decodeLanCode(code);
    if (!url) {
      codeError = 'That is not a table code — it has 4 or 7 letters and digits, like 009A.';
      return;
    }
    codeError = '';
    joining = true;
    log.info('companion', 'Table code typed', { code, url });
    try {
      const at = await services().listTables(url);
      const rows = tablesAt(url, at);
      if (rows.length === 1 && rows[0]!.table) {
        onpick(rows[0]!.table, url);
        return;
      }
      if (rows.length === 0) {
        codeError = 'The TV answers, but no game table is open on it yet — start battlemap in TV mode.';
        return;
      }
      found = rows; // several tables on that TV's server: show them as nearby rows
    } catch (e) {
      // a browser page on https can't ask a plain-http TV directly: open the TV's own app instead
      log.info('companion', 'Table server not asked from here — opening its own app', { url, error: String(e) });
      onpick(null, url);
    } finally {
      joining = false;
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(true), 4000);
    const stop = discover
      ? discoverLanTables((list) => {
          if (list.length !== found.length) log.info('companion', 'Tables nearby', { count: list.length });
          found = list;
        })
      : () => {};
    return () => {
      clearInterval(timer);
      stop();
    };
  });
</script>

{#snippet row(r: PickerRow)}
  <li>
    <ListRow title={r.name} sub={r.sub} icon={r.where === 'tv' ? 'tv' : 'connected'} selected={r.lastUsed} onclick={() => pick(r)}>
      {#snippet trailing()}
        {#if r.lastUsed}<span class="last"><Badge text="Last used" tone="accent" /></span>{/if}
        <Badge text={WHERE_LABEL[r.where]} tone={r.where === 'tv' ? 'ok' : undefined} />
        <span class="code" title={r.room ?? r.serverUrl}>{r.code}</span>
      {/snippet}
    </ListRow>
  </li>
{/snippet}

<main class="picker" data-testid="table-picker">
  <header>
    <span class="mark"><Icon name="candle" filled size="28px" /></span>
    <h1 class="bm-headline">battlemap</h1>
  </header>

  <section class="card bm-sf" aria-labelledby="bm-pick-h">
    <h2 id="bm-pick-h" class="title">Pick your table</h2>
    <p class="sub">Match the code your TV shows at the bottom of its start screen.</p>

    {#if !onTvServer}
      <div class="group" data-testid="tables-nearby">
        <div class="group-head">
          <h3 class="bm-eyebrow">Tables nearby</h3>
          {#if discover}<span class="looking"><Spinner size="14px" />Looking on this Wi-Fi</span>{/if}
        </div>
        {#if nearby.length > 0}
          <ul class="list" aria-label="Tables nearby">
            {#each nearby as r (r.key)}{@render row(r)}{/each}
          </ul>
        {:else if discover}
          <p class="hint">A TV that hosts the table on this Wi-Fi appears here by itself — no internet needed.</p>
        {/if}
        {#if !discover}
          <div class="code-row">
            <div class="code-field">
              <Field
                label="The TV's code"
                placeholder="009A"
                icon="qr"
                bind:value={code}
                error={codeError}
                helper={codeError ? undefined : 'On the TV: the code under "On the tablet, open battlemap".'}
                enterkeyhint="go"
                onenter={() => void joinCode()}
                oninput={() => (codeError = '')}
              />
            </div>
            <Button label="Join" icon="play" loading={joining} disabled={!code.trim()} onclick={() => void joinCode()} />
          </div>
        {/if}
      </div>
    {/if}

    <div class="group" data-testid="tables-online">
      <div class="group-head">
        <h3 class="bm-eyebrow">{onTvServer ? 'Tables on this TV' : 'Online tables'}</h3>
        <Button label="Refresh" icon="sync" variant="flat" size="compact" loading={loading && tables !== null} onclick={() => void load()} />
      </div>
      {#if tables === null}
        <div class="state"><Spinner label="Looking for tables…" /></div>
      {:else if failed && online.length === 0}
        <div class="state">
          <Icon name="wifi-off" size="28px" />
          <p>Can't reach the battlemap server. {nearby.length > 0 || !discover ? 'Tables nearby still work.' : 'Check the Wi-Fi, then refresh.'}</p>
        </div>
      {:else if online.length === 0}
        <div class="state">
          <Icon name="tv" size="28px" />
          <p>No TV is online yet. Start battlemap on the TV in TV mode — it appears here by itself.</p>
        </div>
      {:else}
        <ul class="list" aria-label="Tables">
          {#each online as r (r.key)}{@render row(r)}{/each}
        </ul>
      {/if}
    </div>
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
    width: min(100%, 34rem);
    padding: var(--g2);
    border-radius: var(--r);
    display: grid;
    gap: var(--g2);
  }

  .title {
    margin: 0;
    font: var(--fw-title, 600) var(--fs-title) / 1.2 var(--font-title);
    color: var(--t);
  }

  .sub {
    margin: calc(var(--g2) * -1 + var(--g) / 2) 0 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .group {
    display: grid;
    gap: var(--g);
  }

  .group + .group {
    padding-top: var(--g2);
    border-top: 1px solid var(--hair);
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--g);
    min-height: var(--sq-compact);
  }

  .group-head h3 {
    margin: 0;
  }

  .looking {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--g) / 2);
    font-size: var(--fs-meta);
    color: var(--t3);
  }

  .hint {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .code-row {
    display: flex;
    align-items: flex-start;
    gap: var(--g);
  }

  .code-field {
    flex: 1;
    min-width: 0;
  }

  /* the Join button lines up with the field's box, not with its label */
  .code-row > :global(:last-child) {
    margin-top: calc(var(--fs-small) * 1.4 + var(--g) / 2);
  }

  .state {
    display: grid;
    justify-items: center;
    gap: var(--g);
    padding: var(--g) var(--g);
    text-align: center;
    color: var(--t2);
  }

  .state p {
    margin: 0;
    max-width: 36ch;
    font-size: var(--fs-small);
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

  /* a phone: the row's glow already marks the last used table */
  @media (max-width: 480px) {
    .last {
      display: none;
    }
  }
</style>
