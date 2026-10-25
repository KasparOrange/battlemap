/**
 * Render on demand. `invalidate()` asks for one frame (several calls in one frame coalesce);
 * something that animates holds a lease (`hold()`) and the loop runs every animation frame
 * until the last lease is released — or, for a lease with a frame-rate cap (`hold(name, 15)`,
 * slow drifts), only as often as the fastest lease asks. Nothing changed and nothing animates
 * → no frame at all. Tickers (`onFrame`) run right before each frame's render, with the clock.
 *
 * @see ../../../../docs/architecture.md "rendering"
 */

/** Requests a callback before the next repaint (`requestAnimationFrame` in a browser). */
export type FrameRequester = (callback: (time: number) => void) => number;

/** Waits a number of ms, then calls back (`setTimeout` in a browser). */
export type Delayer = (callback: () => void, ms: number) => unknown;

/** A function run before each frame's render. */
export type Ticker = (now: number) => void;

/** The render-on-demand loop. */
export class RenderScheduler {
  /** Frames drawn since start (the bench reads it; idle must not grow it). */
  frames = 0;
  /** CPU time of the last frame's tickers + `render()`, ms. */
  lastRenderMs = 0;
  /** CPU time of the last frame's tickers alone, ms. */
  lastTickMs = 0;

  private requested = false;
  private delayed = false;
  private lastFrameAt = -Infinity;
  /** Lease → its minimum ms between frames (0 = every frame). */
  private readonly leases = new Map<symbol, number>();
  private readonly tickers: Ticker[] = [];

  /**
   * @param render - draws one frame
   * @param requestFrame - the frame source (default `requestAnimationFrame`)
   * @param delay - the timer for capped leases (default `setTimeout`)
   * @param clock - the clock in ms (default `performance.now`)
   */
  constructor(
    private readonly render: () => void,
    private readonly requestFrame: FrameRequester = (cb) => requestAnimationFrame(cb),
    private readonly delay: Delayer = (cb, ms) => setTimeout(cb, ms),
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** Asks for one frame. */
  invalidate(): void {
    if (this.requested) return;
    this.requested = true;
    this.requestFrame(() => this.frame());
  }

  /**
   * Keeps frames coming while something animates.
   *
   * @param name - what animates (for debugging)
   * @param maxFps - cap for this lease (default: every animation frame)
   * @returns release — call it when the animation ends (calling it twice is harmless)
   */
  hold(name: string, maxFps?: number): () => void {
    const lease = Symbol(name);
    this.leases.set(lease, maxFps && maxFps > 0 ? 1000 / maxFps : 0);
    this.invalidate();
    return () => {
      this.leases.delete(lease);
    };
  }

  /**
   * Runs a function before every frame's render (animations step here).
   *
   * @param ticker - gets the clock in ms
   * @returns a function that removes it
   */
  onFrame(ticker: Ticker): () => void {
    this.tickers.push(ticker);
    return () => {
      const i = this.tickers.indexOf(ticker);
      if (i >= 0) this.tickers.splice(i, 1);
    };
  }

  /** Whether anything holds the loop. */
  get animating(): boolean {
    return this.leases.size > 0;
  }

  /** The shortest interval any lease asks for (ms), or null without leases. */
  private interval(): number | null {
    if (this.leases.size === 0) return null;
    let min = Infinity;
    for (const ms of this.leases.values()) if (ms < min) min = ms;
    return min;
  }

  private frame(): void {
    this.requested = false;
    const t0 = this.clock();
    this.lastFrameAt = t0;
    for (let i = 0; i < this.tickers.length; i++) this.tickers[i]!(t0);
    const t1 = this.clock();
    this.render();
    const t2 = this.clock();
    this.lastTickMs = t1 - t0;
    this.lastRenderMs = t2 - t0;
    this.frames++;
    this.scheduleNext();
  }

  /** Keeps the loop going for leases, at the rate the fastest one asks. */
  private scheduleNext(): void {
    const ms = this.interval();
    if (ms === null) return;
    if (ms <= 0) {
      this.invalidate();
      return;
    }
    if (this.delayed) return;
    this.delayed = true;
    const wait = Math.max(0, this.lastFrameAt + ms - this.clock() - 4);
    this.delay(() => {
      this.delayed = false;
      if (this.leases.size > 0) this.invalidate();
    }, wait);
  }
}
