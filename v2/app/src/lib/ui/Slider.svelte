<!--
  Slider — a value along a range where the exact number matters less than the feel (brush
  size, draw width, a layer's opacity). For exact counts use NumberStepper.

  The label sits above-left, the value (mono) above-right; the track fills in gold up to the
  thumb. The input is a native range (keyboard, D-pad left/right and screen readers for free)
  with a 44 px tall hit area. As the old app did, the value previews while dragging (`oninput`)
  and commits on release (`onchange`) — so the relay gets one message, not sixty.

  Props:
  - value: number (bindable) · min · max · step
  - label: string · format: (v) => string (the readout; default the number)
  - tone: Tone — the fill colour (default gold)
  - oninput: (v) => void — every move · onchange: (v) => void — on release
  - disabled
-->
<script lang="ts">
    import { toneVar, type Tone } from './tone';

    interface Props {
        /** The value. */
        value: number;
        /** Range start. */
        min?: number;
        /** Range end. */
        max?: number;
        /** Granularity. */
        step?: number;
        /** The visible label (also the accessible name). */
        label: string;
        /** Formats the readout. */
        format?: (v: number) => string;
        /** The fill colour. */
        tone?: Tone;
        /** Every move while dragging. */
        oninput?: (v: number) => void;
        /** On release. */
        onchange?: (v: number) => void;
        /** Not changeable right now. */
        disabled?: boolean;
    }

    let {
        value = $bindable(),
        min = 0,
        max = 100,
        step = 1,
        label,
        format = (v: number) => String(v),
        tone,
        oninput,
        onchange,
        disabled = false,
    }: Props = $props();

    const id = `bm-slider-${Math.random().toString(36).slice(2, 9)}`;
    const percent = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
</script>

<div class="bm-slider" class:disabled style:--fill={toneVar(tone)} style:--p="{percent}%">
    <div class="head">
        <label for={id}>{label}</label>
        <output for={id}>{format(value)}</output>
    </div>
    <input
        {id}
        type="range"
        {min}
        {max}
        {step}
        {disabled}
        bind:value
        oninput={() => oninput?.(value)}
        onchange={() => onchange?.(value)}
    />
</div>

<style>
    .bm-slider {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--g);
    }

    label {
        font-size: var(--fs-body);
        font-weight: var(--fw-label);
        color: var(--t);
    }

    output {
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: var(--fs-small);
        font-variant-numeric: tabular-nums;
        color: var(--t2);
    }

    input {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: var(--sq-row);
        margin: 0;
        background: transparent;
        cursor: pointer;
    }

    input:disabled {
        cursor: default;
    }

    input:focus-visible {
        outline-offset: 0;
        border-radius: var(--r-ctl);
    }

    input::-webkit-slider-runnable-track {
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(to right, var(--fill) 0 var(--p), var(--m4) var(--p) 100%);
    }

    input::-moz-range-track {
        height: 6px;
        border-radius: 999px;
        background: var(--m4);
    }

    input::-moz-range-progress {
        height: 6px;
        border-radius: 999px;
        background: var(--fill);
    }

    input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 1.375rem;
        height: 1.375rem;
        margin-top: calc((6px - 1.375rem) / 2);
        border-radius: 50%;
        background: var(--t);
        border: 3px solid var(--fill);
        box-shadow: 0 1px 4px var(--shadow-sm);
        transition: transform var(--dur-tone) var(--ease-std);
    }

    input::-moz-range-thumb {
        width: 1.375rem;
        height: 1.375rem;
        border-radius: 50%;
        background: var(--t);
        border: 3px solid var(--fill);
        box-shadow: 0 1px 4px var(--shadow-sm);
    }

    input:active::-webkit-slider-thumb {
        transform: scale(1.12);
    }

    .disabled {
        opacity: 0.45;
    }
</style>
