<!--
  SharedLibrary — the server's maps, for every game (parity §19): browse (cards, newest first,
  filtered by the search), fill (a link with a paste button: picture, PDF, .dd2vtt, a page's
  main picture, Drive, Dropbox — or "Upload from this device"), prune (Remove, after a question:
  games that use the map keep their copy). "Store as" sits at the foot and is remembered.
  Reloads itself on mount and after every change.

  A picked file or a fetched link comes out as `onfile` — the parent runs the import flow
  (MapImport) and calls `reload()` afterwards.

  Props:
  - mode: 'play' (a card starts a new game) | 'add' (a card adds the map to the open game)
  - inGame: string[] — library ids already in the open game ("In this game")
  - query: string — the search · busyId: string | null — the card being opened
  - onpick: (entry) => void · onfile: (file: File) => void
  - columns: 'grid' | 'list' — cards in a grid (library screen) or rows (side sheet)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { LibraryEntry } from '@battlemap/shared';
  import { log } from '../../log.ts';
  import Badge from '../../ui/Badge.svelte';
  import Button from '../../ui/Button.svelte';
  import Card from '../../ui/Card.svelte';
  import Dialog from '../../ui/Dialog.svelte';
  import Field from '../../ui/Field.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import ListRow from '../../ui/ListRow.svelte';
  import Section from '../../ui/Section.svelte';
  import Segmented from '../../ui/Segmented.svelte';
  import Spinner from '../../ui/Spinner.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import { mapMeta, visibleEntries } from './library-logic.ts';
  import { services, type StoreAs } from './services.ts';
  import { loadStoreAs, saveStoreAs, STORE_AS_HINTS, STORE_AS_OPTIONS } from './store-as.ts';

  interface Props {
    /** What a card does. */
    mode?: 'play' | 'add';
    /** Library ids already in the open game. */
    inGame?: string[];
    /** The search. */
    query?: string;
    /** The card being opened (spinner, others wait). */
    busyId?: string | null;
    /** A map was chosen. */
    onpick: (entry: LibraryEntry) => void;
    /** A file to import (picked or fetched). */
    onfile: (file: File) => void;
    /** Cards in a grid or rows in a list. */
    columns?: 'grid' | 'list';
  }

  let { mode = 'play', inGame = [], query = '', busyId = null, onpick, onfile, columns = 'grid' }: Props = $props();

  let entries = $state.raw<LibraryEntry[] | null>(null);
  let failed = $state(false);
  let loading = $state(false);
  let link = $state('');
  let fetching = $state(false);
  let storeAs = $state<StoreAs>('asis');
  let removing = $state<LibraryEntry | null>(null);
  let removeBusy = $state(false);
  let picker: HTMLInputElement | undefined = $state();

  const shown = $derived(visibleEntries(entries ?? [], query));

  /** Reloads the list (also called by the parent after an import). */
  export async function reload(): Promise<void> {
    loading = true;
    const t0 = performance.now();
    try {
      entries = await services().libraryList();
      failed = false;
      log.info('companion', 'Shared library listed', { count: entries.length, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      failed = true;
      log.warn('companion', 'Shared library not listed', { error: String(e) });
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void reload();
    void loadStoreAs().then((v) => (storeAs = v));
  });

  async function fetchLink(): Promise<void> {
    const url = link.trim();
    if (!url) {
      notify('Type or paste a link first.', { kind: 'info' });
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      notify('That is not a web link (it must start with http:// or https://).', { kind: 'warning' });
      return;
    }
    fetching = true;
    try {
      const file = await services().fetchLink(url, () => {});
      link = '';
      onfile(file);
    } catch (e) {
      log.warn('companion', 'Link not fetched', { url, error: String(e) });
      notify(`Couldn't get the map: ${e instanceof Error ? e.message : String(e)}`, { kind: 'error' });
    } finally {
      fetching = false;
    }
  }

  async function paste(): Promise<void> {
    if (!navigator.clipboard?.readText) {
      notify('This page has no clipboard access (plain http) — long-press the field and paste there.', { kind: 'info' });
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        notify('Nothing to paste — long-press the field and paste there.', { kind: 'info' });
        return;
      }
      link = text;
      await fetchLink();
    } catch {
      notify('The clipboard was not given — long-press the field and paste there.', { kind: 'info' });
    }
  }

  async function confirmRemove(): Promise<void> {
    const e = removing;
    if (!e) return;
    removeBusy = true;
    try {
      await services().libraryRemove(e.map.id);
      notify(`“${e.map.name}” removed`, { kind: 'success' });
      log.info('companion', 'Shared map removed', { id: e.map.id, name: e.map.name });
      removing = null;
      await reload();
    } catch (err) {
      log.warn('companion', 'Shared map not removed', { id: e.map.id, error: String(err) });
      notify(`Couldn't remove “${e.map.name}”.`, { kind: 'error' });
    } finally {
      removeBusy = false;
    }
  }

  function picked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) onfile(file);
  }

  const inGameSet = $derived(new Set(inGame));
  const thumb = (e: LibraryEntry) => (e.thumb ? services().fileUrl(e.thumb) : undefined);
</script>

<div class="shared" class:list={columns === 'list'}>
  <Section title="Add a map">
    <div class="add">
      <div class="link-row">
        <div class="link">
          <Field
            label="From a link"
            type="url"
            inputmode="url"
            enterkeyhint="go"
            icon="link"
            placeholder="Picture, PDF, .dd2vtt, a page, Drive, Dropbox"
            bind:value={link}
            onenter={() => void fetchLink()}
            disabled={fetching}
          >
            {#snippet trailing()}
              <IconButton icon="paste" label="Paste the link and get the map" variant="quiet" loading={fetching} onclick={() => void paste()} />
            {/snippet}
          </Field>
        </div>
        <Button label="Get the map" icon="download" disabled={!link.trim()} loading={fetching} onclick={() => void fetchLink()} />
      </div>
      <div class="row">
        <Button label="Upload from this device" icon="upload" variant="flat" onclick={() => picker?.click()} />
      </div>
      <input bind:this={picker} type="file" hidden onchange={picked} />
      <div class="store">
        <span class="bm-eyebrow">Store as</span>
        <Segmented label="Store as" options={STORE_AS_OPTIONS} bind:value={storeAs} block onchange={(v) => void saveStoreAs(v as StoreAs)} />
        <p class="hint">{STORE_AS_HINTS[storeAs]}</p>
      </div>
    </div>
  </Section>

  <Section title={entries ? `On the server · ${entries.length}` : 'On the server'}>
    {#snippet trailing()}
      <IconButton icon="sync" label="Reload the shared library" variant="quiet" loading={loading && entries !== null} onclick={() => void reload()} />
    {/snippet}
    {#if entries === null && !failed}
      <div class="state"><Spinner label="Loading the shared library…" /></div>
    {:else if failed}
      <p class="state">Can't reach the shared library — check the connection.</p>
    {:else if shown.length === 0}
      <p class="state">{query ? 'No map matches the search.' : 'No maps yet. Add one from a link or from this device.'}</p>
    {:else if columns === 'grid'}
      <div class="grid" data-testid="shared-maps">
        {#each shown as e (e.map.id)}
          {@const here = inGameSet.has(e.map.id)}
          <Card
            title={e.map.name}
            meta={mapMeta(e.map)}
            image={thumb(e)}
            disabled={(busyId !== null && busyId !== e.map.id) || (mode === 'add' && here)}
            onclick={() => onpick(e)}
          >
            {#snippet badges()}
              {#if busyId === e.map.id}<Spinner size="16px" />{:else if here}<Badge text="In this game" />{/if}
            {/snippet}
            {#snippet actions()}
              <IconButton icon="more" label="More for {e.map.name}" variant="quiet" menu={[{ id: 'remove', label: 'Remove from the shared library', icon: 'delete', danger: true }]} onmenu={() => (removing = e)} />
            {/snippet}
          </Card>
        {/each}
      </div>
    {:else}
      <ul class="rows">
        {#each shown as e (e.map.id)}
          {@const here = inGameSet.has(e.map.id)}
          <li>
            <ListRow title={e.map.name} sub={mapMeta(e.map)} icon={thumb(e) ? undefined : 'map'} disabled={mode === 'add' && here} onclick={() => onpick(e)}>
              {#snippet leading()}{#if thumb(e)}<img class="th" src={thumb(e)} alt="" />{/if}{/snippet}
              {#snippet trailing()}
                {#if busyId === e.map.id}<Spinner size="16px" />{:else if here}<Badge text="In this game" />{:else}<Badge text={mode === 'add' ? 'Add' : 'Play'} tone="accent" />{/if}
                <IconButton icon="delete" label="Remove {e.map.name} from the shared library" variant="quiet" onclick={() => (removing = e)} />
              {/snippet}
            </ListRow>
          </li>
        {/each}
      </ul>
    {/if}
  </Section>
</div>

<Dialog
  open={removing !== null}
  title="Remove from the shared library?"
  description={removing ? `“${removing.map.name}” is removed from the server. Games that already use it keep their copy.` : ''}
  icon="delete"
  size="sm"
  onclose={() => (removing = null)}
>
  {#snippet footer()}
    <Button label="Keep it" variant="flat" onclick={() => (removing = null)} />
    <Button label="Remove" icon="delete" variant="primary" tone="danger" loading={removeBusy} onclick={() => void confirmRemove()} />
  {/snippet}
</Dialog>

<style>
  .shared {
    display: flex;
    flex-direction: column;
    gap: var(--g2);
  }

  /* the form keeps a readable width on a wide library; the maps below use the full width */
  .add {
    display: grid;
    gap: var(--g);
    max-width: 40rem;
  }

  .link-row {
    display: flex;
    align-items: flex-end;
    gap: var(--g);
  }

  .link {
    flex: 1;
    min-width: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g);
  }

  .store {
    display: grid;
    gap: calc(var(--g) / 2);
    margin-top: var(--g);
  }

  /* the side sheet (rows) and the phone: the button goes under the field */
  .list .link-row {
    flex-direction: column;
    align-items: stretch;
  }

  @media (max-width: 719px) {
    .link-row {
      flex-direction: column;
      align-items: stretch;
    }
  }

  .hint,
  .state {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .state {
    padding: var(--g2) 0;
    text-align: center;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--g2);
  }

  .rows {
    list-style: none;
    margin: 0 calc(var(--g) * -1);
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .th {
    width: 48px;
    height: 36px;
    object-fit: cover;
    border-radius: var(--r-sm);
  }
</style>
