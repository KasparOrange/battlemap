<!--
  CompanionApp — companion mode's top-level routing (parity CS-02): no table yet → the table
  picker; a table joined but no state yet → "Connecting…"; the TV shows its library → the
  library screen; a game is open on the TV → the game screen. The view follows the TV's state.
  It also turns the TV's messages for the DM into feedback: `tv.status` (a busy card with
  progress, the same the TV shows), `tv.notice` and `deploy.ready` (notices).

  The picker and the library are package 4b's (`library/TablePicker.svelte` with
  `{ lastTable, onpick }`, `library/LibraryScreen.svelte` with `{ config, session }`); they are
  found with `import.meta.glob`, and a plain stand-in shows until they exist.
  No props: it reads the page's configuration (lib/config.ts, mode companion).
-->
<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { appConfig, rememberTable, type AppConfig } from '../config.ts';
  import { log } from '../log.ts';
  import { CompanionSession } from '../state/sessions.svelte.ts';
  import Button from '../ui/Button.svelte';
  import ProgressBar from '../ui/ProgressBar.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { notify } from '../ui/notice.svelte.ts';
  import GameScreen from './game/GameScreen.svelte';

  const config: AppConfig = appConfig();

  type Loose = Component<Record<string, unknown>>;
  const screens = import.meta.glob<{ default: Loose }>(['./library/TablePicker.svelte', './library/LibraryScreen.svelte'], { eager: true });
  const TablePicker = screens['./library/TablePicker.svelte']?.default ?? null;
  const LibraryScreen = screens['./library/LibraryScreen.svelte']?.default ?? null;

  const tableId = config.tableId;
  const debug = new URL(location.href).searchParams.get('debug') === '1';
  const session = tableId ? new CompanionSession(config, tableId) : null;

  /** What the TV is busy with (`tv.status`), or null. */
  let busy = $state<{ text: string; progress: number | null } | null>(null);

  const view = $derived(session?.view ?? null);
  const route = $derived(!session ? 'picker' : !view ? 'connecting' : view.game ? 'game' : 'library');

  /** Joins a table: remembered, then the page reloads with `?table=`. */
  function join(room: string): void {
    log.info('companion', 'Table picked', { room });
    rememberTable(room);
    const url = new URL(location.href);
    url.searchParams.set('table', room);
    location.href = url.toString();
  }

  /** Leaves the table (back to the picker). */
  function leaveTable(): void {
    rememberTable(null);
    const url = new URL(location.href);
    url.searchParams.delete('table');
    location.href = url.toString();
  }

  $effect(() => {
    const msg = session?.lastMessage;
    if (!msg) return;
    switch (msg.type) {
      case 'tv.status': {
        const text = typeof msg.busy === 'string' ? msg.busy : null;
        busy = text ? { text, progress: typeof msg.progress === 'number' ? msg.progress : null } : null;
        return;
      }
      case 'tv.notice': {
        const level = msg.level === 'error' ? 'error' : msg.level === 'warn' ? 'warning' : 'info';
        notify(`TV: ${String(msg.text ?? '')}`, { kind: level });
        busy = null;
        return;
      }
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
    return () => session?.stop();
  });
</script>

{#if route === 'picker'}
  {#if TablePicker}
    <TablePicker lastTable={null} onpick={join} />
  {:else}
    <main class="center">
      <p>Pick a table — the table picker is on its way.</p>
    </main>
  {/if}
{:else if route === 'connecting' && session}
  <main class="center">
    <Spinner />
    <p>
      {session.connection !== 'open' ? 'Connecting to the table…' : !session.tvOnline ? `Waiting for the TV · ${tableId}` : 'Loading the table…'}
    </p>
    <Button label="Another table" icon="tv" variant="flat" onclick={leaveTable} />
  </main>
{:else if route === 'library' && session}
  {#if LibraryScreen}
    <LibraryScreen {config} {session} />
  {:else}
    <main class="center">
      <p>The TV shows its library. Start or continue a game from the library — it is on its way.</p>
      <Button label="Another table" icon="tv" variant="flat" onclick={leaveTable} />
    </main>
  {/if}
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

{#if busy}
  <div class="busy" role="status" aria-live="polite">
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

  .center p {
    margin: 0;
    max-width: 28rem;
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
</style>
