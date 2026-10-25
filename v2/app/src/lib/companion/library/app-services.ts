/**
 * The app's `CompanionServices`, on its seams: `$lib/api` (files, shared library, link fetch),
 * `$lib/import` (examine + upload a map, regrid it), `$lib/storage` (settings, the file cache).
 * Only the list of tables is a plain fetch (the API client has no call for it). Importing this
 * module registers it as the default (`setServicesFactory`).
 */
import type { FileRef, LibraryEntry, MapInfo } from '@battlemap/shared';
import { api } from '../../api/index.ts';
import { importFile, type ImportResult } from '../../import/index.ts';
import { log } from '../../log.ts';
import { files, settings } from '../../storage/index.ts';
import {
  setServicesFactory, type CompanionServices, type GridFinding, type MapChoices, type PreparedMap, type ProgressFn, type StoreAs, type TableRow,
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
  const g = r.map.grid;
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
    async listTables(): Promise<TableRow[]> {
      const r = await fetch(`${api.serverUrl}/api/tables`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { tables: TableRow[] }).tables;
    },

    async prepareMap(file: File, onProgress: ProgressFn): Promise<PreparedMap> {
      const format = await this.getSetting<StoreAs>('storeAs', 'asis');
      const r = await importFile(file, (p) => onProgress(p.fraction, p.label.replace(/…$/, '')), { format });
      const pic = r.map.grid;
      return {
        fileName: file.name, name: r.map.name || nameFromFile(file.name), kind: r.map.kind,
        picture: r.pictureBlob, pictureExt: r.map.picture.ext === 'jpg' || r.map.picture.ext === 'webp' ? r.map.picture.ext : 'png',
        pictureW: pic.pictureW, pictureH: pic.pictureH, previewUrl: URL.createObjectURL(r.pictureBlob),
        geometry: null, grid: r.map.grid, drawGrid: r.map.drawGrid, finding: findingOf(r),
        needsGrid: r.needsGrid && r.gridOrigin === 'default', formatChosen: true, thumb: r.thumb, handle: r,
      };
    },

    async uploadMap(p: PreparedMap, c: MapChoices, onProgress: ProgressFn): Promise<MapInfo> {
      const r = p.handle as ImportResult;
      const map = await r.regrid(c.grid, c.drawGrid, (x) => onProgress(x.fraction, x.label.replace(/…$/, '')));
      return { ...map, name: c.name };
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

setServicesFactory(() => appServices());
