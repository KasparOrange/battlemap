<!--
  Kit — the gallery of the fluent kit (mounted by v2/app/kit.html). Three pages:
  - Components: every component in every state, in the dark theme, the light one, or both
    side by side;
  - Companion: the game screen composed from the kit — the tablet layout at ≥ 720 px wide,
    the phone layout below;
  - TV: the TV's screens at 10-foot size (home, library, game, calibration), D-pad live.

  The URL drives it, so a screenshot can ask for any view:
    kit.html#components?theme=both   #companion?theme=light&tab=view   #tv?screen=library
  `chrome=0` hides the gallery's own bar, `notice=1` raises a sample notice.
-->
<script lang="ts">
    import Segmented from './Segmented.svelte';
    import NoticeHost from './NoticeHost.svelte';
    import KitComponents from './kit/KitComponents.svelte';
    import KitCompanion from './kit/KitCompanion.svelte';
    import KitTv from './kit/KitTv.svelte';
    import { notify } from './notice.svelte';

    type Page = 'components' | 'companion' | 'tv';

    function readUrl() {
        const [path = '', query = ''] = location.hash.replace(/^#/, '').split('?');
        const params = new URLSearchParams(query);

        return {
            page: (['components', 'companion', 'tv'].includes(path) ? path : 'components') as Page,
            theme: params.get('theme') ?? 'dark',
            screen: params.get('screen') ?? 'home',
            chrome: params.get('chrome') !== '0',
            notice: params.get('notice') === '1',
            tab: params.get('tab') ?? 'fog',
        };
    }

    const start = readUrl();

    let page = $state<Page>(start.page);
    let theme = $state(start.theme);
    let screen = $state(start.screen);
    const chrome = start.chrome;

    // keep the URL in step, so a reload (or a screenshot script) lands on the same view
    $effect(() => {
        const q = new URLSearchParams();

        if (page !== 'tv') q.set('theme', theme);
        else q.set('screen', screen);

        if (page === 'companion' && start.tab !== 'fog') q.set('tab', start.tab);

        if (!chrome) q.set('chrome', '0');

        history.replaceState(null, '', `#${page}?${q}`);
    });

    // the root theme follows the pick (the light column of "both" sets its own)
    $effect(() => {
        document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    });

    $effect(() => {
        // iOS Safari applies :active only when a touch listener exists
        const noop = () => {};

        document.addEventListener('touchstart', noop, { passive: true });

        if (start.notice) {
            setTimeout(
                () =>
                    notify('Whole map revealed — the players see every room now', {
                        action: { label: 'Undo', run: () => notify('Fog back as it was') },
                        ms: 60000,
                    }),
                300,
            );
        }

        return () => document.removeEventListener('touchstart', noop);
    });
</script>

<div class="kit" class:full={page !== 'components'} class:bare={!chrome} class:companion={page === 'companion'}>
    {#if chrome}
        <header class="bar" data-ctl="compact">
            <div class="brand">
                <span class="bm-headline name">battlemap</span>
                <span class="bm-eyebrow">fluent kit</span>
            </div>
            <Segmented
                label="Page"
                bind:value={page}
                options={[
                    { id: 'components', label: 'Components', icon: 'grid' },
                    { id: 'companion', label: 'Companion', icon: 'tablet' },
                    { id: 'tv', label: 'TV', icon: 'tv' },
                ]}
            />
            <span class="spacer"></span>
            {#if page === 'tv'}
                <Segmented
                    label="TV screen"
                    bind:value={screen}
                    options={[
                        { id: 'home', label: 'Home' },
                        { id: 'library', label: 'Library' },
                        { id: 'game', label: 'Game' },
                        { id: 'calibration', label: 'Calibration' },
                    ]}
                />
            {:else}
                <Segmented
                    label="Theme"
                    bind:value={theme}
                    options={[
                        { id: 'dark', label: 'Dark', icon: 'moon' },
                        { id: 'light', label: 'Light', icon: 'sun' },
                        ...(page === 'components' ? [{ id: 'both', label: 'Both', icon: 'grid' as const }] : []),
                    ]}
                />
            {/if}
        </header>
    {/if}

    <main>
        {#if page === 'components'}
            <div class="columns" class:both={theme === 'both'}>
                {#if theme !== 'light'}
                    <div class="column" data-theme="dark"><KitComponents theme="dark" /></div>
                {/if}
                {#if theme !== 'dark'}
                    <div class="column" data-theme="light"><KitComponents theme="light" /></div>
                {/if}
            </div>
        {:else if page === 'companion'}
            <div class="stage" data-theme={theme === 'light' ? 'light' : 'dark'}><KitCompanion startTab={start.tab} /></div>
        {:else}
            <div class="stage" data-theme="dark"><KitTv {screen} /></div>
        {/if}
    </main>

    <NoticeHost />
</div>

<style>
    :global(html, body) {
        height: 100%;
    }

    :global(body) {
        margin: 0;
        background: var(--bg);
    }

    .kit {
        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 100dvh;
        background: var(--bg);
        color: var(--t);
    }

    .kit.full {
        height: 100dvh;
    }

    .kit.bare {
        grid-template-rows: 1fr;
    }

    /* notices: over the map, clear of the tool panel (tablet) or the tab bar (phone) */
    .kit.companion {
        --notice-right: calc(var(--panel-w) + var(--rail-w) + 2 * var(--g));
    }

    @media (max-width: 719px) {
        .kit.companion {
            --notice-right: 0px;
            --notice-bottom: calc(var(--tabbar-h) + var(--g2));
        }
    }

    .bar {
        position: sticky;
        top: 0;
        z-index: var(--z-panel);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--g) var(--g2);
        padding: var(--g) var(--g2);
        background: color-mix(in srgb, var(--bg) 92%, transparent);
        border-bottom: 1px solid var(--hair);
    }

    .brand {
        display: flex;
        align-items: baseline;
        gap: var(--g);
    }

    .name {
        font-size: var(--fs-title);
    }

    .spacer {
        flex: 1;
    }

    main {
        min-height: 0;
    }

    .columns {
        display: grid;
        grid-template-columns: 1fr;
    }

    .columns.both {
        grid-template-columns: 1fr 1fr;
    }

    .column {
        min-width: 0;
        padding: var(--g2);
        background: var(--bg);
    }

    .stage {
        height: 100%;
        min-height: 0;
    }

    @media (max-width: 900px) {
        .columns.both {
            grid-template-columns: 1fr;
        }
    }
</style>
