<!--
  SoundPanel — the Sound tab: what the TV plays to the room. A tab of its own (not a section of
  Effects or Settings) because mid-game the DM reaches for it in one tap — a door creaks, the
  storm starts — and its pads must be big and always in the same place.

  From the top: the mix now (up to three ambient beds, a volume slider each, × takes one out),
  the volumes (master, one-shots), the one-shot pads (favourites first), the ambience library
  by group (a tap adds a bed to the mix or takes it out), and the effects-sound switch.
  Every pad and tile has a long-press menu with "Listen here" — a quiet preview on this
  tablet only. Play / Stop all is the footer (`SoundFooter`). Sliders send while dragging
  (every 200 ms) so the DM mixes by ear; no undo step (sound is not table history).

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { MAX_BEDS, newId } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import Section from '../../../ui/Section.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import Spinner from '../../../ui/Spinner.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { log } from '../../../log.ts';
  import { onPreviewChange, previewBed, previewShot, stopPreview } from '../../../sound/preview.ts';
  import type { SoundEntry } from '../../../sound/catalogue.ts';
  import { soundLocal } from './local.svelte.ts';
  import { BED_GROUPS, bedsOf, padOrder, percent, setBedVolume, soundPlay, soundSet, toggleBed } from './sound-logic.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  void soundLocal.load();

  const sound = $derived(ctx.game.sound);
  const cat = $derived(soundLocal.catalogue);
  const nameOf = (id: string): string => cat?.get(id)?.name ?? id;
  const inMix = $derived(new Set(sound.beds.map((b) => b.sound)));
  const pads = $derived(cat ? padOrder(cat.oneShots, soundLocal.favourites) : []);

  /** Slider values while a finger is on them, by key (`master`, `shots`, a bed id). */
  let dragging = $state<Record<string, number>>({});
  /** The bed previewing on this tablet, or null. */
  let previewing = $state<string | null>(null);

  let lastSent = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  // Leaving the tab ends a preview and a slider send still waiting.
  $effect(() => {
    const stopListening = onPreviewChange((id) => (previewing = id));
    return () => {
      stopListening();
      stopPreview();
      if (pending) clearTimeout(pending);
    };
  });

  /**
   * A slider moved: show the value, send it at most every 200 ms (the last one always goes).
   *
   * @param key - the slider
   * @param v - its value
   * @param send - sends the value
   */
  function drag(key: string, v: number, send: (v: number) => void): void {
    dragging = { ...dragging, [key]: v };
    if (pending) clearTimeout(pending);
    const wait = 200 - (Date.now() - lastSent);
    pending = setTimeout(() => {
      pending = null;
      lastSent = Date.now();
      send(v);
    }, Math.max(0, wait));
  }

  /**
   * A slider was let go: send the final value now.
   *
   * @param key - the slider
   * @param v - its value
   * @param send - sends the value
   */
  function release(key: string, v: number, send: (v: number) => void): void {
    if (pending) clearTimeout(pending);
    pending = null;
    lastSent = Date.now();
    send(v);
    const { [key]: _gone, ...rest } = dragging;
    dragging = rest;
  }

  const sendMaster = (v: number) => ctx.dispatch(soundSet({ master: v }));
  const sendShots = (v: number) => ctx.dispatch(soundSet({ shots: v }));
  const sendBed = (id: string) => (v: number) => ctx.dispatch(soundSet({ beds: setBedVolume(ctx.game.sound.beds, id, v) }));

  /**
   * A bed tile was tapped: into the mix or out of it.
   *
   * @param bed - the bed
   */
  function tapBed(bed: SoundEntry): void {
    const t = toggleBed(sound.beds, bed.id);
    if (t.kind === 'full') {
      notify(`${MAX_BEDS} sounds play at once — take one out of the mix first.`, { kind: 'warning' });
      return;
    }
    if (ctx.dispatch(soundSet({ beds: t.beds }))) {
      log.info('companion', t.kind === 'added' ? 'Bed added' : 'Bed taken out', { sound: bed.id, on: sound.on });
      if (t.kind === 'added' && !sound.on) notify(`${bed.name} is in the mix — Play starts it on the TV.`);
    }
  }

  /**
   * A pad was pressed: the one-shot plays on the TV (when the sound is on).
   *
   * @param shot - the one-shot
   */
  function playPad(shot: SoundEntry): void {
    if (!sound.on) {
      notify('The sound is off on the TV.', { kind: 'warning', action: { label: 'Turn on', run: () => ctx.dispatch(soundSet({ on: true })) } });
      return;
    }
    if (ctx.dispatch(soundPlay(shot.id, newId(), ctx.serverNow()))) log.info('companion', 'One-shot', { sound: shot.id });
  }

  /**
   * A pad's long-press menu row.
   *
   * @param shot - the one-shot
   * @param id - the row
   */
  function padMenu(shot: SoundEntry, id: string): void {
    if (id === 'play') playPad(shot);
    else if (id === 'listen') previewShot(shot.id);
    else if (id === 'star') soundLocal.toggleFavourite(shot.id);
  }

  /**
   * A bed tile's long-press menu row.
   *
   * @param bed - the bed
   * @param id - the row
   */
  function bedMenu(bed: SoundEntry, id: string): void {
    if (id === 'mix') tapBed(bed);
    else if (id === 'listen') previewBed(bed.id);
  }
</script>

{#if !cat}
  <div class="state" data-testid="sound-loading">
    {#if soundLocal.error}
      <p>The sound library didn't load.</p>
      <Button icon="sync" label="Try again" onclick={() => void soundLocal.load()} />
    {:else}
      <Spinner />
      <p>Loading the sound library…</p>
    {/if}
  </div>
{:else}
  <Section title="Mix on the TV" description={`Up to ${MAX_BEDS} at once. A scene saved while it plays keeps this mix.`}>
    <div class="mix" data-testid="sound-mix">
      {#each sound.beds as b (b.sound)}
        <div class="bed-row">
          <Slider
            label={nameOf(b.sound)}
            min={0}
            max={1}
            step={0.05}
            value={dragging[b.sound] ?? b.volume}
            format={percent}
            oninput={(v) => drag(b.sound, v, sendBed(b.sound))}
            onchange={(v) => release(b.sound, v, sendBed(b.sound))}
          />
          <IconButton icon="close" label={`Take ${nameOf(b.sound)} out`} variant="quiet" onclick={() => tapBed(cat.get(b.sound) ?? ({ id: b.sound, name: b.sound } as SoundEntry))} />
        </div>
      {:else}
        <p class="empty">No ambience yet — tap one below.</p>
      {/each}
    </div>
  </Section>

  <Section title="Volume">
    <Slider label="Master" min={0} max={1} step={0.05} value={dragging.master ?? sound.master} format={percent} oninput={(v) => drag('master', v, sendMaster)} onchange={(v) => release('master', v, sendMaster)} />
    <Slider label="One-shots" min={0} max={1} step={0.05} value={dragging.shots ?? sound.shots} format={percent} oninput={(v) => drag('shots', v, sendShots)} onchange={(v) => release('shots', v, sendShots)} />
  </Section>

  <Section title="One-shots" description={sound.on ? 'Tap to play on the TV. Hold for Listen here and ★.' : 'The sound is off — Play below turns it on.'}>
    <div class="pads" class:off={!sound.on} data-testid="sound-pads">
      {#each pads as p (p.entry.id)}
        <Button
          label={p.entry.name}
          icon={p.favourite ? 'star' : 'play'}
          onclick={() => playPad(p.entry)}
          menu={[
            { id: 'play', label: 'Play on the TV', icon: 'play' },
            { id: 'listen', label: 'Listen here', icon: 'tablet', description: 'Quietly, on this tablet only' },
            { id: 'star', label: p.favourite ? 'Remove from favourites' : 'Add to favourites', icon: 'star', divider: true },
          ]}
          onmenu={(id) => padMenu(p.entry, id)}
          data-testid="sound-pad"
          data-sound={p.entry.id}
        />
      {/each}
    </div>
  </Section>

  {#each BED_GROUPS as g (g.id)}
    {@const beds = bedsOf(cat.beds, g.id)}
    {#if beds.length}
      <Section title={g.title}>
        <div class="tiles">
          {#each beds as b (b.id)}
            <Button
              label={b.name}
              icon={previewing === b.id ? 'tablet' : 'sound'}
              on={inMix.has(b.id)}
              hint={previewing === b.id ? 'here' : undefined}
              onclick={() => tapBed(b)}
              menu={[
                { id: 'mix', label: inMix.has(b.id) ? 'Take out of the mix' : 'Add to the mix', icon: inMix.has(b.id) ? 'minus' : 'add' },
                { id: 'listen', label: previewing === b.id ? 'Stop listening' : 'Listen here', icon: 'tablet', description: 'Quietly, on this tablet only (15 s)' },
              ]}
              onmenu={(id) => bedMenu(b, id)}
              data-testid="sound-bed"
              data-sound={b.id}
            />
          {/each}
        </div>
      </Section>
    {/if}
  {/each}

  <Section title="Effects">
    <ToggleSwitch
      label="Effects play their sound"
      description="A fireball, lightning or healing from the Effects tab sounds on the TV too."
      checked={sound.fxSounds}
      onchange={(on) => ctx.dispatch(soundSet({ fxSounds: on }))}
    />
    <p class="credit">Sounds: CC0 (public domain) from Freesound, OpenGameArt and Kenney.</p>
  </Section>
{/if}

<style>
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--g);
    padding: calc(var(--g) * 2) 0;
    color: var(--t2);
  }

  .mix {
    display: flex;
    flex-direction: column;
    gap: calc(var(--g) / 2);
  }

  .bed-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: calc(var(--g) / 2);
  }

  .empty,
  .credit {
    margin: 0;
    color: var(--t2);
  }

  .credit {
    font-size: 0.8125rem;
  }

  .pads {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: calc(var(--g) / 2);
  }

  .pads :global(button) {
    width: 100%;
    min-height: 3.5rem;
  }

  .pads.off {
    opacity: 0.6;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: calc(var(--g) / 2);
  }

  .tiles :global(button) {
    width: 100%;
  }
</style>
