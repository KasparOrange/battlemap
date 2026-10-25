<!--
  CalibrationDialog — "Measure the TV" (parity §15, design.md "Table calibration"): once per
  TV, so one map square is one inch on its glass. While it is open the TV shows its one-inch
  pattern and a gold measuring bar that starts at a fixed point (the pivot, picked on a small
  TV picture); the DM lays a ruler on the bar, types what it measures, and fine-tunes the
  picture width and the edges the set cuts off. Every change applies at once (the TV redraws);
  "Back to auto" offers Undo. Closing turns the pattern off.

  Props:
  - open: boolean · table: TableState — the TV's state (from the companion's view)
  - dispatch: (cmd: Command) => boolean · onclose: () => void
-->
<script lang="ts">
  import type { CalibrationPivot, Command, TableState } from '@battlemap/shared';
  import { log } from '../../log.ts';
  import Button from '../../ui/Button.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Field from '../../ui/Field.svelte';
  import NumberStepper from '../../ui/NumberStepper.svelte';
  import Section from '../../ui/Section.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import ToggleSwitch from '../../ui/ToggleSwitch.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import {
    currentBarInches, formatLength, fromUnit, OVERSCAN_STEPS, PIVOTS, resultLine, toUnit, widthFromMeasurement,
    WIDTH_RANGE, WIDTH_STEPS, type LengthUnit,
  } from './calibration-logic.ts';

  interface Props {
    /** Shown or not. */
    open: boolean;
    /** The TV's state. */
    table: TableState;
    /** Sends a command. */
    dispatch: (cmd: Command) => boolean;
    /** Closed. */
    onclose: () => void;
  }

  let { open, table, dispatch, onclose }: Props = $props();

  let unit = $state<LengthUnit>('cm');
  let measured = $state('');
  let error = $state('');

  const bar = $derived(currentBarInches(table));
  const range = $derived(WIDTH_RANGE[unit]);
  const widthInUnit = $derived(Number(toUnit(table.widthInches, unit).toFixed(range.decimals)));

  // The pattern is on while the dialog is open, off when it closes.
  let shown = false;
  $effect(() => {
    if (open && !shown) {
      shown = true;
      dispatch({ type: 'table.pattern', on: true, pivot: table.pattern.pivot });
      log.info('companion', 'Calibration opened', { widthInches: table.widthInches, overscan: table.overscanPercent });
    } else if (!open && shown) {
      shown = false;
      dispatch({ type: 'table.pattern', on: false });
    }
  });

  function applyMeasurement(): void {
    const r = widthFromMeasurement(table, measured, unit);
    if (!r.ok) {
      error = r.message;
      return;
    }
    error = '';
    measured = '';
    dispatch({ type: 'table.calibrate', widthInches: r.widthInches });
    log.info('companion', 'TV calibrated', { from: table.widthInches, to: r.widthInches, unit });
    notify(`Set: the picture is ${formatLength(r.widthInches, unit)} wide. Measure the bar again to check.`, { kind: 'success' });
  }

  function setWidth(v: number): void {
    dispatch({ type: 'table.calibrate', widthInches: Math.round(fromUnit(v, unit) * 10_000) / 10_000 });
  }

  function setPivot(p: CalibrationPivot): void {
    dispatch({ type: 'table.pattern', on: true, pivot: p });
  }

  function backToAuto(): void {
    const before = { w: table.widthInches, o: table.overscanPercent };
    dispatch({ type: 'table.reset' });
    log.info('companion', 'TV calibration reset', before);
    notify('TV scale back to auto: 34 × 19 squares, no edges cut off.', {
      kind: 'info',
      action: {
        label: 'Undo',
        run: () => {
          dispatch({ type: 'table.calibrate', widthInches: before.w });
          dispatch({ type: 'table.overscan', percent: before.o });
        },
      },
    });
  }
</script>

<Dialog
  {open}
  title="Measure the TV"
  description="This TV only, once: one square becomes one inch on the glass."
  icon="tv"
  size="lg"
  {onclose}
>
  <div class="cols">
    <Section title="Where the bar starts" description="Lay the ruler's zero on the gold ring there — it never moves while you adjust.">
      <div class="tv" role="radiogroup" aria-label="Where the bar starts">
        {#each PIVOTS as p (p.id)}
          <button
            type="button"
            role="radio"
            aria-checked={table.pattern.pivot === p.id}
            aria-label={p.label}
            title={p.label}
            class="dot"
            class:on={table.pattern.pivot === p.id}
            style:left="{8 + p.x * 84}%"
            style:top="{10 + p.y * 80}%"
            onclick={() => setPivot(p.id)}
          ></button>
        {/each}
      </div>
      <ToggleSwitch
        label="Pattern on the TV"
        description="The one-inch squares and the gold bar."
        checked={table.pattern.on}
        onchange={(on) => dispatch({ type: 'table.pattern', on })}
      />
    </Section>

    <div class="stack">
      <Section title="The gold bar measures" description="It should be {formatLength(bar, unit)}. Measure it and type what you get.">
        <div class="measure">
          <Field
            label="Measured"
            type="text"
            inputmode="decimal"
            enterkeyhint="done"
            placeholder={formatLength(bar, unit)}
            bind:value={measured}
            {error}
            onenter={applyMeasurement}
          />
          <Segmented label="Unit" value={unit} onchange={(id) => (unit = id as LengthUnit)} options={[{ id: 'cm', label: 'cm' }, { id: 'in', label: 'in' }]} />
        </div>
        <Button label="Apply" icon="check" block disabled={!measured.trim()} onclick={applyMeasurement} />
      </Section>

      <Section title="Fine tune" description="The picture is this wide. Wider = smaller squares.">
        <NumberStepper
          label="Picture width"
          hideLabel
          value={widthInUnit}
          min={range.min}
          max={range.max}
          steps={WIDTH_STEPS[unit]}
          decimals={range.decimals}
          {unit}
          onchange={setWidth}
        />
      </Section>

      <Section title="Edges the TV cuts off" description="Raise it until the blue line shows on all four edges.">
        <NumberStepper
          label="Cut off each edge"
          hideLabel
          value={table.overscanPercent}
          min={0}
          max={12}
          steps={OVERSCAN_STEPS}
          decimals={2}
          unit="%"
          onchange={(v) => dispatch({ type: 'table.overscan', percent: v })}
        />
      </Section>
    </div>
  </div>

  <p class="result" data-testid="calibration-result">{resultLine(table)}</p>

  {#snippet footer()}
    <Button label="Back to auto (34 × 19)" icon="undo" variant="flat" onclick={backToAuto} />
    <span class="spacer"></span>
    <Button label="Done" icon="check" variant="primary" onclick={onclose} />
  {/snippet}
</Dialog>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    gap: var(--g2);
    align-items: start;
  }

  @media (max-width: 680px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }

  .stack {
    display: grid;
    gap: var(--g2);
  }

  .tv {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--r-ctl);
    background: #050505;
    box-shadow: 0 0 0 1px var(--hair-strong), inset 0 0 0 6px #111;
    background-image:
      linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
    background-size: 9% 16%;
  }

  .dot {
    position: absolute;
    width: var(--sq-compact);
    height: var(--sq-compact);
    margin: calc(var(--sq-compact) / -2);
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .dot::after {
    content: '';
    position: absolute;
    inset: 30%;
    border-radius: 50%;
    background: var(--t3);
    transition: transform var(--dur-tone) var(--ease-std), background var(--dur-tone) var(--ease-std);
  }

  .dot.on::after {
    inset: 22%;
    background: transparent;
    box-shadow: 0 0 0 3px var(--accent);
  }

  .result {
    margin: 0;
    padding: var(--g) var(--g2);
    border-radius: var(--r-ctl);
    background: var(--m1);
    font: var(--fs-small) / 1.4 var(--font-value);
    color: var(--t);
    text-align: center;
  }

  .measure {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--g);
    align-items: end;
  }

  .spacer {
    flex: 1;
  }
</style>
