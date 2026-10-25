/**
 * The Universal VTT parser (`.dd2vtt` from Dungeondraft, `.uvtt`): a JSON file with the map's
 * picture as base64 and its walls, doors and lights in grid units. Port of the old app's
 * `lib/model/uvtt_parser.dart` + `uvtt_map.dart`, with two changes: the file's `map_origin` is
 * subtracted (so (0, 0) is the picture's top-left corner, as `MapGeometry` wants), and a broken
 * file gives a readable `ImportError` instead of a type error.
 *
 * Read fields: `format`; `resolution.map_origin`, `map_size`, `pixels_per_grid` (required);
 * `line_of_sight` and `objects_line_of_sight` (polylines, merged into `walls`); `portals`
 * (`bounds[0..1]` → a door); `lights` (position, range, intensity, `aarrggbb` colour);
 * `image` (required); battlemap's extension `battlemap.draw_doors`.
 *
 * @see ../../../../shared/src/model/map.ts MapGeometry
 */
import { decodeBase64, MAX_MAP_SIDE, type Door, type Light, type MapGeometry, type Point } from '@battlemap/shared';
import { ImportError } from './errors.ts';
import { pictureKind, type PictureExt } from './sniff.ts';

/** A parsed `.dd2vtt` / `.uvtt`. */
export interface UvttParsed {
  /** The file's `format` number (0.2, 0.3), or null when missing. */
  format: number | null;
  /** Squares across (`map_size.x`). */
  cols: number;
  /** Squares down (`map_size.y`). */
  rows: number;
  /** Picture pixels per square (`pixels_per_grid`). */
  pixelsPerGrid: number;
  /** The file's `map_origin`, in squares (already subtracted from the geometry). */
  origin: Point;
  /** The picture's bytes. */
  picture: Uint8Array;
  /** The picture's kind, by its magic number. */
  pictureExt: PictureExt;
  /** Walls, doors and lights in squares from the map's top-left corner. */
  geometry: MapGeometry;
  /** Whether battlemap draws the doors (`battlemap.draw_doors`, AI maps). */
  drawDoors: boolean;
  /** Entries that were dropped because they were malformed (for the log). */
  dropped: { walls: number; doors: number; lights: number };
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The DM's message for a damaged file. */
function damaged(why: string): ImportError {
  return new ImportError('corrupt', `This map file is damaged or not a Dungeondraft/Universal VTT map: ${why}.`, why);
}

/**
 * Parses a `.dd2vtt` / `.uvtt` file's text.
 *
 * @param text - the file's text (JSON)
 * @returns the parsed map
 * @throws ImportError `corrupt` when the JSON is invalid, `image` or `resolution` is missing or
 *   invalid, or the picture inside is no PNG/JPEG/WebP; `too-big` when the map has more than
 *   `MAX_MAP_SIDE` squares on a side
 */
export function parseUvtt(text: string): UvttParsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw damaged('it is not valid JSON');
  }
  if (!isObject(json)) throw damaged('it is not a JSON object');

  const res = json['resolution'];
  if (!isObject(res)) throw damaged('"resolution" is missing');
  const size = res['map_size'];
  if (!isObject(size) || !finite(size['x']) || !finite(size['y']) || size['x'] <= 0 || size['y'] <= 0) {
    throw damaged('"resolution.map_size" is missing or not a size');
  }
  const ppg = res['pixels_per_grid'];
  if (!finite(ppg) || ppg <= 0) throw damaged('"resolution.pixels_per_grid" is missing or not a number');
  const cols = Math.max(1, Math.round(size['x']));
  const rows = Math.max(1, Math.round(size['y']));
  if (cols > MAX_MAP_SIDE || rows > MAX_MAP_SIDE) {
    throw new ImportError('too-big', `This map is ${cols} × ${rows} squares; battlemap takes at most ${MAX_MAP_SIDE} on a side.`);
  }
  const rawOrigin = res['map_origin'];
  const origin: Point = isObject(rawOrigin) && finite(rawOrigin['x']) && finite(rawOrigin['y'])
    ? { x: rawOrigin['x'], y: rawOrigin['y'] }
    : { x: 0, y: 0 };

  const image = json['image'];
  if (typeof image !== 'string' || image.length < 16) throw damaged('it has no picture inside ("image")');
  const comma = image.startsWith('data:') ? image.indexOf(',') : -1; // a data: URL now and then
  const picture = decodeBase64(comma >= 0 ? image.slice(comma + 1) : image);
  const pictureExt = pictureKind(picture);
  if (!pictureExt) throw damaged('the picture inside is no PNG, JPEG or WebP');

  const dropped = { walls: 0, doors: 0, lights: 0 };
  const point = (v: unknown): Point | null =>
    isObject(v) && finite(v['x']) && finite(v['y']) ? { x: v['x'] - origin.x, y: v['y'] - origin.y } : null;

  const walls: Point[][] = [];
  for (const key of ['line_of_sight', 'objects_line_of_sight']) {
    const list = json[key];
    if (!Array.isArray(list)) continue;
    for (const line of list) {
      const pts = Array.isArray(line) ? line.map(point).filter((p): p is Point => p !== null) : [];
      if (pts.length >= 2) walls.push(pts);
      else dropped.walls++;
    }
  }

  const doors: Door[] = [];
  const portals = json['portals'];
  if (Array.isArray(portals)) {
    for (const p of portals) {
      const bounds = isObject(p) && Array.isArray(p['bounds']) ? p['bounds'] : [];
      const a = point(bounds[0]);
      const b = point(bounds[1]);
      if (a && b) doors.push({ a, b });
      else dropped.doors++;
    }
  }

  const lights: Light[] = [];
  const rawLights = json['lights'];
  if (Array.isArray(rawLights)) {
    for (const l of rawLights) {
      const pos = isObject(l) ? point(l['position']) : null;
      if (!isObject(l) || !pos) {
        dropped.lights++;
        continue;
      }
      lights.push({
        x: pos.x,
        y: pos.y,
        range: finite(l['range']) && l['range'] >= 0 ? l['range'] : 0,
        intensity: finite(l['intensity']) && l['intensity'] >= 0 ? l['intensity'] : 1,
        color: uvttColor(l['color']),
      });
    }
  }

  const ext = json['battlemap'];
  return {
    format: finite(json['format']) ? json['format'] : null,
    cols,
    rows,
    pixelsPerGrid: ppg,
    origin,
    picture,
    pictureExt,
    geometry: { walls, doors, lights },
    drawDoors: isObject(ext) && ext['draw_doors'] === true,
    dropped,
  };
}

/**
 * A UVTT colour (`aarrggbb` hex, as Dungeondraft writes it, or `rrggbb`) as `#rrggbb`; the alpha
 * is dropped. Anything else gives white, like the old app.
 *
 * @param v - the colour field
 * @returns `#rrggbb`, lower case
 */
export function uvttColor(v: unknown): string {
  if (typeof v !== 'string') return '#ffffff';
  const hex = v.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(2).toLowerCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
  return '#ffffff';
}
