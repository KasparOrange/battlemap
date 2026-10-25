/**
 * Tiny shared shapes and number helpers for the geometry modules.
 */

/** An axis-aligned rectangle: top-left corner and size. */
export interface Rect {
  /** Left edge. */
  readonly x: number;
  /** Top edge. */
  readonly y: number;
  /** Width. */
  readonly width: number;
  /** Height. */
  readonly height: number;
}

/**
 * Rounds half away from zero (Dart's `round()`: −6.5 → −7, 6.5 → 7) — the old app's maths
 * used it, and the table window must land on the same square as before.
 *
 * @param x - the number
 * @returns the rounded integer
 */
export function roundHalfAway(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/**
 * Clamps a number into a range.
 *
 * @param x - the number
 * @param min - lowest allowed
 * @param max - highest allowed
 * @returns `x` limited to `[min, max]`
 */
export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}
