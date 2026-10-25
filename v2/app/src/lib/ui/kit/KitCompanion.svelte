<!--
  KitCompanion — the companion's game screen composed from the kit, as the gallery's proposal
  for the layout system (v2/docs/design.md "layout per device"). Picks its layout from its own
  width: ≥ 720 px the tablet / desktop layout (map, and the tool panel with the tab rail docked
  at the right edge as one surface), below that the phone layout (map, a bottom sheet growing
  out of the tab bar). Static demo; the real screen lives in lib/companion.

  Props:
  - startTab: string — the tab shown first (default fog)
-->
<script lang="ts">
    import Tabs, { type TabItem } from '../Tabs.svelte';
    import IconButton from '../IconButton.svelte';
    import Button from '../Button.svelte';
    import Badge from '../Badge.svelte';
    import Sheet from '../Sheet.svelte';
    import { scrollFade } from '../scroll-fade';
    import KitMap from './KitMap.svelte';
    import KitTools from './KitTools.svelte';
    import { notify } from '../notice.svelte';

    interface Props {
        /** The tab shown first. */
        startTab?: string;
    }

    let { startTab = 'fog' }: Props = $props();

    let width = $state(1200);
    // svelte-ignore state_referenced_locally
    let tab = $state(startTab);
    let panelOpen = $state(true);
    let sheetOpen = $state(true);
    let detent = $state<'half' | 'full'>('half');
    let tvOk = $state(true);

    const phone = $derived(width < 720);

    const TABS: TabItem[] = [
        { id: 'tokens', label: 'Tokens', icon: 'token', group: 'modes' },
        { id: 'fog', label: 'Fog', icon: 'fog', group: 'modes' },
        { id: 'draw', label: 'Draw', icon: 'draw', group: 'modes' },
        { id: 'measure', label: 'Measure', icon: 'measure', group: 'modes' },
        { id: 'view', label: 'View', icon: 'view', group: 'panels' },
        { id: 'game', label: 'Game', icon: 'game', group: 'panels' },
    ];

    const titles: Record<string, string> = {
        tokens: 'Tokens',
        fog: 'Fog of war',
        draw: 'Draw',
        measure: 'Measure',
        view: 'View',
        game: 'Game',
    };

    const gameMenu = [
        { id: 'library', label: 'Library', icon: 'library' as const, description: 'All games and maps' },
        { id: 'switch', label: 'Switch map', icon: 'map' as const, description: 'Cave level · Tower, floor 2' },
        { id: 'help', label: 'Help', icon: 'help' as const, divider: true },
    ];
</script>

<div class="screen" class:phone bind:clientWidth={width}>
    <div class="map">
        <KitMap />

        <div class="corner tl" data-ctl={phone ? 'toolbar' : 'standalone'}>
            <IconButton icon="menu" label="Game menu" menu={gameMenu} onmenu={(id) => notify(`Open: ${id}`)} />
        </div>

        <div class="corner tr" data-ctl={phone ? 'toolbar' : 'standalone'}>
            {#if !tvOk}<Badge text="TV not connected" icon="warning" tone="warn" />{/if}
            <IconButton icon="tv" label={tvOk ? 'The table — connected' : 'The table — reconnect'} badge={true} badgeTone={tvOk ? 'ok' : 'warn'} onclick={() => (tvOk = !tvOk)} />
            <IconButton icon="fullscreen" label="Full screen" />
        </div>

        <div class="corner bl" data-ctl="toolbar">
            <IconButton icon="fit" label="Fit the map on my screen" />
            <IconButton icon="jump" label="Jump to what the TV shows" />
        </div>

        {#if phone && !sheetOpen}
            <div class="corner br" data-ctl="toolbar">
                <IconButton icon="undo" label="Undo" />
                <IconButton icon="redo" label="Redo" disabled />
            </div>
        {/if}
    </div>

    {#if !phone}
        <div class="dock" class:folded={!panelOpen}>
            {#if panelOpen}
                <section class="panel" aria-label={titles[tab]}>
                    <header>
                        <h2>{titles[tab]}</h2>
                        {#if tab === 'fog'}<span class="bm-eyebrow">Tap a room</span>{/if}
                    </header>
                    <div class="body bm-scroll" use:scrollFade>
                        <KitTools {tab} />
                    </div>
                    {#if tab === 'fog'}
                        <footer>
                            <Button icon="close" label="Discard" variant="flat" />
                            <Button icon="check" label="Apply 12 squares" variant="primary" block onclick={() => notify('12 squares revealed on the table', { kind: 'success' })} />
                        </footer>
                    {/if}
                </section>
            {/if}
            <div class="rail">
                <Tabs
                    items={TABS}
                    bind:value={tab}
                    label="Tools"
                    onselect={() => (panelOpen = true)}
                    onreselect={() => (panelOpen = !panelOpen)}
                >
                    {#snippet footer()}
                        <IconButton icon="undo" label="Undo" variant="flat" />
                        <IconButton icon="redo" label="Redo" variant="flat" disabled />
                    {/snippet}
                </Tabs>
            </div>
        </div>
    {:else}
        <div class="sheet-zone">
            <Sheet side="bottom" bind:open={sheetOpen} bind:detent title={titles[tab]} label="Tool panel">
                {#snippet actions()}
                    <IconButton icon="undo" label="Undo" variant="flat" />
                    <IconButton icon="redo" label="Redo" variant="flat" disabled />
                {/snippet}
                <KitTools {tab} />
                {#snippet footer()}
                    {#if tab === 'fog'}
                        <Button icon="close" label="Discard" variant="flat" />
                        <Button icon="check" label="Apply 12 squares" variant="primary" block />
                    {/if}
                {/snippet}
            </Sheet>
        </div>
        <nav class="tabbar" class:joined={sheetOpen}>
            <Tabs
                items={TABS}
                bind:value={tab}
                orientation="horizontal"
                label="Tools"
                onselect={() => (sheetOpen = true)}
                onreselect={() => (sheetOpen = !sheetOpen)}
            />
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
        overflow: hidden;
    }

    /* the map is a WILD ground: it keeps a hairline so it never melts into the gap */
    .map {
        position: relative;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        border-radius: var(--r);
        background: var(--map-ground);
        box-shadow: inset 0 0 0 1px var(--hair);
    }

    .map > :global(svg) {
        position: absolute;
        inset: 0;
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
        overflow: hidden;
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
        padding: var(--g) var(--g2) var(--g2);
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
