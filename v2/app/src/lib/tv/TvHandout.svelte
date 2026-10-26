<!--
  TvHandout — a handout on the TV (`docs/features.md` "table moments"): a picture or a letter,
  upright for the players at one side of the table. At the edge it is a card against that side
  and the map stays; full screen it is a pause card over a dark table (the remote's Back, or the
  tablet, takes it off). A picture comes from the device's cache (fetched once from the server;
  a spinner while it loads); a letter is parchment with its name in the story face. Draws
  nothing for a handout that is gone.

  Props:
  - handout: Handout — what to show
  - shown: HandoutShown — where and for which side
  - files: (ref: FileRef) => Promise<Blob> — the device's file cache
-->
<script lang="ts">
  import type { FileRef, Handout, HandoutShown } from '@battlemap/shared';
  import { log } from '../log.ts';
  import Spinner from '../ui/Spinner.svelte';
  import { handoutPlacement, letterSize } from './handout.ts';

  interface Props {
    /** The handout. */
    handout: Handout;
    /** Where and for which side. */
    shown: HandoutShown;
    /** Loads a file (cache first). */
    files: (ref: FileRef) => Promise<Blob>;
  }

  let { handout, shown, files }: Props = $props();

  let url = $state<string | null>(null);
  let failed = $state(false);
  const place = $derived(handoutPlacement(shown.place, shown.side));
  const fileKey = $derived(handout.file ? `${handout.file.hash}.${handout.file.ext}` : '');

  // the picture: from the cache as an object URL, freed when it changes or the card goes
  $effect(() => {
    const ref = handout.kind === 'picture' ? handout.file : null;
    void fileKey;
    url = null;
    failed = false;
    if (!ref) return;
    let gone = false;
    let made: string | null = null;
    const t0 = performance.now();
    files(ref).then(
      (blob) => {
        if (gone) return;
        made = URL.createObjectURL(blob);
        url = made;
        log.info('tv', 'Handout picture loaded', { hash: ref.hash, bytes: blob.size, ms: Math.round(performance.now() - t0) });
      },
      (e: unknown) => {
        if (gone) return;
        failed = true;
        log.warn('tv', 'Handout picture failed', { hash: ref.hash, error: String(e) });
      },
    );
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  });
</script>

<div class="handout" class:full={shown.place === 'full'} data-testid="tv-handout" data-place={shown.place} data-side={shown.side}>
  <div
    class="card"
    class:letter={handout.kind === 'letter'}
    data-theme={handout.kind === 'letter' ? 'light' : undefined}
    style:transform={place.transform}
    style:max-width={place.maxWidth}
    style:max-height={place.maxHeight}
  >
    {#if handout.kind === 'letter'}
      <h2 class="title">{handout.name}</h2>
      <p class="text" style:font-size="{letterSize(handout.text, shown.place)}rem">{handout.text}</p>
    {:else}
      {#if url}
        <img class="pic" src={url} alt={handout.name} style:max-height="calc({place.maxHeight} - {handout.text ? '3.4rem' : '1.2rem'})" />
      {:else if failed}
        <p class="missing">The picture didn't load</p>
      {:else}
        <div class="wait"><Spinner size="2rem" label="Loading the picture" /></div>
      {/if}
      {#if handout.text}<p class="caption">{handout.text}</p>{/if}
    {/if}
  </div>
</div>

<style>
  .handout {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }

  .handout.full {
    background: rgb(14 12 10 / 0.94);
    animation: fade 320ms ease-out both;
  }

  .card {
    position: absolute;
    left: 50%;
    top: 50%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem;
    border-radius: var(--r);
    background: var(--m1);
    box-shadow: 0 0 0 1px var(--hair-strong);
    color: var(--t);
    overflow: hidden;
    animation: fade 320ms ease-out both;
  }

  .card.letter {
    padding: 1rem 1.3rem;
    background: var(--m0);
    width: max-content;
  }

  .title {
    margin: 0;
    font-family: var(--font-headline);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--t);
    text-align: center;
  }

  .text {
    margin: 0;
    max-width: 30em;
    font-family: var(--font-body);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--t);
  }

  .pic {
    display: block;
    max-width: 100%;
    object-fit: contain;
    border-radius: var(--r-sm);
  }

  .caption {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--t2);
    text-align: center;
  }

  .wait,
  .missing {
    display: grid;
    place-items: center;
    min-width: 8rem;
    min-height: 5rem;
    margin: 0;
    color: var(--t2);
    font-size: 0.7rem;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
