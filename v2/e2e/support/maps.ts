/**
 * The test map set as fixtures: the ten maps of the old game night (`../../docs/test-session.md`
 * "maps") with their real names, squares and door counts, but synthetic content — a generated
 * picture (four tinted rooms, grid lines) and a generated geometry (a cross of walls splitting
 * the map into four rooms, doors cut into those walls). No third-party map is committed or
 * needed; importing the real files is the import package's flow (`e2e/import-*`).
 *
 * The rooms make fog checks exact: with every door closed a room fill from the top-left square
 * covers exactly the top-left quadrant; door 0 always joins top-left and top-right.
 *
 * `uploadMap` stores picture + geometry on the server (`POST /files`) and returns a `MapInfo`;
 * on a server without `/files` yet it falls back to locally hashed refs (the state flows still
 * work, the TV just can't load the picture).
 */
import { createHash } from 'node:crypto';
import { newId, wholeGrid, type FileRef, type MapGeometry, type MapInfo } from '../../shared/src/index.ts';
import { mapPicture } from './png.ts';

/** One map of the set. */
export interface FixtureMap {
  /** Short key used by the flows ("tavern", "lair", …). */
  key: string;
  /** The old set's file name (for the report). */
  file: string;
  /** Name shown in the game. */
  name: string;
  /** Squares across. */
  cols: number;
  /** Squares down. */
  rows: number;
  /** Doors in the geometry (0 = a picture map without geometry). */
  doors: number;
  /** `uvtt` (walls + doors) or `picture`. */
  kind: 'uvtt' | 'picture';
  /** Pixels per square of the generated picture. */
  px: number;
  /** Whether the picture has its own grid lines (battlemap then draws none). */
  ownGrid: boolean;
}

/** The ten maps (plus the PDF's stand-in), in the old set's order. */
export const MAP_SET: readonly FixtureMap[] = [
  { key: 'house', file: '01-eldrica-house-10x8.dd2vtt', name: 'Eldrica house', cols: 10, rows: 8, doors: 2, kind: 'uvtt', px: 64, ownGrid: false },
  { key: 'home', file: '02-small-home-16x18.uvtt', name: 'Small home', cols: 16, rows: 18, doors: 29, kind: 'uvtt', px: 48, ownGrid: false },
  { key: 'tavern', file: '03-przerzut-16x16.dd2vtt', name: 'Przerzut tavern', cols: 16, rows: 16, doors: 12, kind: 'uvtt', px: 48, ownGrid: false },
  { key: 'lair', file: '04-vampire-lair-19x14.dd2vtt', name: 'Vampire lair', cols: 19, rows: 14, doors: 5, kind: 'uvtt', px: 48, ownGrid: false },
  { key: 'towerGround', file: '05-tower-ground-11x11.dd2vtt', name: 'Tower ground', cols: 11, rows: 11, doors: 3, kind: 'uvtt', px: 64, ownGrid: false },
  { key: 'towerUpper', file: '06-tower-upper-11x11.dd2vtt', name: 'Tower upper', cols: 11, rows: 11, doors: 2, kind: 'uvtt', px: 64, ownGrid: false },
  { key: 'castle', file: '07-STRESS-castle-114x64-30MB.dd2vtt', name: 'STRESS castle', cols: 114, rows: 64, doors: 57, kind: 'uvtt', px: 40, ownGrid: false },
  { key: 'lairImage', file: '08a-vampire-lair-image-19x14.jpg', name: 'Vampire lair (image)', cols: 19, rows: 14, doors: 0, kind: 'picture', px: 72, ownGrid: true },
  { key: 'homeImage', file: '08b-small-home-image-16x18.webp', name: 'Small home (image)', cols: 16, rows: 18, doors: 0, kind: 'picture', px: 48, ownGrid: false },
  { key: 'dyson', file: '09-dyson-twelve-goats-tavern-6000px.png', name: 'Twelve goats tavern', cols: 25, rows: 25, doors: 0, kind: 'picture', px: 96, ownGrid: true },
  { key: 'pdf', file: 'test_map.pdf', name: 'PDF map', cols: 20, rows: 15, doors: 0, kind: 'picture', px: 48, ownGrid: false },
];

/**
 * A map of the set by key.
 *
 * @param key - e.g. `tavern`
 * @returns the fixture
 * @throws Error for an unknown key
 */
export function fixture(key: string): FixtureMap {
  const m = MAP_SET.find((f) => f.key === key);
  if (!m) throw new Error(`no fixture map "${key}"`);
  return m;
}

/**
 * The fixture's geometry: outer walls, a vertical and a horizontal wall through the middle, and
 * `doors` one-square doors cut into the middle walls (door 0 in the top half of the vertical
 * wall, door 1 in the left half of the horizontal one, then alternating outwards).
 *
 * @param f - the fixture
 * @returns walls, doors (no lights)
 */
export function fixtureGeometry(f: FixtureMap): MapGeometry {
  const mx = Math.ceil(f.cols / 2);
  const my = Math.ceil(f.rows / 2);
  // Unit door slots along the two middle walls, in the order doors are placed.
  const vSlots: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  const hSlots: typeof vSlots = [];
  for (let i = 0; i < Math.max(f.rows, f.cols); i++) {
    for (const y of [my - 1 - i, my + i]) if (y >= 0 && y < f.rows && i < f.rows) vSlots.push({ a: { x: mx, y }, b: { x: mx, y: y + 1 } });
    for (const x of [mx - 1 - i, mx + i]) if (x >= 0 && x < f.cols && i < f.cols) hSlots.push({ a: { x, y: my }, b: { x: x + 1, y: my } });
  }
  const doors: MapGeometry['doors'] = [];
  const used = new Set<string>();
  // Door 0: top half of the vertical wall (joins the two top rooms); door 1: left half of the horizontal wall.
  const order = [...interleave(vSlots.filter((s) => s.a.y < my), hSlots.filter((s) => s.a.x < mx)), ...interleave(vSlots.filter((s) => s.a.y >= my), hSlots.filter((s) => s.a.x >= mx))];
  for (const s of order) {
    if (doors.length >= f.doors) break;
    const k = `${s.a.x},${s.a.y},${s.b.x},${s.b.y}`;
    if (used.has(k)) continue;
    used.add(k);
    doors.push(s);
  }
  const walls: MapGeometry['walls'] = [
    [{ x: 0, y: 0 }, { x: f.cols, y: 0 }, { x: f.cols, y: f.rows }, { x: 0, y: f.rows }, { x: 0, y: 0 }],
  ];
  // The middle walls as unit segments, except where a door sits (a closed door blocks by itself).
  for (let y = 0; y < f.rows; y++) if (!used.has(`${mx},${y},${mx},${y + 1}`)) walls.push([{ x: mx, y }, { x: mx, y: y + 1 }]);
  for (let x = 0; x < f.cols; x++) if (!used.has(`${x},${my},${x + 1},${my}`)) walls.push([{ x, y: my }, { x: x + 1, y: my }]);
  return { walls, doors, lights: [] };
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/** Cells of the top-left room (the quadrant a room fill from square 0 must cover with doors closed). */
export function topLeftRoom(f: FixtureMap): number[] {
  const mx = Math.ceil(f.cols / 2);
  const my = Math.ceil(f.rows / 2);
  const out: number[] = [];
  for (let r = 0; r < my; r++) for (let c = 0; c < mx; c++) out.push(r * f.cols + c);
  return out;
}

/** Picture bytes per fixture key (generating the castle takes a moment; do it once). */
const pictures = new Map<string, Uint8Array>();

/**
 * The fixture's picture as PNG bytes.
 *
 * @param f - the fixture
 * @returns the PNG
 */
export function fixturePicture(f: FixtureMap): Uint8Array {
  let p = pictures.get(f.key);
  if (!p) {
    p = mapPicture(f.cols, f.rows, f.px, f.ownGrid);
    pictures.set(f.key, p);
  }
  return p;
}

/** Whether the server has `POST /files` (null = not asked yet), per server URL. */
const filesRoute = new Map<string, boolean>();

/**
 * Stores one file on the server, or makes a local ref when the server has no `/files` yet.
 *
 * @param serverUrl - the server's base URL
 * @param bytes - the content
 * @param ext - its kind
 * @returns the ref and whether the server really has it
 */
export async function putFile(serverUrl: string, bytes: Uint8Array, ext: FileRef['ext']): Promise<{ ref: FileRef; stored: boolean }> {
  if (filesRoute.get(serverUrl) !== false) {
    try {
      const r = await fetch(`${serverUrl}/files?ext=${ext}&format=asis`, { method: 'POST', body: new Blob([bytes as Uint8Array<ArrayBuffer>]), headers: { 'content-type': ext === 'json' ? 'application/json' : `image/${ext}` } });
      if (r.ok) {
        filesRoute.set(serverUrl, true);
        return { ref: (await r.json()) as FileRef, stored: true };
      }
      if (r.status === 404 || r.status === 405) filesRoute.set(serverUrl, false);
      else throw new Error(`POST /files: HTTP ${r.status} ${await r.text()}`);
    } catch (e) {
      if (filesRoute.get(serverUrl) !== false) throw e;
    }
  }
  return { ref: { hash: createHash('sha256').update(bytes).digest('hex'), ext, bytes: bytes.length }, stored: false };
}

/** A map ready for `game.new` / `map.add`, and whether its files are really on the server. */
export interface UploadedMap {
  /** The fixture it came from. */
  fixture: FixtureMap;
  /** The `MapInfo` to send. */
  info: MapInfo;
  /** Its geometry (also what the companion uses for room fills and circles). */
  geometry: MapGeometry | null;
  /** Whether `/files` stored the picture (false on a server without the route). */
  stored: boolean;
}

/**
 * Uploads a fixture's picture (and geometry) and builds its `MapInfo` with a fresh id.
 *
 * @param serverUrl - the server's base URL
 * @param key - the fixture's key
 * @returns the map
 */
export async function uploadMap(serverUrl: string, key: string): Promise<UploadedMap> {
  const f = fixture(key);
  const pic = await putFile(serverUrl, fixturePicture(f), 'png');
  const geometry = f.kind === 'uvtt' ? fixtureGeometry(f) : null;
  const geo = geometry ? await putFile(serverUrl, new TextEncoder().encode(JSON.stringify(geometry)), 'json') : null;
  const info: MapInfo = {
    id: newId(), name: f.name, kind: f.kind, picture: pic.ref, tableCopy: null, geometry: geo?.ref ?? null,
    grid: wholeGrid(f.cols, f.rows, f.cols * f.px, f.rows * f.px), drawGrid: !f.ownGrid,
    doorCount: geometry?.doors.length ?? 0, drawDoors: false, libraryId: null,
  };
  return { fixture: f, info, geometry, stored: pic.stored };
}
