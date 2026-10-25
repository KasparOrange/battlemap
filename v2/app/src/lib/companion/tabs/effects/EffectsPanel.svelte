<!--
  EffectsPanel — the Effects tab's panel (docs/effects.md "The Effects tab"), top to bottom:
  the armed effect (its frames looping in the stage, `EffectPreview`) with its quick settings (shape, size in feet or squares, Aim first | At
  once, tint, aim at the template disc), the browser (search, Cast · Areas · Auras · Map life,
  damage-type chips, favourites and recent, a capped grid of tiles — a tile loops its frames
  while hovered or focused), what is on this map (tap
  selects, × removes, Clear all with Undo), and Weather & mood (switches with intensity, Flash ·
  Shake · Fade). The commit row (Cancel · Cast / Remove) is EffectsFooter.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import ColorPicker from '../../../ui/ColorPicker.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import NumberStepper from '../../../ui/NumberStepper.svelte';
  import SearchField from '../../../ui/SearchField.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import Spinner from '../../../ui/Spinner.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { scrollFade } from '../../../ui/scroll-fade.ts';
  import { clearAll, removeEffect } from './actions.ts';
  import { browse, damageIn, DAMAGE_COLORS, GROUPS, libraryUrl, loadCatalog, sizeWords, type PickerEffect } from './catalog.ts';
  import { isWeather, whereWords } from './commands.ts';
  import EffectPreview from './EffectPreview.svelte';
  import EffectTile from './EffectTile.svelte';
  import { effectsLocal, type BrowseGroup } from './local.svelte.ts';
  import { quickStrip } from './prefs.ts';
  import { aimAt, shapesFor, type AreaShape } from './shapes.ts';
  import WeatherSection from './WeatherSection.svelte';

  let { ctx }: TabPanelProps = $props();

  const LIB = `${import.meta.env.BASE_URL}effects/`;
  const TINTS = ['#ff7a3d', '#8fd3ff', '#c9b8ff', '#9be15d', '#9b7bd1', '#ffe08a', '#ff5a6e', '#e8e2d6'];

  let loading = $state(false);

  async function load(): Promise<void> {
    if (effectsLocal.catalog || loading) return;
    loading = true;
    effectsLocal.failed = false;
    const t0 = performance.now();
    try {
      const c = await loadCatalog(LIB);
      effectsLocal.catalog = c.effects;
      log.info('companion', 'Effects catalogue loaded', { effects: c.effects.length, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      effectsLocal.failed = true;
      log.error('companion', 'Effects catalogue not loaded', { error: String(e) });
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  const all = $derived(effectsLocal.catalog ?? []);
  const chosen = $derived(effectsLocal.chosen);
  const settings = $derived(chosen ? effectsLocal.settingsFor(chosen) : null);
  const searching = $derived(effectsLocal.query.trim() !== '');
  const inGroup = $derived(browse(all, { group: effectsLocal.group, query: effectsLocal.query, damage: null }));
  const shown = $derived(browse(all, { group: effectsLocal.group, query: effectsLocal.query, damage: effectsLocal.damage }));
  const chips = $derived(damageIn(inGroup));
  const strip = $derived(quickStrip(effectsLocal.favourites, effectsLocal.recent, (id) => all.some((e) => e.id === id && e.group !== 'weather')));
  const placed = $derived(ctx.map.effects.filter((p) => !isWeather(p)));
  const area = $derived(!!chosen && (chosen.group === 'cast' || chosen.group === 'area'));
  const shapes = $derived(chosen ? shapesFor(chosen.shape) : []);
  const otherSpells = $derived(chosen ? chosen.spells.filter((sp) => sp.toLowerCase() !== chosen.name.toLowerCase()).slice(0, 2) : []);

  const verb = $derived(!chosen ? '' : chosen.group === 'cast' ? 'cast' : 'place');
  const hint = $derived.by(() => {
    if (!chosen) return placed.length ? 'Pick an effect, then tap the map. Nothing picked: tap an effect on the map to select it.' : 'Pick an effect, then tap the map.';
    if (chosen.group === 'aura') return 'Tap a token to give it the aura — tap again to take it off. It hides with the token.';
    if (chosen.group === 'life') return 'Every tap places one. Pick it again to stop.';
    const pointing = settings?.shape === 'cone' || settings?.shape === 'line';
    const aim = pointing ? 'Drag from the caster to aim' : 'Tap where it lands';
    return effectsLocal.aimFirst ? `${aim}, then tap inside to ${verb} it.` : `${aim} — it is ${verb === 'cast' ? 'cast' : 'placed'} at once.`;
  });

  const sizeLabel: Record<AreaShape, string> = { circle: 'Radius', cone: 'Length', line: 'Length', cube: 'Side' };

  function pick(e: PickerEffect): void {
    effectsLocal.choose(e.id);
    log.info('companion', effectsLocal.chosenId ? 'Effect armed' : 'Effect disarmed', { effect: e.id, group: e.group });
  }

  function setGroup(id: string): void {
    effectsLocal.group = id as BrowseGroup;
    effectsLocal.damage = null;
    effectsLocal.save();
  }

  function setShape(id: string): void {
    if (chosen) effectsLocal.setSettings(chosen, { shape: id as AreaShape });
  }

  function atDisc(): void {
    if (!chosen || !settings) return;
    const d = ctx.map.disc;
    const { cols, rows } = ctx.map.info.grid;
    const aim = aimAt(settings.shape, settings.feet, chosen.width ?? 5, { x: d.x, y: d.y }, d.rotation, { x: cols / 2, y: rows / 2 });
    effectsLocal.aim = { ...aim, origin: { x: d.x, y: d.y } };
    log.info('companion', 'Effect aimed at the disc', { effect: chosen.id });
  }

  function setTint(on: boolean): void {
    if (chosen) effectsLocal.setSettings(chosen, { tint: on ? (chosen.damage.map((d) => DAMAGE_COLORS[d]).find(Boolean) ?? TINTS[0]!) : null });
  }

  function select(id: string): void {
    effectsLocal.selectedId = effectsLocal.selectedId === id ? null : id;
    if (effectsLocal.selectedId) effectsLocal.chosenId = null;
    effectsLocal.aim = null;
  }
</script>

{#if !effectsLocal.catalog}
  <div class="loading">
    {#if effectsLocal.failed}
      <p>Couldn't load the effects library.</p>
      <Button icon="sync" label="Try again" onclick={load} />
    {:else}
      <Spinner label="Loading effects…" />
    {/if}
  </div>
{:else}
  {#if chosen && settings}
    <Section title={chosen.group === 'cast' ? 'Ready to cast' : chosen.group === 'aura' ? 'Ready for a token' : 'Ready to place'} description={hint}>
      <div class="armed" data-testid="effects-armed">
        <span class="stage">
          <img src={libraryUrl(chosen.thumb, LIB)} alt="" />
          <EffectPreview effect={chosen} lib={LIB} active scale={0.9} />
        </span>
        <div class="who">
          <span class="title">{chosen.name}</span>
          <span class="meta">{sizeWords(chosen)}{otherSpells.length ? ` · also ${otherSpells.join(', ')}` : ''}</span>
          {#if chosen.damage.length}
            <span class="badges">{#each chosen.damage as d (d)}<Badge text={d} />{/each}</span>
          {/if}
        </div>
        <IconButton icon="star" variant="quiet" label={effectsLocal.favourites.includes(chosen.id) ? 'Unstar' : 'Star as a favourite'} on={effectsLocal.favourites.includes(chosen.id)} onclick={() => effectsLocal.toggleFavourite(chosen.id)} />
        <IconButton icon="close" variant="quiet" label="Put it away" onclick={() => pick(chosen)} />
      </div>
      {#if area}
        {#if shapes.length > 1}
          <Segmented label="Shape" block value={settings.shape} onchange={setShape} options={shapes.map((s) => ({ id: s, label: s === 'circle' ? 'Sphere' : s === 'cube' ? 'Cube' : s === 'cone' ? 'Cone' : 'Line', icon: s === 'circle' ? 'circle' : s === 'cube' ? 'grid' : 'template' }))} />
        {/if}
        <NumberStepper label={sizeLabel[settings.shape]} value={settings.feet} min={5} max={200} steps={[5, 10, 20]} unit="ft" onchange={(v) => chosen && effectsLocal.setSettings(chosen, { feet: v })} />
        <Segmented
          label="On a tap"
          block
          value={effectsLocal.aimFirst ? 'aim' : 'now'}
          onchange={(id) => { effectsLocal.aimFirst = id === 'aim'; effectsLocal.aim = null; effectsLocal.save(); }}
          options={[{ id: 'aim', label: 'Aim first', icon: 'template' }, { id: 'now', label: 'At once', icon: 'play' }]}
        />
        {#if ctx.map.disc.visible}
          <Button icon="template" label="Aim at the template disc" variant="flat" block onclick={atDisc} />
        {/if}
      {:else}
        <NumberStepper label="Size" value={settings.squares} min={0.5} max={16} steps={[0.5, 1, 2]} decimals={1} unit="sq" onchange={(v) => chosen && effectsLocal.setSettings(chosen, { squares: v })} />
      {/if}
      <ToggleSwitch label="Tint" description="Colours the effect on the table" checked={settings.tint !== null} onchange={setTint} />
      {#if settings.tint}
        <ColorPicker label="Tint colour" value={settings.tint} colors={TINTS} onchange={(c) => chosen && effectsLocal.setSettings(chosen, { tint: c })} />
      {/if}
    </Section>
  {/if}

  <Section title="Effects" description={chosen ? undefined : hint}>
    <SearchField bind:value={effectsLocal.query} expanded label="Search effects" placeholder="Search: fireball, fire, web, torch…" />
    <div class:dim={searching}>
      <Segmented label="Effect group" layout="tile" block value={effectsLocal.group} onchange={setGroup} options={GROUPS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, icon: g.id === 'cast' ? 'wand' : g.id === 'area' ? 'circle' : g.id === 'aura' ? 'token' : 'candle' }))} />
    </div>
    {#if chips.length > 1}
      <div class="chips bm-scroll" use:scrollFade role="group" aria-label="Damage type">
        {#each chips as d (d)}
          <button type="button" class="chip bm-sf flat" class:on={effectsLocal.damage === d} aria-pressed={effectsLocal.damage === d} style:--dot={DAMAGE_COLORS[d]} onclick={() => (effectsLocal.damage = effectsLocal.damage === d ? null : d)}>{d}</button>
        {/each}
      </div>
    {/if}
    {#if strip.length && !searching}
      <div class="strip bm-scroll" use:scrollFade aria-label="Favourites and recent">
        {#each strip as s (s.id)}
          {@const e = effectsLocal.byId(s.id)}
          {#if e}<EffectTile effect={e} compact thumbUrl={libraryUrl(e.thumb, LIB)} lib={LIB} on={effectsLocal.chosenId === e.id} favourite={s.from === 'favourite'} onclick={() => pick(e)} />{/if}
        {/each}
      </div>
    {/if}
    <div class="grid bm-scroll bm-capped" use:scrollFade data-testid="effects-grid">
      {#each shown as e (e.id)}
        <EffectTile effect={e} thumbUrl={libraryUrl(e.thumb, LIB)} lib={LIB} on={effectsLocal.chosenId === e.id} favourite={effectsLocal.favourites.includes(e.id)} onclick={() => pick(e)} />
      {:else}
        <p class="empty">Nothing matches “{effectsLocal.query}”.</p>
      {/each}
    </div>
  </Section>

  <Section title="On this map">
    {#snippet trailing()}<Badge text={String(placed.length)} />{/snippet}
    {#if placed.length === 0}
      <p class="note">Areas, auras and map life you place show up here.</p>
    {:else}
      <div class="list bm-scroll bm-capped" use:scrollFade data-testid="effects-on-map">
        {#each placed as p (p.id)}
          {@const e = effectsLocal.byId(p.effect)}
          <ListRow title={e?.name ?? p.effect} sub={whereWords(p, ctx.map.tokens)} selected={effectsLocal.selectedId === p.id} onclick={() => select(p.id)}>
            {#snippet leading()}<span class="mini">{#if e}<img src={libraryUrl(e.thumb, LIB)} alt="" loading="lazy" />{/if}</span>{/snippet}
            {#snippet trailing()}<IconButton icon="delete" variant="quiet" label="Remove {e?.name ?? 'effect'}" onclick={() => removeEffect(ctx, p.id)} />{/snippet}
          </ListRow>
        {/each}
      </div>
      <Button icon="delete" label="Clear all effects" hint="weather stays" tone="danger" block onclick={() => clearAll(ctx)} />
    {/if}
  </Section>

  <WeatherSection {ctx} lib={LIB} />
{/if}

<style>
  .loading {
    display: grid;
    justify-items: start;
    gap: var(--g);
    padding: var(--g) 0;
    color: var(--t2);
    font-size: var(--fs-small);
  }

  .loading p {
    margin: 0;
  }

  .armed {
    display: flex;
    align-items: center;
    gap: var(--g);
  }

  .stage {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 45%, #2a2118 0%, #0b0907 72%);
    box-shadow: inset 0 0 0 1px var(--hair), 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
    overflow: hidden;
  }

  .stage img {
    width: 90%;
    height: 90%;
    object-fit: contain;
    animation: breathe 3.2s ease-in-out infinite;
  }

  @keyframes breathe {
    50% {
      transform: scale(1.06) rotate(4deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage img {
      animation: none;
    }
  }

  .who {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .title {
    font: 600 var(--fs-value) / 1.15 var(--font-headline);
    color: var(--t);
  }

  .meta {
    font: var(--fs-meta) / 1.3 var(--font-value);
    color: var(--t3);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .dim {
    opacity: 0.45;
    transition: opacity var(--dur-tone, 150ms) ease;
  }

  .chips {
    display: flex;
    gap: calc(var(--g) / 2);
    overflow-x: auto;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    min-height: 2.25rem;
    padding: 0 var(--g);
    border-radius: 999px;
    font: 500 var(--fs-small) / 1 var(--font-button);
    text-transform: capitalize;
    color: var(--t2);
    cursor: pointer;
    touch-action: manipulation;
  }

  .chip::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
  }

  .chip.on {
    --sf-c: var(--dot);
    color: var(--t);
  }

  .strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 5rem;
    gap: calc(var(--g) / 2);
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .grid {
    --cap: 19rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
    gap: calc(var(--g) / 2);
    align-content: start;
  }

  .list {
    --cap: 15rem;
    display: grid;
    gap: 2px;
  }

  .mini {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: #0b0907;
    overflow: hidden;
  }

  .mini img {
    width: 90%;
    height: 90%;
    object-fit: contain;
  }

  .empty,
  .note {
    grid-column: 1 / -1;
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t3);
  }
</style>
