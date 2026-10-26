/**
 * The app's `CompanionServices`, on its seams: `$lib/api` (files, shared library, link fetch),
 * `$lib/import` (examine a map, upload it once the squares are confirmed), `$lib/storage` (settings, the file cache).
 * Only the list of tables is a plain fetch (the API client has no call for it). The companion's
 * root installs it (`setServices(appServices())`); importing this module does nothing by itself.
 */
import type { FileRef, LibraryEntry } from '@battlemap/shared';
import { api } from '../../api/index.ts';
import { importFile, pdfPageThumbs, type ImportResult } from '../../import/index.ts';
import { log } from '../../log.ts';
import { files, settings } from '../../storage/index.ts';
import {
  type CompanionServices, type GridFinding, type MapChoices, type PreparedMap, type ProgressFn, type StoreAs, type TableRow,
  type UploadedMap,
} from './services.ts';
import { nameFromFile } from './library-logic.ts';

/** Settings keys of this package (storage's `SETTING` names where it has one). */
const KEYS: Record<string, string> = { storeAs: 'companion.storeAs', discLook: 'companion.discLook' };

/** "12.4 of 38 MB". */
function mbOf(loaded: number, total: number): string {
  return `${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
}

/** What the import found, in this package's words. */
function findingOf(r: ImportResult): GridFinding {
  const g = r.draft.grid;
  switch (r.gridOrigin) {
    case 'detected':
      return {
        source: 'drawn', cols: g.cols, rows: g.rows, cellPx: r.detection?.cellPx ?? g.cellW,
        offsetX: Math.max(0, g.x), offsetY: Math.max(0, g.y),
      };
    case 'name':
      return { source: 'fileName', cols: g.cols, rows: g.rows, cellPx: g.cellW, offsetX: 0, offsetY: 0 };
    case 'uvtt':
      return { source: 'file', cols: g.cols, rows: g.rows, cellPx: g.cellW, offsetX: 0, offsetY: 0 };
    default:
      return { source: 'none', cols: 0, rows: 0, cellPx: 0, offsetX: 0, offsetY: 0 };
  }
}

/**
 * Builds the services.
 *
 * @returns the services on the app's seams
 */
export function appServices(): CompanionServices {
  return {
    async listTables(serverUrl = api.serverUrl): Promise<TableRow[]> {
      const r = await fetch(`${serverUrl}/api/tables`, { signal: AbortSignal.timeout(5_000), cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { tables: TableRow[] }).tables;
    },

    async prepareMap(file: File, onProgress: ProgressFn, pdfPage?: number): Promise<PreparedMap> {
      // nothing is uploaded here: a cancelled squares dialog leaves nothing on the server
      const r = await importFile(file, (p) => onProgress(p.fraction, p.label.replace(/…$/, '')), pdfPage ? { pdfPage } : {});
      const d = r.draft;
      const pic = d.grid;
      return {
        fileName: file.name, name: pdfPage ? `${nameFromFile(file.name)} — page ${pdfPage}` : nameFromFile(file.name), kind: d.kind,
        picture: r.pictureBlob, pictureExt: d.pictureExt === 'jpg' || d.pictureExt === 'webp' ? d.pictureExt : 'png',
        pictureW: pic.pictureW, pictureH: pic.pictureH, previewUrl: URL.createObjectURL(r.pictureBlob),
        geometry: null, grid: d.grid, drawGrid: d.drawGrid, finding: findingOf(r),
        needsGrid: r.needsGrid && r.gridOrigin === 'default', handle: r,
      };
    },

    async pdfPages(file: File, onProgress: ProgressFn): Promise<{ pageCount: number; thumbs: Blob[] }> {
      onProgress(0, 'Reading the pages');
      const t0 = performance.now();
      const r = await pdfPageThumbs(file, 240, (done, total) => onProgress(done / total, `Reading page ${done} of ${total}`));
      log.info('companion', 'PDF pages read', { file: file.name, pages: r.pageCount, thumbs: r.thumbs.length, ms: Math.round(performance.now() - t0) });
      return r;
    },

    async uploadMap(p: PreparedMap, c: MapChoices, onProgress: ProgressFn): Promise<UploadedMap> {
      const r = p.handle as ImportResult;
      const t0 = performance.now();
      const { map, thumb } = await r.upload({ grid: c.grid, drawGrid: c.drawGrid, format: c.format }, (x) => {
        const label = x.label.replace(/…$/, '');
        onProgress(x.fraction, label, x.step === 'upload' ? `${Math.round(x.fraction * 100)} %` : undefined);
      });
      log.info('companion', 'Map files uploaded', { name: c.name, format: c.format, ms: Math.round(performance.now() - t0) });
      return { map: { ...map, name: c.name }, thumb };
    },

    async uploadFile(blob: Blob, opts: { ext: FileRef['ext']; format: StoreAs }, onProgress: ProgressFn): Promise<FileRef> {
      const res = await api.uploadFile(blob, { ext: opts.ext, format: opts.format }, (loaded, total) =>
        onProgress(total ? loaded / total : null, 'Uploading', mbOf(loaded, total)));
      void files.put(res, blob).catch(() => {});
      return { hash: res.hash, ext: res.ext, bytes: res.bytes };
    },

    libraryList: () => api.library.list(),

    async libraryAdd(entry: LibraryEntry): Promise<void> {
      await api.library.add(entry);
    },

    libraryRemove: (id: string) => api.library.remove(id),

    async fetchLink(url: string, onProgress: ProgressFn): Promise<File> {
      onProgress(null, 'Getting the map behind the link');
      const got = await api.fetchLink(url, (loaded, total) => onProgress(total ? loaded / total : null, 'Downloading the map', mbOf(loaded, total)));
      log.info('companion', 'Link fetched', { url, name: got.name, bytes: got.blob.size, kind: got.kind });
      const name = got.ext && !got.name.toLowerCase().endsWith(`.${got.ext}`) ? `${got.name}.${got.ext}` : got.name;
      return new File([got.blob], name, { type: got.blob.type });
    },

    getFile: (ref: FileRef) => files.get(ref),

    fileUrl: (ref: FileRef) => api.fileUrl(ref),

    async getSetting<T>(key: string, fallback: T): Promise<T> {
      try {
        const v = await settings.get<T>(KEYS[key] ?? `companion.${key}`);
        return v === null ? fallback : v;
      } catch (e) {
        log.warn('companion', 'Setting not read', { key, error: String(e) });
        return fallback;
      }
    },

    async putSetting(key: string, value: unknown): Promise<void> {
      try {
        await settings.put(KEYS[key] ?? `companion.${key}`, value);
      } catch (e) {
        log.warn('companion', 'Setting not kept', { key, error: String(e) });
      }
    },
  };
}

