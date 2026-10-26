<!--
  FogPanel — the Fog tab's panel (design.md "the tool tabs", parity §8), top to bottom:
  Tool (Brush · Room · Circle tiles, Reveal | Hide, brush size or circle radius), Players see
  changes (Instantly | Preview first, the staged count), Areas (the prepared reveal areas, one
  tap each — areas/AreasSection), Whole map (Reveal all · Hide all, each with an Undo notice),
  Look (folded: fog on the map, fog style, trim revealed edges). While an area is drawn or
  edited the panel is that area's editor (areas/AreaEditor). The commit row (Discard · Apply n
  squares, or Cancel · Save area) is FogFooter.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { maskCount } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { withUndo } from '../../game/undo.ts';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import NumberStepper from '../../../ui/NumberStepper.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { BRUSH_RADII, CIRCLE_MAX, CIRCLE_MIN } from './cells.ts';
  import { fogLocal, type FogTool, type FogValue } from './local.svelte.ts';
  import { resizeLiveCircle } from './tool.ts';
  import AreaEditor from './areas/AreaEditor.svelte';
  import AreasSection from './areas/AreasSection.svelte';
  import { areasLocal } from './areas/local.svelte.ts';

  let { ctx }: TabPanelProps = $props();

  let lookOpen = $state(false);
  /** The trim value shown at once; sent after a short pause (v1 sent every tap). */
  let trim = $state(0);
  let trimTimer: ReturnType<typeof setTimeout> | null = null;

  // slices, so a patch elsewhere (a disc drag, a token) doesn't re-run this panel (rv#37)
  const grid = $derived(ctx.map.info.grid);
  const fog = $derived(ctx.map.fog);
  const settings = $derived(ctx.game.settings);
  const previewFirst = $derived(ctx.game.previewFirst);
  const cells = $derived(grid.cols * grid.rows);
  const staged = $derived(fog.staged ? maskCount(fog.staged.reveal, cells) + maskCount(fog.staged.hide, cells) : 0);
  const verb = $derived(fogLocal.value === 'reveal' ? 'reveal' : 'hide');
  const hint = $derived(
    fogLocal.tool === 'brush' ? `Drag over the map to ${verb} squares.`
    : fogLocal.tool === 'room' ? `Tap a room to ${verb} all of it.`
    : `Tap the map to ${verb} ${fogLocal.circle} squares around it — walls and closed doors stop it.`,
  );

  $effect(() => {
    if (trimTimer === null) trim = settings.fogEdgeInset;
  });

  function setTool(id: string): void {
    fogLocal.tool = id as FogTool;
    fogLocal.save();
  }

  function setValue(id: string): void {
    fogLocal.value = id as FogValue;
    fogLocal.save();
  }

  function setRadius(r: number): void {
    fogLocal.circle = r;
    fogLocal.save();
    resizeLiveCircle(ctx);
  }

  function setPreview(id: string): void {
    const on = id === 'preview';
    if (on === previewFirst) return;
    if (ctx.dispatch({ type: 'fog.preview', on })) {
      log.info('companion', 'Preview first', { on });
      fogLocal.lastCircle = null;
    }
  }

  function wholeMap(value: 'reveal' | 'hide'): void {
    const preview = previewFirst;
    const r = withUndo(() => ctx.session.view, (c) => ctx.dispatch(c), { type: 'fog.all', value }, (t) => notify(t));
    if (!r.sent) return;
    log.info('companion', value === 'reveal' ? 'Reveal all' : 'Hide all', { preview, changed: r.changed });
    if (preview) notify(value === 'reveal' ? 'Whole map revealed in the preview — apply it to show the players.' : 'Whole map hidden in the preview — apply it to hide it from the players.');
    else if (!r.changed) notify('Nothing changed.');
    else notify(value === 'reveal' ? 'Whole map revealed' : 'Whole map hidden', r.options);
  }

  function setTrim(v: number): void {
    trim = v;
    if (trimTimer) clearTimeout(trimTimer);
    trimTimer = setTimeout(() => {
      trimTimer = null;
      if (trim === settings.fogEdgeInset) return;
      if (ctx.dispatch({ type: 'game.settings', settings: { fogEdgeInset: trim } })) log.info('companion', 'Trim revealed edges', { percent: trim });
    }, 350);
  }

  function setStyle(id: string): void {
    const fogStyle = id as 'standard' | 'soft' | 'cloud' | 'atmospheric';
    if (fogStyle !== settings.fogStyle) ctx.dispatch({ type: 'game.settings', settings: { fogStyle } });
  }
</script>

{#if areasLocal.draft}
<AreaEditor {ctx} />
{:else}
<Section title="Tool" description={hint}>
  <Segmented
    label="Fog tool"
    layout="tile"
    block
    value={fogLocal.tool}
    onchange={setTool}
    options={[
      { id: 'brush', label: 'Brush', icon: 'brush', hint: 'Drag to paint' },
      { id: 'room', label: 'Room', icon: 'room', hint: 'Tap a room' },
      { id: 'circle', label: 'Circle', icon: 'circle', hint: 'Tap a spot' },
    ]}
  />
  <Segmented
    label="Reveal or hide"
    block
    value={fogLocal.value}
    onchange={setValue}
    options={[
      { id: 'reveal', label: 'Reveal', icon: 'reveal', tone: 'reveal' },
      { id: 'hide', label: 'Hide', icon: 'hide', tone: 'hide' },
    ]}
  />
  {#if fogLocal.tool === 'brush'}
    <Slider
      label="Brush size"
      min={0}
      max={BRUSH_RADII.length - 1}
      value={fogLocal.brush}
      format={(v) => `${2 * v + 1} squares wide`}
      tone={fogLocal.value === 'hide' ? 'hide' : 'reveal'}
      onchange={(v) => { fogLocal.brush = v; fogLocal.save(); }}
    />
  {:else if fogLocal.tool === 'circle'}
    <NumberStepper label="Radius" value={fogLocal.circle} min={CIRCLE_MIN} max={CIRCLE_MAX} steps={[1, 2, 5]} unit="sq" onchange={setRadius} />
  {/if}
</Section>

<Section title="Players see changes">
  <Segmented
    label="Players see changes"
    block
    value={previewFirst ? 'preview' : 'now'}
    onchange={setPreview}
    options={[
      { id: 'now', label: 'Instantly', icon: 'play' },
      { id: 'preview', label: 'Preview first', icon: 'reveal' },
    ]}
  />
  {#if previewFirst}
    <div class="staged">
      {#if staged > 0}
        <Badge text={staged === 1 ? '1 square waiting' : `${staged} squares waiting`} tone="reveal" icon="reveal" />
        <span>The players see them after Apply.</span>
      {:else}
        <span>Changes wait here, tinted, until you apply them.</span>
      {/if}
    </div>
    {#if fogLocal.tool === 'circle' && fog.live}
      <p class="note">− / + resizes the circle waiting in the preview.</p>
    {/if}
  {/if}
</Section>

<AreasSection {ctx} />

<Section title="Whole map">
  <div class="two">
    <Button icon="reveal" label="Reveal all" onclick={() => wholeMap('reveal')} />
    <Button icon="hide" label="Hide all" onclick={() => wholeMap('hide')} />
  </div>
</Section>

<Section title="Look" collapsible bind:open={lookOpen}>
  <ToggleSwitch
    label="Fog on this map"
    description="Off shows the players the whole map"
    checked={fog.on}
    onchange={(on) => ctx.dispatch({ type: 'fog.enable', on })}
  />
  <Segmented
    label="Fog style"
    block
    value={settings.fogStyle}
    onchange={setStyle}
    options={[
      { id: 'standard', label: 'Plain' },
      { id: 'soft', label: 'Soft' },
      { id: 'cloud', label: 'Cloud' },
      { id: 'atmospheric', label: 'Mist' },
    ]}
  />
  <NumberStepper label="Trim revealed edges" value={trim} min={0} max={45} steps={[1, 2, 5, 10]} unit="%" onchange={setTrim} />
  <p class="note">Shows a little less at the rim of every revealed area — in % of a square.</p>
</Section>
{/if}

<style>
  .staged {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--g);
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g);
  }

  .two :global(button) {
    width: 100%;
  }

  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t3);
  }
</style>
