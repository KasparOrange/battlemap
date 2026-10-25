/**
 * Reading v1's shared library (the old dev server's `uploads/library/` + `index.json`) and
 * turning its entries into what v2 stores: a picture, a geometry file for `.dd2vtt` maps (walls,
 * doors and lights in squares, the file's origin subtracted — the rules of the old parser,
 * `lib/model/uvtt_parser.dart`), a table copy for dense pictures, and a `MapInfo`.
 *
 * Pure apart from sharp; `import-v1-library.ts` does the IO.
 */
import { wholeGrid, type Door, type Light, type MapGeometry, type Point } from '@battlemap/shared';

/** An entry of v1's `index.json`. */
export interface V1Entry {
  /** 12 hex characters. */
  id: string;
  /** Display name. */
  name: string;
  /** `vtt` (a `.dd2vtt` / `.uvtt`) or `image`. */
  kind: 'vtt' | 'image';
  /** Squares across. */
  gridCols?: number;
  /** Squares down. */
  gridRows?: number;
  /** The picture has its own grid lines. */
  hasOwnGrid?: boolean;
  /** File name in the library folder. */
  file: string;
  /** When it was added (ISO). */
  addedAt: string;
}

/** A `.dd2vtt` split into its parts. */
export interface UvttParts {
  /** The embedded picture's bytes. */
  picture: Uint8Array;
  /** Walls, doors and lights in squares. */
  geometry: MapGeometry;
  /** Squares across. */
  cols: number;
  /** Squares down. */
  rows: number;
  /** Pixels per square of the picture. */
  pixelsPerGrid: number;
  /** Whether battlemap draws the doors (`"battlemap": {"draw_doors": true}`). */
  drawDoors: boolean;
}

/** A point of the file, moved by its origin. */
function point(p: unknown, origin: Point): Point {
  const o = (p ?? {}) as { x?: unknown; y?: unknown };
  return { x: Number(o.x ?? 0) - origin.x, y: Number(o.y ?? 0) - origin.y };
}

/**
 * A UVTT colour (`AARRGGBB` or `RRGGBB` hex, with or without `#`) as `#rrggbb`.
 *
 * @param c - the file's colour
 * @returns the colour, white when unreadable
 */
export function uvttColor(c: unknown): string {
  const hex = String(c ?? '').replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return '#ffffff';
}

/**
 * Splits a `.dd2vtt` / `.uvtt` file.
 *
 * @param text - the file's JSON
 * @returns picture, geometry, size
 * @throws {Error} when it isn't a UVTT file with a picture
 */
export function splitUvtt(text: string): UvttParts {
  const doc = JSON.parse(text) as Record<string, unknown>;
  const res = (doc.resolution ?? {}) as { map_origin?: unknown; map_size?: { x?: unknown; y?: unknown }; pixels_per_grid?: unknown };
  if (typeof doc.image !== 'string' || !res.map_size) throw new Error('not a UVTT file with a picture');
  const origin = point(res.map_origin, { x: 0, y: 0 });
  const lines = (v: unknown): Point[][] => (Array.isArray(v) ? v.map((line) => (Array.isArray(line) ? line.map((p) => point(p, origin)) : [])) : []);
  const doors: Door[] = (Array.isArray(doc.portals) ? doc.portals : []).map((p: { bounds?: unknown[] }) => ({
    a: point(p.bounds?.[0], origin),
    b: point(p.bounds?.[1], origin),
  }));
  const lights: Light[] = (Array.isArray(doc.lights) ? doc.lights : []).map((l: { position?: unknown; range?: unknown; intensity?: unknown; color?: unknown }) => {
    const at = point(l.position, origin);
    return { x: at.x, y: at.y, range: Math.max(0, Number(l.range ?? 0)), intensity: Math.max(0, Number(l.intensity ?? 1)), color: uvttColor(l.color) };
  });
  const battlemap = (doc.battlemap ?? {}) as { draw_doors?: unknown };
  return {
    picture: new Uint8Array(Buffer.from(doc.image, 'base64')),
    geometry: { walls: [...lines(doc.line_of_sight), ...lines(doc.objects_line_of_sight)].filter((l) => l.length >= 2), doors, lights },
    cols: Math.max(1, Math.round(Number(res.map_size.x))),
    rows: Math.max(1, Math.round(Number(res.map_size.y))),
    pixelsPerGrid: Number(res.pixels_per_grid ?? 0),
    drawDoors: battlemap.draw_doors === true,
  };
}

/**
 * The picture grid of a v1 map: v1 stretched its squares over the whole picture.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param width - picture width
 * @param height - picture height
 * @returns the grid
 */
export function v1Grid(cols: number, rows: number, width: number, height: number) {
  return wholeGrid(cols, rows, width, height);
}
