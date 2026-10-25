<!--
  Button — THE button of the kit. Icon + label (a button is never text alone where an icon
  can say it; tafel guideline 18), on the raised Surface by default.

  Variants:
  - raised (default) — its own surface, hairline, soft shadow; hover previews the open tone
  - flat — no surface until touched; for dense strips and secondary actions in a row
  - primary — the gold fill: the ONE commit action of a dialog or screen (at most one per surface)

  `on` latches it (a filter, a view switch): the accent arrives as THE EDGE GLOW with a faint
  wash, never a second button style. `tone` changes that accent (reveal blue, hide rose …);
  `tone="danger"` also writes the label in the error colour.

  Second action (cross-project rule): pass `menu` and holding the button (~420 ms, the face
  fills while it waits) unfolds a Menu out of it — the default action as the first row, the
  others below with a line each; lifting the finger over a row picks it. Holding Enter / the
  remote's OK does the same. A small corner mark tells that a menu is there.

  IO rule: `loading` swaps the icon for a spinner and blocks presses; repeated presses within
  `debounce` ms are ignored (no double-loading a session).

  Props:
  - label: string · icon: IconName · iconEnd: IconName · hint: string (dim trailing text)
  - variant: 'raised' | 'flat' | 'primary' · tone: Tone · on: boolean
  - size: CtlSize — pins a size; unset = THE CONTROL CONTEXT (default row, 44 px on touch)
  - block: boolean — full width · disabled · loading · debounce: number (ms, default 350)
  - menu: MenuItem[] · onmenu: (id) => void · menuLabel: string
  - onclick: (e) => void · type: 'button' | 'submit' · title · el (bindable) · children (Snippet)
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLButtonAttributes } from 'svelte/elements';
    import Icon from './Icon.svelte';
    import Spinner from './Spinner.svelte';
    import Menu, { type MenuItem } from './Menu.svelte';
    import { hold } from './hold';
    import { toneVar, type CtlSize, type Tone } from './tone';
    import type { IconName } from './icons';

    interface Props extends Omit<HTMLButtonAttributes, 'onclick' | 'children'> {
        /** The text. */
        label?: string;
        /** Leading icon. */
        icon?: IconName;
        /** Trailing icon (a chevron for "goes somewhere"). */
        iconEnd?: IconName;
        /** Dim trailing text: a value, a count, a key. */
        hint?: string;
        /** raised · flat · primary. */
        variant?: 'raised' | 'flat' | 'primary';
        /** The accent of the glow (and the ink for danger). */
        tone?: Tone;
        /** Latched (filter on, current view). */
        on?: boolean;
        /** Pins one of the four sizes; unset = the container's context. */
        size?: CtlSize;
        /** Full width of its container. */
        block?: boolean;
        /** Busy: spinner instead of the icon, presses blocked. */
        loading?: boolean;
        /** Presses closer together than this (ms) are ignored. */
        debounce?: number;
        /** Long-press menu: the button's other actions. */
        menu?: MenuItem[];
        /** A row of the long-press menu was chosen. */
        onmenu?: (id: string) => void;
        /** Accessible name of the menu (default: the label). */
        menuLabel?: string;
        /** The default action. */
        onclick?: (e: MouseEvent) => void;
        /** The button element. */
        el?: HTMLButtonElement;
        /** Free content after the label. */
        children?: Snippet;
    }

    let {
        label,
        icon,
        iconEnd,
        hint,
        variant = 'raised',
        tone,
        on = false,
        size,
        block = false,
        loading = false,
        debounce = 350,
        menu,
        onmenu,
        menuLabel,
        onclick,
        el = $bindable(),
        children,
        disabled = false,
        type = 'button',
        class: extraClass = '',
        ...rest
    }: Props = $props();

    let menuOpen = $state(false);
    let menuHeld = $state(false);
    let menuFocus = $state(false);
    let lastPress = -Infinity;

    const bare = $derived(!label && !children && !hint);

    function press(e: MouseEvent) {
        const now = performance.now();

        if (now - lastPress < debounce) return;

        lastPress = now;
        onclick?.(e);
    }

    function openMenu(via: { pointer: boolean }) {
        menuHeld = via.pointer;
        menuFocus = !via.pointer;
        menuOpen = true;
    }
</script>

<button
    bind:this={el}
    {type}
    class="bm-btn bm-sf {extraClass}"
    class:flat={variant === 'flat'}
    class:primary={variant === 'primary'}
    class:on
    class:block
    class:bare
    class:danger={tone === 'danger'}
    class:has-menu={!!menu}
    data-ctl={size}
    style:--sf-c={toneVar(tone)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-pressed={on || undefined}
    aria-haspopup={menu ? 'menu' : undefined}
    aria-expanded={menu ? menuOpen : undefined}
    use:hold={{ onhold: openMenu, enabled: !!menu && !disabled && !loading }}
    onclick={press}
    {...rest}
>
    {#if loading}
        <Spinner tone={variant === 'primary' ? 'ink' : 'accent'} />
    {:else if icon}
        <Icon name={icon} filled={on} />
    {/if}
    {#if label}<span class="label">{label}</span>{/if}
    {@render children?.()}
    {#if hint}<span class="hint">{hint}</span>{/if}
    {#if iconEnd}<span class="end"><Icon name={iconEnd} /></span>{/if}
    {#if menu}<span class="menu-mark" aria-hidden="true"></span>{/if}
</button>

{#if menu}
    <Menu
        anchor={el}
        bind:open={menuOpen}
        items={menu}
        held={menuHeld}
        focus={menuFocus}
        label={menuLabel ?? label ?? 'More'}
        onpick={(id) => onmenu?.(id)}
    />
{/if}

<style>
    .bm-btn {
        position: relative;
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: calc(var(--g) * 0.75);
        min-height: var(--ctl-sq, var(--sq-row));
        min-width: var(--ctl-sq, var(--sq-row));
        padding: 0 calc(var(--g) * 1.5) 0 calc(var(--g) * 1.25);
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        font-size: var(--ctl-fs, var(--fs-body));
        line-height: 1.1;
        letter-spacing: -0.005em;
        white-space: nowrap;
        color: var(--t);
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        overflow: hidden;
    }

    .bm-btn :global(.bm-icon) {
        color: var(--t2);
        transition: color var(--dur-tone) ease;
    }

    @media (hover: hover) {
        .bm-btn:not(:disabled):hover :global(.bm-icon) {
            color: var(--t);
        }
    }

    .bm-btn.on :global(.bm-icon) {
        color: var(--t);
    }

    .bm-btn.bare {
        padding: 0;
    }

    .bm-btn.block {
        display: flex;
        flex: 1 1 auto;
        width: 100%;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .hint {
        margin-left: auto;
        padding-left: calc(var(--g) / 2);
        font-family: var(--font-value);
        font-weight: 500;
        font-size: var(--fs-small);
        color: var(--t3);
    }

    .end {
        display: flex;
        margin-right: calc(var(--g) * -0.5);
    }

    .block .end {
        margin-left: auto;
    }

    .block .hint + .end {
        margin-left: 0;
    }

    .bm-btn:not(:disabled):active {
        transform: translateY(0.5px);
    }

    /* primary — the gold fill, one per surface */
    .bm-btn.primary {
        --sf-tone: var(--accent);
        --sf-ring: color-mix(in srgb, var(--accent) 70%, var(--accent-ink));
        color: var(--accent-ink);
    }

    .bm-btn.primary :global(.bm-icon) {
        color: var(--accent-ink);
    }

    @media (hover: hover) {
        .bm-btn.primary:not(:disabled):hover {
            --sf-tone: var(--accent-hover);
            color: var(--accent-ink);
        }

        .bm-btn.primary:not(:disabled):hover :global(.bm-icon) {
            color: var(--accent-ink);
        }
    }

    .bm-btn.primary:not(:disabled):active {
        --sf-tone: var(--accent-hover);
        color: var(--accent-ink);
    }

    /* danger — the error ink, the glow in the same hue when latched */
    .bm-btn.danger,
    .bm-btn.danger :global(.bm-icon) {
        color: var(--err);
    }

    /* long press: the face fills while the hold waits */
    .bm-btn::after {
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

    .bm-btn:global([data-holding])::after {
        transform: scaleX(1);
        opacity: 1;
        transition:
            transform var(--dur-hold) linear,
            opacity 0.1s ease;
    }

    /* the corner mark: "hold me for more" */
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
