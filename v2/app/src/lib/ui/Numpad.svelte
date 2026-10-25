<!--
  Numpad — type a number on screen (the old app's showNumpad, after MitWare's MwKeypad). Used
  by NumberStepper inside its plane; usable on its own inside a Plane or Dialog.

  The display shows the current value dimmed until the first key, which REPLACES it (no
  clearing first). A value outside min–max keeps OK off and shows the range in the error
  colour. A hardware keyboard works too: digits, . or , , Backspace, Enter (Escape is the
  surrounding plane's). Keys are 56 × 48 px on touch.

  Props:
  - value: number — the starting value
  - min, max: number — the allowed range
  - decimals: number — places after the point (0 = whole numbers; the key is then C)
  - unit: string — shown after the number
  - onok: (value: number) => void
-->
<script lang="ts">
    import Icon from './Icon.svelte';

    interface Props {
        /** The starting value. */
        value: number;
        /** Smallest allowed value. */
        min?: number;
        /** Largest allowed value. */
        max?: number;
        /** Places after the decimal point. */
        decimals?: number;
        /** Unit after the number. */
        unit?: string;
        /** The typed value was confirmed. */
        onok: (value: number) => void;
    }

    let { value, min = -Infinity, max = Infinity, decimals = 0, unit, onok }: Props = $props();

    let draft = $state('');

    const typed = $derived(draft !== '');
    const parsed = $derived(typed ? Number(draft) : value);
    const inRange = $derived(Number.isFinite(parsed) && parsed >= min && parsed <= max);
    const shown = $derived(typed ? draft : value.toFixed(decimals));
    const range = $derived(
        `${Number.isFinite(min) ? min.toFixed(decimals) : '…'} – ${Number.isFinite(max) ? max.toFixed(decimals) : '…'}`,
    );

    function key(k: string) {
        if (k === 'back') {
            draft = draft.slice(0, -1);
            return;
        }

        if (k === 'clear') {
            draft = '';
            return;
        }

        if (k === '.') {
            if (decimals === 0 || draft.includes('.')) return;

            draft = (draft === '' ? '0' : draft) + '.';
            return;
        }

        const [, frac = ''] = draft.split('.');

        if (draft.includes('.') && frac.length >= decimals) return;

        if (draft.replace('.', '').length >= 7) return;

        draft = draft === '0' ? k : draft + k;
    }

    function ok() {
        if (inRange) onok(parsed);
    }

    // a hardware keyboard types too
    $effect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (/^[0-9]$/.test(e.key)) key(e.key);
            else if (e.key === '.' || e.key === ',') key('.');
            else if (e.key === 'Backspace') key('back');
            else if (e.key === 'Enter') ok();
            else return;

            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('keydown', onKey, true);

        return () => window.removeEventListener('keydown', onKey, true);
    });

    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
</script>

<div class="bm-numpad">
    <div class="display" class:typed class:bad={typed && !inRange}>
        <span class="num">{shown}</span>
        {#if unit}<span class="unit">{unit}</span>{/if}
    </div>
    <div class="range" class:bad={typed && !inRange}>{range}{unit ? ` ${unit}` : ''}</div>
    <div class="keys">
        {#each digits as d (d)}
            <button type="button" class="key" onclick={() => key(d)}>{d}</button>
        {/each}
        {#if decimals > 0}
            <button type="button" class="key fn" onclick={() => key('.')}>.</button>
        {:else}
            <button type="button" class="key fn" aria-label="Clear" onclick={() => key('clear')}>C</button>
        {/if}
        <button type="button" class="key" onclick={() => key('0')}>0</button>
        <button type="button" class="key fn" aria-label="Delete a digit" onclick={() => key('back')}>
            <Icon name="backspace" size="var(--icon-row)" />
        </button>
    </div>
    <button type="button" class="ok" disabled={!inRange} onclick={ok}>
        <Icon name="check" size="var(--icon-row)" />
        <span>OK</span>
    </button>
</div>

<style>
    .bm-numpad {
        display: flex;
        flex-direction: column;
        gap: calc(var(--g) / 2);
        padding: calc(var(--g) / 2);
        width: max-content;
    }

    .display {
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 0.375rem;
        min-height: 3rem;
        padding: 0 var(--g);
        border-radius: var(--r-ctl);
        background: color-mix(in srgb, var(--bg) 50%, transparent);
        box-shadow: inset 0 0 0 1px var(--hair);
        line-height: 3rem;
    }

    .num {
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: 1.5rem;
        font-variant-numeric: tabular-nums;
        color: var(--t3);
    }

    .typed .num {
        color: var(--t);
    }

    .bad .num {
        color: var(--err);
    }

    .unit {
        font-family: var(--font-meta);
        font-size: var(--fs-small);
        color: var(--t3);
    }

    .range {
        text-align: right;
        padding: 0 var(--g);
        font-family: var(--font-meta);
        font-size: var(--fs-meta);
        color: var(--t3);
    }

    .range.bad {
        color: var(--err);
    }

    .keys {
        display: grid;
        grid-template-columns: repeat(3, 3.5rem);
        gap: calc(var(--g) / 2);
    }

    .key {
        display: grid;
        place-items: center;
        height: 3rem;
        border-radius: var(--r-ctl);
        background: var(--m1);
        box-shadow: inset 0 0 0 1px var(--hair);
        color: var(--t);
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: 1.25rem;
        transition: background-color var(--dur-tone) var(--ease-std);
        user-select: none;
        -webkit-touch-callout: none;
    }

    @media (hover: hover) {
        .key:hover {
            background: var(--m4);
        }
    }

    .key:active {
        background: var(--m4);
        transform: translateY(0.5px);
    }

    .key.fn {
        color: var(--t2);
        font-size: 1rem;
    }

    .ok {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: calc(var(--g) * 0.75);
        height: 3rem;
        border-radius: var(--r-ctl);
        background: var(--accent);
        color: var(--accent-ink);
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        font-size: var(--fs-body);
        transition:
            background-color var(--dur-tone) var(--ease-std),
            opacity var(--dur-tone) ease;
    }

    @media (hover: hover) {
        .ok:not(:disabled):hover {
            background: var(--accent-hover);
        }
    }

    .ok:disabled {
        opacity: 0.35;
        cursor: default;
    }
</style>
