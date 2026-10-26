<!--
  PdfPagePicker — "Which pages are maps?": a multi-page PDF's pages as thumbnails; the DM taps
  the ones to import (page 1 is picked to start with). Each picked page becomes its own map
  (MapImport takes them one after another through the squares dialog). Pages past the first 60
  aren't shown — the description says so.

  Props:
  - fileName: string · pageCount: number · thumbs: Blob[] — one per shown page, page 1 first
  - onpick: (pages: number[]) => void — the picked pages, from 1, in order · oncancel: () => void
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '../../ui/Button.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Icon from '../../ui/Icon.svelte';
  import { pickerSummary, togglePage } from './pdf-pages.ts';

  interface Props {
    /** The PDF's name. */
    fileName: string;
    /** Pages in the PDF. */
    pageCount: number;
    /** One thumbnail per shown page. */
    thumbs: Blob[];
    /** The DM picked these pages (from 1, in order). */
    onpick: (pages: number[]) => void;
    /** The DM stopped. */
    oncancel: () => void;
  }

  let { fileName, pageCount, thumbs, onpick, oncancel }: Props = $props();

  let picked = $state<number[]>([1]);
  const urls = $derived(thumbs.map((b) => URL.createObjectURL(b)));
  let shownUrls: string[] = [];
  $effect(() => {
    for (const u of shownUrls) if (!urls.includes(u)) URL.revokeObjectURL(u);
    shownUrls = urls;
  });
  onDestroy(() => {
    for (const u of shownUrls) URL.revokeObjectURL(u);
  });
  const summary = $derived(pickerSummary(picked.length, pageCount, thumbs.length));
</script>

<Dialog open title="Which pages are maps?" description="{fileName} · {summary.description}" icon="map" size="lg" onclose={oncancel}>
  <ul class="pages" aria-label="Pages of the PDF">
    {#each urls as url, i (url)}
      {@const page = i + 1}
      {@const on = picked.includes(page)}
      <li>
        <button
          type="button"
          class="page"
          class:on
          aria-pressed={on}
          aria-label="Page {page}"
          data-page={page}
          onclick={() => (picked = togglePage(picked, page))}
        >
          <img src={url} alt="" />
          <span class="no">
            {#if on}<Icon name="check" />{/if}
            Page {page}
          </span>
        </button>
      </li>
    {/each}
  </ul>
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={oncancel} />
    <Button label={summary.commit} icon="check" variant="primary" disabled={picked.length === 0} onclick={() => onpick(picked)} />
  {/snippet}
</Dialog>

<style>
  .pages {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: var(--g);
    max-height: min(60vh, 560px);
    overflow: auto;
    overscroll-behavior: contain;
  }

  .page {
    width: 100%;
    display: grid;
    gap: var(--m1);
    padding: var(--m1);
    border: 2px solid var(--hair);
    border-radius: var(--r-sm);
    background: var(--wash);
    color: var(--t);
    cursor: pointer;
    font: inherit;
  }

  .page.on {
    border-color: var(--accent);
  }

  .page:focus-visible {
    outline: var(--focus-w) solid var(--accent);
    outline-offset: var(--focus-offset);
  }

  img {
    width: 100%;
    aspect-ratio: 3 / 4;
    object-fit: contain;
    background: #fff;
    border-radius: var(--r-sm);
  }

  .no {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--m1);
    font-family: var(--font-value);
    font-size: var(--fs-small);
  }

  .page.on .no {
    color: var(--accent-text);
  }
</style>
