<!--
  CurtainButton — the curtain in one tap from every tab (roadmap N8; docs/features.md "the
  curtain"): a chrome square in the map's top-right corner. A tap lowers the curtain (the TV
  fades to black or to the "next scene…" plate) or lifts it (the players see the table again in
  one fade). Holding it unfolds its menu (cross-project long-press rule): lower / lift first,
  then Black or Next scene plate, then the plate's line (a small dialog). While the curtain is
  down the square is latched gold and a Badge beside it says so — the DM's own map stays as it
  is, so fog, maps, tokens and effects can be set up unseen.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { defaultCurtain, MAX_CURTAIN_TEXT } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import Field from '../../../ui/Field.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { curtainMenu } from './scenes-logic.ts';

  interface Props {
    /** The game screen's context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const curtain = $derived(ctx.game.curtain ?? defaultCurtain());
  const menu = $derived(curtainMenu(curtain));

  let editing = $state(false);
  let draft = $state('');

  /** Lowers or lifts the curtain, keeping the plate choice. */
  function setDown(down: boolean): void {
    if (!ctx.dispatch({ type: 'curtain.set', down })) return;
    log.info('companion', down ? 'Curtain lowered' : 'Curtain lifted', { plate: curtain.plate });
    notify(down ? (curtain.plate ? 'Curtain down — the TV shows the next scene plate' : 'Curtain down — the TV is black') : 'Curtain up — the players see the table', { kind: 'info' });
  }

  /** Black or the plate (applies at once, also while the curtain is down). */
  function setPlate(plate: boolean): void {
    if (plate === curtain.plate) return;
    if (ctx.dispatch({ type: 'curtain.set', down: curtain.down, plate })) log.info('companion', 'Curtain look', { plate });
  }

  function onMenu(id: string): void {
    if (id === 'toggle') setDown(!curtain.down);
    else if (id === 'black') setPlate(false);
    else if (id === 'plate') setPlate(true);
    else if (id === 'text') {
      draft = curtain.text;
      editing = true;
    }
  }

  /** Saves the plate's line — and shows the plate, which is what the line is for. */
  function saveText(): void {
    const text = draft.trim().slice(0, MAX_CURTAIN_TEXT);
    if (ctx.dispatch({ type: 'curtain.set', down: curtain.down, plate: true, text })) {
      log.info('companion', 'Curtain plate text', { length: text.length });
      notify(text ? 'Plate text saved' : 'Plate text cleared', { kind: 'success' });
    }
    editing = false;
  }
</script>

{#if curtain.down && !ctx.phone}
  <span data-testid="curtain-badge"><Badge text={curtain.plate ? 'Curtain down · plate' : 'Curtain down'} icon="hide" /></span>
{/if}
<IconButton
  icon="hide"
  label={curtain.down ? 'Lift the curtain (hold for more)' : 'Lower the curtain (hold for more)'}
  on={curtain.down}
  {menu}
  onmenu={onMenu}
  onclick={() => setDown(!curtain.down)}
  data-testid="curtain-button"
/>

<Dialog bind:open={editing} title="Plate text" description="A line under the game’s name while the curtain is down" icon="edit" size="sm">
  <Field
    bind:value={draft}
    label="Line on the plate"
    placeholder="The crypt awaits…"
    kind="prose"
    enterkeyhint="done"
    helper="{draft.length} of {MAX_CURTAIN_TEXT} — empty shows the game’s name alone"
    onenter={saveText}
  />
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (editing = false)} />
    <Button label="Save" icon="check" variant="primary" onclick={saveText} />
  {/snippet}
</Dialog>
