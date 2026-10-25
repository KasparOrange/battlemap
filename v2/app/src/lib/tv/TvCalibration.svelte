<!--
  TvCalibration — the words over the calibration pattern (design.md "Table calibration"; the
  pattern itself — one-inch squares, the cut-off edges, the gold measuring bar — is drawn by the
  renderer in screen space). Says what to do, shows the numbers, and offers "Done" for the
  remote (it turns the pattern off; the tablet usually does that). The card sits in the corner
  across from the bar's pivot so it never covers the bar.

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
</script>

<div class="calib" data-testid="tv-calibration">
  <div class="instruct" class:bottom={atBottom} class:left={atLeft}>
    <span class="bm-eyebrow">Measure the table</span>
    <h1 class="bm-headline">Measure the gold bar</h1>
    <p>Hold a ruler to it and type on the tablet what it measures. The bar starts at the gold ring and stays put while the squares change.</p>
    <div class="facts">
      {#if grid}<span><b>{grid.cols} × {grid.rows}</b> squares</span>{/if}
      <span><b>{fmt(table.widthInches)} in</b> picture width</span>
      <span><b>{fmt(table.overscanPercent)} %</b> cut off at the edges</span>
    </div>
    <div class="actions">
      <Button label="Done" icon="check" data-autofocus onclick={onDone} />
    </div>
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
    width: 36%;
    display: flex;
    flex-direction: column;
    gap: var(--g);
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

  h1,
  p {
    margin: 0;
  }

  p {
    font-size: var(--fs-body);
    color: var(--t2);
    line-height: var(--lh-body);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g) var(--g2);
    padding-top: var(--g);
    border-top: 1px solid var(--hair);
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .facts b {
    font-family: var(--font-value);
    color: var(--t);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
