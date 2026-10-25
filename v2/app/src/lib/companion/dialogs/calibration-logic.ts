/**
 * The "Measure the TV" dialog's rules: the bar's length, turning what the DM measured into the
 * picture's width, units, and the result line. Pure, tested (`calibration-logic.test.ts`).
 *
 * @see ../../../../../docs/parity.md §15 (CT-01 … CT-08)
 * @see @battlemap/shared geometry/table.ts for the one-inch maths
 */
import {
  barInches, MAX_WIDTH_INCHES, MIN_WIDTH_INCHES, tableGrid, type CalibrationPivot, type TableState,
} from '@battlemap/shared';

/** The length units the dialog offers. */
export type LengthUnit = 'cm' | 'in';

/** Centimetres per inch. */
export const CM_PER_INCH = 2.54;

/** Fallback screen when the TV has not reported one (16:9). */
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

/**
 * How long the gold bar is on the TV right now, in inches (≤ 10, shorter without room).
 *
 * @param table - the TV's state
 * @returns inches
 */
export function currentBarInches(table: TableState): number {
  const v = table.viewport ?? DEFAULT_VIEWPORT;
  const heightInches = (table.widthInches * v.height) / v.width;
  return barInches(table.widthInches, heightInches, table.pattern.pivot, table.overscanPercent);
}

/**
 * A length in the chosen unit.
 *
 * @param inches - the length in inches
 * @param unit - cm or in
 * @returns the number in that unit
 */
export function toUnit(inches: number, unit: LengthUnit): number {
  return unit === 'cm' ? inches * CM_PER_INCH : inches;
}

/**
 * A length in inches.
 *
 * @param value - the number in `unit`
 * @param unit - cm or in
 * @returns inches
 */
export function fromUnit(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value / CM_PER_INCH : value;
}

/**
 * Reads a typed length: comma or point, spaces ignored.
 *
 * @param text - what was typed
 * @returns the number, or null when it isn't one
 */
export function parseLength(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The outcome of applying a measurement. */
export type MeasureResult = { ok: true; widthInches: number } | { ok: false; message: string };

/**
 * The picture width that makes the bar as long as it should be (CT-06): the bar was drawn as
 * `bar` inches at the current width but measured `measured`, so the picture is
 * `width × measured / bar` wide.
 *
 * @param table - the TV's state
 * @param text - what the DM typed
 * @param unit - its unit
 * @returns the new width (clamped 10–90), or the message to show
 */
export function widthFromMeasurement(table: TableState, text: string, unit: LengthUnit): MeasureResult {
  const value = parseLength(text);
  if (value === null || value <= 0) return { ok: false, message: 'Enter what the bar measures.' };
  const bar = currentBarInches(table);
  const ratio = fromUnit(value, unit) / bar;
  if (ratio < 0.5 || ratio > 2) {
    return { ok: false, message: `That is far from ${formatLength(bar, unit)} — measure the bar again.` };
  }
  const w = Math.min(MAX_WIDTH_INCHES, Math.max(MIN_WIDTH_INCHES, table.widthInches * ratio));
  return { ok: true, widthInches: Math.round(w * 10_000) / 10_000 };
}

/**
 * A length for reading: "25.4 cm" / "10 in" (up to 2 places, no trailing zeros).
 *
 * @param inches - the length
 * @param unit - the unit to show
 * @returns the text
 */
export function formatLength(inches: number, unit: LengthUnit): string {
  const n = toUnit(inches, unit);
  return `${Number(n.toFixed(2))} ${unit}`;
}

/** Steps of the width stepper, per unit (CT-07). */
export const WIDTH_STEPS: Record<LengthUnit, number[]> = { cm: [0.1, 0.2, 0.5, 1], in: [0.05, 0.1, 0.2, 0.5] };

/** Range of the width stepper per unit. */
export const WIDTH_RANGE: Record<LengthUnit, { min: number; max: number; decimals: number }> = {
  cm: { min: MIN_WIDTH_INCHES * CM_PER_INCH, max: MAX_WIDTH_INCHES * CM_PER_INCH, decimals: 1 },
  in: { min: MIN_WIDTH_INCHES, max: MAX_WIDTH_INCHES, decimals: 2 },
};

/** Steps of the overscan stepper (CT-08). */
export const OVERSCAN_STEPS = [0.25, 0.5, 1, 2];

/**
 * Squares the table holds with this calibration.
 *
 * @param table - the TV's state
 * @returns cols and rows, or null without a viewport
 */
export function tableSquares(table: TableState): { cols: number; rows: number } | null {
  if (!table.viewport) return null;
  const g = tableGrid(table.viewport, table.widthInches, table.overscanPercent);
  return g ? { cols: g.cols, rows: g.rows } : null;
}

/**
 * The live result line: "34 × 19 squares · picture 34.5 in (87.6 cm) wide · 2 % cut off each edge".
 *
 * @param table - the TV's state
 * @returns the text
 */
export function resultLine(table: TableState): string {
  const sq = tableSquares(table);
  const head = sq ? `${sq.cols} × ${sq.rows} squares` : 'The TV has not reported its screen yet';
  const width = `picture ${formatLength(table.widthInches, 'in')} (${formatLength(table.widthInches, 'cm')}) wide`;
  const cut = table.overscanPercent > 0 ? ` · ${Number(table.overscanPercent.toFixed(2))} % cut off each edge` : '';
  return `${head} · ${width}${cut}`;
}

/** The pivots in reading order with their names (CT-05). */
export const PIVOTS: { id: CalibrationPivot; label: string; x: number; y: number }[] = [
  { id: 'topLeft', label: 'Top left', x: 0, y: 0 },
  { id: 'topRight', label: 'Top right', x: 1, y: 0 },
  { id: 'center', label: 'Middle', x: 0.5, y: 0.5 },
  { id: 'bottomLeft', label: 'Bottom left', x: 0, y: 1 },
  { id: 'bottomRight', label: 'Bottom right', x: 1, y: 1 },
];
