<!--
  EditorPanel — the grid editor's tools beside the canvas (below it on narrow screens): the tool
  tiles, the Two corners / Known length steps, square size, position nudges, squares across and
  edge squares, corner jumps to check the fit, what lands on the table, and the rare settings
  (line colour, bold lines, start over) folded under "More". Every change is one undo step,
  made through `oncommit`.

  Props:
  - grid: RasterGrid — the grid now · table: {cols, rows} | null · detected: RasterGrid | null
  - tool, square, partial, colour, bold (bindable) — the editor's settings
  - markA, markB: Point | null — the marks on the picture
  - oncommit: (grid) => void · onjump: (jump) => void · onclearmarks: () => void
-->
<script lang="ts">
  import { acrossWidth, recountGrid, withCell, wholeGrid, type Point, type RasterGrid } from '@battlemap/shared';
  import Button from '../../../ui/Button.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import NumberStepper from '../../../ui/NumberStepper.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { fromCorners, fromLength, moved, positionText, readout, TOOL_HINTS, type EditorTool, type Jump, type LengthUnitKind } from './editor-logic.ts';
  import { LINE_COLOURS } from './paint.ts';

  interface Props {
    /** The grid now. */
    grid: RasterGrid;
    /** Squares the table holds. */
    table: { cols: number; rows: number } | null;
    /** The grid the importer found. */
    detected: RasterGrid | null;
    /** The tool. */
    tool: EditorTool;
    /** Square squares. */
    square: boolean;
    /** Partial edge squares count. */
    partial: boolean;
    /** Index of the line colour. */
    colour: number;
    /** Bold lines. */
    bold: boolean;
    /** First mark. */
    markA: Point | null;
    /** Second mark. */
    markB: Point | null;
    /** Makes a grid current as one undo step. */
    oncommit: (grid: RasterGrid) => void;
    /** Moves the view to a corner. */
    onjump: (j: Jump) => void;
    /** Removes the marks. */
    onclearmarks: () => void;
  }

  let {
    grid, table, detected, tool = $bindable(), square = $bindable(), partial = $bindable(), colour = $bindable(), bold = $bindable(),
    markA, markB, oncommit, onjump, onclearmarks,
  }: Props = $props();

  const TOOLS = [
    { id: 'look', label: 'Look', icon: 'view' as const },
    { id: 'move', label: 'Move', icon: 'pan' as const },
    { id: 'stretch', label: 'Stretch', icon: 'fullscreen' as const },
    { id: 'corners', label: 'Corners', icon: 'grid' as const },
    { id: 'length', label: 'Length', icon: 'measure' as const },
  ];
  const SIZE_STEPS = [0.01, 0.1, 1, 5];
  const JUMPS: { id: Jump; label: string }[] = [
    { id: 'topLeft', label: 'Top left' }, { id: 'topRight', label: 'Top right' }, { id: 'center', label: 'Centre' },
    { id: 'bottomLeft', label: 'Bottom left' }, { id: 'bottomRight', label: 'Bottom right' }, { id: 'whole', label: 'Whole' },
  ];

  let lengthAmount = $state(1);
  let lengthUnit = $state<LengthUnitKind>('squares');
  let nudgeStep = $state(1);

  const info = $derived(readout(grid, table));
  const cornerResult = $derived(markA && markB ? fromCorners(grid, markA, markB, square, partial) : null);
  const lengthResult = $derived(
    markA && markB ? fromLength(markA, markB, lengthAmount, lengthUnit, grid.pictureW, grid.pictureH, table, partial) : null,
  );
  const linePx = $derived(markA && markB ? Math.hypot(markB.x - markA.x, markB.y - markA.y) : 0);

  function useCorners(): void {
    const g = cornerResult?.grid;
    if (!g) return;
    oncommit(g);
    notify(`Grid: ${g.cols} × ${g.rows} squares of ${g.cellW.toFixed(2)} px`, { kind: 'success' });
    onclearmarks();
  }

  function useLength(): void {
    const g = lengthResult?.grid;
    if (!g) return;
    oncommit(g);
    square = true;
    notify(`Squares of ${g.cellW.toFixed(2)} px — ${g.cols} × ${g.rows} on the table.`, { kind: 'success' });
    onclearmarks();
  }

  function setPartial(on: boolean): void {
    partial = on;
    oncommit(recountGrid(grid, on));
  }

  const setSize = (w: number, h: number) => oncommit(withCell(grid, w, square ? w : h));
  const nudge = (dx: number, dy: number) => oncommit(moved(grid, dx, dy));
</script>

<Section title="Tool" description={TOOL_HINTS[tool]}>
  <Segmented label="Tool" options={TOOLS} bind:value={tool as string} layout="tile" block onchange={onclearmarks} />
</Section>

{#if tool === 'corners'}
  <Section title="Two corners">
    <p class="note" class:warn={cornerResult?.warn}>{cornerResult ? cornerResult.text : markA ? 'Now tap a corner far away.' : 'Tap a grid corner on the picture.'}</p>
    <div class="row">
      <Button label="Clear marks" icon="close" variant="flat" disabled={!markA} onclick={onclearmarks} />
      <Button label="Use these corners" icon="check" disabled={!cornerResult?.grid} onclick={useCorners} />
    </div>
  </Section>
{:else if tool === 'length'}
  <Section title="Known length">
    <p class="note">{markA && markB ? `The line is ${linePx.toFixed(1)} px long. It is:` : 'Drag a line on the picture.'}</p>
    <NumberStepper
      label="Length"
      hideLabel
      bind:value={lengthAmount}
      min={lengthUnit === 'feet' ? 2.5 : 0.5}
      max={lengthUnit === 'feet' ? 2000 : 400}
      steps={lengthUnit === 'feet' ? [5, 10, 25, 50] : [0.5, 1, 5, 10]}
      decimals={1}
    />
    <Segmented
      label="Unit"
      block
      bind:value={lengthUnit as string}
      options={[{ id: 'squares', label: 'Squares' }, { id: 'feet', label: 'Feet', hint: '5 per square' }]}
      onchange={(id) => (lengthAmount = id === 'feet' ? 5 : 1)}
    />
    {#if lengthResult}<p class="note" class:warn={lengthResult.warn}>{lengthResult.text}</p>{/if}
    <Button label="Use this length" icon="check" block disabled={!lengthResult?.grid} onclick={useLength} />
  </Section>
{/if}

<Section title="Square size">
  {#if square}
    <NumberStepper label="Side" value={grid.cellW} min={4} max={2000} steps={SIZE_STEPS} decimals={2} unit="px" onchange={(v) => setSize(v, v)} />
  {:else}
    <NumberStepper label="Width" value={grid.cellW} min={4} max={2000} steps={SIZE_STEPS} decimals={2} unit="px" onchange={(v) => setSize(v, grid.cellH)} />
    <NumberStepper label="Height" value={grid.cellH} min={4} max={2000} steps={SIZE_STEPS} decimals={2} unit="px" onchange={(v) => oncommit(withCell(grid, grid.cellW, v))} />
  {/if}
  <div class="row">
    <Button label="½ size" variant="flat" onclick={() => oncommit(withCell(grid, grid.cellW / 2, grid.cellH / 2))} />
    <Button label="× 2 size" variant="flat" onclick={() => oncommit(withCell(grid, grid.cellW * 2, grid.cellH * 2))} />
  </div>
  <ToggleSwitch
    label="Square squares"
    bind:checked={square}
    onchange={(on) => on && oncommit(withCell(grid, (grid.cellW + grid.cellH) / 2, (grid.cellW + grid.cellH) / 2))}
  />
</Section>

<Section title="Position" description={positionText(grid)}>
  <div class="nudge">
    <Segmented label="Step" value={String(nudgeStep)} onchange={(id) => (nudgeStep = Number(id))} options={[{ id: '1', label: '1 px' }, { id: '0.1', label: '0.1 px' }]} />
    <span class="arrows" data-ctl="compact">
      <IconButton icon="arrow-left" label="Left {nudgeStep} px" onclick={() => nudge(-nudgeStep, 0)} />
      <IconButton icon="arrow-up" label="Up {nudgeStep} px" onclick={() => nudge(0, -nudgeStep)} />
      <IconButton icon="arrow-down" label="Down {nudgeStep} px" onclick={() => nudge(0, nudgeStep)} />
      <IconButton icon="arrow-right" label="Right {nudgeStep} px" onclick={() => nudge(nudgeStep, 0)} />
    </span>
  </div>
  <Button label="Lines on the picture edge" icon="fit" variant="flat" onclick={() => oncommit({ ...grid, x: 0, y: 0 })} />
</Section>

<Section title="Squares">
  <NumberStepper label="Across the whole width" value={grid.cols} min={1} max={400} onchange={(n) => oncommit(acrossWidth(grid, n, square, partial))} />
  <Segmented
    label="Edge squares"
    block
    value={partial ? 'partial' : 'whole'}
    onchange={(id) => setPartial(id === 'partial')}
    options={[{ id: 'whole', label: 'Whole only' }, { id: 'partial', label: 'Include partial' }]}
  />
</Section>

<Section title="Check the fit" description="Jump to a corner: the lines must sit on the picture’s lines there too.">
  <div class="jumps">
    {#each JUMPS as j (j.id)}
      <Button label={j.label} variant="flat" size="compact" onclick={() => onjump(j.id)} />
    {/each}
  </div>
</Section>

<Section title="On the table" description={info.table}>
  {#if info.skew}<p class="note warn">{info.skew}</p>{/if}
</Section>

<Section title="More" collapsible open={false}>
  <div class="row">
    <Button label="Line colour" icon="color" variant="flat" onclick={() => (colour = (colour + 1) % LINE_COLOURS.length)}>
      <span class="swatch" style:background={LINE_COLOURS[colour]}></span>
    </Button>
    <Button label="Bold lines" variant="flat" on={bold} onclick={() => (bold = !bold)} />
  </div>
  {#if detected}
    <Button label="Start over: detected {detected.cols} × {detected.rows}" icon="sync" variant="flat" onclick={() => oncommit(detected)} />
  {/if}
  <Button
    label="Start over: whole picture, {grid.cols} across"
    icon="sync"
    variant="flat"
    onclick={() => oncommit(wholeGrid(grid.cols, Math.max(1, Math.round((grid.pictureH * grid.cols) / grid.pictureW)), grid.pictureW, grid.pictureH))}
  />
</Section>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g);
  }

  .row > :global(*) {
    flex: 1;
  }

  .nudge {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g);
    align-items: center;
    justify-content: space-between;
  }

  .arrows {
    display: flex;
    gap: calc(var(--g) / 2);
  }

  .jumps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: calc(var(--g) / 2);
  }

  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .note.warn {
    color: var(--warn);
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--hair-strong);
  }
</style>
