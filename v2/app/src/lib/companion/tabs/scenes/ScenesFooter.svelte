<!--
  ScenesFooter — the Scenes tab's commit row: "Save the table as a scene" (the one primary
  button). Saves what the TV shows now under a new name; rename it from the row's menu.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { MAX_SCENES } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import { saveNewScene } from './save.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();
</script>

<Button
  label="Save the table as a scene"
  icon="add"
  variant="primary"
  block
  disabled={(ctx.game.scenes?.length ?? 0) >= MAX_SCENES}
  onclick={() => void saveNewScene(ctx)}
  data-testid="scene-save"
/>
