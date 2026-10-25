/**
 * The table — facts about the TV itself, not about a game: how wide its picture is, how much
 * of it the set cuts off, how big its viewport is, and whether it shows the calibration
 * pattern. Owned and saved by the TV; replicated so the companion can draw the players' frame.
 *
 * @see ../geometry/table.ts for the one-inch-per-square maths
 */
import * as v from 'valibot';
import { Positive } from './basics.ts';

/** Where the measuring bar of the calibration pattern starts (the ruler's zero). */
export const CalibrationPivot = v.picklist(['bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'center']);
/** A pivot name; see the schema of the same name. */
export type CalibrationPivot = v.InferOutput<typeof CalibrationPivot>;

/** The TV's own state. */
export const TableState = v.object({
  /** Physical width of the whole picture in inches (default `DEFAULT_WIDTH_INCHES`). */
  widthInches: v.pipe(v.number(), v.minValue(10), v.maxValue(90)),
  /** Percent of the picture the TV set cuts off at each edge (0 = it shows every pixel). */
  overscanPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(12)),
  /** The TV's viewport in CSS pixels, reported by the TV; null until it has one. */
  viewport: v.nullable(v.object({ width: Positive, height: Positive })),
  /** The calibration pattern (one-inch squares + measuring bar). */
  pattern: v.object({
    /** Whether the TV shows it. */
    on: v.boolean(),
    /** Where the bar starts. */
    pivot: CalibrationPivot,
  }),
});
/** The TV's own state; see the schema of the same name. */
export type TableState = v.InferOutput<typeof TableState>;

/**
 * Picture width assumed before calibration, in inches: 34.5 in on a 16:9 picture is 19.4 in
 * tall → 34 × 19 one-inch squares with about ¼ in to spare per side — Konrad's measured table.
 */
export const DEFAULT_WIDTH_INCHES = 34.5;

/** Narrowest plausible picture, in inches. */
export const MIN_WIDTH_INCHES = 10;

/** Widest plausible picture, in inches. */
export const MAX_WIDTH_INCHES = 90;

/** Largest overscan the TV accepts, in percent per edge. */
export const MAX_OVERSCAN_PERCENT = 12;

/**
 * The table before anyone calibrated it.
 *
 * @returns a new table state
 */
export function defaultTable(): TableState {
  return {
    widthInches: DEFAULT_WIDTH_INCHES,
    overscanPercent: 0,
    viewport: null,
    pattern: { on: false, pivot: 'bottomLeft' },
  };
}
