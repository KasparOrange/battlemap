<!--
  MomentsChips — what is running on the TV right now, reachable from every tab (the game screen
  mounts it at the map's top-right corner, beside the curtain): while a timer is on the TV a chip
  with its time — a tap pauses or resumes it (hold: Reset, Off the TV); while a handout shows a
  chip that takes it off with one tap. Nothing shows while neither is on. The time redraws once a
  second while it runs, never idle.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { formatTimer, resetTimer, timerLeft, type Timer } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import { followTimer } from './timer-clock.ts';
  import { timerAction, timerToggled } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const timer = $derived(ctx.game.timer ?? null);
  const shown = $derived(ctx.game.handoutShown ?? null);
  const handout = $derived(shown ? (ctx.game.handouts ?? []).find((h) => h.id === shown.id) ?? null : null);
  let now = $state(0); // set by the first tick

  $effect(() => {
    const t = timer;
    if (!t) return;
    return followTimer(t, () => ctx.serverNow(), (n) => (now = n));
  });

  const action = $derived(timer ? timerAction(timer, now) : 'start');

  function send(t: Timer | null, what: string): void {
    if (ctx.dispatch({ type: 'timer.set', timer: t })) log.info('companion', `Timer ${what}`, { from: 'chip' });
  }

  function onMenu(id: string): void {
    if (!timer) return;
    if (id === 'reset') send(resetTimer(timer), 'reset');
    else if (id === 'off') send(null, 'off');
    else if (id === 'toggle') send(timerToggled(timer, ctx.serverNow()), action === 'pause' ? 'paused' : 'resumed');
  }
</script>

{#if handout}
  <Button
    label={shown?.place === 'full' ? 'Pause card' : 'Handout'}
    icon="close"
    onclick={() => ctx.dispatch({ type: 'handout.show', shown: null })}
    aria-label="Take “{handout.name}” off the TV"
    data-testid="handout-chip"
  />
{/if}
{#if timer}
  <Button
    label={formatTimer(timerLeft(timer, now))}
    icon={action === 'pause' ? undefined : 'play'}
    on={action === 'pause'}
    onclick={() => onMenu('toggle')}
    menu={[
      { id: 'toggle', label: action === 'pause' ? 'Pause' : action === 'resume' ? 'Resume' : 'Start', icon: 'play' },
      { id: 'reset', label: 'Reset', icon: 'undo' },
      { id: 'off', label: 'Off the TV', icon: 'close', divider: true },
    ]}
    onmenu={onMenu}
    aria-label={action === 'pause' ? 'Pause the timer' : 'Start the timer'}
    data-testid="timer-chip"
  />
{/if}
