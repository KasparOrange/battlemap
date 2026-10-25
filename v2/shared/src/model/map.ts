/**
 * A map as a game uses it: where its squares lie on its picture, its walls and doors, and the
 * files it is made of.
 *
 * @see ../geometry/raster-grid.ts for the grid maths
 * @see ../geometry/walls.ts for flood fills over the walls
 */
import * as v from 'valibot';
import { Color, FileRef, Id, Name, Num, NonNegative, Point, Positive, Count } from './basics.ts';

/** Largest number of squares along one side of a map. */
export const MAX_MAP_SIDE = 1000;

const Side = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_MAP_SIDE));

/**
 * Where the squares of a map lie on its picture — `cols × rows` squares of
 * `cellW × cellH` picture pixels whose top-left corner is at (`x`, `y`). The renderer stretches
 * this rectangle onto the map's squares, so nothing is cropped or resampled: `x`/`y` may be
 * negative and the rectangle may reach past the picture (partial edge squares, drawn dark).
 * A `.dd2vtt` map has the whole picture at its pixels per grid.
 */
export const RasterGrid = v.object({
  /** Left edge of square (0, 0) in picture pixels. */
  x: Num,
  /** Top edge of square (0, 0) in picture pixels. */
  y: Num,
  /** Width of one square in picture pixels. */
  cellW: Positive,
  /** Height of one square in picture pixels. */
  cellH: Positive,
  /** Squares across — the map's width in squares (and the fog mask's). */
  cols: Side,
  /** Squares down. */
  rows: Side,
  /** Width of the picture the lengths refer to, in pixels. */
  pictureW: Positive,
  /** Height of that picture, in pixels. */
  pictureH: Positive,
});
/** A picture grid; see the schema of the same name. */
export type RasterGrid = v.InferOutput<typeof RasterGrid>;

/** `uvtt`: from a `.dd2vtt` (walls and doors known); `picture`: an image or a PDF page. */
export const MapKind = v.picklist(['uvtt', 'picture']);
/** The kind of a map; see the schema of the same name. */
export type MapKind = v.InferOutput<typeof MapKind>;

/** A door (a UVTT portal) as a segment in squares. Its index in the list is its id. */
export const Door = v.object({
  /** One end of the door segment. */
  a: Point,
  /** The other end. */
  b: Point,
});
/** A door segment; see the schema of the same name. */
export type Door = v.InferOutput<typeof Door>;

/** A light source from the map file (for light effects later). */
export const Light = v.object({
  /** Position in squares. */
  x: Num,
  /** Position in squares. */
  y: Num,
  /** Reach in squares. */
  range: NonNegative,
  /** 0 (off) to 1 (full). */
  intensity: NonNegative,
  /** Its colour. */
  color: Color,
});
/** A light source; see the schema of the same name. */
export type Light = v.InferOutput<typeof Light>;

/**
 * The geometry of a `.dd2vtt` map, stored as its own small JSON file next to the picture so no
 * device has to parse the big original. All coordinates in squares, relative to the map's
 * top-left corner (the importer subtracts the file's `map_origin`).
 */
export const MapGeometry = v.object({
  /** Wall polylines (line of sight and object walls together). */
  walls: v.array(v.array(Point)),
  /** Doors in file order — their indices are what `door.set` names. */
  doors: v.array(Door),
  /** Light sources. */
  lights: v.array(Light),
});
/** A map's walls, doors and lights; see the schema of the same name. */
export type MapGeometry = v.InferOutput<typeof MapGeometry>;

/**
 * Everything a game needs to know about one of its maps. Small on purpose: the picture and the
 * geometry are files, fetched by hash.
 */
export const MapInfo = v.object({
  /** The map's id within the game (the shared library's id when it came from there). */
  id: Id,
  /** What the DM calls it ("Tower floor 2"). */
  name: Name,
  /** Where it came from. */
  kind: MapKind,
  /** The original picture (the companion zooms in on this one). */
  picture: FileRef,
  /** A copy at table density (≤ 72 px per square) that the TV loads instead, if one was made. */
  tableCopy: v.nullable(FileRef),
  /** Walls, doors and lights (`.dd2vtt` maps), else null. */
  geometry: v.nullable(FileRef),
  /** Where the squares lie on `picture`; `grid.cols × grid.rows` is the map's size in squares. */
  grid: RasterGrid,
  /** Whether battlemap draws grid lines (false when the picture has its own). */
  drawGrid: v.boolean(),
  /** Number of doors in the geometry (0 for picture maps). */
  doorCount: Count,
  /** Whether battlemap draws the doors (AI maps: the picture shows empty doorways). */
  drawDoors: v.boolean(),
  /** The shared library entry it was taken from, if any. */
  libraryId: v.nullable(Id),
});
/** A map's description; see the schema of the same name. */
export type MapInfo = v.InferOutput<typeof MapInfo>;
