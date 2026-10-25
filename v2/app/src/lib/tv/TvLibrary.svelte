<!--
  TvLibrary — the TV's library, the remote's way into a game (design.md "TV library"): the back
  square, "Library" in the story face, Segmented Games | Maps, a 4-column grid of Cards. A game
  card opens that game; a map card starts a new game on that shared map. Every card is a D-pad
  stop; the focused one grows and rings gold.

  Props:
  - games: GameSummary[] · maps: LibraryEntry[] — what to list
  - loading: boolean — still reading the lists (a spinner shows)
  - mapsError: string | null — the shared library couldn't be read
  - openId: string | null — the game on the table (marked)
  - thumbUrl: (ref) => string — a thumbnail's URL
  - onOpenGame: (id) => void · onStartMap: (entry) => void · onBack: () => void
-->
<script lang="ts">
  import type { FileRef, GameSummary, LibraryEntry } from '@battlemap/shared';
  import Badge from '../ui/Badge.svelte';
  import Card from '../ui/Card.svelte';
  import Icon from '../ui/Icon.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { focusables, focusFirst } from '../ui/spatial.ts';
  import { ago } from './screen.ts';

  interface Props {
    /** The games. */
    games: GameSummary[];
    /** The shared maps. */
    maps: LibraryEntry[];
    /** Still loading. */
    loading: boolean;
    /** Why the shared maps are missing, or null. */
    mapsError: string | null;
    /** The open game's id. */
    openId: string | null;
    /** A thumbnail's URL. */
    thumbUrl: (ref: FileRef) => string;
    /** Open a game. */
    onOpenGame: (id: string) => void;
    /** Start a new game on a shared map. */
    onStartMap: (entry: LibraryEntry) => void;
    /** Back to home. */
    onBack: () => void;
  }

  let { games, maps, loading, mapsError, openId, thumbUrl, onOpenGame, onStartMap, onBack }: Props = $props();

  let shelf = $state('games');
  let grid: HTMLDivElement | undefined = $state();

  /** Shows another shelf (the focus stays on the Segmented). */
  function pick(id: string): void {
    shelf = id;
  }

  /** Whether the remote moved the focus here yet — until then the first card keeps it. */
  let moved = false;

  $effect(() => {
    // While the remote hasn't moved yet, the first card has the focus — also when the lists
    // arrive or change order (a refresh), so OK lands on the newest game, not on Back.
    void games;
    void maps;
    void shelf;
    if (loading || !grid || moved) return;
    requestAnimationFrame(() => {
      if (!moved && grid) focusFirst(grid);
    });
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key.startsWith('Arrow')) moved = true;
  }

  /**
   * ← → inside the header walk its controls in order (Back, Games, Maps) — by geometry alone a
   * card below is nearer than the shelf switch at the far right.
   */
  function onHeaderKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const header = e.currentTarget as HTMLElement;
    const list = focusables(header);
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = list[at + (e.key === 'ArrowRight' ? 1 : -1)];
    if (at < 0 || !next) return;
    e.preventDefault();
    next.focus();
  }

  const now = Date.now();
  const where = (g: GameSummary) => (g.where === 'server' ? ' · on the server' : '');
</script>

<div class="library" data-testid="tv-library" onkeydowncapture={onKeydown}>
  <header class="top" role="toolbar" aria-label="Library" tabindex="-1" onkeydown={onHeaderKey}>
    <button type="button" class="back" aria-label="Back" onclick={onBack}><Icon name="back" size="1.5rem" /></button>
    <h1 class="bm-headline">Library</h1>
    <Segmented
      label="Shelf"
      value={shelf}
      onchange={pick}
      options={[
        { id: 'games', label: 'Games', icon: 'game' },
        { id: 'maps', label: 'Maps', icon: 'map' },
      ]}
    />
  </header>

  <div class="grid" bind:this={grid}>
    {#if loading}
      <div class="note"><Spinner label="Reading the library…" /></div>
    {:else if shelf === 'games'}
      {#each games as g (g.id)}
          <Card
            title={g.name}
            meta={`${g.activeMapName} · ${ago(g.savedAt, now)}${where(g)}`}
            selected={g.id === openId}
            image={g.thumb ? thumbUrl(g.thumb) : undefined}
            onclick={() => onOpenGame(g.id)}
          >
            {#snippet badges()}{#if g.id === openId}<Badge text="On the table" tone="accent" />{/if}{/snippet}
          </Card>
      {:else}
        <div class="note">
          <Icon name="game" size="2.5rem" />
          <p>No games yet. Start one on the tablet, or pick a map under Maps.</p>
        </div>
      {/each}
    {:else}
      {#each maps as m (m.map.id)}
          <Card
            title={m.map.name}
            meta={`${m.map.grid.cols} × ${m.map.grid.rows} squares`}
            image={m.thumb ? thumbUrl(m.thumb) : undefined}
            onclick={() => onStartMap(m)}
          />
      {:else}
        <div class="note">
          <Icon name="map" size="2.5rem" />
          <p>{mapsError ?? 'The shared library is empty. Upload a map from the tablet.'}</p>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .library {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--g2);
    padding: calc(var(--g2) * 1.5) calc(var(--g2) * 2);
    background: var(--bg);
    color: var(--t);
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--g2);
  }

  .top h1 {
    flex: 1;
    margin: 0;
  }

  .back {
    display: grid;
    place-items: center;
    width: var(--sq-standalone);
    height: var(--sq-standalone);
    border-radius: var(--r);
    background: var(--m0);
    color: var(--t2);
    box-shadow: var(--elev-rest);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-content: start;
    gap: var(--g2);
    padding: var(--g);
    margin: calc(var(--g) * -1);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .note {
    grid-column: 1 / -1;
    display: grid;
    place-items: center;
    gap: var(--g);
    padding: calc(var(--g2) * 3) 0;
    color: var(--t2);
    font-size: var(--fs-body);
    text-align: center;
  }

  .note p {
    margin: 0;
  }
</style>
