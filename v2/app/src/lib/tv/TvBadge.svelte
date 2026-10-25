<!--
  TvBadge — the TV's top-right badge (design.md "TV — home and game"): a problem in the game
  (only then), or the tablet's state on the home screen. When another TV took the table it
  carries "Take over", and the focus jumps to that button (parity TV-22).

  Props:
  - badge: Badge — what to show (screen.ts `problemBadge` / `homeBadge`)
  - onTakeOver: () => void — "Take over" pressed
-->
<script lang="ts">
  import Badge from '../ui/Badge.svelte';
  import Button from '../ui/Button.svelte';
  import type { Badge as BadgeInfo } from './screen.ts';

  interface Props {
    /** What to show. */
    badge: BadgeInfo;
    /** "Take over" was pressed. */
    onTakeOver: () => void;
  }

  let { badge, onTakeOver }: Props = $props();

  let takeOverEl: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (badge.takeOver && takeOverEl) takeOverEl.focus();
  });

  const icon = $derived(badge.tone === 'ok' ? 'connected' : badge.text.includes('server') ? 'wifi-off' : badge.tone === 'danger' ? 'error' : 'disconnected');
</script>

<div class="badge" role="status" data-testid="tv-badge">
  <Badge text={badge.text} icon={icon} tone={badge.tone} size="tv" />
  {#if badge.takeOver}
    <Button label="Take over" icon="sync" variant="primary" bind:el={takeOverEl} onclick={onTakeOver} />
  {/if}
</div>

<style>
  .badge {
    display: flex;
    align-items: center;
    gap: var(--g);
    max-width: 50vw;
  }
</style>
