<!--
  GameScreen — the companion's game screen (design.md "layout per device"): the map as the hero
  with chrome squares at its corners (game menu · table status · full screen · fit · jump to the
  TV), and the tools in one docked surface — on a landscape tablet (≥ 720 px) the tool panel and
  the tab rail at the right edge (tapping the chosen tab folds the panel), on a phone a bottom
  sheet that grows out of the tab bar. Tabs come from the registry (`tabs.ts`): every
  `companion/tabs/<id>/tab.ts`. Undo / redo sit at the rail's foot (tablet), in the sheet's
  header or above the tab bar (phone). Desk keys: 1–9 tabs, Ctrl Z / Ctrl Shift Z, F, Escape.

  Props:
  - config: AppConfig — the page's configuration
  - session: CompanionSession — the joined table (a game is open)
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { AppConfig } from '../../config.ts';
  import { log } from '../../log.ts';
  import type { CompanionSession } from '../../state/sessions.svelte.ts';
  import Badge from '../../ui/Badge.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import Sheet from '../../ui/Sheet.svelte';
  import Tabs, { type TabItem } from '../../ui/Tabs.svelte';
  import type { MenuItem } from '../../ui/Menu.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import { scrollFade } from '../../ui/scroll-fade.ts';
  import { GameScreenContext } from './context.svelte.ts';
  import MapView from './MapView.svelte';
  import { collectTabs, DEFAULT_TAB, type MapTool, type TabDef } from './tabs.ts';
  import { canRedo, canUndo, undoKey } from './undo.ts';
  import { hiddenTabs } from '../session-settings/settings-logic.ts';

  interface Props {
    /** The page's configuration. */
    config: AppConfig;
    /** The joined table, with a game open. */
    session: CompanionSession;
  }

  let { config, session }: Props = $props();

  const tabs: TabDef[] = collectTabs(import.meta.glob<{ default?: TabDef }>('../tabs/*/tab.ts', { eager: true }));
  // svelte-ignore state_referenced_locally
  const ctx = new GameScreenContext(config, session);

  let width = $state(1200);
  let panelOpen = $state(true);
  let sheetOpen = $state(false);
  let detent = $state<'half' | 'full'>('half');
  let fullscreen = $state(false);

  const phone = $derived(width < 720);
  // the game's session settings hide some tabs (parity DP-04); a hidden chosen tab falls back to Tokens
  const hidden = $derived(hiddenTabs(session.view?.game?.settings));
  const shown = $derived(tabs.filter((t) => !hidden.has(t.id)));
  const active = $derived(shown.find((t) => t.id === ctx.tab) ?? shown.find((t) => t.id === DEFAULT_TAB) ?? shown[0]!);
  const tokensTab = tabs.find((t) => t.id === DEFAULT_TAB);
  const tool = $derived<MapTool>((active.tool ?? tokensTab?.tool)?.(ctx) ?? {});
  const items = $derived<TabItem[]>(shown.map((t) => ({ id: t.id, label: t.label, icon: t.icon, group: t.group })));
  const showFooter = $derived(!!active.footer && (active.hasFooter?.(ctx) ?? true));
  const undoOk = $derived(canUndo(session.view));
  const redoOk = $derived(canRedo(session.view));
  const tvOk = $derived(session.connection === 'open' && session.tvOnline);
  const game = $derived(session.view?.game ?? null);

  const gameMenu = $derived<MenuItem[]>([
    ...(game && game.mapOrder.length > 1
      ? game.mapOrder.map((id, i) => ({
          id: `map:${id}`,
          label: game.maps[id]?.info.name ?? 'Map',
          icon: 'map' as const,
          description: id === game.activeMapId ? 'On the table' : 'Put it on the table',
          divider: i === 0,
        }))
      : []),
    { id: 'library', label: 'Back to the library', icon: 'library', description: 'Saves the game and closes it on the TV', divider: true },
  ]);

  $effect(() => {
    ctx.phone = phone;
  });
  // the chosen tab got hidden by the game's settings: leave it properly, land on the fallback
  $effect(() => {
    const now = active.id;
    untrack(() => {
      if (ctx.tab === now) return;
      tabs.find((t) => t.id === ctx.tab)?.onLeave?.(ctx);
      ctx.selectTab(now);
    });
  });

  let mapEl = $state<HTMLDivElement>();
  let sheetZone = $state<HTMLDivElement>();
  // phone: the view fits the map into the part the sheet leaves free (measured once it moved)
  $effect(() => {
    void sheetOpen;
    void detent;
    if (!phone) {
      ctx.setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    const t = setTimeout(() => {
      const sheet = sheetZone?.querySelector<HTMLElement>('.bm-sheet');
      if (!mapEl || !sheet) return;
      const covered = sheetOpen ? mapEl.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top : 0;
      ctx.setInsets({ top: 0, right: 0, bottom: Math.max(0, Math.round(Math.min(covered, mapEl.clientHeight * 0.6))), left: 0 });
    }, 380);
    return () => clearTimeout(t);
  });

  /** Chooses a tab: leaves the old one, opens the panel / sheet. */
  function choose(id: string): void {
    const before = active;
    if (before.id !== id) before.onLeave?.(ctx);
    ctx.selectTab(id);
    if (phone) sheetOpen = true;
    else panelOpen = true;
  }

  function undo(): void {
    if (ctx.dispatch({ type: 'history.undo' })) log.info('companion', 'Undo');
  }

  function redo(): void {
    if (ctx.dispatch({ type: 'history.redo' })) log.info('companion', 'Redo');
  }

  function onMenu(id: string): void {
    if (id === 'library') {
      log.info('companion', 'Back to the library');
      if (session.request({ type: 'game.close' })) notify('Saving the game…');
      return;
    }
    if (id.startsWith('map:')) {
      const mapId = id.slice(4);
      if (mapId !== game?.activeMapId && ctx.dispatch({ type: 'map.switch', mapId })) notify(`Loading “${game?.maps[mapId]?.info.name ?? 'the map'}” on the TV…`);
    }
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      log.warn('companion', 'Full screen refused', { error: String(e) });
      notify("This browser won't go full screen here.", { kind: 'warning' });
    }
  }

  function onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const u = undoKey(e);
    if (u) {
      e.preventDefault();
      if (u === 'undo') undo();
      else redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= shown.length) {
      choose(shown[n - 1]!.id);
      return;
    }
    if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
  }

  onMount(() => {
    const fs = () => (fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    return () => {
      document.removeEventListener('fullscreenchange', fs);
      ctx.dispose(); // following the tablet, listeners and timers stop with the screen
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="screen" class:phone bind:clientWidth={width} data-testid="game-screen">
  <div class="map" bind:this={mapEl}>
    <MapView {ctx} tool={() => tool} doors={() => active.doors !== false} />
    {#if active.overlay}
      <div class="tab-overlay" data-testid="tab-overlay">
        <active.overlay {ctx} />
      </div>
    {/if}

    <div class="corner tl" data-ctl={phone ? 'toolbar' : 'standalone'}>
      <IconButton icon="menu" label="Game menu" menu={gameMenu} onmenu={onMenu} />
    </div>

    <div class="corner tr" data-ctl={phone ? 'toolbar' : 'standalone'}>
      {#if !tvOk}<Badge text="TV not connected" icon="warning" tone="warn" />{/if}
      <IconButton
        icon="tv"
        label={tvOk ? 'The table — connected' : 'The table — not connected'}
        badge={true}
        badgeTone={tvOk ? 'ok' : 'warn'}
        onclick={() => notify(tvOk ? `Connected to the TV · ${config.tableId ?? ''}` : 'Waiting for the TV — is it on and in battlemap?', { kind: tvOk ? 'info' : 'warning' })}
      />
      <IconButton icon={fullscreen ? 'fullscreen-exit' : 'fullscreen'} label={fullscreen ? 'Leave full screen' : 'Full screen'} onclick={() => void toggleFullscreen()} />
    </div>

    <div class="corner bl" data-ctl="toolbar">
      <IconButton icon="fit" label="Fit the map on my screen" onclick={() => ctx.camera.fit()} />
      <IconButton icon="jump" label="Jump to what the TV shows" onclick={() => ctx.camera.showTv()} />
    </div>

    {#if phone && !sheetOpen}
      <div class="corner br" data-ctl="toolbar">
        <IconButton icon="undo" label="Undo" disabled={!undoOk} onclick={undo} />
        <IconButton icon="redo" label="Redo" disabled={!redoOk} onclick={redo} />
      </div>
    {/if}
  </div>

  {#if !phone}
    <div class="dock" class:folded={!panelOpen}>
      {#if panelOpen}
        <section class="panel" aria-label={active.title} data-testid="tool-panel">
          <header>
            <h2>{active.title}</h2>
          </header>
          <div class="body bm-scroll" use:scrollFade>
            <active.panel {ctx} />
          </div>
          {#if showFooter && active.footer}
            <footer>
              <active.footer {ctx} />
            </footer>
          {/if}
        </section>
      {/if}
      <div class="rail">
        <Tabs {items} value={active.id} label="Tools" onselect={choose} onreselect={() => (panelOpen = !panelOpen)}>
          {#snippet footer()}
            <IconButton icon="undo" label="Undo" variant="flat" disabled={!undoOk} onclick={undo} />
            <IconButton icon="redo" label="Redo" variant="flat" disabled={!redoOk} onclick={redo} />
          {/snippet}
        </Tabs>
      </div>
    </div>
  {:else}
    <div class="sheet-zone" bind:this={sheetZone}>
      <Sheet side="bottom" bind:open={sheetOpen} bind:detent title={active.title} label="Tool panel">
        {#snippet actions()}
          <IconButton icon="undo" label="Undo" variant="flat" disabled={!undoOk} onclick={undo} />
          <IconButton icon="redo" label="Redo" variant="flat" disabled={!redoOk} onclick={redo} />
        {/snippet}
        <div class="sheet-body" data-testid="tool-panel">
          <active.panel {ctx} />
        </div>
        {#snippet footer()}
          {#if showFooter && active.footer}
            <active.footer {ctx} />
          {/if}
        {/snippet}
      </Sheet>
    </div>
    <nav class="tabbar" class:joined={sheetOpen}>
      <Tabs {items} value={active.id} orientation="horizontal" label="Tools" onselect={choose} onreselect={() => (sheetOpen = !sheetOpen)} />
    </nav>
  {/if}
</div>

<style>
  .screen {
    position: relative;
    display: flex;
    gap: var(--g);
    height: 100%;
    padding: var(--g);
    background: var(--bg);
    overflow: clip; /* never scrollable: a focus or scrollIntoView must not shift the screen */
  }

  /* the map is a WILD ground: it keeps a hairline so it never melts into the gap */
  .map {
    position: relative;
    flex: 1;
    min-width: 0;
    border-radius: var(--r);
    background: var(--map-ground);
    box-shadow: inset 0 0 0 1px var(--hair);
    overflow: clip;
  }

  /* a tab's DM-only layer over the map (TabDef.overlay): the map view's size, touch passes through */
  .tab-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  .corner {
    position: absolute;
    z-index: var(--z-chrome);
    display: flex;
    gap: var(--g);
  }

  .corner :global(.bm-sf) {
    --sf-elev: var(--elev-float);
  }

  .tl {
    top: var(--g);
    left: var(--g);
  }

  .tr {
    top: var(--g);
    right: var(--g);
    align-items: center;
  }

  .bl {
    left: var(--g);
    bottom: var(--g);
    flex-direction: column;
  }

  .br {
    right: var(--g);
    bottom: var(--g);
  }

  /* tablet: the panel and the rail are ONE surface docked at the right edge */
  .dock {
    display: flex;
    flex: none;
    min-height: 0;
    background: var(--m0);
    border: 1.5px solid var(--hair);
    border-radius: var(--r);
    box-shadow: var(--elev-float);
    overflow: clip;
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: var(--panel-w);
    min-height: 0;
    border-right: 1px solid var(--hair);
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--g);
    padding: var(--g2) var(--g2) var(--g);
  }

  h2 {
    margin: 0;
    font-family: var(--font-title);
    font-weight: var(--fw-title);
    font-size: var(--fs-title);
    letter-spacing: -0.01em;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--g2);
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--g) var(--g2) var(--g2);
  }

  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: var(--g2);
  }

  footer {
    display: flex;
    gap: var(--g);
    padding: var(--g) var(--g2) var(--g2);
    border-top: 1px solid var(--hair);
  }

  .rail {
    width: var(--rail-w);
    padding: calc(var(--g) / 2);
  }

  /* phone */
  .phone {
    flex-direction: column;
    padding: calc(var(--g) / 2);
    gap: 0;
  }

  .sheet-zone {
    position: absolute;
    left: calc(var(--g) / 2);
    right: calc(var(--g) / 2);
    top: calc(var(--sq-toolbar) + var(--g2));
    bottom: calc(var(--tabbar-h) + var(--g) / 2 - 1.5px);
    pointer-events: none;
    z-index: var(--z-sheet);
    --sheet-h: 100%;
    --sheet-foot-r: 0;
  }

  .sheet-zone > :global(*) {
    pointer-events: auto;
  }

  .tabbar {
    flex: none;
    position: relative;
    z-index: calc(var(--z-sheet) + 1);
    height: var(--tabbar-h);
    margin-top: calc(var(--g) / 2);
    padding: calc(var(--g) / 2);
    background: var(--m0);
    border: 1.5px solid var(--hair);
    border-radius: var(--r);
    box-shadow: var(--elev-float);
  }

  .tabbar.joined {
    border-top-color: var(--hair);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
</style>
