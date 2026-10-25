<!--
  TvApp — TV mode: the table and the authority for its room (architecture.md "work packages"
  #3). It restores the TV (calibration, the game it had open), joins the room, and shows one of
  three screens over the renderer's players' view:

  - home — the start and waiting screen ("Waiting for the tablet", how to pair, Continue);
  - library — the TV's games and the shared maps, for the remote;
  - game — nothing but the map while all is well: the back arrow for 5 s after a remote key
    (always focusable), the top-right badge only for a problem.

  The calibration pattern (drawn by the renderer) gets its instruction card over any screen.
  Requests from the tablet (open, new, close, delete, rename, list, deploy, reload) are answered
  by `games.ts` from storage; it also autosaves and backs up. Every control works with the D-pad
  and OK; Back walks pattern → game → library → home → (the shell closes the app).
  With `?debug=1` a line at the bottom shows the sync state (the e2e tests read it).
  No props: it reads the page's configuration (lib/config.ts, mode tv).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { GameSummary, LibraryEntry } from '@battlemap/shared';
  import { appConfig, lanJoinInfo, onLanChange, type AppConfig, type LanJoinInfo } from '../config.ts';
  import { log } from '../log.ts';
  import { markShellReady, onShellEvent, shellBridge } from '../shell.ts';
  import { TvSession } from '../state/sessions.svelte.ts';
  import { rememberTried } from '../net/build-check.ts';
  import Icon from '../ui/Icon.svelte';
  import { focusFirst, installDpad, setSurface } from '../ui/spatial.ts';
  import { TvGames, type BusyStatus } from './games.ts';
  import { answerRequest } from './requests.ts';
  import { realPorts, requestPersistentStorage } from './seams.ts';
  import { backAction, backGate, CHROME_MS, homeBadge, OFFLINE_RED_MS, PROBLEM_MS, problemBadge, screenFor } from './screen.ts';
  import type { TableViewEvent } from '../render/index.ts';
  import { openTableView, type TvTableView } from './table-view.ts';
  import { lanLogFields } from './lan.ts';
  import { BootTiming } from './boot-timing.ts';
  import TvBadge from './TvBadge.svelte';
  import TvBusy from './TvBusy.svelte';
  import TvCalibration from './TvCalibration.svelte';
  import TvHome from './TvHome.svelte';
  import TvLibrary from './TvLibrary.svelte';

  const timing = new BootTiming(log); // qa#11: reload → first frame with the map, logged as `perf`
  timing.mark('script');
  const config: AppConfig = appConfig();
  const debug = new URL(location.href).searchParams.get('debug') === '1';
  const ports = realPorts();

  // The session hands requests to `games` only once it is connected, after both exist.
  const session = new TvSession(config, (req, from) => void answerRequest(req, from, games, log));
  const games = new TvGames(ports, session.host, (msg) => session.send(msg), log, { build: config.build });
  const sessionOnChange = session.host.onChange;
  session.host.onChange = (state, cmd) => {
    sessionOnChange?.(state, cmd);
    games.changed(state);
  };

  let booted = $state(false);
  let wanted = $state<'home' | 'library'>('home');
  let status = $state<BusyStatus>({ busy: null, progress: null });
  let problem = $state<string | null>(null);
  let offlineLong = $state(false);
  let chromeShown = $state(false);
  let listed = $state<GameSummary[]>([]);
  let shared = $state<LibraryEntry[]>([]);
  let listing = $state(false);
  let sharedError = $state<string | null>(null);
  /** This TV's LAN table (LAN play): the home shows how to join it. */
  let lan = $state<LanJoinInfo | null>(lanJoinInfo());

  let stage: HTMLDivElement | undefined = $state();
  let backArrow: HTMLButtonElement | undefined = $state();
  let view: TvTableView | null = null;

  const game = $derived(session.state.game);
  const patternOn = $derived(session.state.table.pattern.on);
  const screen = $derived(screenFor(game !== null, wanted));
  const companions = $derived(session.peers.filter((p) => p.role === 'companion').length);
  const badgeInput = $derived({ connection: session.connection, companions, problem, offlineMs: offlineLong ? OFFLINE_RED_MS : 0 });
  const badge = $derived(problemBadge(badgeInput));
  const home = $derived(homeBadge(badgeInput));
  // Continue offers this TV's own newest game; other TVs' backups are only in the library.
  const last = $derived(listed.find((g) => g.where !== 'server') ?? null);
  // The library lists this TV's games first, then the backups of games it doesn't hold.
  const libraryGames = $derived([...listed.filter((g) => g.where !== 'server'), ...listed.filter((g) => g.where === 'server')]);

  games.onStatus = (s) => (status = s);
  let problemTimer: ReturnType<typeof setTimeout> | undefined;
  games.onProblem = (text) => {
    problem = text;
    clearTimeout(problemTimer);
    problemTimer = setTimeout(() => (problem = null), PROBLEM_MS);
  };
  games.onGameChanged = (g) => {
    if (g === null) void refreshLists();
  };

  /** Re-reads the games (and, in the library, the shared maps) for the screens. */
  async function refreshLists(): Promise<void> {
    listing = true;
    try {
      listed = await games.listGames();
      if (wanted === 'library') {
        try {
          shared = await ports.library.list();
          sharedError = null;
        } catch (e) {
          sharedError = 'The shared library could not be read — is the server reachable?';
          log.warn('tv', 'Shared library could not be listed', { error: String(e) });
        }
      }
    } finally {
      listing = false;
    }
  }

  // ── actions from the remote ────────────────────────────────────────────────────────────────

  function showLibrary(): void {
    wanted = 'library';
    log.info('tv', 'Screen', { screen: 'library', by: 'remote' });
    void refreshLists();
  }

  function showHome(): void {
    wanted = 'home';
    log.info('tv', 'Screen', { screen: 'home', by: 'remote' });
    void refreshLists();
  }

  function closeGame(): void {
    wanted = 'library';
    void games.run('close', null, () => games.close()).then(() => refreshLists());
  }

  function openGame(id: string): void {
    void games.run('open', null, () => games.open(id, null));
  }

  function startMap(entry: LibraryEntry): void {
    void games.run('start', null, () => games.startFromMap(entry));
  }

  function setPattern(on: boolean): void {
    session.host.applyLocal({ type: 'table.pattern', on });
  }

  function reload(): void {
    void games.run('reload', null, () => games.reloadApp());
  }

  // ── Back ───────────────────────────────────────────────────────────────────────────────────

  const gate = backGate();
  let lastBackHandled = false;

  /** One press of Back; returns whether the app handled it (else the shell closes the app). */
  function onBack(): boolean {
    if (!gate.accept()) return lastBackHandled; // the same press, delivered twice
    const action = backAction(screen, patternOn);
    log.info('tv', 'Back', { action, screen });
    lastBackHandled = action !== 'exit';
    if (action === 'pattern-off') setPattern(false);
    else if (action === 'close-game') closeGame();
    else if (action === 'home') showHome();
    return lastBackHandled;
  }

  // ── chrome: the back arrow for 5 s after a remote key ─────────────────────────────────────

  let chromeTimer: ReturnType<typeof setTimeout> | undefined;
  function onKey(e: KeyboardEvent): void {
    if (screen !== 'game') return;
    // The first OK while the arrow is hidden only shows it — a stray press never closes the game.
    if (!chromeShown && (e.key === 'Enter' || e.key === ' ') && document.activeElement === backArrow) {
      e.preventDefault();
      e.stopPropagation();
    }
    chromeShown = true;
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(() => (chromeShown = false), CHROME_MS);
  }

  // ── focus: each screen starts on its first control; the game parks it on the back arrow ──

  $effect(() => {
    void screen;
    void patternOn;
    void booted;
    void tick().then(() => {
      if (screen === 'game' && !patternOn) backArrow?.focus();
      else focusFirst();
    });
  });

  // ── the table ──────────────────────────────────────────────────────────────────────────────

  $effect(() => {
    const state = session.state; // read first: `view?.update(…)` would skip it while view is null
    view?.update(state);
  });

  // ── a newer app build on the server (rv#13): reload while no game is on the table ─────────
  // A game in play is never interrupted; the reload waits until the game closes. A build is tried
  // once per page session, so a server that keeps announcing it can't loop the TV.

  $effect(() => {
    const build = session.newBuild;
    if (!build || !booted || session.state.game) return;
    log.info('tv', 'Reloading for a newer build', { own: config.build, served: build });
    rememberTried(build);
    void games.reloadApp();
  });

  // ── the server: badge red after a while offline, backups retried when back ────────────────

  let offlineTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const open = session.connection === 'open';
    clearTimeout(offlineTimer);
    if (open) {
      offlineLong = false;
      void games.retryBackups();
    } else {
      offlineTimer = setTimeout(() => (offlineLong = true), OFFLINE_RED_MS);
    }
  });

  /** The renderer's map loading → the busy card here and on the tablet; failures → the badge. */
  function onViewEvent(e: TableViewEvent): void {
    if (e.type === 'map-loading') {
      timing.mark('map-loading');
      games.showBusy(`Loading “${e.name}”…`);
    } else if (e.type === 'map-shown') {
      timing.mark('map-shown');
      // the view asked for its frame before telling us; this callback runs right after it
      requestAnimationFrame(() => timing.report({ mapMs: e.ms, fetchMs: e.fetchMs, decodeMs: e.decodeMs, uploadMs: e.uploadMs, tiles: e.tiles, pxPerSquare: Math.round(e.pxPerSquare) }));
      games.showBusy(null);
    } else if (e.type === 'map-failed') {
      timing.noMap();
      games.showBusy(null);
      games.report(`The map could not be shown: ${e.error}`);
    } else if (e.type === 'renderer-failed') games.report(`The table can't be drawn: ${e.error}`);
  }

  /** Tells the reducer the TV's viewport (CSS px). */
  function reportViewport(): void {
    session.host.applyLocal({ type: 'table.viewport', width: Math.max(1, innerWidth), height: Math.max(1, innerHeight) });
  }

  /** The page goes away (reload, close): save first (rv#34: a named listener, removed again). */
  function onPageHide(): void {
    void games.flush('page hide');
  }

  function onHide(): void {
    if (document.visibilityState === 'hidden') void games.flush('page hidden');
  }

  onMount(() => {
    timing.mark('mounted');
    setSurface('tv');
    const stopDpad = installDpad({ onBack });
    const stopShell = onShellEvent((detail, event) => {
      if (detail.type === 'back') {
        if (onBack()) event.preventDefault();
      }
    });
    if (lan) log.info('tv', 'LAN table', lanLogFields(lan));
    const stopLan = onLanChange((info) => {
      lan = info;
      log.info('tv', 'LAN table changed', lanLogFields(info));
    });
    const shell = shellBridge();
    shell?.setKeepAwake(true);
    shell?.setImmersive(true);
    requestPersistentStorage();

    addEventListener('keydown', onKey, true);
    addEventListener('resize', reportViewport);
    document.addEventListener('visibilitychange', onHide);
    addEventListener('pagehide', onPageHide);
    reportViewport();

    void games.boot().then(async () => {
      timing.mark('booted');
      if (!session.state.game) timing.noMap();
      booted = true;
      session.start();
      markShellReady();
      await refreshLists();
    });

    view = openTableView(stage!, { log, files: (ref) => ports.files.get(ref), onEvent: onViewEvent });
    view.ready.then(() => timing.mark('renderer'), () => timing.noMap());
    view.update(session.state);

    return () => {
      stopDpad();
      stopShell();
      stopLan();
      removeEventListener('keydown', onKey, true);
      removeEventListener('resize', reportViewport);
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', onPageHide);
      clearTimeout(chromeTimer);
      clearTimeout(problemTimer);
      clearTimeout(offlineTimer);
      view?.destroy();
      session.stop();
    };
  });
</script>

<div class="stage" bind:this={stage}></div>

{#if booted && !patternOn}
  {#if screen === 'home'}
    <TvHome
      {last}
      loading={listing && listed.length === 0}
      badge={home}
      tableName={config.deviceName}
      tableId={config.tableId ?? 'table'}
      build={config.build}
      {lan}
      thumbUrl={ports.files.url}
      onContinue={() => last && openGame(last.id)}
      onLibrary={showLibrary}
      onMeasure={() => setPattern(true)}
      onReload={reload}
      onTakeOver={() => session.conn.takeOver()}
    />
  {:else if screen === 'library'}
    <TvLibrary
      games={libraryGames}
      maps={shared}
      loading={listing && listed.length === 0 && shared.length === 0}
      mapsError={sharedError}
      openId={game?.id ?? null}
      thumbUrl={ports.files.url}
      onOpenGame={openGame}
      onStartMap={startMap}
      onBack={showHome}
    />
  {/if}
{/if}

{#if screen === 'game'}
  <div class="game" data-testid="tv-game">
    <button
      type="button"
      class="back"
      class:shown={chromeShown}
      aria-label="Back to the library"
      bind:this={backArrow}
      onclick={closeGame}
    >
      <Icon name="back" size="1.5rem" />
    </button>
    {#if badge && !patternOn}
      <div class="problem"><TvBadge {badge} onTakeOver={() => session.conn.takeOver()} /></div>
    {/if}
  </div>
{/if}

{#if patternOn}
  <TvCalibration table={session.state.table} onDone={() => setPattern(false)} />
{/if}

{#if status.busy}
  <TvBusy busy={status.busy} progress={status.progress} />
{/if}

{#if debug}
  <p class="debug" data-testid="tv-status">
    {session.connection} · rev {session.rev} · width {session.state.table.widthInches} in · companions {companions}
    · game {game?.name ?? 'none'} · screen {screen}{patternOn ? ' · pattern' : ''}
  </p>
{/if}

<style>
  .stage {
    position: fixed;
    inset: 0;
    background: #000;
  }

  .game {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .back {
    pointer-events: auto;
    position: absolute;
    top: var(--g2);
    left: var(--g2);
    display: grid;
    place-items: center;
    width: var(--sq-standalone);
    height: var(--sq-standalone);
    border-radius: var(--r);
    background: var(--m0);
    color: var(--t2);
    box-shadow: var(--elev-rest);
    opacity: 0;
    transition: opacity 200ms var(--ease-std);
  }

  .back.shown {
    opacity: 1;
  }

  .problem {
    pointer-events: auto;
    position: absolute;
    top: var(--g2);
    right: var(--g2);
  }

  .debug {
    position: fixed;
    left: 12px;
    bottom: 8px;
    margin: 0;
    font: 12px ui-monospace, monospace;
    color: #8a8;
  }
</style>
