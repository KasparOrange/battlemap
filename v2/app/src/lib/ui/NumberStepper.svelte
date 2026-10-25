<!--
  NumberStepper — the one control for every count and length (map squares, circle radius,
  trim of revealed edges, the TV's picture width, a square's size in px). The old app's
  NumberStepper, after MitWare's: `−10 −5 −2 −1 [ n unit ] +1 +2 +5 +10`, magnitudes shrinking
  toward the number. Where the row is too narrow the biggest pairs drop out (measured, so it
  works without container queries); a tap on the number unfolds a Numpad out of it.

  Stability rules (from MitWare's composer): the number's box never changes size (tabular
  figures, a fixed minimum width), so fast tapping never chases a moving target; a step that
  would leave the range is disabled rather than clamped silently.

  Props:
  - value: number (bindable) · min · max
  - steps: number[] — ascending (default [1, 2, 5, 10]; 0.01 / 0.1 / 1 / 5 for px sizes)
  - decimals: number — places shown and typed (default 0)
  - unit: string — after the number ('%', 'sq', 'in', 'mm', 'px')
  - label: string — the visible label above the row and the accessible name ("Radius")
  - hideLabel: boolean — keep the label for screen readers only (a row that is self-explaining)
  - numpad: boolean — tap the number to type it (default true)
  - size: CtlSize · disabled · onchange: (value) => void
-->
<script lang="ts">
    import Plane from './Plane.svelte';
    import Numpad from './Numpad.svelte';
    import type { CtlSize } from './tone';

    interface Props {
        /** The number. */
        value: number;
        /** Smallest allowed value. */
        min?: number;
        /** Largest allowed value. */
        max?: number;
        /** The step sizes, ascending. */
        steps?: number[];
        /** Places after the decimal point. */
        decimals?: number;
        /** Unit after the number. */
        unit?: string;
        /** Visible label above the row, and the accessible name. */
        label: string;
        /** Keep the label for screen readers only. */
        hideLabel?: boolean;
        /** Tap the number to type it. */
        numpad?: boolean;
        /** Pins one of the four sizes. */
        size?: CtlSize;
        /** Not changeable right now. */
        disabled?: boolean;
        /** Called after every change by the user. */
        onchange?: (value: number) => void;
    }

    let {
        value = $bindable(),
        min = -Infinity,
        max = Infinity,
        steps = [1, 2, 5, 10],
        decimals = 0,
        unit,
        label,
        hideLabel = false,
        numpad = true,
        size,
        disabled = false,
        onchange,
    }: Props = $props();

    let root = $state<HTMLElement>();
    let pill = $state<HTMLButtonElement>();
    let padOpen = $state(false);
    /** how many step pairs fit beside the number */
    let pairs = $state(99);

    const MINUS = '−';
    const factor = $derived(Math.pow(10, decimals));
    const shownSteps = $derived(steps.slice(0, Math.max(1, Math.min(steps.length, pairs))));

    const round = (v: number) => Math.round(v * factor) / factor;
    const fmt = (v: number) => v.toFixed(decimals);
    const fmtStep = (s: number) => String(s);

    function set(next: number) {
        const v = round(Math.min(max, Math.max(min, next)));

        if (v === value) return;

        value = v;
        onchange?.(v);
    }

    // measured inside the observer's callback; written only when the count changes
    $effect(() => {
        if (!root) return;

        const el = root;
        const observer = new ResizeObserver(() => {
            const chip = el.querySelector<HTMLElement>('.step');
            const center = el.querySelector<HTMLElement>('.pill');

            if (!chip || !center) return;

            const row = el.querySelector<HTMLElement>('.row');
            const gap = row ? parseFloat(getComputedStyle(row).columnGap) || 0 : 0;
            const per = 2 * (chip.offsetWidth + gap);
            // the number's MINIMUM width — it grows into whatever the steps leave over
            const pillMin = parseFloat(getComputedStyle(center).minWidth) || center.offsetWidth;
            const fit = Math.max(1, Math.floor((el.clientWidth - pillMin - gap * 2) / per));

            if (fit !== pairs) pairs = fit;
        });

        observer.observe(el);

        return () => observer.disconnect();
    });
</script>

<div bind:this={root} class="bm-stepper" class:disabled data-ctl={size} role="group" aria-label={label}>
    <div class="caption" class:bm-visually-hidden={hideLabel} aria-hidden="true">
        <span>{label}</span>
        {#if Number.isFinite(min) && Number.isFinite(max)}<span class="range">{fmt(min)}–{fmt(max)}{unit ? ` ${unit}` : ''}</span>{/if}
    </div>
    <div class="row">
        {#each [...shownSteps].reverse() as s (s)}
            <button
                type="button"
                class="step minus"
                aria-label="{MINUS}{fmtStep(s)}"
                disabled={disabled || round(value - s) < min}
                onclick={() => set(value - s)}>{MINUS}{fmtStep(s)}</button
            >
        {/each}

        <button
            bind:this={pill}
            type="button"
            class="pill"
            class:open={padOpen}
            class:static={!numpad}
            aria-label="{label}: {fmt(value)}{unit ? ' ' + unit : ''}{numpad ? ', tap to type' : ''}"
            aria-haspopup={numpad ? 'dialog' : undefined}
            aria-expanded={numpad ? padOpen : undefined}
            {disabled}
            onclick={() => numpad && (padOpen = !padOpen)}
        >
            <span class="num">{fmt(value)}</span>
            {#if unit}<span class="unit">{unit}</span>{/if}
        </button>

        {#each shownSteps as s (s)}
            <button
                type="button"
                class="step plus"
                aria-label="+{fmtStep(s)}"
                disabled={disabled || round(value + s) > max}
                onclick={() => set(value + s)}>+{fmtStep(s)}</button
            >
        {/each}
    </div>
</div>

{#if numpad}
    <Plane anchor={pill} bind:open={padOpen} label="Type {label}" pad={false}>
        <Numpad
            {value}
            {min}
            {max}
            {decimals}
            {unit}
            onok={(v) => {
                set(v);
                padOpen = false;
            }}
        />
    </Plane>
{/if}

<style>
    .bm-stepper {
        display: block;
        width: 100%;
        min-width: 0;
    }

    .caption {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--g);
        margin-bottom: calc(var(--g) / 2);
        font-size: var(--fs-body);
        font-weight: var(--fw-label);
        color: var(--t);
    }

    .range {
        font-family: var(--font-meta);
        font-weight: var(--fw-meta);
        font-size: var(--fs-meta);
        color: var(--t3);
    }

    .row {
        display: flex;
        align-items: center;
        column-gap: calc(var(--g) / 2);
    }

    .step {
        flex: none;
        min-width: var(--ctl-sq, var(--sq-row));
        height: var(--ctl-sq, var(--sq-row));
        padding: 0 0.375rem;
        border-radius: var(--r-ctl);
        box-shadow: inset 0 0 0 1px var(--hair-strong);
        color: var(--t2);
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: var(--fs-small);
        font-variant-numeric: tabular-nums;
        transition:
            background-color var(--dur-tone) var(--ease-std),
            color var(--dur-tone) ease,
            box-shadow var(--dur-tone) ease;
        user-select: none;
        -webkit-touch-callout: none;
    }

    .step:not(:disabled):active {
        transform: translateY(1px);
    }

    @media (hover: hover) {
        .minus:not(:disabled):hover {
            color: var(--hide);
            background: color-mix(in srgb, var(--hide) 10%, transparent);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hide) 45%, transparent);
        }

        .plus:not(:disabled):hover {
            color: var(--ok);
            background: color-mix(in srgb, var(--ok) 10%, transparent);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok) 45%, transparent);
        }
    }

    .minus:not(:disabled):active {
        color: var(--hide);
        background: color-mix(in srgb, var(--hide) 12%, transparent);
    }

    .plus:not(:disabled):active {
        color: var(--ok);
        background: color-mix(in srgb, var(--ok) 12%, transparent);
    }

    .step:disabled {
        opacity: 0.32;
        cursor: default;
    }

    .pill {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: baseline;
        justify-content: center;
        gap: 0.25rem;
        min-width: 5rem;
        height: var(--ctl-sq, var(--sq-row));
        line-height: var(--ctl-sq, var(--sq-row));
        padding: 0 var(--g);
        border: var(--glow-w) solid var(--hair);
        border-radius: var(--r-ctl);
        background: var(--m1);
        color: var(--t);
        transition:
            background-color var(--dur-tone) var(--ease-std),
            border-color var(--dur-tone) ease;
    }

    .pill:not(.static) {
        cursor: pointer;
    }

    .pill.static {
        cursor: default;
    }

    @media (hover: hover) {
        .pill:not(.static):not(:disabled):hover {
            background: var(--m3);
        }
    }

    /* the numpad grows out of the number: same tone, joined corners square */
    .pill.open {
        background: var(--m3);
        border-color: var(--hair);
    }

    .pill:global([data-joint='down']) {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    .pill:global([data-joint='up']) {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }

    .num {
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: var(--fs-value);
        font-variant-numeric: tabular-nums;
    }

    .unit {
        font-family: var(--font-meta);
        font-size: var(--fs-small);
        color: var(--t3);
    }

    .disabled {
        opacity: 0.5;
    }
</style>
