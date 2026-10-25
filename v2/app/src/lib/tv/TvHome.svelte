<!--
  TvHome — the TV's start screen and its waiting screen in one (design.md "TV — home and
  game"): the brand and the tablet's state top right; the last game as the big "Continue" card;
  Library, Measure the table and Reload as tiles; at the bottom how to pair: "On the tablet,
  open battlemap and pick this table". Every control is a D-pad stop; Library has the focus
  first (Continue when there is a game to continue).

  Props:
  - last: GameSummary | null — the game to continue (null: none yet)
  - loading: boolean — the game list is still being read
  - badge: Badge — the tablet / server state
  - tableName: string · tableId: string — what the tablet's table picker shows
  - build: string — the app build
  - thumbUrl: (ref) => string — a thumbnail's URL
  - onContinue · onLibrary · onMeasure · onReload · onTakeOver: () => void
-->
<script lang="ts">
  import type { FileRef, GameSummary } from '@battlemap/shared';
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import TvBadge from './TvBadge.svelte';
  import { ago, type Badge as BadgeInfo } from './screen.ts';

  interface Props {
    /** The game to continue. */
    last: GameSummary | null;
    /** The game list is still loading. */
    loading: boolean;
    /** The tablet / server state. */
    badge: BadgeInfo;
    /** The table's name in the tablet's picker. */
    tableName: string;
    /** The table's id. */
    tableId: string;
    /** The app build. */
    build: string;
    /** A thumbnail's URL. */
    thumbUrl: (ref: FileRef) => string;
    /** Continue the last game. */
    onContinue: () => void;
    /** Open the library. */
    onLibrary: () => void;
    /** Show the calibration pattern. */
    onMeasure: () => void;
    /** Reload the app. */
    onReload: () => void;
    /** Take the table back from another TV. */
    onTakeOver: () => void;
  }

  let { last, loading, badge, tableName, tableId, build, thumbUrl, onContinue, onLibrary, onMeasure, onReload, onTakeOver }: Props = $props();

  const meta = $derived(last ? [last.activeMapName, ago(last.savedAt, Date.now()), last.where === 'server' ? 'on the server' : ''].filter(Boolean).join(' · ') : '');
</script>

<div class="home" data-testid="tv-home">
  <header class="top">
    <div class="brand">
      <span class="mark"><Icon name="candle" filled size="1.5rem" /></span>
      <span class="bm-headline">battlemap</span>
    </div>
    <TvBadge {badge} {onTakeOver} />
  </header>

  <div class="tiles">
    <div class="hero">
      {#if last}
        <Card title={last.name} {meta} prominent aspect="16 / 8" image={last.thumb ? thumbUrl(last.thumb) : undefined} onclick={onContinue}>
          {#snippet badges()}<Badge text="Continue" icon="play" tone="accent" />{/snippet}
        </Card>
      {:else}
        <div class="welcome">
          {#if loading}
            <Spinner label="Looking for games…" />
          {:else}
            <Icon name="tablet" size="3rem" />
            <h2 class="bm-headline">No game yet</h2>
            <p>Start one on the tablet, or pick a map in the library.</p>
          {/if}
        </div>
      {/if}
    </div>
    <div class="side">
      <button type="button" class="tile" data-focus-grow data-autofocus={last ? undefined : true} onclick={onLibrary}>
        <Icon name="library" size="2rem" />
        <span class="t">Library</span>
        <span class="s">Games and shared maps</span>
      </button>
      <button type="button" class="tile" data-focus-grow onclick={onMeasure}>
        <Icon name="measure" size="2rem" />
        <span class="t">Measure the table</span>
        <span class="s">One square = one inch</span>
      </button>
      <button type="button" class="tile" data-focus-grow onclick={onReload}>
        <Icon name="sync" size="2rem" />
        <span class="t">Reload</span>
        <span class="s">Gets a new version · {build}</span>
      </button>
    </div>
  </div>

  <footer class="pair">
    <Icon name="tablet" size="1.25rem" />
    <span>On the tablet, open battlemap and pick this table:</span>
    <span class="code">{tableName}</span>
    <span class="id">{tableId}</span>
  </footer>
</div>

<style>
  .home {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--g2);
    padding: calc(var(--g2) * 1.5) calc(var(--g2) * 2);
    background: var(--bg);
    color: var(--t);
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--g2);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--g);
    flex: 1;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--r-ctl);
    background: color-mix(in srgb, var(--accent) 16%, var(--m0));
    color: var(--accent);
  }

  .tiles {
    display: grid;
    grid-template-columns: 1.7fr 1fr;
    gap: var(--g2);
    min-height: 0;
    align-items: center;
  }

  .welcome {
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--g);
    aspect-ratio: 16 / 9;
    border-radius: var(--r);
    background: var(--m1);
    box-shadow: var(--elev-rest);
    color: var(--t2);
    text-align: center;
  }

  .welcome h2 {
    margin: 0;
    color: var(--t);
  }

  .welcome p {
    margin: 0;
    font-size: var(--fs-body);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--g);
  }

  .tile {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--g2);
    align-items: center;
    padding: var(--g2);
    border-radius: var(--r);
    background: var(--m1);
    color: var(--t2);
    text-align: left;
    box-shadow: var(--elev-rest);
  }

  .tile :global(.bm-icon) {
    grid-row: span 2;
  }

  .tile .t {
    font-family: var(--font-title);
    font-weight: var(--fw-title);
    font-size: var(--fs-title);
    color: var(--t);
  }

  .tile .s {
    font-size: var(--fs-small);
    color: var(--t2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile:focus-visible {
    background: var(--m3);
  }

  .pair {
    display: flex;
    align-items: center;
    gap: var(--g);
    font-size: var(--fs-body);
    color: var(--t2);
  }

  .code {
    font-family: var(--font-value);
    font-weight: var(--fw-value);
    letter-spacing: 0.04em;
    color: var(--accent-text);
  }

  .id {
    font-family: var(--font-meta);
    font-size: var(--fs-small);
    color: var(--t3);
  }
</style>
