<!--
  ListRow — one entry of a list: a token, a DM layer, a map in this game, a setting that opens
  something. Leading mark (an icon tile, a coloured token dot with its number, or a thumbnail),
  a title with an optional sub line, and trailing controls or a value.

  With `onclick` the leading mark and text form one button (the trailing controls stay their
  own buttons beside it — never a button inside a button). `selected` paints the row on the
  open tone with the accent glow ("On the table"); `dim` fades it (a token hidden from the
  players, a layer switched off).

  Props:
  - title: string · sub: string · value: string (dim trailing text)
  - icon: IconName — leading icon tile · color: string — leading token dot (CSS colour)
  - mark: string — text in the dot (the token's number) · leading: Snippet (anything else)
  - trailing: Snippet — controls at the end · chevron: boolean — "opens something"
  - selected · dim · disabled · onclick: (e) => void
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';
    import type { IconName } from './icons';

    interface Props {
        /** The row's name. */
        title: string;
        /** A line under the title. */
        sub?: string;
        /** Dim trailing text. */
        value?: string;
        /** Leading icon tile. */
        icon?: IconName;
        /** Leading token dot colour (CSS colour, e.g. var(--mark-3)). */
        color?: string;
        /** Text inside the token dot. */
        mark?: string;
        /** Custom leading content (a thumbnail). */
        leading?: Snippet;
        /** Controls at the end. */
        trailing?: Snippet;
        /** Shows a chevron: the row opens something. */
        chevron?: boolean;
        /** The current one. */
        selected?: boolean;
        /** Faded (hidden, switched off). */
        dim?: boolean;
        /** Not usable right now. */
        disabled?: boolean;
        /** Activates the row. */
        onclick?: (e: MouseEvent) => void;
    }

    let {
        title,
        sub,
        value,
        icon,
        color,
        mark,
        leading,
        trailing,
        chevron = false,
        selected = false,
        dim = false,
        disabled = false,
        onclick,
    }: Props = $props();
</script>

{#snippet main()}
    {#if leading}
        <span class="lead custom">{@render leading()}</span>
    {:else if color}
        <span class="lead dot" style:--dot={color}>{mark ?? ''}</span>
    {:else if icon}
        <span class="lead tile"><Icon name={icon} filled={selected} /></span>
    {/if}
    <span class="text">
        <span class="title">{title}</span>
        {#if sub}<span class="sub">{sub}</span>{/if}
    </span>
    {#if value}<span class="value">{value}</span>{/if}
    {#if chevron}<span class="chev"><Icon name="chevron-right" size="var(--icon-compact)" /></span>{/if}
{/snippet}

<div class="bm-row" class:selected class:dim class:interactive={!!onclick} class:bm-glow={selected}>
    {#if onclick}
        <button type="button" class="main" {disabled} {onclick}>{@render main()}</button>
    {:else}
        <div class="main">{@render main()}</div>
    {/if}
    {#if trailing}<div class="trailing" data-ctl="compact">{@render trailing()}</div>{/if}
</div>

<style>
    .bm-row {
        --glow-c: var(--accent);
        display: flex;
        align-items: center;
        gap: calc(var(--g) / 2);
        min-height: var(--sq-row);
        padding-right: calc(var(--g) / 2);
        border-radius: var(--r-ctl);
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    .main {
        display: flex;
        align-items: center;
        gap: var(--g);
        flex: 1;
        min-width: 0;
        min-height: var(--sq-row);
        padding: calc(var(--g) / 2) var(--g);
        border-radius: var(--r-ctl);
        text-align: left;
        color: var(--t);
    }

    .interactive .main {
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    @media (hover: hover) {
        .interactive .main:not(:disabled):hover {
            background: var(--wash);
        }
    }

    .interactive .main:not(:disabled):active {
        background: var(--wash);
    }

    .main:focus-visible {
        outline-offset: -2px;
    }

    .bm-row.selected {
        background: color-mix(in srgb, var(--accent) 9%, var(--m1));
    }

    .dim .main {
        opacity: 0.55;
    }

    .lead {
        flex: none;
        display: grid;
        place-items: center;
    }

    .tile {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: var(--r-ctl);
        background: var(--m2);
        color: var(--t2);
    }

    .selected .tile {
        color: var(--accent-text);
        background: color-mix(in srgb, var(--accent) 16%, var(--m1));
    }

    .dot {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        background: var(--dot);
        color: var(--mark-ink);
        font: 700 var(--fs-small) / 1 var(--font-value);
        box-shadow:
            0 0 0 2px var(--m0),
            0 0 0 3.5px color-mix(in srgb, var(--dot) 55%, transparent);
    }

    .custom {
        width: 3.5rem;
        height: 2.5rem;
        overflow: hidden;
        border-radius: var(--r-sm);
        background: var(--map-ground);
    }

    .custom :global(img) {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
        min-width: 0;
    }

    .title {
        font-size: var(--fs-body);
        font-weight: var(--fw-label);
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sub {
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .value {
        flex: none;
        font-family: var(--font-value);
        font-size: var(--fs-small);
        color: var(--t3);
    }

    .chev {
        display: flex;
        color: var(--t3);
    }

    .trailing {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: none;
    }
</style>
