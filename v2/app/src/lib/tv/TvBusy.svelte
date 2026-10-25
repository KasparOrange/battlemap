<!--
  TvBusy — what the TV is doing while it loads ("Opening the game…", "Loading “The tower”…",
  "Updating battlemap — back in a few seconds"): a card low in the middle with the gold spinner,
  and a progress bar when the TV knows how far it is. The tablet shows the same from `tv.status`.

  Props:
  - busy: string — what it is doing
  - progress: number | null — 0–1, or null when unknown
-->
<script lang="ts">
  import ProgressBar from '../ui/ProgressBar.svelte';
  import Spinner from '../ui/Spinner.svelte';

  interface Props {
    /** What the TV is doing. */
    busy: string;
    /** How far, 0–1, or null. */
    progress: number | null;
  }

  let { busy, progress }: Props = $props();
</script>

<div class="busy" role="status" aria-live="polite" data-testid="tv-busy">
  <Spinner size="1.75rem" label={busy} />
  {#if progress !== null}
    <ProgressBar value={progress} label={busy} />
  {/if}
</div>

<style>
  .busy {
    position: fixed;
    left: 50%;
    bottom: 12%;
    transform: translateX(-50%);
    min-width: 30vw;
    display: flex;
    flex-direction: column;
    gap: var(--g);
    padding: var(--g2) calc(var(--g2) * 1.25);
    border-radius: var(--r);
    background: var(--m0);
    box-shadow: 0 0 0 1px var(--hair-strong);
    color: var(--t);
    font-size: var(--fs-body);
  }
</style>
