<!--
  EffectPreview — a sprite-sheet effect's frames looping inside its round thumbnail stage
  (`preview.ts`): laid over the still thumbnail, which it hides once the atlas has loaded. Only
  runs while `active` (the tile is hovered or focused, or the effect is armed) — the grid never
  plays all at once. Not for other techniques (they keep the still) or under reduced motion.
  Fills its positioned parent.

  Props:
  - effect: PickerEffect — the effect · lib: string — the library's base URL (ends in /)
  - active: boolean — play now · scale: number — share of the stage the frame fills (default 0.88)
-->
<script lang="ts">
  import { still } from '../../../ui/fluent.ts';
  import type { PickerEffect } from './catalog.ts';
  import { loadPreview, previewKeyframes, previewLayout, type SheetPreview } from './preview.ts';

  interface Props {
    /** The effect. */
    effect: PickerEffect;
    /** The library's base URL. */
    lib: string;
    /** Play now. */
    active: boolean;
    /** Share of the stage the frame fills. */
    scale?: number;
  }

  // renamed: a prop called `effect` would shadow the `$effect` rune
  let { effect: fx, lib, active, scale = 0.88 }: Props = $props();

  let box = $state<HTMLSpanElement>();
  let anim = $state<HTMLSpanElement>();
  let plan = $state.raw<SheetPreview | null>(null);
  let shown = $state(false);

  const can = $derived(fx.technique === 'sheet' && !still());

  // the plan once the tile is first activated (and only then: no download for a grid at rest)
  $effect(() => {
    if (!active || !can || plan) return;
    let gone = false;
    void loadPreview(fx.id, lib).then((p) => {
      if (!gone) plan = p;
    });
    return () => {
      gone = true;
    };
  });

  // play while active: one CSS animation on the compositor's clock, no script per frame
  $effect(() => {
    const p = plan;
    const el = anim;
    if (!active || !p || !el || !box) {
      shown = false;
      return;
    }
    const side = box.clientWidth * scale;
    if (side <= 0) return;
    const l = previewLayout(p, side);
    el.style.width = `${l.w}px`;
    el.style.height = `${l.h}px`;
    el.style.backgroundSize = `${l.bgW}px ${l.bgH}px`;
    const { keyframes, durationMs } = previewKeyframes(p, l.scale);
    let a: Animation | null = null;
    const img = new Image();
    img.decoding = 'async';
    img.src = p.url;
    let gone = false;
    // swap the still for the loop only once the atlas is decoded (no empty frame)
    img.decode().then(
      () => {
        if (gone) return;
        el.style.backgroundImage = `url("${p.url}")`;
        a = el.animate(keyframes, { duration: durationMs, iterations: Infinity });
        shown = true;
      },
      () => {},
    );
    return () => {
      gone = true;
      a?.cancel();
      shown = false;
    };
  });
</script>

{#if can}
  <span class="pv" class:shown bind:this={box} aria-hidden="true">
    <span class="frame" bind:this={anim}></span>
  </span>
{/if}

<style>
  .pv {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    opacity: 0;
  }

  .pv.shown {
    opacity: 1;
  }

  .frame {
    display: block;
    background-repeat: no-repeat;
  }

  /* the still underneath steps back while the loop plays */
  :global(.stage:has(> .pv.shown) > img) {
    opacity: 0;
  }
</style>
