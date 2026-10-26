<!--
  TimerSection — the countdown on the TV (rings at both long edges of the table). One tap on a
  preset (30 s, 1 min, 5 min) starts it; a custom length in seconds starts with its own button.
  While a timer exists the section shows its time (redrawn once a second while it runs, never
  idle), Pause / Resume / Again, Reset, and Off the TV; the end effect (none, glow, flash)
  applies to the running timer at once and is remembered on this tablet. Every value is
  stamped with the server's clock, so a TV that reloads keeps counting.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { formatTimer, resetTimer, timerLeft, timerPhase, type Timer } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import NumberStepper from '../../../ui/NumberStepper.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import { momentsLocal } from './local.svelte.ts';
  import { followTimer } from './timer-clock.ts';
  import {
    END_EFFECTS, presetTimer, TIMER_ACTION_LABEL, TIMER_PRESETS, timerAction, timerStatus, timerToggled,
  } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const timer = $derived(ctx.game.timer ?? null);
  /** The server's clock as the readout last read it (a tick moves it once a second while running). */
  let now = $state(0); // set by the first tick

  // one tick per printed second while it runs; nothing while it is stopped
  $effect(() => {
    const t = timer;
    if (!t) return;
    return followTimer(t, () => ctx.serverNow(), (n) => (now = n));
  });

  const left = $derived(timer ? timerLeft(timer, now) : 0);
  const phase = $derived(timer ? timerPhase(timer, now) : null);
  const action = $derived(timer ? timerAction(timer, now) : 'start');

  function send(t: Timer | null, what: string): void {
    if (ctx.dispatch({ type: 'timer.set', timer: t })) log.info('companion', `Timer ${what}`, t ? { durationMs: t.durationMs, remainingMs: t.remainingMs, running: t.startedAt !== null } : {});
  }

  function start(ms: number): void {
    send(presetTimer(ms, momentsLocal.endEffect, ctx.serverNow()), 'started');
  }

  function toggle(): void {
    if (!timer) return;
    send(timerToggled(timer, ctx.serverNow()), action === 'pause' ? 'paused' : 'resumed');
  }

  function setEffect(id: string): void {
    const e = END_EFFECTS.find((x) => x.id === id)?.id ?? 'glow';
    momentsLocal.endEffect = e;
    momentsLocal.save();
    if (timer && timer.endEffect !== e) send({ ...timer, endEffect: e }, 'end effect');
  }

  function setCustom(seconds: number): void {
    momentsLocal.customSeconds = seconds;
    momentsLocal.save();
  }
</script>

<Section title="Timer on the TV" description="A countdown ring at both long edges of the table.">
  {#if timer}
    <div class="readout" class:done={phase === 'done'} data-testid="timer-readout">
      <span class="digits">{formatTimer(left)}</span>
      <span class="status">{timerStatus(timer, now)}</span>
    </div>
    <div class="row">
      <Button label={TIMER_ACTION_LABEL[action]} icon={action === 'pause' ? undefined : 'play'} variant="primary" onclick={toggle} block />
      <Button label="Reset" icon="undo" variant="flat" disabled={phase === 'ready'} onclick={() => send(resetTimer(timer), 'reset')} />
      <Button label="Off the TV" icon="close" variant="flat" onclick={() => send(null, 'off')} />
    </div>
  {/if}
  <p class="lbl">{timer ? 'Start a new one' : 'Start'}</p>
  <div class="row presets">
    {#each TIMER_PRESETS as p (p.id)}
      <Button label={p.label} onclick={() => start(p.ms)} block />
    {/each}
  </div>
  <div class="row custom">
    <NumberStepper
      label="Custom length"
      value={momentsLocal.customSeconds}
      min={5}
      max={5999}
      steps={[5, 15, 60]}
      unit="s"
      onchange={setCustom}
    />
    <Button label="Start {formatTimer(momentsLocal.customSeconds * 1000)}" icon="play" variant="flat" onclick={() => start(momentsLocal.customSeconds * 1000)} />
  </div>
  <p class="lbl">When it runs out</p>
  <Segmented label="When it runs out" options={END_EFFECTS} value={timer?.endEffect ?? momentsLocal.endEffect} onchange={setEffect} block />
</Section>

<style>
  .readout {
    display: flex;
    align-items: baseline;
    gap: var(--g2);
    padding: var(--g) 0;
  }

  .digits {
    font-family: var(--font-value);
    font-size: var(--fs-display);
    line-height: 1;
    color: var(--t);
    font-variant-numeric: tabular-nums;
  }

  .done .digits {
    color: var(--accent-text);
  }

  .status {
    color: var(--t2);
    font-size: var(--fs-small);
  }

  .row {
    display: flex;
    gap: var(--g);
    align-items: center;
  }

  .custom {
    flex-wrap: wrap;
  }

  .lbl {
    margin: 0;
    color: var(--t2);
    font-size: var(--fs-small);
  }
</style>
