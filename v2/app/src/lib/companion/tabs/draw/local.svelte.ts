/**
 * The Draw tab's device-local settings (never synced, remembered on this device): ink colour,
 * line width and pen or eraser.
 */

/** The ink presets: v1's six (red default, green, blue, yellow, orange, white) and two of the kit's marks. */
export const INK_COLORS = ['#e53935', '#43a047', '#1e88e5', '#fdd835', '#ff8f00', '#ffffff', '#b693f0', '#15110c', '#5fd0c8'] as const;

/** Line width limits in millimetres on the table (one square = 25.4 mm). */
export const WIDTH_MIN_MM = 1;
/** Widest line. */
export const WIDTH_MAX_MM = 14;

/** Line width presets (parity DR-03: S 2 / M 4 / L 8 / XL 14), in mm on the table. */
export const WIDTH_PRESETS = [
  { id: 's', label: 'S', mm: 2 },
  { id: 'm', label: 'M', mm: 4 },
  { id: 'l', label: 'L', mm: 8 },
  { id: 'xl', label: 'XL', mm: 14 },
] as const;

const KEY = 'battlemap.companion.draw';

/**
 * A line width in millimetres on the table as squares (what a stroke stores).
 *
 * @param mm - width in mm
 * @returns width in squares
 */
export function mmToSquares(mm: number): number {
  return mm / 25.4;
}

/** The tablet-local Draw tab state. */
class DrawLocal {
  /** Ink colour `#rrggbb`. */
  color = $state<string>(INK_COLORS[0]);
  /** Line width in mm on the table. */
  widthMm = $state(4);
  /** Pen or eraser. */
  pen = $state<'pen' | 'eraser'>('pen');

  constructor() {
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as { color?: string; widthMm?: number } | null;
      if (raw?.color && /^#[0-9a-f]{6}$/i.test(raw.color)) this.color = raw.color;
      if (typeof raw?.widthMm === 'number') this.widthMm = Math.min(WIDTH_MAX_MM, Math.max(WIDTH_MIN_MM, Math.round(raw.widthMm)));
    } catch {
      // nothing remembered
    }
  }

  /** Remembers colour and width on this device. */
  save(): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ color: this.color, widthMm: this.widthMm }));
    } catch {
      // private mode
    }
  }
}

/** The one instance. */
export const drawLocal = new DrawLocal();
