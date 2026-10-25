<!--
  Card — one thing you can open: a map or a game in the library (companion and TV), a shared
  map, the "Continue" game. A picture on top (thumbnail, 16:9 by default), the name in the
  story face under it, one meta line (squares, size, when last played), badges at the end.

  With `onclick` the whole card is one button: on the TV it is a D-pad stop that grows a
  little and rings gold when focused. `selected` puts THE EDGE GLOW on it ("On the table").
  A `prominent` card is the screen's main way on (Continue): bigger name, the accent glow at rest.

  Props:
  - title: string · meta: string
  - image: string — picture URL (else the `media` snippet, else a quiet placeholder)
  - aspect: string — CSS aspect ratio of the picture (default '16 / 9')
  - media: Snippet · badges: Snippet · actions: Snippet (a row's tools under the meta line)
  - selected · prominent · disabled · onclick: (e) => void
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';

    interface Props {
        /** The map's or game's name. */
        title: string;
        /** One line of facts. */
        meta?: string;
        /** Picture URL. */
        image?: string;
        /** CSS aspect ratio of the picture area. */
        aspect?: string;
        /** Custom picture content. */
        media?: Snippet;
        /** Badges at the meta line's end. */
        badges?: Snippet;
        /** Tools under the text (outside the card's button). */
        actions?: Snippet;
        /** Marked as the current one. */
        selected?: boolean;
        /** The screen's main way on. */
        prominent?: boolean;
        /** Not openable right now. */
        disabled?: boolean;
        /** Opens it — makes the card a button. */
        onclick?: (e: MouseEvent) => void;
    }

    let {
        title,
        meta,
        image,
        aspect = '16 / 9',
        media,
        badges,
        actions,
        selected = false,
        prominent = false,
        disabled = false,
        onclick,
    }: Props = $props();
</script>

{#snippet face()}
    <span class="pic" style:aspect-ratio={aspect}>
        {#if image}
            <img src={image} alt="" loading="lazy" decoding="async" />
        {:else if media}
            {@render media()}
        {:else}
            <span class="empty"><Icon name="map" size="var(--icon-standalone)" /></span>
        {/if}
    </span>
    <span class="text">
        <span class="title">{title}</span>
        {#if meta || badges}
            <span class="meta-row">
                {#if meta}<span class="meta">{meta}</span>{/if}
                {#if badges}<span class="badges">{@render badges()}</span>{/if}
            </span>
        {/if}
    </span>
{/snippet}

<div class="bm-card bm-glow" class:selected class:prominent class:interactive={!!onclick} class:disabled>
    {#if onclick}
        <button type="button" class="face" {disabled} {onclick} data-focus-grow>{@render face()}</button>
    {:else}
        <div class="face">{@render face()}</div>
    {/if}
    {#if actions}<div class="actions" data-ctl="compact">{@render actions()}</div>{/if}
</div>

<style>
    .bm-card {
        min-width: 0;
        --glow-c: transparent;
        --glow-at: 0% 100%;
        display: flex;
        flex-direction: column;
        border-radius: var(--r);
        background: var(--m1);
        box-shadow: var(--elev-rest);
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    .bm-card.selected,
    .bm-card.prominent {
        --glow-c: var(--accent);
        background: color-mix(in srgb, var(--accent) 7%, var(--m1));
    }

    .face {
        display: flex;
        flex-direction: column;
        gap: var(--g);
        width: 100%;
        min-width: 0;
        padding: var(--g);
        border-radius: var(--r);
        text-align: left;
        color: var(--t);
    }

    .interactive .face {
        cursor: pointer;
    }

    @media (hover: hover) {
        .interactive:not(.disabled):hover {
            background: var(--m2);
        }

        .interactive.selected:not(.disabled):hover,
        .interactive.prominent:not(.disabled):hover {
            background: color-mix(in srgb, var(--accent) 11%, var(--m1));
        }
    }

    .interactive:not(.disabled):active {
        background: var(--m2);
    }

    .disabled {
        opacity: 0.5;
    }

    .pic {
        position: relative;
        display: block;
        width: 100%;
        overflow: hidden;
        border-radius: calc(var(--r) - var(--g) / 2);
        background: var(--map-ground);
    }

    .pic img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .pic :global(> *) {
        width: 100%;
        height: 100%;
    }

    .empty {
        display: grid;
        place-items: center;
        color: var(--t3);
    }

    .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 calc(var(--g) / 2) calc(var(--g) / 2);
        min-width: 0;
    }

    .title {
        font-family: var(--font-headline);
        font-weight: var(--fw-headline);
        font-size: var(--fs-title);
        line-height: var(--lh-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .prominent .title {
        font-size: var(--fs-headline);
    }

    .meta-row {
        display: flex;
        align-items: center;
        gap: var(--g);
        min-width: 0;
    }

    .meta {
        flex: 1;
        min-width: 0;
        font-size: var(--fs-small);
        color: var(--t2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .badges {
        display: flex;
        gap: calc(var(--g) / 2);
        flex: none;
    }

    .actions {
        display: flex;
        gap: calc(var(--g) / 2);
        padding: 0 var(--g) var(--g);
    }
</style>
