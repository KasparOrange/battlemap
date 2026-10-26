<!--
  MapImport — getting one map in, from a picked file or a fetched link to a map ready for a
  game: read and examine it (progress — nothing goes to the server yet), the squares dialog, the
  grid editor when asked, then — only once the squares are confirmed — the upload with "Store
  as" (progress in the dialog's footer); the map joins the shared library (every device upload
  does, parity UP-10) and `ondone` gets it. A cancelled import leaves nothing on the server.
  Failures show as notices; a failed upload can be tried again from the same dialog.
  A PDF of several pages first shows the page picker (PdfPagePicker): every picked page becomes
  its own map, one after another through the squares dialog. Stopping at page k keeps the maps
  already uploaded.

  Mount it with a `file`; it opens itself and calls `ondone` or `oncancel` exactly once.

  Props:
  - file: File — what the DM picked · commitLabel: string · table: {cols, rows} | null
  - ondone: (maps: MapInfo[]) => void — one map, or one per picked PDF page · oncancel: () => void
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { LibraryEntry, MapInfo, RasterGrid } from '@battlemap/shared';
  import { log } from '../../log.ts';
  import Dialog from '../../ui/Dialog.svelte';
  import ProgressBar from '../../ui/ProgressBar.svelte';
  import { notify } from '../../ui/notice.svelte.ts';
  import { releasePrepared, services, type MapChoices, type PreparedMap, type StoreAs } from '../library/services.ts';
  import { loadStoreAs, saveStoreAs } from '../library/store-as.ts';
  import GridEditor from './grid-editor/GridEditor.svelte';
  import PdfPagePicker from './PdfPagePicker.svelte';
  import { isPdfFile, pageCommitLabel } from './pdf-pages.ts';
  import SquaresDialog from './SquaresDialog.svelte';

  interface Props {
    /** The picked file. */
    file: File;
    /** The squares dialog's commit text. */
    commitLabel?: string;
    /** Squares the table holds. */
    table?: { cols: number; rows: number } | null;
    /** The maps are uploaded and in the shared library (several for several PDF pages). */
    ondone: (maps: MapInfo[]) => void;
    /** The DM stopped, or it failed. */
    oncancel: () => void;
  }

  let { file, commitLabel = 'Upload and play', table = null, ondone, oncancel }: Props = $props();

  let prepared = $state.raw<PreparedMap | null>(null);
  let grid = $state.raw<RasterGrid | null>(null);
  let fitted = $state(false);
  let format = $state<StoreAs>('asis');
  let reading = $state<{ value: number | null; label: string } | null>({ value: null, label: 'Reading the file' });
  let uploading = $state<{ value: number | null; label: string; detail?: string } | null>(null);
  let editor = $state<{ tool: 'fit' | 'length' } | null>(null);
  /** A multi-page PDF waiting for the DM's pick. */
  let pages = $state.raw<{ pageCount: number; thumbs: Blob[] } | null>(null);
  /** The PDF pages to import, in order (`[undefined]` for any other file). */
  let queue = $state.raw<(number | undefined)[]>([undefined]);
  /** Which of `queue` is in the squares dialog now. */
  let step = $state(0);
  const done: MapInfo[] = [];
  let finished = false;

  function finish(): void {
    if (finished) return;
    finished = true;
    if (prepared && done.length < queue.length) log.info('companion', 'Import stopped — the rest was not uploaded', { file: prepared.fileName, uploaded: done.length, picked: queue.length });
    releasePrepared(prepared);
    prepared = null;
    if (done.length > 0) ondone([...done]);
    else oncancel();
  }

  /** Reads `queue[step]` and opens the squares dialog for it. */
  async function readStep(): Promise<void> {
    const t0 = performance.now();
    const page = queue[step];
    reading = { value: null, label: page ? `Reading page ${page}` : 'Reading the file' };
    try {
      const p = await services().prepareMap(file, (value, label) => (reading = { value, label }), page);
      log.info('companion', 'Map examined', {
        file: file.name, page: page ?? null, bytes: file.size, kind: p.kind, w: p.pictureW, h: p.pictureH, found: p.finding.source,
        cols: p.grid.cols, rows: p.grid.rows, ms: Math.round(performance.now() - t0),
      });
      prepared = p;
      grid = p.grid;
      fitted = false;
    } catch (e) {
      log.warn('companion', 'Map not read', { file: file.name, page: page ?? null, error: String(e) });
      notify(e instanceof Error ? e.message : `Couldn't read ${file.name}.`, { kind: 'error' });
      finish();
    } finally {
      reading = null;
    }
  }

  /** The DM picked pages of a multi-page PDF. */
  function pickedPages(picked: number[]): void {
    pages = null;
    log.info('companion', 'PDF pages picked', { file: file.name, pages: picked });
    queue = picked;
    step = 0;
    void readStep();
  }

  onMount(() => {
    void (async () => {
      format = await loadStoreAs();
      if (isPdfFile(file.name, new Uint8Array(await file.slice(0, 5).arrayBuffer()))) {
        reading = { value: 0, label: 'Reading the pages' };
        try {
          const r = await services().pdfPages(file, (value, label) => (reading = { value, label }));
          reading = null;
          if (r.pageCount > 1) {
            pages = r;
            return;
          }
        } catch (e) {
          log.warn('companion', 'PDF pages not read', { file: file.name, error: String(e) });
          notify(e instanceof Error ? e.message : `Couldn't read ${file.name}.`, { kind: 'error' });
          reading = null;
          finish();
          return;
        }
      }
      await readStep();
    })();
    return () => releasePrepared(prepared);
  });

  async function commit(choices: MapChoices): Promise<void> {
    if (!prepared || uploading) return;
    void saveStoreAs(choices.format);
    uploading = { value: 0, label: 'Uploading' };
    const t0 = performance.now();
    try {
      const { map, thumb } = await services().uploadMap(prepared, choices, (value, label, detail) => (uploading = { value, label, detail }));
      uploading = { value: null, label: 'Adding it to the shared library' };
      const entry: LibraryEntry = {
        map: { ...map, libraryId: map.id }, thumb, addedAt: new Date().toISOString(),
        originalBytes: prepared.picture.size, note: null,
      };
      try {
        await services().libraryAdd(entry);
      } catch (e) {
        log.warn('companion', 'Map not added to the shared library', { error: String(e) });
        notify("The map is up, but it didn't make it into the shared library.", { kind: 'warning' });
      }
      log.info('companion', 'Map uploaded', { name: map.name, page: queue[step] ?? null, cols: map.grid.cols, rows: map.grid.rows, format: choices.format, ms: Math.round(performance.now() - t0) });
      done.push({ ...map, libraryId: map.id });
      uploading = null;
      if (step + 1 < queue.length) {
        releasePrepared(prepared);
        prepared = null;
        step++;
        await readStep();
      } else finish();
    } catch (e) {
      log.error('companion', 'Upload failed', { file: file.name, error: String(e) });
      notify(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, { kind: 'error' });
      uploading = null;
    }
  }
</script>

{#if reading}
  <Dialog open title="Getting the map ready" description={file.name} icon="map" size="sm" dismissible={false}>
    <ProgressBar value={reading.value ?? undefined} label={reading.label} />
  </Dialog>
{/if}

{#if pages}
  <PdfPagePicker fileName={file.name} pageCount={pages.pageCount} thumbs={pages.thumbs} onpick={pickedPages} oncancel={finish} />
{/if}

{#if prepared && grid}
  <SquaresDialog
    open={!editor}
    {prepared}
    bind:grid
    bind:format
    {fitted}
    commitLabel={pageCommitLabel(commitLabel, step, queue.length)}
    {table}
    progress={uploading}
    oncommit={(c) => void commit(c)}
    onfit={(_g, tool) => (editor = { tool })}
    onclose={() => !uploading && finish()}
  />
  {#if editor}
    <GridEditor
      open
      src={prepared.previewUrl}
      start={grid}
      detected={prepared.finding.source === 'drawn' ? prepared.grid : null}
      tool={editor.tool}
      {table}
      applyLabel="Use this grid"
      onapply={(g) => {
        grid = g;
        fitted = true;
        editor = null;
      }}
      onclose={() => (editor = null)}
    />
  {/if}
{/if}
