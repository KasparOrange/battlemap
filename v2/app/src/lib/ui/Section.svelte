<!--
  Section — one group of related controls inside a Panel ("Tool", "Players see changes",
  "Whole map", "Look"). Things that belong together sit together under one small heading;
  sections are THE GAP × 2 apart (the Panel's body spacing), never boxed in borders of their own.

  The heading can carry a control at its end (`trailing`: the template disc's on/off for
  "Radius rings"). A `collapsible` section folds its body away under a chevron — the measured
  height grows on the fluent clock — for settings visited rarely mid-game.

  Props:
  - title: string — the heading (an eyebrow-style label)
  - description: string — one line under the heading
  - trailing: Snippet — a control at the heading's end
  - collapsible: boolean · open: boolean (bindable, default true)
  - children: Snippet — the controls
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';
    import { grow } from './fluent';

    interface Props {
        /** The heading. */
        title?: string;
        /** One line under the heading. */
        description?: string;
        /** A control at the heading's end. */
        trailing?: Snippet;
        /** Folds under a chevron. */
        collapsible?: boolean;
        /** Unfolded (collapsible sections). */
        open?: boolean;
        /** The controls. */
        children: Snippet;
    }

    let { title, description, trailing, collapsible = false, open = $bindable(true), children }: Props = $props();

    const bodyId = `bm-section-${Math.random().toString(36).slice(2, 9)}`;
</script>

<section class="bm-section" class:collapsible class:closed={collapsible && !open}>
    {#if title || trailing}
        <div class="head">
            {#if collapsible}
                <button type="button" class="fold" aria-expanded={open} aria-controls={bodyId} onclick={() => (open = !open)}>
                    <span class="bm-eyebrow">{title}</span>
                    <span class="chev"><Icon name="chevron-down" size="var(--icon-compact)" /></span>
                </button>
            {:else}
                <h3 class="bm-eyebrow">{title}</h3>
            {/if}
            {#if trailing}<div class="trailing" data-ctl="compact">{@render trailing()}</div>{/if}
        </div>
    {/if}
    {#if !collapsible || open}
        <div class="wrap" id={bodyId} in:grow out:grow>
            <div class="body">
                {#if description}<p class="desc">{description}</p>{/if}
                {@render children()}
            </div>
        </div>
    {/if}
</section>

<style>
    .bm-section {
        display: flex;
        flex-direction: column;
    }

    .head {
        display: flex;
        align-items: center;
        gap: var(--g);
        min-height: 1.75rem;
        margin-bottom: calc(var(--g) / 2);
    }

    .head > .bm-eyebrow,
    .fold {
        flex: 1;
        min-width: 0;
    }

    .fold {
        display: flex;
        align-items: center;
        gap: calc(var(--g) / 2);
        min-height: var(--sq-compact);
        margin: calc(var(--g) / -2) calc(var(--g) * -1);
        padding: 0 var(--g);
        border-radius: var(--r-ctl);
        text-align: left;
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    @media (hover: hover) {
        .fold:hover {
            background: var(--wash);
        }
    }

    .fold:active {
        background: var(--wash);
    }

    .chev {
        display: flex;
        color: var(--t3);
        transition: transform var(--dur-open) var(--ease-open);
    }

    .closed .chev {
        transform: rotate(-90deg);
        transition-duration: var(--dur-close);
        transition-timing-function: var(--ease-close);
    }

    .trailing {
        display: flex;
        align-items: center;
        gap: calc(var(--g) / 2);
        margin: calc(var(--g) / -2) 0;
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: var(--g);
    }

    .desc {
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: var(--lh-body);
    }
</style>
