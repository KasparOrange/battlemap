<!--
  PlayersApp — the players' view (roadmap S12): `?mode=players&table=<room>` on a player's phone
  or a second screen. Read-only: joins the table's room as `players` (the server delivers it the
  TV's `players.state` only, and lets it send nothing but `players.request`), and draws exactly
  what the TV shows — revealed fog, placed tokens, drawings, effects, timer, the handout on show,
  the curtain — with the table renderer's players' profile, in a box of the TV's shape as big as
  the screen allows. Without a table in the link it asks for the table code the TV home shows.
  No props.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { RootState } from '@battlemap/shared';
  import { appConfig } from '../config.ts';
  import { createEffectsRuntime } from '../effects/index.ts';
  import { log } from '../log.ts';
  import { Connection, type ConnectionState } from '../net/connection.ts';
  import { createTableView, type TableView } from '../render/index.ts';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import { notify } from '../ui/notice.svelte.ts';
  import { fitBox, readPlayersMessage, roomForCode, stateForBox, type Box } from './players-logic.ts';

  const config = appConfig();
  const room = config.tableId;

  let connection = $state<ConnectionState>('idle');
  let tvOnline = $state(false);
  let received = $state.raw<RootState | null>(null);
  let screen = $state<Box>({ width: innerWidth, height: innerHeight });
  let host: HTMLDivElement | undefined = $state();
  let code = $state('');
  let finding = $state(false);

  const tv = $derived(received?.table.viewport ?? null);
  const box = $derived(fitBox(screen, tv));
  const game = $derived(received?.game ?? null);
  const message = $derived(
    connection === 'refused' ? 'This server has no players\' view.'
      : connection !== 'open' ? 'Connecting to the table…'
      : !tvOnline ? 'Waiting for the TV — is it on?'
      : !received ? 'Waiting for the table…'
      : !game ? 'No game on the table yet.'
      : null,
  );

  let view: TableView | null = null;

  /** Draws the newest state in the current box. */
  function draw(): void {
    if (view && received) view.update(stateForBox(received, box));
  }

  $effect(() => {
    void box;
    void received;
    draw();
  });

  onMount(() => {
    const onResize = () => (screen = { width: innerWidth, height: innerHeight });
    addEventListener('resize', onResize);
    if (!room || !host) return () => removeEventListener('resize', onResize);
    log.info('players', 'Players\' view opened', { room, server: config.serverUrl });
    const c = new Connection({ url: config.wsUrl, role: 'players', room, client: config.clientId, name: 'Players\' view', build: config.build, log });
    const ask = () => c.send({ type: 'players.request' });
    c.onState = (s) => {
      connection = s;
      if (s === 'open') ask();
    };
    c.onPeers = (peers) => {
      const was = tvOnline;
      tvOnline = peers.some((p) => p.role === 'tv');
      if (tvOnline && !was) ask();
    };
    c.onPeerMessage = (raw) => {
      const m = readPlayersMessage(raw);
      if (!m) {
        log.warn('players', 'Not a players\' message, ignored', { type: raw.type });
        return;
      }
      received = m.state;
    };
    view = createTableView(host, {
      profile: 'players',
      log,
      serverUrl: config.serverUrl,
      effects: (slots, ctx) => createEffectsRuntime(slots, ctx),
      now: () => c.serverNow(),
      onEvent: (e) => {
        if (e.type === 'renderer-failed') notify('This device can\'t draw the table (no WebGL).', { kind: 'error' });
      },
    });
    view.ready.catch((e: unknown) => log.error('players', 'Renderer failed', { error: String(e) }));
    // the e2e's look into the page (`?debug=1`): what arrived, nothing else
    if (new URL(location.href).searchParams.get('debug') === '1') {
      (window as unknown as { __battlemapPlayers?: unknown }).__battlemapPlayers = { state: () => received, connection: () => connection };
    }
    c.connect();
    draw();
    return () => {
      removeEventListener('resize', onResize);
      c.close();
      view?.destroy();
      view = null;
    };
  });

  /** Finds the table by its code and opens its players' view. */
  async function join(): Promise<void> {
    if (finding || !code.trim()) return;
    finding = true;
    try {
      const r = await fetch(`${config.serverUrl}/api/tables`, { signal: AbortSignal.timeout(5_000), cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { tables } = (await r.json()) as { tables: { room: string }[] };
      const found = roomForCode(tables, code);
      log.info('players', 'Table code looked up', { code, found, tables: tables.length });
      if (!found) {
        notify(`No TV with the code ${code.trim().toUpperCase()} is on — check the TV's home screen.`, { kind: 'warning' });
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set('mode', 'players');
      url.searchParams.set('table', found);
      location.href = url.toString();
    } catch (e) {
      log.warn('players', 'Tables not read', { error: String(e) });
      notify('Could not reach the server — try again.', { kind: 'error' });
    } finally {
      finding = false;
    }
  }
</script>

{#if room}
  <main class="stage">
    <div class="box" style:width="{box.width}px" style:height="{box.height}px" bind:this={host} data-testid="players-table"></div>
    {#if message}<p class="state" data-testid="players-state">{message}</p>{/if}
  </main>
{:else}
  <main class="join">
    <h1>Players' view</h1>
    <p>Type the code the TV shows on its home screen.</p>
    <Field label="Table code" bind:value={code} kind="machine" placeholder="IG4Q" onenter={() => void join()} />
    <Button label={finding ? 'Looking…' : 'Join the table'} icon="players" variant="primary" disabled={finding || !code.trim()} onclick={() => void join()} />
  </main>
{/if}

<style>
  .stage {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: #000;
    overflow: hidden;
  }

  .box {
    position: relative;
    overflow: hidden;
  }

  .state {
    position: absolute;
    left: 50%;
    bottom: var(--m4);
    transform: translateX(-50%);
    margin: 0;
    padding: var(--m1) var(--m3);
    border-radius: var(--r);
    background: var(--scrim);
    color: var(--t);
    font: var(--fw-body) var(--fs-body) / var(--lh-body) var(--font-body);
  }

  .join {
    min-height: 100vh;
    display: grid;
    place-content: center;
    gap: var(--g2);
    padding: var(--m3);
    max-width: 420px;
    margin: 0 auto;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-family: var(--font-title);
  }

  p {
    margin: 0;
    color: var(--t2);
  }
</style>
