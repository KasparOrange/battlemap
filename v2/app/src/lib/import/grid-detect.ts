/**
 * Embedded grid detection: finds a square grid drawn into a picture map. A faithful port of the
 * old app's `lib/model/grid_detect.dart` (same formula, same constants, same test cases in
 * `grid-detect.test.ts`). Pure TypeScript on RGBA bytes — no DOM, so it runs in the import
 * worker and under `bun test`.
 *
 * The formula, per axis (x shown; y is the same on rows):
 * 1. **Line profile** — `P(x) = Σ_y min(|L(x+1,y) − L(x,y)|, 24)`: how much luminance changes
 *    between neighbouring columns, summed down the picture. Grid lines run the whole height, so
 *    their columns add up; the clip at 24 keeps thick walls from drowning faint grid lines.
 * 2. **High-pass** — subtract a 15-sample moving average, then a light [1 2 3 2 1] blur.
 * 3. **Period** — the normalized autocorrelation peaks at the grid's spacing and its multiples.
 *    Take the strongest local peak between the minimum cell (20 original px) and a third of the
 *    picture, then prefer its smallest whole fraction `l/d` (d = 6…2) that still reaches half
 *    its strength. Sub-pixel: a parabola through the peak, refined by the largest multiple
 *    still above half strength.
 * 4. **Agreement** — both axes within 3 % and a strength ≥ `MIN_STRENGTH`; the cell is the mean.
 * 5. **Phase** — the circular mean of the profile around the cell gives where the lines sit.
 *
 * Big pictures are box-averaged down by a whole factor first (thin light lines fade but
 * survive; sampling would lose them). `LuminanceBuilder` does that strip by strip, so the
 * worker never needs the whole picture's RGBA at once (Safari caps a canvas at 16.7 M pixels).
 *
 * @see ../../../../../lib/model/grid_detect.dart the original
 * @see ../../../../docs/architecture.md "Work packages" #6
 */
import { gridFromLines, type RasterGrid } from '@battlemap/shared';

/** How far (a fraction of a square) the grid may miss a picture edge and still be aligned. */
export const EDGE_TOLERANCE = 0.15;

/** The weakest repetition reported as a grid (see `GridDetection.strength`). */
export const MIN_STRENGTH = 0.25;

/**
 * Smallest square the detector reports, in original picture pixels. Finer periods are stone or
 * wood texture, and a map that coarse would be useless at one inch per square anyway.
 */
export const MIN_CELL_PX = 20;

/** Default long side the detector averages a picture down to (2048 lost Dyson's dashed grid). */
export const DETECT_MAX_SIDE = 3072;

/**
 * A square grid found drawn into a picture. All lengths are in the original picture's pixels,
 * even when the detection ran on a downscaled copy. Grid lines sit at `offsetX + k·cellPx`
 * (and `offsetY + k·cellPx`), measured in pixel edges: 0 is the picture's left/top edge.
 */
export interface GridDetection {
  /** Side of one square in picture pixels (sub-pixel precise). */
  cellPx: number;
  /** Position of the first vertical grid line, in `[0, cellPx)`. */
  offsetX: number;
  /** Position of the first horizontal grid line, in `[0, cellPx)`. */
  offsetY: number;
  /** The weaker axis's normalized autocorrelation at `cellPx` (0..1; crisp 0.6–0.95, faint 0.3). */
  strength: number;
  /** Whole squares across the part of the picture the grid covers (`detectionCrop`). */
  cols: number;
  /** Whole squares down. */
  rows: number;
  /** The picture's width in pixels. */
  pictureW: number;
  /** The picture's height in pixels. */
  pictureH: number;
}

/** A rectangle in picture pixels. */
export interface PixelRect {
  /** Left edge. */
  left: number;
  /** Top edge. */
  top: number;
  /** Right edge. */
  right: number;
  /** Bottom edge. */
  bottom: number;
}

/** A first line within `EDGE_TOLERANCE` of a square after the edge is the edge itself. */
function snapStart(offset: number, cellPx: number): number {
  const tol = EDGE_TOLERANCE * cellPx;
  if (offset <= tol || cellPx - offset <= tol) return 0;
  return offset;
}

/**
 * The rectangle of whole squares in picture pixels: from the first grid line on each axis,
 * `cols × rows` squares of `cellPx`, clamped to the picture.
 *
 * @param d - the detection
 * @returns the rectangle
 */
export function detectionCrop(d: GridDetection): PixelRect {
  const x0 = snapStart(d.offsetX, d.cellPx);
  const y0 = snapStart(d.offsetY, d.cellPx);
  return {
    left: x0,
    top: y0,
    right: Math.min(x0 + d.cols * d.cellPx, d.pictureW),
    bottom: Math.min(y0 + d.rows * d.cellPx, d.pictureH),
  };
}

/**
 * Whether the drawn grid meets the picture's edges in whole squares, so the picture works as is
 * with `cols × rows` squares.
 *
 * @param d - the detection
 * @returns true when aligned
 */
export function detectionAligned(d: GridDetection): boolean {
  const c = detectionCrop(d);
  const tol = EDGE_TOLERANCE * d.cellPx;
  return c.left <= tol && c.top <= tol &&
    Math.abs(d.pictureW - c.right) <= tol && Math.abs(d.pictureH - c.bottom) <= tol;
}

/**
 * The found grid as battlemap's picture grid: lines through the offsets, squares of `cellPx`,
 * whole squares only or with partial edges — nothing cropped.
 *
 * @param d - the detection
 * @param partialEdges - include partial edge squares
 * @returns the picture grid
 */
export function detectionToRasterGrid(d: GridDetection, partialEdges = false): RasterGrid {
  return gridFromLines({
    lineX: d.offsetX, lineY: d.offsetY, cellW: d.cellPx, cellH: d.cellPx,
    pictureW: d.pictureW, pictureH: d.pictureH, partialEdges,
  });
}

/**
 * A one-line description for logs ("32.00 px, 40 × 30, offset 0.0, 0.0, strength 0.83").
 *
 * @param d - the detection, or null
 * @returns the text
 */
export function describeDetection(d: GridDetection | null): string {
  if (!d) return 'none';
  return `${d.cellPx.toFixed(2)} px, ${d.cols} × ${d.rows}, offset ${d.offsetX.toFixed(1)}, ` +
    `${d.offsetY.toFixed(1)}, strength ${d.strength.toFixed(2)}${detectionAligned(d) ? '' : ', not aligned'}`;
}

/** The box factor for a `width × height` picture: the smallest whole f with max side / f ≤ `maxSide`. */
export function boxFactor(width: number, height: number, maxSide = DETECT_MAX_SIDE): number {
  return Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
}

/**
 * Builds the box-averaged luminance of a picture strip by strip (the `_luminance` step of the
 * original): 0..255 per output pixel, transparent pixels blended onto white, averaged over
 * `f × f` blocks, remainder rows/columns dropped. Feed rows top to bottom with `addRows`.
 */
export class LuminanceBuilder {
  /** Output width (`⌊width / f⌋`). */
  readonly outW: number;
  /** Output height (`⌊height / f⌋`). */
  readonly outH: number;
  /** The luminance, `outW × outH`, filled as rows arrive. */
  readonly lum: Float32Array;
  private readonly norm: number;

  /**
   * @param width - source width in pixels
   * @param height - source height in pixels
   * @param f - box factor (≥ 1)
   */
  constructor(readonly width: number, readonly height: number, readonly f: number) {
    this.outW = Math.floor(width / f);
    this.outH = Math.floor(height / f);
    this.lum = new Float32Array(this.outW * this.outH);
    this.norm = 1 / (f * f);
  }

  /**
   * Adds `count` source rows starting at source row `y0` (straight RGBA, `width` px per row).
   *
   * @param rgba - the rows' pixels
   * @param y0 - first source row
   * @param count - number of rows in `rgba`
   */
  addRows(rgba: Uint8Array | Uint8ClampedArray, y0: number, count: number): void {
    const { width: w, f, outW, outH, lum, norm } = this;
    for (let r = 0; r < count; r++) {
      const sy = y0 + r;
      const oy = Math.floor(sy / f);
      if (oy >= outH) break;
      let p = r * w * 4;
      let o = oy * outW;
      for (let ox = 0; ox < outW; ox++, o++) {
        let sum = 0;
        for (let k = 0; k < f; k++, p += 4) {
          const a = rgba[p + 3]! / 255;
          const y = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
          sum += y * a + 255 * (1 - a);
        }
        lum[o] = lum[o]! + sum * norm;
      }
    }
  }
}

/** Options of `detectEmbeddedGrid`. */
export interface DetectOptions {
  /** A picture larger than this is box-averaged down first (default `DETECT_MAX_SIDE`). */
  maxSide?: number;
}

/**
 * Finds a square grid drawn into a picture map, or returns null.
 *
 * @param rgba - `width × height` pixels, 4 bytes each (straight RGBA, what `getImageData` gives)
 * @param width - picture width
 * @param height - picture height
 * @param options - `maxSide`
 * @returns the detection in original picture pixels, or null when there is no grid or the input
 *   is too small or truncated
 */
export function detectEmbeddedGrid(
  rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, options: DetectOptions = {},
): GridDetection | null {
  if (width < 16 || height < 16 || rgba.length < width * height * 4) return null;
  const f = boxFactor(width, height, options.maxSide);
  const lb = new LuminanceBuilder(width, height, f);
  lb.addRows(rgba, 0, height);
  return detectFromLuminance(lb);
}

/**
 * Steps 1–5 on a finished `LuminanceBuilder` — the part of `detectEmbeddedGrid` after the
 * averaging, for callers that fed the picture strip by strip.
 *
 * @param lb - the luminance of the whole picture
 * @returns the detection in original picture pixels, or null
 */
export function detectFromLuminance(lb: LuminanceBuilder): GridDetection | null {
  if (lb.width < 16 || lb.height < 16) return null;
  const scale = lb.f;
  const w = lb.outW;
  const h = lb.outH;
  const px = profile(lb.lum, w, h, true);
  const py = profile(lb.lum, w, h, false);
  const minLag = Math.max(8, MIN_CELL_PX / scale);
  const rx = axisPeriod(px, minLag);
  const ry = axisPeriod(py, minLag);
  if (!rx || !ry) return null;
  const agree = Math.abs(rx.period - ry.period) / Math.max(rx.period, ry.period);
  const strength = Math.min(rx.strength, ry.strength);
  if (agree > 0.03 || strength < MIN_STRENGTH) return null;

  const cell = (rx.period + ry.period) / 2;
  const ox = phase(px, cell);
  const oy = phase(py, cell);
  const cellPx = cell * scale;
  const cols = wholeSquares(ox * scale, cellPx, lb.width);
  const rows = wholeSquares(oy * scale, cellPx, lb.height);
  if (cols < 2 || rows < 2) return null;
  return { cellPx, offsetX: ox * scale, offsetY: oy * scale, strength, cols, rows, pictureW: lb.width, pictureH: lb.height };
}

/**
 * Whole squares from the first line at `offset` to the end of `length` px, with the original's
 * tolerances (a first line hair after the edge is the edge; a last square short by less than
 * `EDGE_TOLERANCE` still counts).
 *
 * @param offset - first line, px
 * @param cellPx - square side, px
 * @param length - picture side, px
 * @returns the count
 */
export function wholeSquares(offset: number, cellPx: number, length: number): number {
  const tol = EDGE_TOLERANCE;
  const start = offset <= tol * cellPx || cellPx - offset <= tol * cellPx ? 0 : offset;
  return Math.floor((length - start) / cellPx + tol);
}

/**
 * A detection made on a scaled copy of a picture, in the picture's own pixels (the importer's
 * `scaled` plan for pictures too big to decode whole).
 *
 * @param d - the detection on the copy
 * @param pictureW - the picture's width
 * @param pictureH - its height
 * @returns the detection on the picture, or null when the counts come out under 2
 */
export function rescaleDetection(d: GridDetection, pictureW: number, pictureH: number): GridDetection | null {
  const rx = pictureW / d.pictureW;
  const ry = pictureH / d.pictureH;
  const cellPx = (d.cellPx * (rx + ry)) / 2;
  const offsetX = d.offsetX * rx;
  const offsetY = d.offsetY * ry;
  const cols = wholeSquares(offsetX, cellPx, pictureW);
  const rows = wholeSquares(offsetY, cellPx, pictureH);
  if (cols < 2 || rows < 2) return null;
  return { ...d, cellPx, offsetX, offsetY, cols, rows, pictureW, pictureH };
}

/**
 * Steps 1 + 2: the clipped edge profile across the lines that run vertically (or
 * horizontally), high-passed and lightly blurred. Sample `i` sits on pixel edge `i + 1`.
 */
function profile(lum: Float32Array, w: number, h: number, vertical: boolean): Float64Array {
  const clip = 24;
  const n = vertical ? w - 1 : h - 1;
  const p = new Float64Array(n);
  if (vertical) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < n; x++) {
        const d = Math.abs(lum[row + x + 1]! - lum[row + x]!);
        p[x] = p[x]! + (d < clip ? d : clip);
      }
    }
  } else {
    for (let y = 0; y < n; y++) {
      const a = y * w;
      const b = a + w;
      let s = 0;
      for (let x = 0; x < w; x++) {
        const d = Math.abs(lum[b + x]! - lum[a + x]!);
        s += d < clip ? d : clip;
      }
      p[y] = s;
    }
  }
  // High-pass: minus a centred 15-sample moving average; near the ends the average covers only
  // the samples that exist (zero padding would leave spikes at the edges that pull the phase).
  const half = 7;
  const out = new Float64Array(n);
  let win = 0;
  let count = 0;
  for (let i = 0; i < half && i < n; i++) {
    win += p[i]!;
    count++;
  }
  for (let i = 0; i < n; i++) {
    const add = i + half;
    if (add < n) {
      win += p[add]!;
      count++;
    }
    const drop = i - half - 1;
    if (drop >= 0) {
      win -= p[drop]!;
      count--;
    }
    out[i] = p[i]! - win / count;
  }
  // A light [1 2 3 2 1] blur: lines of different widths (a thick major line every fifth
  // square) then still overlap when shifted by one square, which the autocorrelation needs.
  const blurred = new Float64Array(n);
  const taps = [1, 2, 3, 2, 1];
  for (let i = 0; i < n; i++) {
    let s = 0;
    let wsum = 0;
    for (let t = -2; t <= 2; t++) {
      const j = i + t;
      if (j < 0 || j >= n) continue;
      s += out[j]! * taps[t + 2]!;
      wsum += taps[t + 2]!;
    }
    blurred[i] = s / wsum;
  }
  return blurred;
}

/** Step 3 on one axis's profile. */
function axisPeriod(p: Float64Array, minLag: number): { period: number; strength: number } | null {
  const n = p.length;
  const maxLag = Math.trunc(n / 3);
  const lo = Math.ceil(minLag);
  if (maxLag <= lo + 2) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += p[i]!;
  mean /= n;
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = p[i]! - mean;
  // Autocorrelation up to the lags the refinement needs.
  const lags = Math.min(n - 1, Math.ceil(n * 0.6) + 3);
  const ac = new Float64Array(lags + 1);
  for (let l = 0; l <= lags; l++) {
    let s = 0;
    for (let i = 0; i + l < n; i++) s += q[i]! * q[i + l]!;
    ac[l] = s;
  }
  if (ac[0]! <= 0) return null;
  for (let l = lags; l >= 0; l--) ac[l] = ac[l]! / ac[0]!;

  const peaks: number[] = [];
  for (let l = Math.max(lo, 1); l < maxLag && l < lags; l++) {
    if (ac[l]! > ac[l - 1]! && ac[l]! >= ac[l + 1]!) peaks.push(l);
  }
  if (peaks.length === 0) return null;
  let best = peaks.reduce((a, b) => (ac[a]! >= ac[b]! ? a : b));
  for (let d = 6; d >= 2; d--) {
    const c = best / d;
    if (c < 4) continue;
    // Fractions below the minimum cell are looked at too: a strong one means the repetition is
    // texture finer than any grid (bricks at 12 px also repeat at 24) → no grid on this axis.
    let l = -1;
    for (let t = Math.max(2, Math.ceil(c - 1.5)); t <= c + 1.5 && t < lags; t++) {
      if (ac[t]! > ac[t - 1]! && ac[t]! >= ac[t + 1]! && (l < 0 || ac[t]! > ac[l]!)) l = t;
    }
    if (l < 0 || ac[l]! < 0.5 * ac[best]!) continue;
    if (l < minLag) return null;
    best = l;
    break;
  }
  const strength = ac[best]!;
  const p0 = parabola(ac, best);
  let period = p0;
  for (let k = 2; k * p0 < n * 0.6; k++) {
    const c = Math.round(k * p0);
    if (c + 3 > lags) break;
    let j = c - 2;
    for (let t = c - 1; t <= c + 2; t++) {
      if (ac[t]! > ac[j]!) j = t;
    }
    if (ac[j]! < 0.5 * strength) break;
    period = parabola(ac, j) / k;
  }
  return { period, strength };
}

/** Sub-sample position of the peak at `l` from a parabola through its neighbours. */
function parabola(ac: Float64Array, l: number): number {
  const a = ac[l - 1]!;
  const b = ac[l]!;
  const c = ac[l + 1]!;
  const den = a - 2 * b + c;
  return den === 0 ? l : l + (0.5 * (a - c)) / den;
}

/** Step 5: where the lines sit, as a pixel-edge position in `[0, cell)`. */
function phase(p: Float64Array, cell: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < p.length; i++) {
    const w = p[i]!;
    if (w <= 0) continue;
    const a = (2 * Math.PI * (i + 1)) / cell;
    re += w * Math.cos(a);
    im += w * Math.sin(a);
  }
  const ang = Math.atan2(im, re);
  const o = ((ang < 0 ? ang + 2 * Math.PI : ang) / (2 * Math.PI)) * cell;
  return o >= cell ? 0 : o;
}
