<!--
  Tabs — the companion's tool switch, where a TAB IS A MODE (old app, 2026-10-10): being on
  Fog means a finger on the map paints fog; there are no mode buttons inside a tab. Vertical
  as the tablet's rail (right edge, thumb reach), horizontal as the phone's bottom bar.

  Each tab: icon above a short label; the chosen tab's icon fills in and THE EDGE GLOW glides
  to it (fluent rule 14). Tabs with a `group` are set apart by a hairline (modes | panels).
  Tapping the chosen tab again calls `onreselect` (the panel folds; the mode stays).
  A `footer` snippet sits at the far end of the rail (undo / redo).

  Props:
  - items: TabItem[] — id, label, icon, group, badge, disabled
  - value: string (bindable) — the chosen tab
  - orientation: 'vertical' | 'horizontal' (default vertical)
  - onselect: (id) => void · onreselect: (id) => void
  - label: string — accessible name of the tab list
  - footer: Snippet
-->
<script lang="ts" module>
    import type { IconName } from './icons';

    /** One tab of {@link Tabs}. */
    export interface TabItem {
        /** Returned as the value. */
        id: string;
        /** Short label under the icon (one word). */
        label: string;
        /** The tab's icon (filled when chosen). */
        icon: IconName;
        /** Tabs of another group are set apart by a hairline. */
        group?: string;
        /** A count or a dot on the icon. */
        badge?: number | boolean;
        /** Not choosable right now. */
        disabled?: boolean;
    }
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';
    import { openMs, still } from './fluent';

    interface Props {
        /** The tabs. */
        items: TabItem[];
        /** The chosen tab's id. */
        value: string;
        /** vertical rail · horizontal bar. */
        orientation?: 'vertical' | 'horizontal';
        /** Called when another tab was chosen. */
        onselect?: (id: string) => void;
        /** Called when the chosen tab was tapped again. */
        onreselect?: (id: string) => void;
        /** Accessible name of the tab list. */
        label: string;
        /** Content at the far end (undo / redo). */
        footer?: Snippet;
    }

    let { items, value = $bindable(), orientation = 'vertical', onselect, onreselect, label, footer }: Props = $props();

    let list = $state<HTMLElement>();
    let glide = $state({ x: 0, y: 0, w: 0, h: 0, ms: 0, ready: false });
    let lastKey = '';

    function choose(t: TabItem) {
        if (t.disabled) return;

        if (t.id === value) {
            onreselect?.(t.id);
            return;
        }

        value = t.id;
        onselect?.(t.id);
    }

    /** @param animate - glide (a new choice) or jump (a layout change) */
    function measure(animate: boolean) {
        if (!list) return;

        const btn = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(value)}"]`);

        if (!btn) return;

        const next = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight };
        const key = `${next.x}|${next.y}|${next.w}|${next.h}`;

        if (key === lastKey) return;

        lastKey = key;

        const distance = Math.hypot(next.x - glide.x, next.y - glide.y);

        glide = { ...next, ms: animate && glide.ready && !still() ? openMs(distance) : 0, ready: true };
    }

    $effect(() => {
        void value;
        void items.length;
        measure(true);
    });

    $effect(() => {
        if (!list) return;

        const observer = new ResizeObserver(() => measure(false));

        observer.observe(list);

        return () => observer.disconnect();
    });

    const startsGroup = (i: number) => i > 0 && items[i]?.group !== items[i - 1]?.group;
</script>

<div bind:this={list} class="bm-tabs {orientation}" role="tablist" aria-label={label} aria-orientation={orientation}>
    <span
        class="glide bm-sf on"
        class:ready={glide.ready}
        aria-hidden="true"
        style:--glide-ms="{glide.ms}ms"
        style:width="{glide.w}px"
        style:height="{glide.h}px"
        style:transform="translate({glide.x}px, {glide.y}px)"
    ></span>
    {#each items as t, i (t.id)}
        {#if startsGroup(i)}<span class="sep" aria-hidden="true"></span>{/if}
        <button
            type="button"
            class="tab"
            class:chosen={t.id === value}
            data-id={t.id}
            role="tab"
            aria-selected={t.id === value}
            disabled={t.disabled}
            onclick={() => choose(t)}
        >
            <span class="ico">
                <Icon name={t.icon} filled={t.id === value} size="var(--icon-standalone)" />
                {#if t.badge}<span class="badge" class:dot={t.badge === true}>{t.badge === true ? '' : t.badge}</span>{/if}
            </span>
            <span class="lbl">{t.label}</span>
        </button>
    {/each}
    {#if footer}<div class="foot">{@render footer()}</div>{/if}
</div>

<style>
    .bm-tabs {
        position: relative;
        display: flex;
        gap: calc(var(--g) / 2);
    }

    .vertical {
        flex-direction: column;
        height: 100%;
    }

    .horizontal {
        flex-direction: row;
        width: 100%;
    }

    .glide {
        position: absolute;
        top: 0;
        left: 0;
        opacity: 0;
        border-radius: var(--r-ctl);
        pointer-events: none;
    }

    .glide.ready {
        opacity: 1;
        transition:
            transform var(--glide-ms) var(--ease-glide),
            width var(--glide-ms) var(--ease-glide),
            height var(--glide-ms) var(--ease-glide);
    }

    .tab {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 4rem;
        padding: calc(var(--g) / 2) 2px;
        border-radius: var(--r-ctl);
        color: var(--t2);
        transition: color var(--dur-tone) ease;
        -webkit-touch-callout: none;
        user-select: none;
    }

    .horizontal .tab {
        flex: 1 1 0;
        min-width: 0;
        min-height: calc(var(--tabbar-h) - var(--g));
    }

    @media (hover: hover) {
        .tab:not(:disabled):not(.chosen):hover {
            color: var(--t);
            background: var(--wash);
        }
    }

    .tab:not(:disabled):not(.chosen):active {
        background: var(--wash);
    }

    .tab.chosen {
        color: var(--t);
    }

    .tab.chosen .ico {
        color: var(--accent-text);
    }

    .tab:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .ico {
        position: relative;
        display: grid;
        place-items: center;
    }

    .lbl {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        font-size: var(--fs-meta);
        letter-spacing: 0.01em;
    }

    .badge {
        position: absolute;
        top: -4px;
        right: -9px;
        min-width: 1rem;
        height: 1rem;
        padding: 0 0.25rem;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-ink);
        font: 700 0.625rem/1rem var(--font-value);
        text-align: center;
        box-shadow: 0 0 0 2px var(--m0);
    }

    .badge.dot {
        min-width: 0;
        width: 0.5rem;
        height: 0.5rem;
        padding: 0;
        top: -1px;
        right: -3px;
    }

    .sep {
        flex: none;
        background: var(--hair);
    }

    .vertical .sep {
        height: 1px;
        margin: calc(var(--g) / 2) var(--g);
    }

    .horizontal .sep {
        width: 1px;
        margin: var(--g) 0;
    }

    .foot {
        display: flex;
        gap: calc(var(--g) / 2);
        align-items: center;
        justify-content: center;
    }

    .vertical .foot {
        margin-top: auto;
        flex-direction: column;
        padding-top: var(--g);
        border-top: 1px solid var(--hair);
    }

    .horizontal .foot {
        margin-left: auto;
    }
</style>
