<!--
  Panel — a floating surface holding a tool's controls (the tablet's tool panel, the library's
  side column, a TV screen's card). Calm: the base material, one hairline, a soft shadow that
  lifts it off the map; THE GAP from every neighbouring edge is the layout's job.

  Header (optional): an eyebrow over a title, actions at the end. The body scrolls inside the
  panel with melting edges (never the page); a footer stays put under it — the place for a
  tab's commit actions ("Apply 12 squares").

  Props:
  - title: string · eyebrow: string
  - actions: Snippet — header end (an IconButton or two)
  - footer: Snippet — pinned under the body
  - floating: boolean — the stronger shadow for a panel over the wild map (default true)
  - children: Snippet — the body
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import { scrollFade } from './scroll-fade';

    interface Props {
        /** The panel's title. */
        title?: string;
        /** Small uppercase line over the title. */
        eyebrow?: string;
        /** Header end: actions. */
        actions?: Snippet;
        /** Pinned under the body. */
        footer?: Snippet;
        /** Over the map: the stronger shadow. */
        floating?: boolean;
        /** The body. */
        children: Snippet;
    }

    let { title, eyebrow, actions, footer, floating = true, children }: Props = $props();
</script>

<section class="bm-panel" class:floating aria-label={title}>
    {#if title || eyebrow || actions}
        <header>
            <div class="titles">
                {#if eyebrow}<span class="bm-eyebrow">{eyebrow}</span>{/if}
                {#if title}<h2>{title}</h2>{/if}
            </div>
            {#if actions}<div class="actions" data-ctl="compact">{@render actions()}</div>{/if}
        </header>
    {/if}
    <div class="body bm-scroll" use:scrollFade>
        {@render children()}
    </div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
</section>

<style>
    .bm-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: 100%;
        background: var(--m0);
        border: 1.5px solid var(--hair);
        border-radius: var(--r);
        box-shadow: var(--elev-rest);
        color: var(--t);
        overflow: hidden;
    }

    .bm-panel.floating {
        box-shadow: var(--elev-float);
    }

    header {
        display: flex;
        align-items: center;
        gap: var(--g);
        min-height: var(--sq-toolbar);
        padding: var(--g) var(--g) calc(var(--g) / 2) var(--g2);
    }

    .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    h2 {
        font-family: var(--font-title);
        font-weight: var(--fw-title);
        font-size: var(--fs-title);
        line-height: var(--lh-tight);
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        gap: calc(var(--g) / 2);
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: var(--g2);
        min-height: 0;
        flex: 1;
        padding: var(--g) var(--g2) var(--g2);
    }

    footer {
        display: flex;
        gap: var(--g);
        padding: var(--g) var(--g2) var(--g2);
        border-top: 1px solid var(--hair);
        background: var(--m0);
    }
</style>
