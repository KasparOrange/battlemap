/**
 * The first guess at a picture map's squares, before the DM checks it in the squares dialog:
 * a drawn grid the detection found, else the counts in the file name, else 20 across with the
 * rows following (square squares) — the old upload flow's order (`vtt_companion_screen.dart`).
 * Also the note the dialog shows about where the guess came from.
 */
import { wholeGrid, type RasterGrid } from '@battlemap/shared';
import { detectionAligned, detectionToRasterGrid, type GridDetection } from './grid-detect.ts';
import { gridCountsFromName } from './name-counts.ts';

/** Squares across when nothing else is known. */
export const DEFAULT_COLS = 20;

/** Where a picture's first grid came from. */
export type GridSource = 'detected' | 'name' | 'default';

/** The first guess at a picture's squares. */
export interface GridGuess {
  /** Where the squares lie. */
  grid: RasterGrid;
  /** Whether battlemap should draw grid lines (false when the picture has its own). */
  drawGrid: boolean;
  /** Where the guess came from. */
  source: GridSource;
  /** What the squares dialog says about it, or null for the default. */
  note: string | null;
}

/**
 * The first guess for a `width × height` picture.
 *
 * @param fileName - the picture's file name (for counts like `Tavern_30x40.jpg`)
 * @param width - picture width
 * @param height - picture height
 * @param detection - the drawn grid found in it, or null
 * @returns the guess
 */
export function guessGrid(fileName: string, width: number, height: number, detection: GridDetection | null): GridGuess {
  if (detection) {
    const d = detection;
    const where = detectionAligned(d) ? '' : `, starting ${Math.round(d.offsetX)} px in, ${Math.round(d.offsetY)} px down`;
    return {
      grid: detectionToRasterGrid(d),
      drawGrid: false,
      source: 'detected',
      note: `Found a drawn grid: ${d.cols} × ${d.rows} squares of ${d.cellPx.toFixed(d.cellPx < 20 ? 1 : 0)} px${where}. ` +
        'Check it with "Fit on the picture".',
    };
  }
  const named = gridCountsFromName(fileName, width, height);
  if (named) {
    return {
      grid: wholeGrid(named.cols, named.rows, width, height),
      drawGrid: true,
      source: 'name',
      note: `The file name says ${named.cols} × ${named.rows} squares. Check it with "Measure on the picture" (a door is one square).`,
    };
  }
  const rows = Math.max(1, Math.round((DEFAULT_COLS * height) / width));
  return { grid: wholeGrid(DEFAULT_COLS, rows, width, height), drawGrid: true, source: 'default', note: null };
}
