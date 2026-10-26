<!--
  TvHome — the TV's start screen and its waiting screen in one (design.md "TV — home and
  game"): the brand and the tablet's state top right; the last game as the big "Continue" card;
  Library, Measure the table and Reload as tiles; at the bottom how to join. When this TV hosts
  the table (LAN play, shell.md "Table server"), a calm band shows the short code and a QR code of
  the join address in 10-foot size (same Wi-Fi, no internet needed); beside it the online way
  stays: "On the tablet, open battlemap and pick this table". Every control is a D-pad stop;
  Library has the focus first (Continue when there is a game to continue). The join band is
  information, not a control (nothing to press), so the D-pad passes it by.

  Props:
  - last: GameSummary | null — the game to continue (null: none yet)
  - loading: boolean — the game list is still being read
  - badge: Badge — the tablet / server state
  - tableName: string · tableId: string — what the tablet's table picker shows: the TV's name and
    the table code (`tableCode`, protocol.md "table code"), never the raw room id (qa#18)
  - build: string — the app build
  - lan: LanJoinInfo | null — this TV's LAN table (`lanJoinInfo()`, updated by `onLanChange`), null when it doesn't host
  - thumbUrl: (ref) => string — a thumbnail's URL
  - gameThumb?: (game) => string | undefined — the TV's own fog-honest picture of a game (`fog-thumbs.ts`);
    when given, the server's unfogged thumbnail is never shown (undefined = a neutral card)
  - onContinue · onLibrary · onMeasure · onReload · onTakeOver: () => void
-->
<script lang="ts">
  import { tableCode, type FileRef, type GameSummary } from '@battlemap/shared';
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import TvBadge from './TvBadge.svelte';
  import { ago, type Badge as BadgeInfo } from './screen.ts';
  import { lanQrUrl } from './lan.ts';
  import type { LanJoinInfo } from '../config.ts';

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
    /** This TV's LAN table, null when it doesn't host one. */
    lan: LanJoinInfo | null;
    /** A thumbnail's URL. */
    thumbUrl: (ref: FileRef) => string;
    /** The TV's fog-honest picture of a game; when given, server thumbnails are not used. */
    gameThumb?: ((game: GameSummary) => string | undefined) | undefined;
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

  let { last, loading, badge, tableName, tableId, build, lan, thumbUrl, gameThumb, onContinue, onLibrary, onMeasure, onReload, onTakeOver }: Props = $props();

  const qr = $derived(lan ? lanQrUrl(lan) : null);

  let hero: HTMLDivElement | undefined = $state();
  let library: HTMLButtonElement | undefined = $state();
  let offered = '';
  // The game list arrives after the screen showed (focus on Library then): once a game to
  // continue appears, Continue takes the focus — unless the remote already moved it elsewhere.
  $effect(() => {
    const id = last?.id ?? '';
    if (!id || id === offered) return;
    offered = id;
    const active = document.activeElement;
    if (active && active !== document.body && active !== library) return;
    hero?.querySelector<HTMLButtonElement>('button')?.focus();
  });
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
    <div class="hero" bind:this={hero}>
      {#if last}
        <Card title={last.name} {meta} prominent aspect="16 / 8" image={gameThumb ? gameThumb(last) : last.thumb ? thumbUrl(last.thumb) : undefined} onclick={onContinue}>
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
      <button type="button" class="tile" data-focus-grow data-autofocus={last ? undefined : true} bind:this={library} onclick={onLibrary}>
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

  <footer class="join" class:hosting={lan !== null}>
    {#if lan && lan.hosting && lan.code}
      <div class="lan" data-testid="tv-lan">
        {#if qr}<img class="qr" src={qr} alt="QR code: join this table on the same Wi-Fi" width="256" height="256" />{/if}
        <div class="lan-text">
          <span class="eyebrow">Same Wi-Fi — no internet needed</span>
          <span class="lan-code" data-testid="tv-lan-code">{lan.code}</span>
          <span class="hint">Scan with a phone, or type this code on the tablet</span>
        </div>
      </div>
    {:else if lan}
      <div class="lan-off" data-testid="tv-lan">
        <Icon name="warning" size="1.25rem" />
        <span>{lan.hosting ? 'This TV has no Wi-Fi address yet — tablets join over the internet' : `This TV can't host the table${lan.error ? `: ${lan.error}` : ''}`}</span>
      </div>
    {/if}
    <div class="pair">
      <Icon name="tablet" size="1.25rem" />
      <span>{lan ? 'Or pick it in the tablet’s list:' : 'On the tablet, open battlemap and pick this table:'}</span>
      <span class="name">{tableName.trim() || 'This TV'}</span>
      <span class="code" data-testid="tv-table-code">{tableCode(tableId)}</span>
    </div>
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
    gap: calc(var(--g2) * 1.5);
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

  .join {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--g2);
  }

  .lan {
    display: flex;
    align-items: center;
    gap: var(--g2);
    padding: var(--g);
    padding-right: calc(var(--g2) * 1.5);
    border-radius: var(--r);
    background: var(--m1);
    box-shadow: var(--elev-rest);
  }

  /* About 13 cm on a 55-inch TV: a phone scans it from a step or two away. Parchment, not white: calm in a dim room, still a clean scan (the light-theme base). */
  .qr {
    display: block;
    width: 7rem;
    height: 7rem;
    border-radius: var(--r-ctl);
    background: #f7f1e4;
  }

  .lan-text {
    display: grid;
    gap: calc(var(--g) / 2);
  }

  .eyebrow {
    font-family: var(--font-meta);
    font-size: var(--fs-small);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--t3);
  }

  .lan-code {
    font-family: var(--font-value);
    font-weight: var(--fw-value);
    font-size: var(--fs-display);
    line-height: 1;
    letter-spacing: 0.12em;
    color: var(--accent-text);
  }

  .hint {
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .lan-off {
    display: flex;
    align-items: center;
    gap: var(--g);
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .lan-off :global(.bm-icon) {
    color: var(--warn);
  }

  .pair {
    display: flex;
    align-items: center;
    gap: var(--g);
    font-size: var(--fs-body);
    color: var(--t2);
  }

  .join.hosting .pair {
    font-size: var(--fs-small);
  }

  .code {
    font-family: var(--font-value);
    font-weight: var(--fw-value);
    letter-spacing: 0.04em;
    color: var(--accent-text);
  }

  .name {
    font-weight: var(--fw-value);
    color: var(--t);
  }
</style>
