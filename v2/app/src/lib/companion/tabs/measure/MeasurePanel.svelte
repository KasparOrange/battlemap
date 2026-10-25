<!--
  MeasurePanel — the Measure tab (design.md "the tool tabs", parity §10): a finger on the map
  measures a line the players see. The panel holds the L-ruler (on the table, turn it), the
  measure line (clear), and the template disc — on/off, turn by 15°, back to the TV's middle —
  with its look folded below: rings, cubes and cones (sizes, colour, line, labels; cone tips
  and width), the disc (middle, edge, compass marks, tint), lines and labels, placement. The
  look is remembered on this tablet and laid on every disc it shows; "Reset to classic" undoes
  from its notice.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { classicDisc, type DiscShapeSet, type TemplateDisc } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { DISC_OPTIONS, lookOf, nearestOption, sameLook, turned, withLook, type DiscFamily } from './disc-look.ts';
  import FamilyEditor from './FamilyEditor.svelte';
  import { discLookStore } from './look-store.svelte.ts';
  import { discToMiddle, rulerShown, rulerTurned } from './place.ts';

  let { ctx }: TabPanelProps = $props();

  // slices: a token or fog patch doesn't re-run the disc editor (rv#37)
  const disc = $derived(ctx.map.disc);
  const ruler = $derived(ctx.map.ruler);

  /** Sends a disc and remembers its look. */
  function sendDisc(next: TemplateDisc, remember = true): void {
    ctx.dispatch({ type: 'disc.set', disc: next });
    if (remember) discLookStore.remember(lookOf(next));
  }

  /** Changes the look. */
  function look(change: Partial<TemplateDisc>): void {
    sendDisc({ ...disc, ...change });
  }

  function family(k: DiscFamily, set: DiscShapeSet): void {
    look({ [k]: set } as Partial<TemplateDisc>);
  }

  async function showDisc(on: boolean): Promise<void> {
    if (!on) {
      ctx.dispatch({ type: 'disc.set', disc: { ...disc, visible: false } });
      log.info('companion', 'Disc hidden');
      return;
    }
    const remembered = await discLookStore.load();
    sendDisc(discToMiddle(ctx.state.table, ctx.map, withLook(disc, remembered)), false);
    log.info('companion', 'Disc shown');
  }

  function resetLook(): void {
    const before = disc;
    sendDisc(withLook(disc, lookOf(classicDisc())));
    notify('The disc looks like the acrylic one again.', {
      action: { label: 'Undo', run: () => sendDisc(withLook(ctx.map.disc, lookOf(before))) },
    });
  }

  // Lay the remembered look on a shown disc that differs (a resumed game, another map).
  onMount(() => {
    void discLookStore.load().then((l) => {
      const d = ctx.map.disc;
      if (d.visible && !sameLook(lookOf(d), l)) {
        log.info('companion', 'Remembered disc look laid on the disc');
        sendDisc(withLook(d, l), false);
      }
    });
  });

  const FAMILIES: { id: DiscFamily; title: string }[] = [
    { id: 'rings', title: 'Radius rings' },
    { id: 'cubes', title: 'Cubes' },
    { id: 'cones', title: 'Cones' },
  ];
</script>

<Section title="Ruler">
  <ToggleSwitch
    label="Ruler on the table"
    description="The L-shaped inch ruler. Drag it on the map in any tab."
    checked={ruler.visible}
    onchange={(on) => ctx.dispatch({ type: 'ruler.set', ruler: rulerShown(ctx.state.table, ctx.map, on) })}
  />
  {#if ruler.visible}
    <Button label="Turn it a quarter" icon="rotate" hint="{ruler.rotation}°" onclick={() => ctx.dispatch({ type: 'ruler.set', ruler: rulerTurned(ruler) })} />
  {/if}
</Section>

<Section title="Measure line" description="Drag on the map to measure; the players see the line. A tap clears it.">
  {#if ctx.state.live.measure}
    <Button label="Clear the line" icon="close" variant="flat" onclick={() => ctx.dispatch({ type: 'measure.set', line: null })} />
  {/if}
</Section>

<Section title="Template disc">
  <ToggleSwitch
    label="Template disc on the map"
    description="Rings, cubes and cones in feet — one square is 5 ft. Drag its middle or edge, turn it by the gold knob."
    checked={disc.visible}
    onchange={(on) => void showDisc(on)}
  />
  {#if disc.visible}
    <div class="turn" data-ctl="row">
      <Button label="↺ 15°" variant="flat" onclick={() => sendDisc(turned(disc, -15), false)} />
      <span class="deg">{Math.round(disc.rotation)}°</span>
      <Button label="↻ 15°" variant="flat" onclick={() => sendDisc(turned(disc, 15), false)} />
    </div>
    <Button label="To the middle of the TV" icon="tv" block onclick={() => sendDisc(discToMiddle(ctx.state.table, ctx.map, disc), false)} />
  {/if}
</Section>

{#each FAMILIES as f (f.id)}
  <Section title={f.title} collapsible open={false}>
    {#snippet trailing()}
      <ToggleSwitch ariaLabel={f.title} checked={disc[f.id].visible} onchange={(on) => family(f.id, { ...disc[f.id], visible: on })} />
    {/snippet}
    <FamilyEditor set={disc[f.id]} onchange={(s) => family(f.id, s)} />
    {#if f.id === 'cones'}
      <Segmented
        label="Cone tips"
        block
        value={disc.coneAnchor}
        onchange={(id) => look({ coneAnchor: id as TemplateDisc['coneAnchor'] })}
        options={[{ id: 'sharedBase', label: 'One base' }, { id: 'center', label: 'From the middle' }]}
      />
      <Segmented
        label="Cone width"
        block
        value={nearestOption(DISC_OPTIONS.coneDegrees, disc.coneDegrees)}
        onchange={(id) => look({ coneDegrees: Number(id) })}
        options={DISC_OPTIONS.coneDegrees.map((o) => ({ id: o.id, label: o.label }))}
      />
    {/if}
  </Section>
{/each}

<Section title="Disc" collapsible open={false}>
  <ToggleSwitch label="Middle circle" description="One square with a cross" checked={disc.centerMark} onchange={(on) => look({ centerMark: on })} />
  <ToggleSwitch label="Edge" description="The clear disc's rim" checked={disc.rim} onchange={(on) => look({ rim: on })} />
  <span class="bm-eyebrow">Compass marks</span>
  <Segmented label="Compass marks" block value={String(disc.markers)} onchange={(id) => look({ markers: Number(id) })} options={DISC_OPTIONS.markers.map((m) => ({ id: String(m), label: m === 0 ? 'None' : String(m) }))} />
  <span class="bm-eyebrow">Tint</span>
  <Segmented label="Tint" block value={nearestOption(DISC_OPTIONS.tint, disc.tint)} onchange={(id) => look({ tint: Number(id) })} options={DISC_OPTIONS.tint.map((o) => ({ id: o.id, label: o.label }))} />
</Section>

<Section title="Lines and labels" collapsible open={false}>
  <span class="bm-eyebrow">Line width</span>
  <Segmented label="Line width" block value={nearestOption(DISC_OPTIONS.lineWidth, disc.lineWidth)} onchange={(id) => look({ lineWidth: Number(id) })} options={DISC_OPTIONS.lineWidth.map((o) => ({ id: o.id, label: o.label }))} />
  <span class="bm-eyebrow">Label size</span>
  <Segmented label="Label size" block value={nearestOption(DISC_OPTIONS.labelSize, disc.labelSize)} onchange={(id) => look({ labelSize: Number(id) })} options={DISC_OPTIONS.labelSize.map((o) => ({ id: o.id, label: o.label }))} />
</Section>

<Section title="Placement" collapsible open={false} description="What the middle snaps to while you drag it.">
  <Segmented
    label="Snap"
    block
    value={disc.snap}
    onchange={(id) => look({ snap: id as TemplateDisc['snap'] })}
    options={[{ id: 'none', label: 'Free' }, { id: 'squareCenters', label: 'Centres' }, { id: 'squareCorners', label: 'Corners' }]}
  />
</Section>

<Section>
  <p class="note">The look is saved on this tablet — every disc you show uses it.</p>
  <Button label="Reset to the classic disc" icon="undo" variant="flat" onclick={resetLook} />
</Section>

<style>
  .turn {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--g);
    align-items: center;
  }

  .deg {
    min-width: 4ch;
    text-align: center;
    font: var(--fw-value) var(--fs-value) / 1 var(--font-value);
    color: var(--t);
  }

  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }
</style>
