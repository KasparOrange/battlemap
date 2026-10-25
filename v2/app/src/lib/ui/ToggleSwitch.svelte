<!--
  ToggleSwitch — on/off for a setting that applies at once (fluent rule 8: no OK / Apply).
  With a `label` the whole row is the target (label, optional description, the switch at the
  end); without one it is the bare switch (a section header's on/off, a list row's trailing
  control). The thumb travels by transform on the glide curve; on = the gold track.

  Props:
  - checked: boolean (bindable)
  - label: string · description: string (a line under the label)
  - disabled: boolean
  - onchange: (checked: boolean) => void
  - ariaLabel: string — the accessible name of a bare switch
-->
<script lang="ts">
    interface Props {
        /** On or off. */
        checked: boolean;
        /** The setting's name (makes it a full row). */
        label?: string;
        /** A line under the label: what on means. */
        description?: string;
        /** Not changeable right now. */
        disabled?: boolean;
        /** Called after the user flipped it. */
        onchange?: (checked: boolean) => void;
        /** Accessible name of a bare switch. */
        ariaLabel?: string;
    }

    let { checked = $bindable(), label, description, disabled = false, onchange, ariaLabel }: Props = $props();

    function flip() {
        if (disabled) return;

        checked = !checked;
        onchange?.(checked);
    }
</script>

<button
    type="button"
    class="bm-toggle"
    class:row={!!label}
    class:checked
    role="switch"
    aria-checked={checked}
    aria-label={label ? undefined : ariaLabel}
    {disabled}
    onclick={flip}
>
    {#if label}
        <span class="text">
            <span class="label">{label}</span>
            {#if description}<span class="desc">{description}</span>{/if}
        </span>
    {/if}
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</button>

<style>
    .bm-toggle {
        display: inline-flex;
        align-items: center;
        flex: none;
        min-height: var(--ctl-sq, var(--sq-row));
        min-width: var(--ctl-sq, var(--sq-row));
        justify-content: center;
        border-radius: var(--r-ctl);
        text-align: left;
        color: var(--t);
        -webkit-touch-callout: none;
        user-select: none;
    }

    .bm-toggle.row {
        display: flex;
        gap: var(--g);
        padding: calc(var(--g) / 2) var(--g);
        margin: 0 calc(var(--g) * -1);
        width: calc(100% + 2 * var(--g));
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    @media (hover: hover) {
        .bm-toggle.row:not(:disabled):hover {
            background: var(--wash);
        }
    }

    .bm-toggle.row:not(:disabled):active {
        background: var(--wash);
    }

    .bm-toggle:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    .label {
        font-size: var(--fs-body);
        font-weight: var(--fw-label);
        line-height: 1.25;
    }

    .desc {
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: 1.35;
    }

    .track {
        position: relative;
        flex: none;
        width: 2.75rem;
        height: 1.625rem;
        border-radius: 999px;
        background: var(--m4);
        box-shadow: inset 0 0 0 1.5px var(--hair-strong);
        transition:
            background-color var(--dur-tone) var(--ease-std),
            box-shadow var(--dur-tone) var(--ease-std);
    }

    .thumb {
        position: absolute;
        top: 0.25rem;
        left: 0.25rem;
        width: 1.125rem;
        height: 1.125rem;
        border-radius: 50%;
        background: var(--t2);
        box-shadow: 0 1px 2px var(--shadow-sm);
        transition:
            transform var(--dur-glow) var(--ease-glide),
            background-color var(--dur-tone) var(--ease-std);
    }

    .checked .track {
        background: var(--accent);
        box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, var(--accent-ink));
    }

    .checked .thumb {
        transform: translateX(1.125rem);
        background: var(--accent-ink);
    }
</style>
