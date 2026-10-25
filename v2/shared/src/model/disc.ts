/**
 * The area-of-effect template disc: the acrylic disc with radius rings, cubes and cones,
 * rebuilt and configurable (port of `lib/model/template_disc.dart`). Its geometry is in
 * `geometry/disc.ts`.
 */
import * as v from 'valibot';
import { Color, Num, Positive } from './basics.ts';

/** One family of outlines on the disc: rings, cubes or cones. */
export const DiscShapeSet = v.object({
  /** Whether this family is drawn at all. */
  visible: v.boolean(),
  /** Sizes in feet, ascending and unique (ring radius, cube side, cone length). */
  sizes: v.pipe(v.array(Positive), v.maxLength(12)),
  /** Outline and label colour. */
  color: Color,
  /** Continuous or dotted outline. */
  line: v.picklist(['solid', 'dotted']),
  /** Whether each outline carries its label ("20' RADIUS"). */
  labels: v.boolean(),
});
/** One family of disc outlines; see the schema of the same name. */
export type DiscShapeSet = v.InferOutput<typeof DiscShapeSet>;

/** The template disc: where it lies and how it looks. */
export const TemplateDisc = v.object({
  /** Whether it is on the map. */
  visible: v.boolean(),
  /** Its middle, in squares. */
  x: Num,
  /** Its middle, in squares. */
  y: Num,
  /** Turn in degrees clockwise, 0 ≤ rotation < 360. */
  rotation: Num,
  /** Radius rings (sizes = radius in feet). */
  rings: DiscShapeSet,
  /** Cubes centred on the middle (sizes = side in feet). */
  cubes: DiscShapeSet,
  /** Cones (sizes = length in feet). */
  cones: DiscShapeSet,
  /** `sharedBase`: all cones on one base line, the longest centred (the acrylic disc);
   * `center`: every cone's tip on the middle. */
  coneAnchor: v.picklist(['sharedBase', 'center']),
  /** Opening angle of the cones in degrees (5e: `DND_CONE_DEGREES`). */
  coneDegrees: v.pipe(v.number(), v.minValue(10), v.maxValue(180)),
  /** A one-square circle with a cross on the middle. */
  centerMark: v.boolean(),
  /** Compass marks between the two largest rings (0–24; the disc has 12). */
  markers: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24)),
  /** Whether the disc's clear edge is drawn. */
  rim: v.boolean(),
  /** White tint of the face, 0 (clear) to 0.8. */
  tint: v.pipe(v.number(), v.minValue(0), v.maxValue(0.8)),
  /** Outline width in squares. */
  lineWidth: v.pipe(v.number(), v.minValue(0.01), v.maxValue(0.5)),
  /** Label height in squares. */
  labelSize: v.pipe(v.number(), v.minValue(0.05), v.maxValue(1)),
  /** What the middle snaps to while dragged. */
  snap: v.picklist(['none', 'squareCenters', 'squareCorners']),
});
/** The template disc; see the schema of the same name. */
export type TemplateDisc = v.InferOutput<typeof TemplateDisc>;

/** Feet per map square (D&D 5e). */
export const FEET_PER_SQUARE = 5;

/** A 5e cone's opening angle in degrees: as wide as it is long, `2 · atan(½)`. */
export const DND_CONE_DEGREES = 53.13010235415598;

/**
 * The acrylic disc from the photo: red 5/10/15/20 ft rings, black dotted 10/20/30 ft cubes,
 * blue dotted 15/30 ft cones on a shared base, 12 compass marks, a clear edge. Hidden, at the
 * map's corner.
 *
 * @returns a new disc object
 */
export function classicDisc(): TemplateDisc {
  return {
    visible: false,
    x: 0,
    y: 0,
    rotation: 0,
    rings: { visible: true, sizes: [5, 10, 15, 20], color: '#e0402c', line: 'solid', labels: true },
    cubes: { visible: true, sizes: [10, 20, 30], color: '#141414', line: 'dotted', labels: true },
    cones: { visible: true, sizes: [15, 30], color: '#1f4fb8', line: 'dotted', labels: true },
    coneAnchor: 'sharedBase',
    coneDegrees: DND_CONE_DEGREES,
    centerMark: true,
    markers: 12,
    rim: true,
    tint: 0,
    lineWidth: 0.05,
    labelSize: 0.2,
    snap: 'none',
  };
}

/** Colours offered for a family: the disc's red, black, blue, then colours that read on dark maps. */
export const DISC_PALETTE: readonly string[] = [
  '#e0402c', '#141414', '#1f4fb8', '#ffffff', '#f2c14e', '#3dbb6b', '#9b59d0', '#29b6f6',
];
