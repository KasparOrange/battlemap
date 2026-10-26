<!--
  AreaFooter — the Fog tab's commit row while a reveal area is drawn or edited: Cancel (flat) and
  Save area (primary, the panel's one gold fill; disabled while the area has no squares).

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import type { TabPanelProps } from '../../../game/tabs.ts';
  import { log } from '../../../../log.ts';
  import Button from '../../../../ui/Button.svelte';
  import { saveDraft } from './actions.ts';
  import { areasLocal } from './local.svelte.ts';

  let { ctx }: TabPanelProps = $props();

  const empty = $derived((areasLocal.draft?.cells.size ?? 0) === 0);

  function cancel(): void {
    log.info('companion', 'Area editing cancelled', { area: areasLocal.draft?.id });
    areasLocal.cancel();
  }
</script>

<Button icon="close" label="Cancel" variant="flat" onclick={cancel} />
<Button icon="check" label="Save area" variant="primary" block disabled={empty} onclick={() => saveDraft(ctx)} />
