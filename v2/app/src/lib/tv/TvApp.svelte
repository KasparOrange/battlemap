<!--
  TvApp — TV mode (skeleton): joins its table's room as the authority, reports its viewport,
  starts the renderer full screen, and shows no chrome while all is well — only a badge for a
  problem (server unreachable, another TV took over, no tablet yet). With `?debug=1` a line at
  the bottom shows the sync state (the e2e smoke test reads it).
  No props: it reads the page's configuration (lib/config.ts, mode tv).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { appConfig, type AppConfig } from '../config.ts';
  import { log } from '../log.ts';
  import { createRenderer, type TableRenderer } from '../render/pixi.ts';
  import { TvSession } from '../state/sessions.svelte.ts';
  import Button from '../ui/Button.svelte';
  import { answerRequest } from './requests.ts';

  const config: AppConfig = appConfig();

  const startedAt = Date.now();
  const debug = new URL(location.href).searchParams.get('debug') === '1';
  const session = new TvSession(config, (req, from, s) =>
    answerRequest(req, from, {
      get state() { return s.host.state; },
      build: config.build,
      uptimeS: () => Math.round((Date.now() - startedAt) / 1000),
      replace: (state, reason) => s.host.replace(state, reason),
      send: (msg) => s.send(msg),
      syncInfo: () => ({ epoch: s.host.epoch, rev: s.host.rev }),
    }, log),
  );

  let stage: HTMLDivElement | undefined = $state();
  let renderer: TableRenderer | null = null;

  const companions = $derived(session.peers.filter((p) => p.role === 'companion').length);
  const badge = $derived(
    session.connection === 'replaced' ? 'Another TV took over this table.'
    : session.connection === 'refused' ? 'The server refused this app version — update it.'
    : session.connection !== 'open' ? 'Connecting to the server…'
    : companions === 0 ? `Waiting for the tablet · ${config.tableId}`
    : null,
  );

  /** Tells the reducer the TV's viewport (CSS px). */
  function reportViewport(): void {
    session.host.applyLocal({ type: 'table.viewport', width: Math.max(1, innerWidth), height: Math.max(1, innerHeight) });
  }

  onMount(() => {
    session.start();
    reportViewport();
    addEventListener('resize', reportViewport);
    createRenderer(stage!, { log, maxRenderHeight: 1080 })
      .then((r) => (renderer = r))
      .catch((e: unknown) => log.error('render', 'Renderer failed', { error: String(e) }));
    return () => {
      removeEventListener('resize', reportViewport);
      renderer?.destroy();
      session.stop();
    };
  });
</script>

<div class="stage" bind:this={stage}></div>

{#if badge}
  <div class="badge" role="status">
    <span>{badge}</span>
    {#if session.connection === 'replaced'}
      <Button label="Take over" icon="sync" autofocus onclick={() => session.conn.takeOver()} />
    {/if}
  </div>
{/if}

{#if debug}
  <p class="debug" data-testid="tv-status">
    {session.connection} · rev {session.rev} · width {session.state.table.widthInches} in · companions {companions}
    · game {session.state.game?.name ?? 'none'}
  </p>
{/if}

<style>
  .stage { position: fixed; inset: 0; background: #000; }
  .badge {
    position: fixed; top: 24px; right: 24px; display: flex; gap: 16px; align-items: center;
    padding: 12px 18px; border-radius: 12px; background: rgb(0 0 0 / 0.7); color: #ddd; font-size: 20px;
  }
  .debug { position: fixed; left: 12px; bottom: 8px; margin: 0; font: 12px ui-monospace, monospace; color: #8a8; }
</style>
