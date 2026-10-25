<!--
  FamilyEditor — one family of the template disc's outlines (radius rings, cubes or cones):
  its sizes in feet as chips (tap one to pick it, then −5 / +5 or remove; "+" adds the largest
  + 5), its colour (the disc palette), solid or dotted lines, labels on or off. Sits inside a
  collapsible Section whose header switch turns the family on and off.

  Props:
  - set: DiscShapeSet · onchange: (set) => void
-->
<script lang="ts">
  import { DISC_PALETTE, type DiscShapeSet } from '@battlemap/shared';
  import IconButton from '../../../ui/IconButton.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { addSize, MAX_FEET, MIN_FEET, removeSize, stepSize } from './disc-look.ts';

  interface Props {
    /** The family. */
    set: DiscShapeSet;
    /** It changed. */
    onchange: (set: DiscShapeSet) => void;
  }

  let { set, onchange }: Props = $props();

  let picked = $state<number | null>(null);
  const chosen = $derived(picked !== null && set.sizes.includes(picked) ? picked : null);

  function step(delta: number): void {
    if (chosen === null) return;
    const r = stepSize(set, chosen, delta);
    picked = r.size;
    onchange(r.set);
  }

  function add(): void {
    const r = addSize(set);
    if (r.added !== null) {
      picked = r.added;
      onchange(r.set);
    }
  }
</script>

<div class="family">
  <div class="sizes" role="listbox" aria-label="Sizes in feet">
    {#each set.sizes as s (s)}
      <button type="button" role="option" aria-selected={chosen === s} class="chip bm-sf" class:on={chosen === s} onclick={() => (picked = chosen === s ? null : s)}>
        {s}<small>ft</small>
      </button>
    {/each}
    <span data-ctl="compact"><IconButton icon="add" label="Add a size" variant="flat" disabled={set.sizes.length >= 12} onclick={add} /></span>
  </div>
  {#if chosen !== null}
    <div class="edit" data-ctl="compact">
      <span class="what">{chosen} ft</span>
      <IconButton icon="minus" label="5 ft smaller" disabled={chosen <= MIN_FEET} onclick={() => step(-5)} />
      <IconButton icon="add" label="5 ft bigger" disabled={chosen >= MAX_FEET} onclick={() => step(5)} />
      <IconButton icon="delete" label="Remove {chosen} ft" variant="quiet" onclick={() => { onchange(removeSize(set, chosen)); picked = null; }} />
    </div>
  {/if}
  <div class="swatches" role="radiogroup" aria-label="Colour">
    {#each DISC_PALETTE as c (c)}
      <button
        type="button"
        role="radio"
        aria-checked={set.color.toLowerCase() === c}
        aria-label="Colour {c}"
        class="swatch"
        class:chosen={set.color.toLowerCase() === c}
        style:--sw={c}
        onclick={() => onchange({ ...set, color: c })}
      ></button>
    {/each}
  </div>
  <div class="two">
    <Segmented
      label="Line"
      block
      value={set.line}
      onchange={(id) => onchange({ ...set, line: id as DiscShapeSet['line'] })}
      options={[{ id: 'solid', label: 'Solid' }, { id: 'dotted', label: 'Dotted' }]}
    />
    <ToggleSwitch label="Labels" checked={set.labels} onchange={(on) => onchange({ ...set, labels: on })} />
  </div>
</div>

<style>
  .family {
    display: grid;
    gap: var(--g);
  }

  .sizes {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--g) / 2);
    align-items: center;
  }

  .chip {
    min-width: var(--sq-compact);
    height: var(--sq-compact);
    padding: 0 var(--g);
    border-radius: var(--r-ctl);
    font: var(--fw-value) var(--fs-small) / 1 var(--font-value);
    color: var(--t);
    cursor: pointer;
  }

  .chip small {
    margin-left: 2px;
    color: var(--t3);
    font-size: var(--fs-meta);
  }

  .edit {
    display: flex;
    align-items: center;
    gap: calc(var(--g) / 2);
  }

  .what {
    flex: 1;
    font: var(--fs-small) / 1 var(--font-value);
    color: var(--t2);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--g) / 2);
  }

  .swatch {
    width: var(--sq-compact);
    height: var(--sq-compact);
    border: 0;
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 2px var(--shadow-sm);
    cursor: pointer;
    transition: box-shadow var(--dur-tone) var(--ease-std);
  }

  .swatch.chosen {
    box-shadow: inset 0 0 0 2px var(--shadow-sm), 0 0 0 3px var(--m0), 0 0 0 5px var(--t);
  }

  .two {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--g);
    align-items: center;
  }
</style>
