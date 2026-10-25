<!--
  TvCalibration — the remote's way out of the calibration pattern (design.md "Table
  calibration"). The pattern itself — one-inch squares, the cut-off edges, the gold measuring
  bar and its instructions — is drawn by the renderer in screen space; this small card only
  names the step, shows the squares, and offers "Done" (Back does the same; the tablet usually
  turns the pattern off). It sits in the corner across from the bar's pivot so it never covers
  the bar.

  Props:
  - table: TableState — width, overscan, viewport, pivot
  - onDone: () => void — "Done" pressed
-->
<script lang="ts">
  import { tableGrid, type TableState } from '@battlemap/shared';
  import Button from '../ui/Button.svelte';

  interface Props {
    /** The TV's table state. */
    table: TableState;
    /** "Done" was pressed. */
    onDone: () => void;
  }

  let { table, onDone }: Props = $props();

  const grid = $derived(table.viewport ? tableGrid(table.viewport, table.widthInches, table.overscanPercent) : null);
  const pivot = $derived(table.pattern.pivot);
  const atBottom = $derived(pivot === 'topLeft' || pivot === 'topRight');
  const atLeft = $derived(pivot === 'topRight' || pivot === 'bottomRight');
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  const facts = $derived(
    [grid ? `${grid.cols} × ${grid.rows} squares` : null, `${fmt(table.widthInches)} in wide`, table.overscanPercent > 0 ? `${fmt(table.overscanPercent)} % cut off` : null]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<div class="calib" data-testid="tv-calibration">
  <div class="instruct" class:bottom={atBottom} class:left={atLeft}>
    <div class="text">
      <span class="bm-eyebrow">Measure the table</span>
      <span class="facts">{facts}</span>
    </div>
    <Button label="Done" icon="check" data-autofocus onclick={onDone} />
  </div>
</div>

<style>
  .calib {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .instruct {
    pointer-events: auto;
    position: absolute;
    right: 6%;
    top: 14%;
    display: flex;
    align-items: center;
    gap: var(--g2);
    padding: var(--g2) calc(var(--g2) * 1.25);
    border-radius: var(--r);
    background: var(--m0);
    box-shadow: 0 0 0 1px var(--hair-strong);
    color: var(--t);
  }

  .instruct.bottom {
    top: auto;
    bottom: 14%;
  }

  .instruct.left {
    right: auto;
    left: 6%;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: calc(var(--g) / 2);
  }

  .facts {
    font-family: var(--font-value);
    font-size: var(--fs-body);
    color: var(--t);
  }

</style>
