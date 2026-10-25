<!--
  SquaresDialog — "Squares on this picture": the step between picking a map and playing it.
  The picture with the squares drawn over it and what the importer found (a drawn grid, the
  file name's counts, nothing), the map's name, squares across and down (rows follow across,
  square squares, until the DM sets them), whether the picture has its own grid lines, how it
  sits on the table, and "Store as". The flat action opens the grid editor: "Fit on the
  picture", or "Measure on the picture" (its Known length tool) when no grid was found. While
  uploading the footer becomes the progress bar.

  Props:
  - open: boolean (bindable) · prepared: PreparedMap · grid: RasterGrid (bindable — the editor writes it)
  - commitLabel: string ("Upload and play", "Add to the game") · table: {cols, rows} | null
  - format: StoreAs (bindable) · fitted: boolean — the grid came from the editor · progress: {value, label, detail} | null — shown instead of the footer
  - oncommit: (choices) => void · onfit: (grid, tool) => void — open the editor · onclose
-->
<script lang="ts">
  import type { RasterGrid } from '@battlemap/shared';
  import Badge from '../../ui/Badge.svelte';
  import Button from '../../ui/Button.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Field from '../../ui/Field.svelte';
  import NumberStepper from '../../ui/NumberStepper.svelte';
  import ProgressBar from '../../ui/ProgressBar.svelte';
  import Section from '../../ui/Section.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import ToggleSwitch from '../../ui/ToggleSwitch.svelte';
  import { followingRows } from '../library/grid-guess.ts';
  import type { MapChoices, PreparedMap, StoreAs } from '../library/services.ts';
  import { STORE_AS_HINTS, STORE_AS_OPTIONS } from '../library/store-as.ts';
  import { fitText } from './grid-editor/editor-logic.ts';
  import GridPreview from './GridPreview.svelte';
  import { findingText, gridForCounts, offSquareWarning, squareSizeText } from './squares-logic.ts';

  interface Props {
    /** Shown or not. */
    open: boolean;
    /** The examined file. */
    prepared: PreparedMap;
    /** The grid so far (bindable: the grid editor writes its result here). */
    grid: RasterGrid;
    /** The commit button's text. */
    commitLabel?: string;
    /** Squares the table holds, for the fit line. */
    table?: { cols: number; rows: number } | null;
    /** How the server stores the picture (bindable, remembered by the caller). */
    format: StoreAs;
    /** The grid came out of the grid editor. */
    fitted?: boolean;
    /** Upload progress; replaces the footer while set. */
    progress?: { value: number | null; label: string; detail?: string } | null;
    /** The DM committed. */
    oncommit: (choices: MapChoices) => void;
    /** Opens the grid editor with this grid; `length` = start on Known length. */
    onfit: (grid: RasterGrid, tool: 'fit' | 'length') => void;
    /** Closed without committing. */
    onclose: () => void;
  }

  let {
    open = $bindable(),
    prepared,
    grid = $bindable(),
    commitLabel = 'Upload and play',
    table = null,
    format = $bindable(),
    fitted = false,
    progress = null,
    oncommit,
    onfit,
    onclose,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(prepared.name);
  // svelte-ignore state_referenced_locally
  let ownLines = $state(!prepared.drawGrid);
  let rowsTouched = $state(false);

  const finding = $derived(findingText(prepared.finding));
  const warning = $derived(offSquareWarning(grid));
  const busy = $derived(progress !== null);

  function setCols(cols: number): void {
    const rows = rowsTouched ? grid.rows : followingRows(cols, grid.pictureW, grid.pictureH);
    grid = gridForCounts(grid, cols, rows);
  }

  function setRows(rows: number): void {
    rowsTouched = true;
    grid = gridForCounts(grid, grid.cols, rows);
  }

  function commit(): void {
    oncommit({ name: name.trim() || prepared.name, grid, drawGrid: !ownLines, format });
  }
</script>

<Dialog
  {open}
  title="Squares on this picture"
  description="{prepared.fileName} · {prepared.pictureW} × {prepared.pictureH} px"
  icon="grid"
  size="md"
  dismissible={!busy}
  {onclose}
>
  <div class="body">
    <GridPreview src={prepared.previewUrl} {grid}>
      {#snippet badge()}
        {#if fitted}
          <Badge text="Fitted by hand: {grid.cols} × {grid.rows} squares" icon="success" tone="ok" />
        {:else}
          <Badge text={finding.text} icon={finding.tone === 'warn' ? 'warning' : 'success'} tone={finding.tone} />
        {/if}
      {/snippet}
    </GridPreview>

    <Field label="Name" bind:value={name} placeholder={prepared.name} />

    <Section title="Squares" description={squareSizeText(grid)}>
      <div class="two">
        <NumberStepper label="Across" value={grid.cols} min={1} max={400} steps={[1, 5]} onchange={setCols} />
        <NumberStepper label="Down" value={grid.rows} min={1} max={400} steps={[1, 5]} onchange={setRows} />
      </div>
      {#if warning}<p class="warn">{warning}</p>{/if}
      <ToggleSwitch label="The picture has its own grid lines" description="Then battlemap draws no grid over it." bind:checked={ownLines} />
      <p class="fit">On the table: {grid.cols} × {grid.rows} in, {fitText(grid, table)}.</p>
    </Section>

    {#if !prepared.formatChosen}
      <Section title="Store as" description={STORE_AS_HINTS[format]}>
        <Segmented label="Store as" options={STORE_AS_OPTIONS} bind:value={format} block />
      </Section>
    {/if}
  </div>

  {#snippet footer()}
    {#if progress}
      <div class="progress"><ProgressBar value={progress.value ?? undefined} label={progress.label} detail={progress.detail} /></div>
    {:else}
      {#if prepared.needsGrid && !fitted}
        <Button label="Measure on the picture" icon="measure" variant="flat" onclick={() => onfit(grid, 'length')} />
      {:else}
        <Button label="Fit on the picture" icon="grid" variant="flat" onclick={() => onfit(grid, 'fit')} />
      {/if}
      <Button label={commitLabel} icon="play" variant="primary" onclick={commit} />
    {/if}
  {/snippet}
</Dialog>

<style>
  .body {
    display: grid;
    gap: var(--g2);
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g);
  }

  @media (max-width: 520px) {
    .two {
      grid-template-columns: 1fr;
    }
  }

  .fit,
  .warn {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .warn {
    color: var(--warn);
  }

  .progress {
    flex: 1;
  }
</style>
