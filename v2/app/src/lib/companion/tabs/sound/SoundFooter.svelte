<!--
  SoundFooter — the Sound tab's commit row: Play (the gold primary: the TV starts the mix and
  plays one-shots) while the sound is off, Stop all (everything on the TV fades out in 1.5 s,
  the mix stays listed to play again) while it is on.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import type { GameContext } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import { log } from '../../../log.ts';
  import { soundSet } from './sound-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const on = $derived(ctx.game.sound.on);

  /** Turns the TV's sound on or off. */
  function toggle(): void {
    const next = !on;
    if (ctx.dispatch(soundSet({ on: next }))) log.info('companion', next ? 'Sound on' : 'Sound stopped', { beds: ctx.game.sound.beds.length });
  }
</script>

<!-- One button that changes face (not two in an #if): a double tap on Play must not reach a fresh Stop all past the debounce. -->
<Button
  label={on ? 'Stop all' : ctx.game.sound.beds.length ? 'Play on the TV' : 'Turn sound on'}
  icon={on ? 'sound-off' : 'play'}
  variant={on ? undefined : 'primary'}
  block
  debounce={400}
  onclick={toggle}
  data-testid="sound-toggle"
/>
