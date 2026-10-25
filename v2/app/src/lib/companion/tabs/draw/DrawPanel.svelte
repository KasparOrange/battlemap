<!--
  DrawPanel — the Draw tab's panel (design.md "the tool tabs", parity §9): Ink (colour swatches
  with an own colour, line width in mm on the table — presets S/M/L/XL and a slider, Pen | Eraser) and Whole map (Clear all
  drawings, danger, with an Undo notice). Undo of a single stroke is the one undo button.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { withUndo } from '../../game/undo.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import ColorPicker from '../../../ui/ColorPicker.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { drawLocal, INK_COLORS, WIDTH_MAX_MM, WIDTH_MIN_MM, WIDTH_PRESETS } from './local.svelte.ts';

  let { ctx }: TabPanelProps = $props();

  const count = $derived(ctx.map.strokes.length);

  function clear(): void {
    const r = withUndo(() => ctx.session.view, (c) => ctx.dispatch(c), { type: 'draw.clear' }, (s) => notify(s));
    if (!r.sent) return;
    log.info('companion', 'Drawings cleared', { count });
    notify(r.changed ? 'Drawings cleared' : 'No drawings to clear', r.options);
  }
</script>

<Section title="Ink" description={drawLocal.pen === 'pen' ? 'Drag on the map to draw. The players see it on the TV.' : 'Drag over a drawing to wipe it away.'}>
  <Segmented
    label="Pen or eraser"
    block
    value={drawLocal.pen}
    onchange={(id) => (drawLocal.pen = id as 'pen' | 'eraser')}
    options={[
      { id: 'pen', label: 'Pen', icon: 'draw' },
      { id: 'eraser', label: 'Eraser', icon: 'eraser' },
    ]}
  />
  <ColorPicker
    label="Ink colour"
    colors={[...INK_COLORS]}
    bind:value={drawLocal.color}
    onchange={() => { drawLocal.pen = 'pen'; drawLocal.save(); }}
  />
  <Segmented
    label="Line width presets"
    block
    value={WIDTH_PRESETS.find((w) => w.mm === drawLocal.widthMm)?.id ?? ''}
    onchange={(id) => { drawLocal.widthMm = WIDTH_PRESETS.find((w) => w.id === id)!.mm; drawLocal.pen = 'pen'; drawLocal.save(); }}
    options={WIDTH_PRESETS.map((w) => ({ id: w.id, label: w.label }))}
  />
  <Slider
    label="Line width"
    min={WIDTH_MIN_MM}
    max={WIDTH_MAX_MM}
    value={drawLocal.widthMm}
    format={(v) => `${v} mm on the table`}
    onchange={(v) => { drawLocal.widthMm = v; drawLocal.save(); }}
  />
  <div class="preview" aria-hidden="true">
    <svg viewBox="0 0 300 36" preserveAspectRatio="none">
      <path d="M8 26 C 70 4, 120 34, 170 16 S 260 8, 292 20" fill="none" stroke={drawLocal.color} stroke-width={Math.max(1.5, drawLocal.widthMm * 1.3)} stroke-linecap="round" />
    </svg>
  </div>
</Section>

<Section title="Whole map">
  <Button icon="delete" label={count ? `Clear all drawings · ${count}` : 'Clear all drawings'} tone="danger" disabled={count === 0} onclick={clear} />
</Section>

<style>
  .preview {
    height: 2.75rem;
    border-radius: var(--r-ctl);
    background: var(--m2);
    box-shadow: inset 0 0 0 1px var(--hair);
    padding: 0 var(--g);
  }

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
