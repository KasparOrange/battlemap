/**
 * Render on demand. `invalidate()` asks for one frame (several calls in one frame coalesce);
 * something that animates holds a lease (`hold()`) and the loop runs every animation frame
 * until the last lease is released. Nothing changed and nothing animates → no frame at all.
 *
 * @see ../../../../docs/architecture.md "rendering"
 */

/** Requests a callback before the next repaint (`requestAnimationFrame` in a browser). */
export type FrameRequester = (callback: (time: number) => void) => number;

/** The render-on-demand loop. */
export class RenderScheduler {
  /** Frames drawn since start (the bench reads it; idle must not grow it). */
  frames = 0;
  /** CPU time of the last `render()`, ms. */
  lastRenderMs = 0;

  private requested = false;
  private readonly leases = new Set<symbol>();

  /**
   * @param render - draws one frame
   * @param requestFrame - the frame source (default `requestAnimationFrame`)
   */
  constructor(
    private readonly render: () => void,
    private readonly requestFrame: FrameRequester = (cb) => requestAnimationFrame(cb),
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
   * @returns release — call it when the animation ends
   */
  hold(name: string): () => void {
    const lease = Symbol(name);
    this.leases.add(lease);
    this.invalidate();
    return () => {
      this.leases.delete(lease);
    };
  }

  /** Whether anything holds the loop. */
  get animating(): boolean {
    return this.leases.size > 0;
  }

  private frame(): void {
    this.requested = false;
    const t0 = performance.now();
    this.render();
    this.lastRenderMs = performance.now() - t0;
    this.frames++;
    if (this.leases.size > 0) this.invalidate();
  }
}
