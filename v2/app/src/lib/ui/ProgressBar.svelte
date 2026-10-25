<!--
  ProgressBar — how far a long transfer is (a map uploading to the VPS, the TV downloading it,
  a PDF page rendering). Determinate with a `value` 0–1, indeterminate without one (a gliding
  segment). A label above-left, the percent (or `detail`, e.g. "12.4 of 38 MB") above-right.
  The fill moves by transform only.

  Props:
  - value: number — 0–1; omit for indeterminate
  - label: string — what is happening ("Uploading the cave")
  - detail: string — replaces the percent readout
  - tone: Tone — the fill colour (default gold)
-->
<script lang="ts">
    import { toneVar, type Tone } from './tone';

    interface Props {
        /** Progress 0–1; omit while unknown. */
        value?: number;
        /** What is happening. */
        label?: string;
        /** Readout instead of the percent. */
        detail?: string;
        /** The fill colour. */
        tone?: Tone;
    }

    let { value, label, detail, tone }: Props = $props();

    const known = $derived(value !== undefined && Number.isFinite(value));
    const clamped = $derived(known ? Math.min(1, Math.max(0, value as number)) : 0);
</script>

<div class="bm-progress" style:--fill={toneVar(tone)}>
    {#if label || detail || known}
        <div class="head">
            {#if label}<span class="label">{label}</span>{/if}
            <span class="detail">{detail ?? (known ? `${Math.round(clamped * 100)} %` : '')}</span>
        </div>
    {/if}
    <div
        class="track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(clamped * 100) : undefined}
    >
        {#if known}
            <span class="fill" style:transform="scaleX({clamped})"></span>
        {:else}
            <span class="fill indeterminate"></span>
        {/if}
    </div>
</div>

<style>
    .bm-progress {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        width: 100%;
    }

    .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--g);
    }

    .label {
        font-size: var(--fs-body);
        color: var(--t);
    }

    .detail {
        font-family: var(--font-value);
        font-size: var(--fs-small);
        font-variant-numeric: tabular-nums;
        color: var(--t2);
    }

    .track {
        position: relative;
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--m4);
    }

    .fill {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--fill);
        transform-origin: left;
        transition: transform var(--dur-glow) var(--ease-std);
    }

    .fill.indeterminate {
        width: 40%;
        transform-origin: center;
        animation: bm-indeterminate 1.3s var(--ease-std) infinite;
    }

    @keyframes bm-indeterminate {
        from {
            transform: translateX(-100%);
        }

        to {
            transform: translateX(250%);
        }
    }
</style>
