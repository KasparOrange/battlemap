<!--
  SessionSettingsDialog — a game's settings (parity §16): before a new game starts (with its
  name, "Start the game"), and from the Game tab mid-game, where every change applies at once
  (fluent rule 8) and Done closes. Only settings that do something are offered, and only those
  the protocol keeps (`settings-logic.ts` `supported`): the tool preset and the Draw / Measure
  tabs, the fog's look and fade, effects, light from the map — plus "Show walls", a setting of this tablet.

  Props:
  - open: boolean · mode: 'new' | 'game'
  - settings: Partial<GameSettings> — the game's (or the new game's starting) settings
  - name: string — the new game's suggested name (mode new)
  - onchange: (changed: Partial<GameSettings>) => void — mode game: one change, to dispatch
  - onstart: (name: string, settings: Partial<GameSettings>) => void — mode new
  - onclose: () => void
-->
<script lang="ts">
  import type { GameSettings } from '@battlemap/shared';
  import { log } from '../../log.ts';
  import Button from '../../ui/Button.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Field from '../../ui/Field.svelte';
  import Section from '../../ui/Section.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import ToggleSwitch from '../../ui/ToggleSwitch.svelte';
  import { FOG_STYLES, forProtocol, PRESETS, presetOf, supported, withDefaults, type SessionSettings } from './settings-logic.ts';
  import { wallsDebug } from './walls-debug.svelte.ts';

  interface Props {
    /** Shown or not. */
    open: boolean;
    /** A new game, or the open game's gear. */
    mode: 'new' | 'game';
    /** The settings to start from. */
    settings?: Partial<GameSettings> | null;
    /** The new game's name. */
    name?: string;
    /** Mode game: a setting changed (apply it now). */
    onchange?: (changed: Partial<GameSettings>) => void;
    /** Mode new: start with these. */
    onstart?: (name: string, settings: Partial<GameSettings>) => void;
    /** Closed. */
    onclose: () => void;
  }

  let { open, mode, settings = null, name = '', onchange, onstart, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let s = $state<SessionSettings>(withDefaults(settings as Partial<SessionSettings> | null));
  // svelte-ignore state_referenced_locally
  let gameName = $state(name);
  const tabsKnown = supported('drawTools') && supported('measureTools');
  const preset = $derived(presetOf(s));

  // mid-game the TV's state is the truth: follow it when it changes elsewhere
  $effect(() => {
    if (mode === 'game' && settings) s = withDefaults(settings as Partial<SessionSettings>);
  });

  /** Changes settings; mid-game they go to the TV at once. */
  function set(changed: Partial<SessionSettings>): void {
    s = { ...s, ...changed };
    if (mode !== 'game') return;
    const sent = forProtocol(changed);
    if (Object.keys(sent).length === 0) return;
    log.info('companion', 'Game settings changed', sent);
    onchange?.(sent);
  }

  function start(): void {
    const n = gameName.trim();
    if (!n) return;
    onstart?.(n, forProtocol(s));
  }
</script>

<Dialog
  {open}
  title={mode === 'new' ? 'A new game' : 'Game settings'}
  description={mode === 'new' ? 'You can change all of this later in the Game tab.' : 'Changes reach the TV at once.'}
  icon="settings"
  size="md"
  {onclose}
>
  {#if mode === 'new'}
    <Field label="Name" bind:value={gameName} onenter={start} />
  {/if}

  {#if tabsKnown}
    <Section title="Tools on the tablet" description="Fewer tabs, fewer buttons to miss mid-game.">
      <Segmented
        label="Tools"
        layout="tile"
        block
        value={preset ?? ''}
        options={PRESETS.map((p) => ({ id: p.id, label: p.label, hint: p.hint }))}
        onchange={(id) => set(PRESETS.find((p) => p.id === id)!.tools)}
      />
      <ToggleSwitch label="Draw tab" description="Pens and the eraser." checked={s.drawTools} onchange={(on) => set({ drawTools: on })} />
      <ToggleSwitch label="Measure tab" description="The ruler on the table and the template disc." checked={s.measureTools} onchange={(on) => set({ measureTools: on })} />
    </Section>
  {/if}

  <Section title="Fog of war">
    <Segmented
      label="Fog look"
      layout="tile"
      block
      value={s.fogStyle}
      options={FOG_STYLES}
      onchange={(id) => set({ fogStyle: id as SessionSettings['fogStyle'] })}
    />
    <ToggleSwitch label="Fade in revealed squares" description="Squares appear softly instead of at once." checked={s.fogFade} onchange={(on) => set({ fogFade: on })} />
  </Section>

  <Section title="Effects">
    <ToggleSwitch label="Effects on the table" description="Weather, torches and spell effects." checked={s.effects} onchange={(on) => set({ effects: on })} />
    {#if supported('mapLights')}
      <ToggleSwitch
        label="Light from the map"
        description="Torches and braziers of a Dungeondraft map glow and flicker on the table."
        checked={s.mapLights}
        onchange={(on) => set({ mapLights: on })}
      />
    {/if}
  </Section>

  <Section title="This tablet">
    <ToggleSwitch
      label="Show walls"
      description="Draws the map's walls on this tablet, to check where a Room or Circle reveal stops. Never on the TV."
      checked={wallsDebug.on}
      onchange={(on) => wallsDebug.set(on)}
    />
  </Section>

  {#snippet footer()}
    {#if mode === 'new'}
      <Button label="Cancel" variant="flat" onclick={onclose} />
      <Button label="Start the game" icon="play" variant="primary" disabled={!gameName.trim()} onclick={start} />
    {:else}
      <Button label="Done" icon="check" variant="primary" onclick={onclose} />
    {/if}
  {/snippet}
</Dialog>
