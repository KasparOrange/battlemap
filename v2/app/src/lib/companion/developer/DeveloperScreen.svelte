<!--
  DeveloperScreen — logs and diagnostics on the tablet (parity ST-01 Developer, LG-06): the
  versions of app, shell, server and TV; the connection (state, TV, revision, epoch, pending
  commands, the log outbox); the page's last 500 log lines (`log-buffer.ts`) with a level
  filter, copy and clear; and "Send diagnostics", which writes one snapshot line of all of it to
  the logs (MwLog tenant `battlemap`, area `diag`) and ships the outbox at once.
  Opened from the library's menu, the table picker and the Game tab.

  Props:
  - open: boolean · session: CompanionSession | null (null on the table picker) · onclose: () => void
-->
<script lang="ts">
  import type { Level } from 'mwlog/browser';
  import { appConfig } from '../../config.ts';
  import { log, logOutbox } from '../../log.ts';
  import { shellInfo } from '../../shell.ts';
  import type { CompanionSession } from '../../state/sessions.svelte.ts';
  import Button from '../../ui/Button.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Section from '../../ui/Section.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import { peerMessage, type PeerMessage } from '../frame/peer-message.ts';
  import { bufferedLines, clearBuffer, filterLines, lineText, onBufferChange, type BufferedLine } from './log-buffer.ts';

  interface Props {
    /** Shown or not. */
    open: boolean;
    /** The joined table, or null. */
    session: CompanionSession | null;
    /** Closed. */
    onclose: () => void;
  }

  let { open, session, onclose }: Props = $props();

  const config = appConfig();
  const shell = shellInfo();

  let lines = $state.raw<BufferedLine[]>([]);
  let floor = $state<Level>('info');
  let server = $state<{ build: string; serverBuild: string; uptimeS: number } | null | 'failed'>(null);
  let tv = $state.raw<Extract<PeerMessage, { type: 'diag.report' }> | null>(null);
  let asking = $state(false);
  let box: HTMLDivElement | undefined = $state();
  let sending = $state(false);

  const shown = $derived(filterLines(lines, floor));
  // read again with every new line (the outbox itself isn't reactive)
  const outbox = $derived.by(() => {
    void lines;
    return { waiting: logOutbox.waiting(), dropped: logOutbox.dropped() };
  });

  // the buffer while open; a new line keeps the box at the bottom when it was there
  $effect(() => {
    if (!open) return;
    lines = bufferedLines();
    return onBufferChange(() => {
      const atEnd = !box || box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
      lines = bufferedLines();
      if (atEnd) queueMicrotask(() => box && (box.scrollTop = box.scrollHeight));
    });
  });

  $effect(() => {
    if (open) refresh();
  });

  $effect(() => {
    const m = peerMessage(session?.lastMessage ?? null);
    if (m?.type === 'diag.report') {
      tv = m;
      asking = false;
    }
  });

  /** Asks server and TV how they are. */
  function refresh(): void {
    void (async () => {
      try {
        const r = await fetch(`${config.serverUrl}/health`);
        const h = (await r.json()) as { build?: string; serverBuild?: string; uptimeS?: number };
        server = { build: String(h.build ?? '?'), serverBuild: String(h.serverBuild ?? '?'), uptimeS: Number(h.uptimeS ?? 0) };
      } catch (e) {
        log.warn('diag', 'Server health not read', { error: String(e) });
        server = 'failed';
      }
    })();
    if (session?.tvOnline && session.conn.send({ type: 'diag.status' })) {
      asking = true;
      setTimeout(() => (asking = false), 5000);
    }
  }

  const since = (s: number) => (s < 120 ? `${Math.round(s)} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

  /** Everything this screen knows, as one record. */
  function snapshot(): Record<string, unknown> {
    return {
      app: config.build, shell: shell ? `${shell.shellVersion} (${shell.versionCode})` : null, device: config.deviceName,
      serverUrl: config.serverUrl, server: server === 'failed' ? 'unreachable' : server,
      connection: session?.connection ?? 'no table', tvOnline: session?.tvOnline ?? false, ready: session?.ready ?? false,
      rev: session?.rev ?? null, epoch: session?.client.epoch ?? null, pending: session?.client.pendingCount ?? null,
      peers: session?.peers.length ?? 0, outboxWaiting: logOutbox.waiting(), outboxDropped: logOutbox.dropped(),
      tv: tv ? { build: tv.build, rev: tv.rev, table: tv.table, uptimeS: tv.uptimeS, heapMb: tv.heapMb, game: tv.gameId } : null,
      screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, userAgent: navigator.userAgent,
    };
  }

  async function sendDiagnostics(): Promise<void> {
    if (sending) return;
    sending = true;
    log.info('diag', 'Diagnostics snapshot', snapshot());
    try {
      const empty = await logOutbox.drain();
      notify(empty ? 'Diagnostics sent to the logs.' : 'Diagnostics written — they go out when the server is back.', { kind: empty ? 'success' : 'warning' });
    } finally {
      sending = false;
    }
  }

  async function copy(): Promise<void> {
    const text = [JSON.stringify(snapshot()), ...shown.map(lineText)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${shown.length} lines.`, { kind: 'success' });
    } catch (e) {
      log.warn('diag', 'Clipboard refused', { error: String(e) });
      notify("This browser didn't allow copying.", { kind: 'warning' });
    }
  }

  function clear(): void {
    clearBuffer();
    notify('Log view cleared — the lines stay in MwLog.');
  }

  const time = (t: number) => new Date(t).toTimeString().slice(0, 8);
</script>

<Dialog {open} title="Logs and diagnostics" icon="info" size="lg" {onclose}>
  <div class="cols">
    <Section title="Versions">
      <dl class="facts">
        <dt>App</dt><dd>{config.build}</dd>
        <dt>Shell</dt><dd>{shell ? `${shell.shellVersion} · ${shell.versionCode}${shell.debug ? ' · debug' : ''}` : 'Browser'}</dd>
        <dt>Server</dt>
        <dd>
          {#if server === null}<Spinner size="14px" />{:else if server === 'failed'}<span class="bad">unreachable</span>{:else}{server.serverBuild} · app {server.build} · up {since(server.uptimeS)}{/if}
        </dd>
        <dt>TV</dt>
        <dd>
          {#if tv}{tv.build} · up {since(tv.uptimeS)}{tv.heapMb !== null ? ` · ${tv.heapMb.toFixed(0)} MB heap` : ''}{:else if asking}<Spinner size="14px" />{:else}—{/if}
        </dd>
      </dl>
    </Section>

    <Section title="Connection">
      <dl class="facts">
        <dt>Table</dt><dd>{session ? `${session.connection} · TV ${session.tvOnline ? 'online' : 'away'}` : 'none picked'}</dd>
        <dt>State</dt><dd>{session ? `rev ${session.rev} · ${session.client.pendingCount} pending · ${session.ready ? 'ready' : 'not ready'}` : '—'}</dd>
        <dt>TV table</dt><dd>{tv?.table ?? '—'} squares</dd>
        <dt>Log outbox</dt><dd>{outbox.waiting} waiting · {outbox.dropped} dropped</dd>
        <dt>Server URL</dt><dd class="url">{config.serverUrl}</dd>
      </dl>
    </Section>
  </div>

  <Section title="Log · {shown.length} of {lines.length} lines">
    <div class="logbar">
      <Segmented
        label="Level"
        value={floor}
        onchange={(id) => (floor = id as Level)}
        options={[{ id: 'debug', label: 'All' }, { id: 'info', label: 'Info' }, { id: 'warn', label: 'Warn' }, { id: 'error', label: 'Errors' }]}
      />
      <span class="grow"></span>
      <Button label="Refresh" icon="sync" variant="flat" size="compact" onclick={refresh} />
      <Button label="Copy" icon="copy" variant="flat" size="compact" disabled={shown.length === 0} onclick={() => void copy()} />
      <Button label="Clear" icon="delete" variant="flat" size="compact" disabled={lines.length === 0} onclick={clear} />
    </div>
    <div class="log bm-scroll" bind:this={box} data-testid="dev-log">
      {#each shown as l (l.n)}
        <div class="line {l.level}"><span class="t">{time(l.t)}</span> <span class="a">{l.area}</span> {l.msg}{#if l.props}<span class="p"> {l.props}</span>{/if}</div>
      {:else}
        <p class="empty">No lines at this level yet.</p>
      {/each}
    </div>
  </Section>

  {#snippet footer()}
    <Button label="Close" variant="flat" onclick={onclose} />
    <Button label="Send diagnostics" icon="upload" variant="primary" loading={sending} onclick={() => void sendDiagnostics()} />
  {/snippet}
</Dialog>

<style>
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g2);
  }

  @media (max-width: 600px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }

  .facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: calc(var(--g) / 2) var(--g);
    margin: 0;
    font-size: var(--fs-small);
  }

  dt {
    color: var(--t3);
  }

  dd {
    margin: 0;
    font-family: var(--font-value);
    color: var(--t);
    overflow-wrap: anywhere;
  }

  .bad {
    color: var(--err);
  }

  .logbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--g) / 2);
  }

  .grow {
    flex: 1;
  }

  /* long content scrolls in its own capped box (~code CLAUDE.md) */
  .log {
    max-height: 280px;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--g);
    border-radius: var(--r-ctl);
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--hair);
    font: var(--fs-meta) / 1.5 var(--font-value);
    color: var(--t2);
  }

  .line {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .line .t,
  .line .p {
    color: var(--t3);
  }

  .line .a {
    color: var(--info);
  }

  .line.warn {
    color: var(--warn);
  }

  .line.error {
    color: var(--err);
  }

  .line.debug {
    opacity: 0.75;
  }

  .empty {
    margin: 0;
    color: var(--t3);
  }
</style>
