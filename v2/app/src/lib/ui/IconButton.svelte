<!--
  IconButton — a square control with one icon. Its `label` is required: it becomes the
  accessible name and the tooltip (desktop hover, keyboard / D-pad focus — never on touch).
  On touch screens prefer a labelled Button where the icon alone is not obvious.

  Variants:
  - raised (default) — the square tile (map corner squares, the rail's undo/redo)
  - flat — no surface until touched (rows, toolbars)
  - quiet — the glyph alone: no surface ever, the glyph darkens and grows (close ×, row tools)

  Menus: with `menu` and no `onclick`, a press opens the menu ("⋯"). With both, the press runs
  `onclick` and a long press opens the menu (cross-project rule), with the corner mark.

  Props:
  - icon: IconName · label: string (required) · variant · tone · on · size · disabled · loading
  - badge: number | boolean — a count (or a dot) in the corner · badgeTone: Tone — its colour
  - menu: MenuItem[] · onmenu · onclick · el (bindable) · tooltip: boolean (default true)
-->
<script lang="ts">
    import type { HTMLButtonAttributes } from 'svelte/elements';
    import Icon from './Icon.svelte';
    import Spinner from './Spinner.svelte';
    import Menu, { type MenuItem } from './Menu.svelte';
    import { hold } from './hold';
    import { tooltip as tip } from './tooltip';
    import { toneVar, type CtlSize, type Tone } from './tone';
    import type { IconName } from './icons';

    interface Props extends Omit<HTMLButtonAttributes, 'onclick'> {
        /** The icon. */
        icon: IconName;
        /** Accessible name and tooltip text. */
        label: string;
        /** raised · flat · quiet. */
        variant?: 'raised' | 'flat' | 'quiet';
        /** The accent of the glow when latched. */
        tone?: Tone;
        /** Latched — the icon fills in and the edge glows. */
        on?: boolean;
        /** Pins one of the four sizes; unset = the container's context. */
        size?: CtlSize;
        /** Busy: a spinner instead of the icon. */
        loading?: boolean;
        /** A count in the corner, or `true` for a dot. */
        badge?: number | boolean;
        /** The badge's colour (default the gold accent; `ok` for "connected"). */
        badgeTone?: Tone;
        /** The button's menu (see the top comment). */
        menu?: MenuItem[];
        /** A row of the menu was chosen. */
        onmenu?: (id: string) => void;
        /** The press action. */
        onclick?: (e: MouseEvent) => void;
        /** Show the label as a tooltip on hover and keyboard focus. */
        tooltip?: boolean;
        /** The button element. */
        el?: HTMLButtonElement;
    }

    let {
        icon,
        label,
        variant = 'raised',
        tone,
        on = false,
        size,
        loading = false,
        badge,
        badgeTone,
        menu,
        onmenu,
        onclick,
        tooltip = true,
        el = $bindable(),
        disabled = false,
        class: extraClass = '',
        ...rest
    }: Props = $props();

    let menuOpen = $state(false);
    let menuHeld = $state(false);
    let menuFocus = $state(false);

    const holdMenu = $derived(!!menu && !!onclick);

    function press(e: MouseEvent) {
        if (onclick) return onclick(e);

        if (menu) {
            menuHeld = false;
            menuFocus = e.detail === 0; // a key press, not a pointer
            menuOpen = !menuOpen;
        }
    }

    function openByHold(via: { pointer: boolean }) {
        menuHeld = via.pointer;
        menuFocus = !via.pointer;
        menuOpen = true;
    }
</script>

<button
    bind:this={el}
    type="button"
    class="bm-ibtn {extraClass}"
    class:bm-sf={variant !== 'quiet'}
    class:flat={variant === 'flat'}
    class:quiet={variant === 'quiet'}
    class:on
    data-ctl={size}
    style:--sf-c={toneVar(tone)}
    aria-label={label}
    aria-pressed={on || undefined}
    aria-haspopup={menu ? 'menu' : undefined}
    aria-expanded={menu ? menuOpen : undefined}
    disabled={disabled || loading}
    use:hold={{ onhold: openByHold, enabled: holdMenu && !disabled }}
    use:tip={tooltip ? label : null}
    onclick={press}
    {...rest}
>
    {#if loading}
        <Spinner />
    {:else}
        <Icon name={icon} filled={on} />
    {/if}
    {#if badge}
        <span class="badge" class:dot={badge === true} style:--badge-c={badgeTone ? toneVar(badgeTone) : undefined}>{badge === true ? '' : badge}</span>
    {/if}
    {#if holdMenu}<span class="menu-mark" aria-hidden="true"></span>{/if}
</button>

{#if menu}
    <Menu anchor={el} bind:open={menuOpen} items={menu} held={menuHeld} focus={menuFocus} {label} onpick={(id) => onmenu?.(id)} />
{/if}

<style>
    .bm-ibtn {
        position: relative;
        display: inline-grid;
        place-items: center;
        flex: none;
        width: var(--ctl-sq, var(--sq-row));
        height: var(--ctl-sq, var(--sq-row));
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
    }

    .bm-ibtn:not(:disabled):active {
        transform: translateY(0.5px);
    }

    .bm-ibtn.on {
        color: var(--t);
    }

    /* quiet: the glyph is the button — it darkens and grows, no surface */
    .quiet {
        color: var(--t3);
        border-radius: var(--r-ctl);
        transition: color var(--dur-tone) ease;
    }

    .quiet :global(.bm-icon) {
        transition: transform var(--dur-tone) var(--ease-std);
    }

    @media (hover: hover) {
        .quiet:not(:disabled):hover {
            color: var(--t);
        }

        .quiet:not(:disabled):hover :global(.bm-icon) {
            transform: scale(1.14);
        }
    }

    .quiet:not(:disabled):active {
        color: var(--t);
    }

    .quiet:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .badge {
        position: absolute;
        top: 3px;
        right: 3px;
        min-width: 1.05rem;
        height: 1.05rem;
        padding: 0 0.25rem;
        border-radius: 999px;
        background: var(--badge-c, var(--accent));
        color: var(--accent-ink);
        font: 700 0.6875rem/1.05rem var(--font-value);
        text-align: center;
        box-shadow: 0 0 0 2px var(--m0);
    }

    .badge.dot {
        min-width: 0.5rem;
        width: 0.5rem;
        height: 0.5rem;
        padding: 0;
        top: 6px;
        right: 6px;
    }

    .bm-ibtn::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: color-mix(in srgb, var(--sf-c) 26%, transparent);
        transform: scaleX(0);
        transform-origin: left;
        opacity: 0;
        transition:
            transform 0.12s ease,
            opacity 0.12s ease;
        pointer-events: none;
    }

    .bm-ibtn:global([data-holding])::after {
        transform: scaleX(1);
        opacity: 1;
        transition:
            transform var(--dur-hold) linear,
            opacity 0.1s ease;
    }

    .menu-mark {
        position: absolute;
        right: 3px;
        bottom: 3px;
        width: 7px;
        height: 7px;
        border-bottom-right-radius: 3px;
        background: linear-gradient(135deg, transparent 50%, currentColor 50%);
        opacity: 0.4;
        pointer-events: none;
    }
</style>
