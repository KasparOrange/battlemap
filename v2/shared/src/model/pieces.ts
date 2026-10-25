/**
 * The things laid on a map during play: tokens, drawings, the ruler, DM layers and the measure
 * line. (The template disc has its own file, `disc.ts`; effects have `effect.ts`.)
 */
import * as v from 'valibot';
import { Color, FileRef, Id, Int, Name, Point, Positive } from './basics.ts';

/**
 * A token: a position marker for a player or a monster (tabletop mode — the real miniature
 * stands on it). It can exist off the map (`placed` false: created in the Tokens tab, placed
 * later) and be hidden from the players (`hidden`: the TV leaves it out, the DM sees it faded).
 */
export const Token = v.object({
  /** Made by the companion that created it. */
  id: Id,
  /** Short text on the token, usually a number ("3"). */
  label: v.pipe(v.string(), v.maxLength(8)),
  /** The DM's name for it ("Thorin"), may be empty. */
  name: Name,
  /** Its fill colour. */
  color: Color,
  /** Column of its square (meaningless while not placed). */
  col: Int,
  /** Row of its square (meaningless while not placed). */
  row: Int,
  /** Whether it stands on the map. */
  placed: v.boolean(),
  /** Whether the players don't see it. */
  hidden: v.boolean(),
});
/** A token; see the schema of the same name. */
export type Token = v.InferOutput<typeof Token>;

/** A freehand drawing stroke. */
export const Stroke = v.object({
  /** Made by the companion that drew it. */
  id: Id,
  /** The polyline as flat pairs in squares: x0, y0, x1, y1, … (at least one pair). */
  points: v.pipe(v.array(v.pipe(v.number(), v.finite())), v.minLength(2), v.maxLength(20_000)),
  /** Its colour. */
  color: Color,
  /** Line width in squares. */
  width: Positive,
});
/** A drawing stroke; see the schema of the same name. */
export type Stroke = v.InferOutput<typeof Stroke>;

/**
 * The L-shaped ruler: two arms of `RULER_ARM_SQUARES` from a corner, along +x and −y, turned by
 * `rotation`. Moved by the DM, shown to the players.
 */
export const Ruler = v.object({
  /** Whether it is on the map. */
  visible: v.boolean(),
  /** The corner, in squares. */
  x: v.pipe(v.number(), v.finite()),
  /** The corner, in squares. */
  y: v.pipe(v.number(), v.finite()),
  /** Quarter turns clockwise in degrees. */
  rotation: v.picklist([0, 90, 180, 270]),
});
/** The ruler; see the schema of the same name. */
export type Ruler = v.InferOutput<typeof Ruler>;

/**
 * A DM-only picture laid over the map (a DM version of the map, notes, secrets). Only the
 * companion loads and draws it; the TV keeps the list with the game and never fetches the file.
 */
export const DmLayer = v.object({
  /** Made by the companion that added it. */
  id: Id,
  /** The picked file's name. */
  name: Name,
  /** The picture. */
  file: FileRef,
  /** The layer's eye. */
  visible: v.boolean(),
  /** 0 (clear) to 1 (opaque). */
  opacity: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});
/** A DM layer; see the schema of the same name. */
export type DmLayer = v.InferOutput<typeof DmLayer>;

/** A measured line between two points, in squares (shown on the TV while the DM drags). */
export const MeasureLine = v.object({
  /** Where the drag started. */
  a: Point,
  /** Where the finger is. */
  b: Point,
});
/** A measure line; see the schema of the same name. */
export type MeasureLine = v.InferOutput<typeof MeasureLine>;
