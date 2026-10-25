<!--
  EffectTile — one effect in the Effects tab's browser, quick strip or weather grid: its
  thumbnail on a dark round stage, its name, a short size line; the armed (or switched-on) one
  carries THE EDGE GLOW. A star marks favourites. A real button: focusable, Enter / OK picks.

  Props:
  - effect: PickerEffect — the effect
  - thumbUrl: string — its thumbnail's URL
  - on: boolean — armed / switched on
  - favourite: boolean — starred (a small star in the corner)
  - line: string — the line under the name (default: its size words)
  - compact: boolean — the quick strip's smaller tile
  - pressed: boolean — render as a toggle (`aria-pressed`) rather than a pick
  - onclick: () => void
-->
<script lang="ts">
  import Icon from '../../../ui/Icon.svelte';
  import { DAMAGE_COLORS, sizeWords, type PickerEffect } from './catalog.ts';

  interface Props {
    /** The effect. */
    effect: PickerEffect;
    /** Its thumbnail's URL. */
    thumbUrl: string;
    /** Armed / switched on. */
    on?: boolean;
    /** Starred. */
    favourite?: boolean;
    /** The line under the name. */
    line?: string;
    /** The quick strip's smaller tile. */
    compact?: boolean;
    /** A toggle (`aria-pressed`). */
    pressed?: boolean;
    /** The tile's name, when not the effect's. */
    name?: string;
    /** Picked. */
    onclick?: () => void;
  }

  let { effect, thumbUrl, on = false, favourite = false, line, compact = false, pressed = false, name, onclick }: Props = $props();

  const hue = $derived(effect.damage.map((d) => DAMAGE_COLORS[d]).find(Boolean) ?? null);
</script>

<button
  type="button"
  class="tile bm-sf"
  class:on
  class:compact
  aria-pressed={pressed ? on : undefined}
  aria-current={!pressed && on ? 'true' : undefined}
  title={effect.spells.length ? effect.spells.join(', ') : undefined}
  data-effect={effect.id}
  style:--hue={hue}
  {onclick}
>
  <span class="stage">
    <img src={thumbUrl} alt="" loading="lazy" decoding="async" draggable="false" />
  </span>
  <span class="name">{name ?? effect.name}</span>
  {#if !compact}<span class="line">{line ?? sizeWords(effect)}</span>{/if}
  {#if favourite}<span class="star" aria-label="Favourite"><Icon name="star" filled size="0.75rem" /></span>{/if}
</button>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--g) / 2);
    min-width: 0;
    padding: calc(var(--g) * 0.75) calc(var(--g) / 2) var(--g);
    border-radius: var(--r-ctl);
    color: var(--t2);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .tile.on {
    color: var(--t);
  }

  .stage {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--hue, var(--accent)) 14%, #15110d) 0%, #0b0907 72%);
    box-shadow: inset 0 0 0 1px var(--hair);
    overflow: hidden;
  }

  .compact .stage {
    width: 3rem;
    height: 3rem;
  }

  .stage img {
    width: 88%;
    height: 88%;
    object-fit: contain;
    pointer-events: none;
  }

  .name {
    width: 100%;
    font: 500 var(--fs-small) / 1.2 var(--font-title);
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .compact .name {
    font-size: var(--fs-meta);
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .line {
    font: var(--fs-meta) / 1 var(--font-value);
    color: var(--t3);
  }

  .star {
    position: absolute;
    top: calc(var(--g) / 2);
    right: calc(var(--g) / 2);
    color: var(--accent-text);
    line-height: 0;
  }
</style>
