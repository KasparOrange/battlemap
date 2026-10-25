<!--
  Segmented — pick exactly one of a few options (Brush | Room | Circle, Reveal | Hide,
  Instantly | Preview first). Options are tiles: icon + text (fluent rule 10). The chosen look
  — THE EDGE GLOW on a faint wash — is one surface that GLIDES to the newly chosen option on
  the fluent clock (rule 14), and morphs its colour when the options carry tones (reveal
  blue → hide rose). A choice applies at once.

  Every option is its own focusable button, so the TV's D-pad and the arrow keys walk them like
  any other control; Enter / OK chooses.

  Props:
  - options: SegmentOption[] — id, label, icon, tone, hint (small line under a tile), disabled
  - value: string (bindable) — the chosen id
  - onchange: (id: string) => void
  - layout: 'inline' (icon beside text, control height) | 'tile' (icon above text, taller)
  - block: boolean — stretch over the full width in equal parts
  - size: CtlSize — pins the inline height; unset = the control context
  - label: string — accessible name of the group
-->
<script lang="ts" module>
    import type { IconName } from './icons';
    import type { Tone } from './tone';

    /** One option of a {@link Segmented} control. */
    export interface SegmentOption {
        /** Returned as the value. */
        id: string;
        /** The option's text (omit for an icon-only option — then give `title`). */
        label?: string;
        /** The option's icon. */
        icon?: IconName;
        /** The accent the chosen look takes on this option. */
        tone?: Tone;
        /** A small line under a tile's label (tile), or dim words after it (inline). */
        hint?: string;
        /** Accessible name / tooltip of an icon-only option. */
        title?: string;
        /** Not choosable. */
        disabled?: boolean;
    }
</script>

<script lang="ts">
    import Icon from './Icon.svelte';
    import { toneVar, type CtlSize } from './tone';
    import { openMs, still } from './fluent';

    interface Props {
        /** The options. */
        options: SegmentOption[];
        /** The chosen option's id. */
        value: string;
        /** Called after the user chose another option. */
        onchange?: (id: string) => void;
        /** inline · tile. */
        layout?: 'inline' | 'tile';
        /** Stretch over the full width. */
        block?: boolean;
        /** Pins the inline height. */
        size?: CtlSize;
        /** Accessible name of the group. */
        label: string;
    }

    let { options, value = $bindable(), onchange, layout = 'inline', block = false, size, label }: Props = $props();

    let track = $state<HTMLElement>();
    let glide = $state({ x: 0, y: 0, w: 0, h: 0, ms: 0, ready: false });
    let lastKey = '';

    const chosen = $derived(options.find((o) => o.id === value));

    function choose(o: SegmentOption) {
        if (o.disabled || o.id === value) return;

        value = o.id;
        onchange?.(o.id);
    }

    /**
     * Reads the chosen button's box and moves the highlight there (writes only on change).
     * @param animate - glide (a new choice) or jump (a layout change)
     */
    function measure(animate: boolean) {
        if (!track) return;

        const btn = track.querySelector<HTMLElement>(`[data-id="${CSS.escape(value)}"]`);

        if (!btn) return;

        const next = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight };
        const key = `${next.x}|${next.y}|${next.w}|${next.h}`;

        if (key === lastKey) return;

        lastKey = key;

        const distance = Math.hypot(next.x - glide.x, next.y - glide.y) + Math.abs(next.w - glide.w);
        const ms = animate && glide.ready && !still() ? openMs(distance) : 0;

        glide = { ...next, ms, ready: true };
    }

    $effect(() => {
        void value;
        void options.length;
        measure(true);
    });

    $effect(() => {
        if (!track) return;

        // measured inside the callback (after layout, before paint — ui-performance rule 6)
        const observer = new ResizeObserver(() => measure(false));

        observer.observe(track);

        return () => observer.disconnect();
    });
</script>

<div
    bind:this={track}
    class="bm-seg"
    class:tile={layout === 'tile'}
    class:block
    data-ctl={size}
    role="radiogroup"
    aria-label={label}
>
    <span
        class="glide bm-sf on"
        class:ready={glide.ready}
        aria-hidden="true"
        style:--sf-c={toneVar(chosen?.tone)}
        style:--glide-ms="{glide.ms}ms"
        style:width="{glide.w}px"
        style:height="{glide.h}px"
        style:transform="translate({glide.x}px, {glide.y}px)"
    ></span>
    {#each options as o (o.id)}
        <button
            type="button"
            class="opt"
            class:chosen={o.id === value}
            class:icon-only={!o.label}
            data-id={o.id}
            role="radio"
            aria-checked={o.id === value}
            aria-label={o.label ? undefined : o.title}
            title={o.label ? undefined : o.title}
            disabled={o.disabled}
            onclick={() => choose(o)}
        >
            {#if o.icon}<Icon name={o.icon} filled={o.id === value} />{/if}
            {#if o.label}
                <span class="text">
                    <span class="label">{o.label}</span>
                    {#if o.hint}<span class="hint">{o.hint}</span>{/if}
                </span>
            {/if}
        </button>
    {/each}
</div>

<style>
    .bm-seg {
        position: relative;
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: auto;
        gap: 3px;
        padding: 3px;
        border-radius: calc(var(--ctl-r, var(--r-ctl)) + 3px);
        background: color-mix(in srgb, var(--bg) 55%, transparent);
        box-shadow: inset 0 0 0 1px var(--hair);
        max-width: 100%;
    }

    .bm-seg.block {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        width: 100%;
    }

    .glide {
        position: absolute;
        top: 0;
        left: 0;
        border-radius: var(--ctl-r, var(--r-ctl));
        opacity: 0;
        pointer-events: none;
    }

    .glide.ready {
        opacity: 1;
        transition:
            transform var(--glide-ms) var(--ease-glide),
            width var(--glide-ms) var(--ease-glide),
            height var(--glide-ms) var(--ease-glide),
            --sf-tone var(--dur-glow) var(--ease-std),
            --sf-glow var(--dur-glow) var(--ease-std);
    }

    .opt {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: calc(var(--g) * 0.75);
        min-height: calc(var(--ctl-sq, var(--sq-row)) - 6px);
        padding: 0 calc(var(--g) * 1.25);
        border-radius: var(--ctl-r, var(--r-ctl));
        color: var(--t2);
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        font-size: var(--ctl-fs, var(--fs-body));
        white-space: nowrap;
        transition: color var(--dur-tone) ease;
        -webkit-touch-callout: none;
        user-select: none;
    }

    .opt.icon-only {
        padding: 0;
        min-width: calc(var(--ctl-sq, var(--sq-row)) - 6px);
    }

    @media (hover: hover) {
        .opt:not(:disabled):not(.chosen):hover {
            color: var(--t);
            background: var(--wash);
        }
    }

    .opt.chosen {
        color: var(--t);
    }

    .opt:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .text {
        display: flex;
        flex-direction: column;
        align-items: inherit;
        min-width: 0;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* inline: the hint follows the label in the same line, dimmer and smaller */
    .bm-seg:not(.tile) .text {
        flex-direction: row;
        align-items: baseline;
        gap: 0.3125rem;
    }

    /* tiles: icon above text, room for a hint line */
    .tile .opt {
        flex-direction: column;
        gap: calc(var(--g) / 2);
        min-height: 4rem;
        padding: calc(var(--g) * 0.75) calc(var(--g) / 2);
    }

    .tile .opt :global(.bm-icon) {
        --icon-size: var(--icon-standalone);
    }

    .tile .text {
        align-items: center;
        text-align: center;
    }

    .hint {
        font-family: var(--font-body);
        font-weight: 400;
        font-size: var(--fs-meta);
        color: var(--t3);
        white-space: normal;
        line-height: 1.25;
    }

    .chosen .hint {
        color: var(--t2);
    }
</style>
