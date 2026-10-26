/**
 * The reveal animation's timing — pure, no Pixi. When the DM reveals squares, each new square
 * starts with full fog in the fog texture's G channel and loses it over the style's duration
 * (ease-out); hiding is instant. Two styles:
 *
 * | style | duration | start |
 * |---|---|---|
 * | `fade` | `FADE_MS` (500 ms) | every square at once — the plain alpha fade |
 * | `wisps` | `WISPS_MS` (900 ms) | staggered by Chebyshev distance from the fog already revealed, `STAGGER_MS` per square, the whole reveal capped at `MAX_TOTAL_MS` |
 *
 * The shader turns G into a plain fade or, for `wisps`, into a noise dissolve with a smoke tint
 * (`fog-layer.ts`). No allocation per frame: animating squares live in typed arrays that only
 * grow; the distance pass's buffer only grows too.
 *
 * @see ./fog-texels.ts for the texel layout (R revealed, G extra fog)
 * @see ./fog-layer.ts for the lease that steps it
 */

/** How the reveal animates. */
export type RevealStyle = 'fade' | 'wisps';

/** How long a square fades in the plain `fade` style, ms. */
export const FADE_MS = 500;

/** How long one square dissolves in the `wisps` style, ms. */
export const WISPS_MS = 900;

/** Extra delay per square of distance from the already revealed fog (`wisps`), ms. */
export const STAGGER_MS = 40;

/** The whole `wisps` reveal (last square's delay + its dissolve) finishes within this, ms. */
export const MAX_TOTAL_MS = 1600;

/** Distance value for "no seed reached yet". */
const FAR = 0xffff;

/**
 * Steps a reveal animation by writing G for every animating square.
 *
 * The style is read when squares start and in every step; changing it mid-animation changes
 * the duration of what still runs (harmless, the setting rarely changes during a reveal).
 */
export class RevealAnim {
  /** The style new and running squares use (default `fade`, the plain fade). */
  style: RevealStyle = 'fade';
  private cells = new Int32Array(256);
  private starts = new Float64Array(256);
  private count = 0;
  private dist = new Uint16Array(0);
  /** First row the last `step` wrote. */
  first = 0;
  /** Last row the last `step` wrote. */
  last = -1;

  /** Squares still animating (waiting for their start or dissolving). */
  get active(): number {
    return this.count;
  }

  /** One square's dissolve time in the current style, ms. */
  get duration(): number {
    return this.style === 'wisps' ? WISPS_MS : FADE_MS;
  }

  /**
   * Starts animating every square that is revealed in `next` but was not in `prev` (R channel),
   * and clears G on every fogged square (hide is instant).
   *
   * In `wisps`, a square's start is delayed by its Chebyshev distance (in squares) from the
   * nearest square revealed both before and after — minus the change's nearest distance, so the
   * front starts right away — `STAGGER_MS` per square, compressed so the last square ends
   * by `MAX_TOTAL_MS`. Nothing revealed before: the distance from the change's centre.
   *
   * @param prev - the texels before
   * @param next - the texels after (G of new squares is set to 255 here)
   * @param now - the clock, ms
   * @param cols - map width in squares; 0 = no stagger (every square starts now)
   * @returns how many squares started
   */
  start(prev: Uint8Array, next: Uint8Array, now: number, cols = 0): number {
    const cells = Math.floor(next.length / 4);
    let started = 0;
    let sx = 0;
    let sy = 0;
    let seeds = 0;
    for (let i = 0; i < cells; i++) {
      const o = i * 4;
      if (next[o]! && !prev[o]!) {
        next[o + 1] = 255;
        started++;
        if (cols > 0) {
          sx += (i % cols) + 0.5;
          sy += Math.floor(i / cols) + 0.5;
        }
      } else if (!next[o]!) {
        next[o + 1] = 0; // fog again: nothing to animate
      } else if (prev[o]!) {
        seeds++;
      }
    }
    if (started === 0) return 0;
    const stagger = this.style === 'wisps' && cols > 0 && cells % cols === 0;
    if (stagger && seeds > 0) this.distances(prev, next, cols, cells);
    const cx = sx / started;
    const cy = sy / started;
    // Pass 1: the change's nearest and farthest distance; pass 2: push with the delays.
    let dMin = Infinity;
    let dMax = 0;
    if (stagger) {
      for (let i = 0; i < cells; i++) {
        const o = i * 4;
        if (!next[o]! || prev[o]!) continue;
        const d = seeds > 0 ? this.dist[i]! : Math.max(Math.abs((i % cols) + 0.5 - cx), Math.abs(Math.floor(i / cols) + 0.5 - cy));
        if (d < dMin) dMin = d;
        if (d > dMax) dMax = d;
      }
    }
    const span = stagger ? (dMax - dMin) * STAGGER_MS : 0;
    const room = Math.max(0, MAX_TOTAL_MS - WISPS_MS);
    const perSquare = span > room ? room / (dMax - dMin) : STAGGER_MS;
    for (let i = 0; i < cells; i++) {
      const o = i * 4;
      if (!next[o]! || prev[o]!) continue;
      let delay = 0;
      if (stagger) {
        const d = seeds > 0 ? this.dist[i]! : Math.max(Math.abs((i % cols) + 0.5 - cx), Math.abs(Math.floor(i / cols) + 0.5 - cy));
        delay = (d - dMin) * perSquare;
      }
      this.push(i, now + delay);
    }
    return started;
  }

  /**
   * Advances the animation: writes G for every animating square, drops finished ones and those
   * hidden again.
   *
   * @param texels - the buffer to write
   * @param cols - texels per row
   * @param now - the clock, ms
   * @returns whether rows were written (then `first`…`last`); allocates nothing
   */
  step(texels: Uint8Array, cols: number, now: number): boolean {
    if (this.count === 0) return false;
    const dur = this.duration;
    let first = Infinity;
    let last = -1;
    let keep = 0;
    for (let k = 0; k < this.count; k++) {
      const cell = this.cells[k]!;
      const o = cell * 4;
      const t = Math.min(1, Math.max(0, (now - this.starts[k]!) / dur));
      const revealed = texels[o]! !== 0;
      const g = revealed ? Math.round(255 * (1 - t) * (1 - t)) : 0;
      if (texels[o + 1] !== g) {
        texels[o + 1] = g;
        const row = Math.floor(cell / cols);
        if (row < first) first = row;
        if (row > last) last = row;
      }
      if (t < 1 && revealed) {
        this.cells[keep] = cell;
        this.starts[keep] = this.starts[k]!;
        keep++;
      }
    }
    this.count = keep;
    this.first = last < 0 ? 0 : first;
    this.last = last;
    return last >= 0;
  }

  /** Forgets every animating square (a new map, a snapshot, the animation switched off). */
  clear(): void {
    this.count = 0;
  }

  /**
   * Chebyshev distance from every square to the nearest square revealed before and after, by
   * two passes over the grid (uncapped up to `FAR`), into `this.dist`.
   */
  private distances(prev: Uint8Array, next: Uint8Array, cols: number, cells: number): void {
    if (this.dist.length < cells) this.dist = new Uint16Array(Math.max(cells, this.dist.length * 2));
    const dist = this.dist;
    const rows = cells / cols;
    for (let i = 0; i < cells; i++) dist[i] = prev[i * 4]! && next[i * 4]! ? 0 : FAR;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let d = dist[i]!;
        if (d === 0) continue;
        if (x > 0) d = Math.min(d, dist[i - 1]! + 1);
        if (y > 0) {
          d = Math.min(d, dist[i - cols]! + 1);
          if (x > 0) d = Math.min(d, dist[i - cols - 1]! + 1);
          if (x < cols - 1) d = Math.min(d, dist[i - cols + 1]! + 1);
        }
        dist[i] = Math.min(d, FAR);
      }
    }
    for (let y = rows - 1; y >= 0; y--) {
      for (let x = cols - 1; x >= 0; x--) {
        const i = y * cols + x;
        let d = dist[i]!;
        if (d === 0) continue;
        if (x < cols - 1) d = Math.min(d, dist[i + 1]! + 1);
        if (y < rows - 1) {
          d = Math.min(d, dist[i + cols]! + 1);
          if (x < cols - 1) d = Math.min(d, dist[i + cols + 1]! + 1);
          if (x > 0) d = Math.min(d, dist[i + cols - 1]! + 1);
        }
        dist[i] = Math.min(d, FAR);
      }
    }
  }

  private push(cell: number, start: number): void {
    // A square hidden and revealed again while animating may sit here twice; the later entry is
    // written last in `step`, so it wins — harmless, and no O(n²) search.
    if (this.count === this.cells.length) {
      const c = new Int32Array(this.cells.length * 2);
      c.set(this.cells);
      this.cells = c;
      const s = new Float64Array(this.starts.length * 2);
      s.set(this.starts);
      this.starts = s;
    }
    this.cells[this.count] = cell;
    this.starts[this.count] = start;
    this.count++;
  }
}
