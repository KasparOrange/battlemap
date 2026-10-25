<!--
  KitTv — the TV's own screens composed from the kit at 10-foot size (v2/docs/design.md "TV
  screens"): home, library, game chrome, calibration. While shown it switches the page to the
  TV surface (`data-surface="tv"`: the root scales with the screen width, thick focus ring,
  no blur) and installs the D-pad, so the arrow keys walk it like a remote. Static demo; the
  real screens live in lib/tv.

  Props:
  - screen: 'home' | 'library' | 'game' | 'calibration'
-->
<script lang="ts">
    import Card from '../Card.svelte';
    import Badge from '../Badge.svelte';
    import Icon from '../Icon.svelte';
    import Segmented from '../Segmented.svelte';
    import KitMap from './KitMap.svelte';
    import { focusFirst, installDpad, setSurface } from '../spatial';

    interface Props {
        /** Which TV screen. */
        screen: string;
    }

    let { screen }: Props = $props();

    let shelf = $state('games');
    let chrome = $state(true);

    $effect(() => {
        setSurface('tv');
        const stop = installDpad();

        return () => {
            stop();
            setSurface('companion');
        };
    });

    $effect(() => {
        void screen;
        requestAnimationFrame(() => focusFirst());
    });

    const games = [
        { title: 'The Sunless Citadel', meta: 'Cave level · 2 hours ago' },
        { title: 'Tower of the Moon', meta: 'Floor 2 · last Friday' },
        { title: 'Salt Marsh', meta: 'The smugglers’ cove · 3 weeks ago' },
        { title: 'Goblin warrens', meta: 'Test map · 44 × 28' },
        { title: 'Juri’s dungeon', meta: 'With DM layers · 40 × 30' },
        { title: 'AI keep', meta: 'Generated · 34 × 19' },
        { title: 'Tavern brawl', meta: '22 × 30' },
        { title: 'Forest road', meta: '60 × 19' },
    ];
</script>

<div class="tv">
    {#if screen === 'home'}
        <div class="home">
            <header class="top">
                <div class="brand">
                    <span class="mark"><Icon name="candle" filled size="1.5rem" /></span>
                    <span class="bm-headline">battlemap</span>
                </div>
                <Badge text="Tablet connected" icon="connected" tone="ok" size="tv" />
            </header>
            <div class="tiles">
                <div class="hero">
                    <Card title="The Sunless Citadel" meta="Cave level · 2 hours ago · 5 tokens" prominent onclick={() => {}} aspect="16 / 8">
                        {#snippet media()}<KitMap tokens={false} frame={false} fog={false} />{/snippet}
                        {#snippet badges()}<Badge text="Continue" icon="play" tone="accent" />{/snippet}
                    </Card>
                </div>
                <div class="side">
                    <button type="button" class="tile" data-focus-grow data-autofocus>
                        <Icon name="library" size="2rem" />
                        <span class="t">Library</span>
                        <span class="s">Games and maps on this TV</span>
                    </button>
                    <button type="button" class="tile" data-focus-grow>
                        <Icon name="measure" size="2rem" />
                        <span class="t">Measure the table</span>
                        <span class="s">One square = one inch</span>
                    </button>
                    <button type="button" class="tile" data-focus-grow>
                        <Icon name="settings" size="2rem" />
                        <span class="t">Settings</span>
                        <span class="s">Update · version 2.0.0</span>
                    </button>
                </div>
            </div>
            <footer class="pair">
                <Icon name="tablet" size="1.25rem" />
                <span>On the tablet, open battlemap and pick this table:</span>
                <span class="code">TABLE 7F3K</span>
            </footer>
        </div>
    {:else if screen === 'library'}
        <div class="library">
            <header class="top">
                <button type="button" class="back" aria-label="Back"><Icon name="back" size="1.5rem" /></button>
                <h1 class="bm-headline">Library</h1>
                <Segmented
                    label="Shelf"
                    bind:value={shelf}
                    options={[
                        { id: 'games', label: 'Games', icon: 'game' },
                        { id: 'maps', label: 'Maps', icon: 'map' },
                    ]}
                />
            </header>
            <div class="grid">
                {#each games as g, i (g.title)}
                    <Card title={g.title} meta={g.meta} selected={i === 0} onclick={() => {}}>
                        {#snippet media()}<KitMap tokens={false} frame={false} grid={false} fog={i % 3 === 2} tv />{/snippet}
                    </Card>
                {/each}
            </div>
        </div>
    {:else if screen === 'game'}
        <div class="game">
            <KitMap frame={false} tv />
            <button
                type="button"
                class="back floating"
                class:shown={chrome}
                aria-label="Back to the library"
                onclick={() => (chrome = !chrome)}
            >
                <Icon name="back" size="1.5rem" />
            </button>
            <div class="problem"><Badge text="Tablet not connected" icon="disconnected" tone="warn" size="tv" /></div>
        </div>
    {:else if screen === 'calibration'}
        <div class="calib">
            <svg class="pattern" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <pattern id="inch" width="55.4" height="55.4" patternUnits="userSpaceOnUse" x="18" y="13">
                        <path d="M55.4 0V55.4H0" fill="none" stroke="rgba(240,232,220,0.28)" stroke-width="2" />
                    </pattern>
                </defs>
                <rect width="1920" height="1080" fill="#14110e" />
                <rect width="1920" height="1080" fill="url(#inch)" />
                <!-- edges the TV cuts off: red strips, blue line on their border -->
                <rect width="1920" height="40" fill="rgba(240,112,112,0.35)" />
                <rect y="1040" width="1920" height="40" fill="rgba(240,112,112,0.35)" />
                <rect width="40" height="1080" fill="rgba(240,112,112,0.35)" />
                <rect x="1880" width="40" height="1080" fill="rgba(240,112,112,0.35)" />
                <rect x="40" y="40" width="1840" height="1000" fill="none" stroke="#6cb4e6" stroke-width="4" />
                <!-- the 10-inch bar from the pivot -->
                <circle cx="130" cy="950" r="22" fill="none" stroke="#e3b45e" stroke-width="6" />
                <rect x="130" y="940" width="554" height="20" rx="4" fill="#e3b45e" />
                {#each Array.from({ length: 11 }, (_, k) => k) as k (k)}
                    <rect x={130 + k * 55.4 - 2} y={k % 5 === 0 ? 905 : 918} width="4" height={k % 5 === 0 ? 35 : 22} fill="#e3b45e" />
                {/each}
                <text x="684" y="900" fill="#e3b45e" font-size="34" font-family="JetBrains Mono" text-anchor="end">10 in</text>
            </svg>
            <div class="instruct">
                <span class="bm-eyebrow">Measure the table</span>
                <h1 class="bm-headline">Measure the gold bar</h1>
                <p>Hold a ruler to it and type on the tablet what it measures. The bar starts at the gold ring and stays put while the squares change.</p>
                <div class="facts">
                    <span><b>34 × 19</b> squares</span>
                    <span><b>34.5 in</b> picture width</span>
                    <span><b>2 %</b> cut off at the edges</span>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .tv {
        position: relative;
        height: 100%;
        overflow: hidden;
        background: var(--bg);
        color: var(--t);
    }

    .top {
        display: flex;
        align-items: center;
        gap: var(--g2);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: var(--g);
        flex: 1;
    }

    .mark {
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: var(--r-ctl);
        background: color-mix(in srgb, var(--accent) 16%, var(--m0));
        color: var(--accent);
    }

    /* home */
    .home {
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: var(--g2);
        height: 100%;
        padding: calc(var(--g2) * 1.5) calc(var(--g2) * 2);
    }

    .tiles {
        display: grid;
        grid-template-columns: 1.7fr 1fr;
        gap: var(--g2);
        min-height: 0;
        align-items: center;
    }

    .side {
        display: flex;
        flex-direction: column;
        gap: var(--g);
    }

    .tile {
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto;
        column-gap: var(--g2);
        align-items: center;
        padding: var(--g2);
        border-radius: var(--r);
        background: var(--m1);
        color: var(--t2);
        text-align: left;
        box-shadow: var(--elev-rest);
    }

    .tile :global(.bm-icon) {
        grid-row: span 2;
    }

    .tile .t {
        font-family: var(--font-title);
        font-weight: var(--fw-title);
        font-size: var(--fs-title);
        color: var(--t);
    }

    .tile .s {
        font-size: var(--fs-small);
        color: var(--t2);
    }

    .tile:focus-visible {
        background: var(--m3);
    }

    .pair {
        display: flex;
        align-items: center;
        gap: var(--g);
        font-size: var(--fs-body);
        color: var(--t2);
    }

    .code {
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        letter-spacing: 0.08em;
        color: var(--accent-text);
    }

    /* library */
    .library {
        display: flex;
        flex-direction: column;
        gap: var(--g2);
        height: 100%;
        padding: calc(var(--g2) * 1.5) calc(var(--g2) * 2);
    }

    .library h1 {
        flex: 1;
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--g2);
        padding: var(--g) 0;
    }

    .back {
        display: grid;
        place-items: center;
        width: var(--sq-standalone);
        height: var(--sq-standalone);
        border-radius: var(--r);
        background: var(--m0);
        color: var(--t2);
        box-shadow: var(--elev-rest);
    }

    /* game: nothing but the map while all is well */
    .game {
        position: absolute;
        inset: 0;
    }

    .game > :global(svg) {
        position: absolute;
        inset: 0;
    }

    .back.floating {
        position: absolute;
        top: var(--g2);
        left: var(--g2);
        opacity: 0;
        transition: opacity var(--dur-fade) var(--ease-std);
    }

    .back.floating.shown,
    .back.floating:focus-visible {
        opacity: 1;
    }

    .problem {
        position: absolute;
        top: var(--g2);
        right: var(--g2);
    }

    /* calibration */
    .calib {
        position: absolute;
        inset: 0;
    }

    .pattern {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .instruct {
        position: absolute;
        right: 6%;
        top: 14%;
        width: 36%;
        display: flex;
        flex-direction: column;
        gap: var(--g);
        padding: var(--g2) calc(var(--g2) * 1.25);
        border-radius: var(--r);
        background: var(--m0);
        box-shadow: 0 0 0 1px var(--hair-strong);
    }

    .instruct p {
        font-size: var(--fs-body);
        color: var(--t2);
        line-height: var(--lh-body);
    }

    .facts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--g) var(--g2);
        padding-top: var(--g);
        border-top: 1px solid var(--hair);
        font-size: var(--fs-small);
        color: var(--t2);
    }

    .facts b {
        font-family: var(--font-value);
        color: var(--t);
    }
</style>
