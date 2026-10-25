<!--
  Icon — one Fluent UI System Icon from the kit's set (icons.ts), drawn inline in
  currentColor on its 20 × 20 grid.

  Props:
  - name: IconName — which icon
  - filled: boolean — the filled form (falls back to regular where none exists)
  - size: string — CSS length; default = THE CONTROL CONTEXT's icon size (--ctl-icon, else 20 px)
  - label: string — set when the icon carries meaning on its own (becomes role="img");
    omit for decorative icons next to text (aria-hidden)
-->
<script lang="ts">
    import { icons, type IconName } from './icons';

    interface Props {
        /** Which icon. */
        name: IconName;
        /** Show the filled form (selected states). */
        filled?: boolean;
        /** CSS length; default follows the control context. */
        size?: string;
        /** Accessible name when the icon stands alone; omit when decorative. */
        label?: string;
    }

    let { name, filled = false, size, label }: Props = $props();

    const paths = $derived(icons[name]);
    const d = $derived(filled && 'filled' in paths && paths.filled ? paths.filled : paths.regular);
</script>

<svg
    class="bm-icon"
    viewBox="0 0 20 20"
    style:--icon-size={size}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
    focusable="false"
>
    <path {d} />
</svg>

<style>
    .bm-icon {
        width: var(--icon-size, var(--ctl-icon, var(--icon-row)));
        height: var(--icon-size, var(--ctl-icon, var(--icon-row)));
        flex: none;
        fill: currentColor;
    }
</style>
