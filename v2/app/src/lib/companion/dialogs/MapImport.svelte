<!--
  MapImport — getting one map in, from a picked file or a fetched link to a map ready for a
  game: read and examine it (progress), the squares dialog, the grid editor when asked, the
  upload with "Store as" (progress in the dialog's footer), then the map joins the shared
  library (every device upload does, parity UP-10) and `ondone` gets it. Failures show as
  notices and end the flow; nothing is half-added.

  Mount it with a `file`; it opens itself and calls `ondone` or `oncancel` exactly once.

  Props:
  - file: File — what the DM picked · commitLabel: string · table: {cols, rows} | null
  - ondone: (map: MapInfo) => void · oncancel: () => void
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
  import SquaresDialog from './SquaresDialog.svelte';

  interface Props {
    /** The picked file. */
    file: File;
    /** The squares dialog's commit text. */
    commitLabel?: string;
    /** Squares the table holds. */
    table?: { cols: number; rows: number } | null;
    /** The map is uploaded and in the shared library. */
    ondone: (map: MapInfo) => void;
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
  let finished = false;

  function finish(map: MapInfo | null): void {
    if (finished) return;
    finished = true;
    if (!map && prepared) noteLeftovers(prepared);
    releasePrepared(prepared);
    if (map) ondone(map);
    else oncancel();
  }

  /**
   * A cancelled import leaves the files "prepare" already uploaded on the server (rv#22, kept
   * knowingly: the store is content-addressed, so picking the same file again reuses them and
   * costs no second upload). Logged, so a leftover can be traced.
   */
  function noteLeftovers(p: PreparedMap): void {
    const handle = p.handle as { map?: MapInfo } | undefined;
    const m = handle?.map;
    log.info('companion', 'Import cancelled — its uploaded files stay on the server', {
      file: p.fileName, picture: m?.picture.hash ?? null, tableCopy: m?.tableCopy?.hash ?? null,
      geometry: m?.geometry?.hash ?? null, thumb: p.thumb?.hash ?? null,
    });
  }

  onMount(() => {
    const t0 = performance.now();
    void (async () => {
      format = await loadStoreAs();
      try {
        const p = await services().prepareMap(file, (value, label) => (reading = { value, label }));
        log.info('companion', 'Map examined', {
          file: file.name, bytes: file.size, kind: p.kind, w: p.pictureW, h: p.pictureH, found: p.finding.source,
          cols: p.grid.cols, rows: p.grid.rows, ms: Math.round(performance.now() - t0),
        });
        prepared = p;
        grid = p.grid;
      } catch (e) {
        log.warn('companion', 'Map not read', { file: file.name, error: String(e) });
        notify(e instanceof Error ? e.message : `Couldn't read ${file.name}.`, { kind: 'error' });
        finish(null);
      } finally {
        reading = null;
      }
    })();
    return () => releasePrepared(prepared);
  });

  async function commit(choices: MapChoices): Promise<void> {
    if (!prepared || uploading) return;
    void saveStoreAs(choices.format);
    uploading = { value: 0, label: 'Uploading' };
    const t0 = performance.now();
    try {
      const map = await services().uploadMap(prepared, choices, (value, label, detail) => (uploading = { value, label, detail }));
      uploading = { value: null, label: 'Adding it to the shared library' };
      const entry: LibraryEntry = {
        map: { ...map, libraryId: map.id }, thumb: prepared.thumb, addedAt: new Date().toISOString(),
        originalBytes: prepared.picture.size, note: null,
      };
      try {
        await services().libraryAdd(entry);
      } catch (e) {
        log.warn('companion', 'Map not added to the shared library', { error: String(e) });
        notify("The map is up, but it didn't make it into the shared library.", { kind: 'warning' });
      }
      log.info('companion', 'Map uploaded', { name: map.name, cols: map.grid.cols, rows: map.grid.rows, format: choices.format, ms: Math.round(performance.now() - t0) });
      finish({ ...map, libraryId: map.id });
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

{#if prepared && grid}
  <SquaresDialog
    open={!editor}
    {prepared}
    bind:grid
    bind:format
    {fitted}
    {commitLabel}
    {table}
    progress={uploading}
    oncommit={(c) => void commit(c)}
    onfit={(_g, tool) => (editor = { tool })}
    onclose={() => !uploading && finish(null)}
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
