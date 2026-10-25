<!--
  Spinner — an arc turning while something loads (IO rule: no IO without visible feedback).
  Inside a busy button it replaces the icon; on its own it can carry a label beside it. The
  motion is one CSS transform (composited, no script per frame) and keeps running under
  reduced motion — it carries information, not decoration.

  Props:
  - size: string — CSS length (default: the control context's icon size)
  - label: string — text beside the arc ("Loading the map…"); also its accessible name
  - tone: 'accent' | 'ink' — gold arc, or the surrounding text colour (default accent)
-->
<script lang="ts">
    interface Props {
        /** CSS length of the arc. */
        size?: string;
        /** Visible text beside the arc, and the accessible name. */
        label?: string;
        /** Gold arc, or the surrounding text colour. */
        tone?: 'accent' | 'ink';
    }

    let { size, label, tone = 'accent' }: Props = $props();
</script>

<span class="bm-spinner" class:ink={tone === 'ink'} role="status" aria-label={label ?? 'Loading'} style:--spin-size={size}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle class="track" cx="10" cy="10" r="8" />
        <circle class="arc" cx="10" cy="10" r="8" />
    </svg>
    {#if label}<span class="label">{label}</span>{/if}
</span>

<style>
    .bm-spinner {
        display: inline-flex;
        align-items: center;
        gap: var(--g);
        color: var(--accent);
    }

    .bm-spinner.ink {
        color: currentColor;
    }

    svg {
        width: var(--spin-size, var(--ctl-icon, var(--icon-row)));
        height: var(--spin-size, var(--ctl-icon, var(--icon-row)));
        animation: bm-spin 0.9s linear infinite;
    }

    circle {
        fill: none;
        stroke-width: 2.2;
        stroke-linecap: round;
    }

    .track {
        stroke: currentColor;
        opacity: 0.18;
    }

    .arc {
        stroke: currentColor;
        stroke-dasharray: 16 50.3;
    }

    .label {
        font-size: var(--fs-body);
        color: var(--t2);
    }

    @keyframes bm-spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
