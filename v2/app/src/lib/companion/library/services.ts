/**
 * The IO the library, the dialogs and the tabs of this package need — one interface, so the
 * screens never care who implements it. `app-services.ts` implements it on the app's seams
 * (`$lib/api`, `$lib/import`, `$lib/storage`); the companion's root (`CompanionApp.svelte`) installs it once with
 * `setServices(appServices())` before any screen mounts, tests pass fakes the same way. No module
 * installs anything as a side effect of being imported (rv#33).
 */
import type { FileRef, LibraryEntry, MapGeometry, MapInfo, MapKind, RasterGrid } from '@battlemap/shared';

import type { StoreAs } from '../../api/index.ts';

export type { StoreAs };

/** Progress of a long step: a fraction 0–1 (null = unknown), what happens, an optional readout. */
export type ProgressFn = (fraction: number | null, label: string, detail?: string) => void;

/** What the importer found out about a picture's squares. */
export interface GridFinding {
  /** Where the counts come from: a drawn grid in the picture, the file name, the map file, nothing. */
  source: 'drawn' | 'fileName' | 'file' | 'none';
  /** Squares across (0 when nothing was found). */
  cols: number;
  /** Squares down. */
  rows: number;
  /** One square's size in picture px. */
  cellPx: number;
  /** Where a drawn grid starts inside the picture, px (0 when at the edge). */
  offsetX: number;
  /** Where a drawn grid starts, px down. */
  offsetY: number;
}

/** A picked file read and examined, not yet uploaded. */
export interface PreparedMap {
  /** The picked file's name ("cave_40x30.webp"). */
  fileName: string;
  /** The map name it suggests. */
  name: string;
  /** Picture or Dungeondraft map. */
  kind: MapKind;
  /** The picture to upload (a PDF already rendered to PNG). */
  picture: Blob;
  /** Its extension. */
  pictureExt: 'png' | 'jpg' | 'webp';
  /** Picture width in px. */
  pictureW: number;
  /** Picture height in px. */
  pictureH: number;
  /** An object URL of the picture for previews (revoke with `releasePrepared`). */
  previewUrl: string;
  /** Walls, doors and lights of a `.dd2vtt`, else null. */
  geometry: MapGeometry | null;
  /** The suggested grid (detected, from the name, from the file, or 20 across). */
  grid: RasterGrid;
  /** Whether battlemap should draw grid lines (false when the picture has its own). */
  drawGrid: boolean;
  /** What was found. */
  finding: GridFinding;
  /** True when no grid is known and the DM should measure one. */
  needsGrid: boolean;
  /** True when the picture is already uploaded (with the remembered "Store as"), so the
   * squares dialog can't offer another format. */
  formatChosen: boolean;
  /** The 288 px thumbnail for the library entry, when one was made. */
  thumb: FileRef | null;
  /** The implementation's own handle (the import result). */
  handle?: unknown;
}

/** What the DM decided in the squares dialog. */
export interface MapChoices {
  /** The map's name. */
  name: string;
  /** Where its squares lie. */
  grid: RasterGrid;
  /** Whether battlemap draws the grid. */
  drawGrid: boolean;
  /** How the server stores the picture. */
  format: StoreAs;
}

/** A table the server knows (`GET /api/tables`). */
export interface TableRow {
  /** The room id. */
  room: string;
  /** The TV's name. */
  tvName: string;
  /** Companions in the room. */
  companions: number;
}

/** Every IO this package does. */
export interface CompanionServices {
  /** Tables with a TV online. */
  listTables(): Promise<TableRow[]>;
  /** Reads and examines a picked file (`.dd2vtt`, PDF, picture). Throws a readable `Error`. */
  prepareMap(file: File, onProgress: ProgressFn): Promise<PreparedMap>;
  /** Uploads a prepared map with the DM's choices; returns the map ready for a game. */
  uploadMap(prepared: PreparedMap, choices: MapChoices, onProgress: ProgressFn): Promise<MapInfo>;
  /** Uploads one file (a DM layer). */
  uploadFile(blob: Blob, opts: { ext: FileRef['ext']; format: StoreAs }, onProgress: ProgressFn): Promise<FileRef>;
  /** The shared library, as stored. */
  libraryList(): Promise<LibraryEntry[]>;
  /** Adds a map to the shared library. */
  libraryAdd(entry: LibraryEntry): Promise<void>;
  /** Removes a map from the shared library. */
  libraryRemove(id: string): Promise<void>;
  /** Fetches the map behind a link (through the server); returns it as a file for `prepareMap`. */
  fetchLink(url: string, onProgress: ProgressFn): Promise<File>;
  /** Downloads a stored file (a DM layer, a thumbnail) as a blob, cached. */
  getFile(ref: FileRef): Promise<Blob>;
  /** The URL of a stored file (for `<img>`). */
  fileUrl(ref: FileRef): string;
  /** A remembered setting of this device. */
  getSetting<T>(key: string, fallback: T): Promise<T>;
  /** Remembers a setting on this device. */
  putSetting(key: string, value: unknown): Promise<void>;
}

let current: CompanionServices | null = null;

/**
 * Installs the implementation (the companion's root at start, tests with fakes).
 *
 * @param s - the services, or null to remove them
 */
export function setServices(s: CompanionServices | null): void {
  current = s;
}

/**
 * The services in use.
 *
 * @returns the installed implementation
 * @throws {Error} when nothing was installed
 */
export function services(): CompanionServices {
  if (!current) throw new Error('Companion services are not installed.');
  return current;
}

/**
 * Frees what a prepared map holds (its preview URL).
 *
 * @param p - the prepared map
 */
export function releasePrepared(p: PreparedMap | null): void {
  if (p?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
}
