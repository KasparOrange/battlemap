<!--
  Badge — a short state word or count beside a name: "On the table", "Hidden", "Shared",
  "WebP", "3 staged". The tinted border, wash and text ARE the colour — no leading dot (tafel
  guideline 15a). `size="tv"` is the TV's top-right problem badge (icon + text, readable from
  the couch); it only ever appears when something is wrong.

  Props:
  - text: string · icon: IconName
  - tone: 'neutral' | Tone (default neutral)
  - size: 'sm' | 'tv' (default sm)
-->
<script lang="ts">
    import Icon from './Icon.svelte';
    import { toneVar, type Tone } from './tone';
    import type { IconName } from './icons';

    interface Props {
        /** The word or count. */
        text: string;
        /** A leading icon. */
        icon?: IconName;
        /** The colour. */
        tone?: 'neutral' | Tone;
        /** sm · tv. */
        size?: 'sm' | 'tv';
    }

    let { text, icon, tone = 'neutral', size = 'sm' }: Props = $props();
</script>

<span class="bm-badge {size}" class:neutral={tone === 'neutral'} style:--c={tone === 'neutral' ? undefined : toneVar(tone)}>
    {#if icon}<Icon name={icon} filled size={size === 'tv' ? 'var(--icon-row)' : '0.875rem'} />{/if}
    <span>{text}</span>
</span>

<style>
    .bm-badge {
        --c: var(--t2);
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        height: 1.375rem;
        padding: 0 0.4375rem;
        border-radius: var(--r-sm);
        border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
        background: color-mix(in srgb, var(--c) 12%, transparent);
        color: var(--c);
        font-family: var(--font-body);
        font-weight: 600;
        font-size: var(--fs-meta);
        line-height: 1;
        letter-spacing: 0.01em;
        white-space: nowrap;
    }

    .neutral {
        border-color: var(--hair-strong);
        background: var(--wash);
        color: var(--t2);
    }

    .tv {
        height: 2.75rem;
        gap: 0.5rem;
        padding: 0 0.875rem;
        border-radius: var(--r-ctl);
        border-width: 1.5px;
        background: color-mix(in srgb, var(--c) 16%, var(--m0));
        font-size: var(--fs-body);
        font-weight: var(--fw-label);
        color: var(--t);
    }

    .tv :global(.bm-icon) {
        color: var(--c);
    }
</style>
