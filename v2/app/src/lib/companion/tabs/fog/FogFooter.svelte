<!--
  FogFooter — the Fog tab's commit row while "Preview first" is on (parity FG-10): Discard
  (flat) and Apply n squares (primary, the panel's one gold fill). Debounced by the kit Button.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { maskCount } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { fogLocal } from './local.svelte.ts';

  let { ctx }: TabPanelProps = $props();

  const map = $derived(ctx.map);
  const cells = $derived(map.info.grid.cols * map.info.grid.rows);
  const staged = $derived(map.fog.staged ? maskCount(map.fog.staged.reveal, cells) + maskCount(map.fog.staged.hide, cells) : 0);

  function apply(): void {
    const n = staged;
    if (ctx.dispatch({ type: 'fog.commit' })) {
      fogLocal.lastCircle = null;
      log.info('companion', 'Preview applied', { squares: n });
      notify(n === 1 ? '1 square shown to the players' : `${n} squares shown to the players`, { kind: 'success' });
    }
  }

  function discard(): void {
    if (ctx.dispatch({ type: 'fog.discard' })) {
      fogLocal.lastCircle = null;
      log.info('companion', 'Preview discarded', { squares: staged });
      notify('Preview discarded');
    }
  }
</script>

<Button icon="close" label="Discard" variant="flat" disabled={staged === 0} onclick={discard} />
<Button icon="check" label={staged === 1 ? 'Apply 1 square' : `Apply ${staged} squares`} variant="primary" block disabled={staged === 0} onclick={apply} />
