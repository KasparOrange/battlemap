<!--
  WeatherSection — "Weather & mood" in the Effects tab: one switch tile per weather (Rain, Snow,
  Mist, Embers, Night, Storm = rain storm + lightning, Underwater; the rest of the library's
  global effects under "More"), an intensity slider for each one that is on (sent on release),
  and the screen buttons Flash · Shake · Fade. Folds (remembered on this device).

  Props:
  - ctx: GameContext — the game screen's context
  - lib: string — the effects library's URL
-->
<script lang="ts">
  import type { GameContext } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import Section from '../../../ui/Section.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import { screenButton, setWeather } from './actions.ts';
  import { libraryUrl, type PickerEffect } from './catalog.ts';
  import { weatherId } from './commands.ts';
  import EffectTile from './EffectTile.svelte';
  import { effectsLocal } from './local.svelte.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameContext;
    /** The library's URL. */
    lib: string;
  }

  let { ctx, lib }: Props = $props();

  /** The main switches: a name and the library effects it turns on together. */
  const MAIN: ReadonlyArray<{ key: string; label: string; ids: string[] }> = [
    { key: 'rain', label: 'Rain', ids: ['rain'] },
    { key: 'snow', label: 'Snow', ids: ['snow'] },
    { key: 'mist', label: 'Mist', ids: ['mist'] },
    { key: 'embers', label: 'Embers', ids: ['embers'] },
    { key: 'night', label: 'Night', ids: ['night'] },
    { key: 'storm', label: 'Storm', ids: ['rain-storm', 'lightning-storm'] },
    { key: 'underwater', label: 'Underwater', ids: ['underwater'] },
  ];

  let more = $state(false);
  let open = $state(effectsLocal.weatherOpen);
  /** Slider values while a finger is on them, by switch key. */
  let dragging = $state<Record<string, number>>({});

  const weather = $derived((effectsLocal.catalog ?? []).filter((e) => e.group === 'weather').sort((a, b) => (a.weather?.order ?? 99) - (b.weather?.order ?? 99)));
  const used = $derived(new Set(MAIN.flatMap((m) => m.ids)));
  const switches = $derived([
    ...MAIN.map((m) => ({ ...m, effects: m.ids.map((id) => weather.find((e) => e.id === id)).filter((e): e is PickerEffect => !!e) })).filter((m) => m.effects.length > 0),
    ...weather.filter((e) => !used.has(e.id)).map((e) => ({ key: e.id, label: e.name, ids: [e.id], effects: [e], extra: true })),
  ] as Array<{ key: string; label: string; ids: string[]; effects: PickerEffect[]; extra?: boolean }>);

  const placedIds = $derived(new Set(ctx.map.effects.map((p) => p.id)));
  const isOn = (ids: string[]) => ids.some((id) => placedIds.has(weatherId(id)));
  const percentOf = (ids: string[]): number => {
    const p = ctx.map.effects.find((x) => x.id === weatherId(ids[0]!));
    const v = p?.params.intensityPercent;
    return typeof v === 'number' ? v : 100;
  };
  const onNow = $derived(switches.filter((s) => isOn(s.ids)));
  const extraOn = $derived(onNow.filter((s) => s.extra).length);

  function toggle(s: { ids: string[]; effects: PickerEffect[] }): void {
    const on = !isOn(s.ids);
    for (const e of s.effects) setWeather(ctx, e, on, percentOf(s.ids));
  }

  function setPercent(s: { key: string; ids: string[]; effects: PickerEffect[] }, v: number): void {
    const { [s.key]: _gone, ...rest } = dragging;
    dragging = rest;
    for (const e of s.effects) setWeather(ctx, e, true, v);
  }

  $effect(() => {
    if (open !== effectsLocal.weatherOpen) {
      effectsLocal.weatherOpen = open;
      effectsLocal.save();
    }
  });
</script>

<Section title="Weather & mood" collapsible bind:open description={onNow.length ? `On: ${onNow.map((s) => s.label).join(', ')}` : 'The whole map, for everyone at the table.'}>
  <div class="tiles" data-testid="weather">
    {#each switches.filter((s) => !s.extra || more) as s (s.key)}
      <EffectTile effect={s.effects[0]!} name={s.label} line={isOn(s.ids) ? `${percentOf(s.ids)} %` : 'Off'} pressed on={isOn(s.ids)} thumbUrl={libraryUrl(s.effects[0]!.thumb, lib)} onclick={() => toggle(s)} />
    {/each}
  </div>
  <Button variant="flat" icon={more ? 'chevron-up' : 'chevron-down'} label={more ? 'Less weather' : 'More weather'} hint={extraOn ? `${extraOn} on` : String(switches.filter((s) => s.extra).length)} block onclick={() => (more = !more)} />
  {#each onNow as s (s.key)}
    <Slider
      label="{s.label} — intensity"
      min={10}
      max={200}
      step={10}
      value={dragging[s.key] ?? percentOf(s.ids)}
      format={(v) => `${v} %`}
      oninput={(v) => (dragging = { ...dragging, [s.key]: v })}
      onchange={(v) => setPercent(s, v)}
    />
  {/each}
  <div class="screen" role="group" aria-label="Screen effects">
    <Button icon="sun" label="Flash" onclick={() => screenButton(ctx, 'flash')} />
    <Button icon="pan" label="Shake" onclick={() => screenButton(ctx, 'shake')} />
    <Button icon="moon" label="Fade" onclick={() => screenButton(ctx, 'fade')} />
  </div>
</Section>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
    gap: calc(var(--g) / 2);
  }

  .screen {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--g);
  }

  .screen :global(button) {
    width: 100%;
  }
</style>
