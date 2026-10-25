<!--
  CompanionApp — companion mode's root (parity CS-02). It installs the companion's services
  (`setServices(appServices())`, before any screen mounts) and routes: no table yet → the table
  picker; a table joined but no state yet → "Connecting…"; the TV shows its library → the
  library; a game is open on the TV → the game screen. The view follows the TV's state.

  It turns the TV's messages for the DM into feedback, each checked with the shared schemas
  (`frame/peer-message.ts`): `tv.status` — a card over the library while the TV opens something,
  but only a small status pill in a game, so it never covers the map that is already drawn
  (qa#23); `tv.notice` and `deploy.ready` — notices. A server that refuses this app (protocol
  mismatch) or announces a new build gets a reload offer (rv#13).
  No props: it reads the page's configuration (lib/config.ts, mode companion).
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { appConfig, checkServerChoice, joinTable, rememberTable, type AppConfig } from '../config.ts';
  import { log } from '../log.ts';
  import { CompanionSession } from '../state/sessions.svelte.ts';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import ProgressBar from '../ui/ProgressBar.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { notify } from '../ui/notice.svelte.ts';
  import { lastUsedTable, rememberUsedTable } from './frame/last-table.ts';
  import { peerMessage } from './frame/peer-message.ts';
  import GameScreen from './game/GameScreen.svelte';
  import { appServices } from './library/app-services.ts';
  import LibraryScreen from './library/LibraryScreen.svelte';
  import { setServices } from './library/services.ts';
  import { serverWhere } from './library/picker-logic.ts';
  import TablePicker from './library/TablePicker.svelte';

  setServices(appServices());

  const config: AppConfig = appConfig();
  const tableId = config.tableId;
  const debug = new URL(location.href).searchParams.get('debug') === '1';
  const session = tableId ? new CompanionSession(config, tableId) : null;
  if (tableId) rememberUsedTable(tableId);

  /** What the TV is busy with (`tv.status`), or null. */
  let busy = $state<{ text: string; progress: number | null } | null>(null);
  /** A newer app build the server announced (`server.build`), or null. */
  let newBuild = $state<string | null>(null);

  const view = $derived(session?.view ?? null);
  const route = $derived(!session ? 'picker' : !view ? 'connecting' : view.game ? 'game' : 'library');
  const refused = $derived(session?.connection === 'refused');

  /** The start check of a remembered LAN table server (`checkServerChoice`), once per load. */
  let serverCheck = $state<'checking' | 'ok' | 'fallback' | 'unreachable'>(config.lan ? 'checking' : 'ok');

  /**
   * Joins a table: remembered (per table, which server it lives on), then the page loads the
   * companion for it — on a TV's own table server for a table nearby.
   */
  function join(room: string | null, serverUrl: string): void {
    log.info('companion', 'Join table', { room, server: serverUrl, lan: serverUrl !== config.serverUrl });
    if (room) rememberUsedTable(room);
    joinTable(serverUrl, room);
  }

  /** Leaves the table (back to the picker, which still marks it "Last used"). */
  function leaveTable(): void {
    log.info('companion', 'Leave the table', { room: tableId, server: config.serverUrl });
    rememberTable(null);
    const url = new URL(location.href);
    url.searchParams.delete('table');
    // a table nearby was on the TV's own server: the picker lists from the usual server again
    if (config.lan && config.homeServerUrl) url.searchParams.set('server', config.homeServerUrl);
    url.searchParams.delete('lan');
    location.href = url.toString();
  }

  /** Reloads the page for the server's new build. */
  function reload(): void {
    log.info('companion', 'Reload for a new build', { build: newBuild, mine: config.build });
    location.reload();
  }

  // the session owns the one server-message callback; chain ours behind it
  if (session) {
    const prev = session.conn.onServerMessage;
    session.conn.onServerMessage = (msg) => {
      prev?.(msg);
      if (msg.type === 'server.build' && msg.build !== config.build) {
        newBuild = msg.build;
        notify('A new version of battlemap is ready.', { kind: 'info', action: { label: 'Reload', run: reload }, ms: 15_000 });
      }
    };
  }

  $effect(() => {
    const msg = peerMessage(session?.lastMessage ?? null);
    if (!msg) return;
    switch (msg.type) {
      case 'tv.status': {
        // untracked: this effect writes `busy`, so reading it tracked looped (effect_update_depth_exceeded)
        if (!!msg.busy !== !!untrack(() => busy)) log.info('companion', msg.busy ? 'TV busy' : 'TV ready', { text: msg.busy });
        busy = msg.busy ? { text: msg.busy, progress: msg.progress } : null;
        return;
      }
      case 'tv.notice':
        notify(`TV: ${msg.text}`, { kind: msg.level === 'error' ? 'error' : msg.level === 'warn' ? 'warning' : 'info' });
        busy = null;
        return;
      case 'deploy.ready':
        notify('The TV is updating — back in a few seconds.');
        return;
    }
  });

  $effect(() => {
    log.info('companion', 'Route', { route });
  });

  onMount(() => {
    session?.start();
    // a remembered table on a TV's own server that doesn't answer: the internet server instead
    void checkServerChoice(config).then(
      (r) => {
        serverCheck = r;
        if (r !== 'ok') log.warn('companion', 'Table server check', { result: r, server: config.serverUrl, home: config.homeServerUrl });
      },
      (e: unknown) => log.warn('companion', 'Table server check failed', { error: String(e) }),
    );
    return () => session?.stop();
  });
</script>

{#if route === 'picker'}
  <TablePicker lastTable={lastUsedTable()} onpick={join} />
{:else if refused}
  <main class="center" data-testid="companion-refused">
    <Icon name="sync" size="32px" />
    <h1 class="bm-headline">A new version is needed</h1>
    <p>The server runs a newer battlemap than this tablet. Reload to get it — the game on the TV is not affected.</p>
    <div class="row">
      <Button label="Reload" icon="sync" variant="primary" onclick={reload} />
      <Button label="Another table" icon="tv" variant="flat" onclick={leaveTable} />
    </div>
  </main>
{:else if route === 'connecting' && session}
  <main class="center">
    <Spinner />
    <p>
      {#if serverCheck === 'unreachable'}
        The TV that hosts this table doesn't answer on this Wi-Fi. Is it on, and is this tablet on the same Wi-Fi?
      {:else if serverCheck === 'fallback'}
        The TV's own server doesn't answer — switching to the online server…
      {:else if session.connection !== 'open'}
        Connecting to the table {serverWhere(config.serverUrl) === 'tv' ? 'on the TV' : 'online'}…
      {:else if !session.tvOnline}
        Waiting for the TV — switch it on and start battlemap in TV mode.
      {:else}
        Loading the table…
      {/if}
    </p>
    <Button label="Another table" icon="tv" variant="flat" onclick={leaveTable} />
  </main>
{:else if route === 'library' && session}
  <LibraryScreen {session} onchangetable={leaveTable} />
{:else if route === 'game' && session}
  <div class="full">
    <GameScreen {config} {session} />
  </div>
{/if}

{#if debug && session}
  <p class="debug" data-testid="companion-status">
    {session.connection} · TV {session.tvOnline ? 'online' : 'away'} · {session.ready ? 'ready' : 'not ready'} · rev {session.rev}
    · width {view?.table.widthInches ?? '?'} in · game {view?.game?.name ?? 'none'}
  </p>
{/if}

{#if busy && route === 'game'}
  <div class="pill bm-sf" role="status" aria-live="polite" data-testid="tv-busy">
    <Spinner size="16px" />
    <span>TV: {busy.text}</span>
    {#if busy.progress !== null}<span class="pct">{Math.round(busy.progress * 100)} %</span>{/if}
  </div>
{:else if busy}
  <div class="busy" role="status" aria-live="polite" data-testid="tv-busy">
    <div class="card">
      {#if busy.progress === null}<Spinner />{/if}
      <p>{busy.text}</p>
      {#if busy.progress !== null}<ProgressBar value={busy.progress} label={busy.text} />{/if}
    </div>
  </div>
{/if}

<style>
  .full {
    position: fixed;
    inset: 0;
  }

  .center {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--g2);
    padding: var(--g2);
    background: var(--bg);
    color: var(--t2);
    text-align: center;
  }

  .center p,
  .center h1 {
    margin: 0;
    max-width: 28rem;
  }

  .center h1 {
    color: var(--t);
  }

  .row {
    display: flex;
    gap: var(--g);
    flex-wrap: wrap;
    justify-content: center;
  }

  .debug {
    position: fixed;
    left: 12px;
    bottom: 2px;
    z-index: var(--z-tooltip);
    margin: 0;
    font: 11px ui-monospace, monospace;
    color: #8a8;
    pointer-events: none;
  }

  .busy {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: grid;
    place-items: center;
    background: var(--scrim);
  }

  .card {
    display: grid;
    justify-items: center;
    gap: var(--g);
    min-width: 16rem;
    padding: var(--g2);
    border-radius: var(--r);
    background: var(--m3);
    box-shadow: var(--elev-open);
    color: var(--t);
  }

  .card p {
    margin: 0;
  }

  /* in a game: a small pill at the top middle of the map, never over the table's middle */
  .pill {
    position: fixed;
    top: var(--g2);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-sheet);
    display: flex;
    align-items: center;
    gap: var(--g);
    max-width: min(28rem, calc(100vw - 8rem));
    padding: calc(var(--g) / 2) var(--g2) calc(var(--g) / 2) var(--g);
    border-radius: 999px;
    box-shadow: var(--elev-float);
    font-size: var(--fs-small);
    color: var(--t);
    pointer-events: none;
  }

  .pill span:first-of-type {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pct {
    font-family: var(--font-value);
    color: var(--t2);
  }
</style>
