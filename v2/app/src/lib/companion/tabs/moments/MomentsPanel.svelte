<!--
  MomentsPanel — the Moments tab: the things a DM does to the table mid-game, top to bottom in
  how often they come up — the spotlight (a tap on the map in this tab), the timer on the TV,
  handouts, and the DM's own notes on this map (`docs/features.md` "table moments").

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import type { TabPanelProps } from '../../game/tabs.ts';
  import HandoutsSection from './HandoutsSection.svelte';
  import NotesSection from './NotesSection.svelte';
  import SpotlightSection from './SpotlightSection.svelte';
  import TimerSection from './TimerSection.svelte';

  let { ctx }: TabPanelProps = $props();
</script>

<div class="moments" data-testid="moments-panel">
  <SpotlightSection {ctx} />
  <TimerSection {ctx} />
  <HandoutsSection {ctx} />
  <NotesSection {ctx} />
</div>

<style>
  .moments {
    display: contents;
  }
</style>
