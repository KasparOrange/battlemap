/**
 * The curtain's clock on the TV — pure, no Pixi, tested under `bun test`. It turns the state's
 * curtain (`Game.curtain.down`) into what the screen shows: the curtain's opacity, and whether
 * the scene must keep drawing the state it showed before ("hold").
 *
 * The one promise (roadmap N8): **the players never see a change made behind the curtain until
 * it lifts.** So:
 *
 * - **falling** (0 → 1 over `fallMs`): the scene holds — it keeps the state from before the
 *   curtain was asked down, even if the same update switched the map; changes wait.
 * - **down** (1): the scene draws the newest state behind the opaque curtain (the new map loads
 *   there, unseen).
 * - **lift asked while falling**: the fall finishes first, then the curtain stays down for at
 *   least `dwellMs` — a quick down-switch-up never flashes half-done things.
 * - **rising** (1 → 0 over `riseMs`): starts once the map behind is ready (its picture is on the
 *   GPU) or after `readyWaitMs` at the latest; shows the new state in one fade.
 * - **another game or the first state**: no animation — the curtain snaps to what the game says
 *   (a TV that reloads behind the curtain comes back behind it).
 */

/** What the curtain is doing. */
export type CurtainPhase = 'up' | 'falling' | 'down' | 'rising';

/** Timings of the curtain, ms. */
export interface CurtainTimings {
  /** Fade to the curtain. */
  fallMs: number;
  /** Fade back to the table. */
  riseMs: number;
  /** Shortest time fully down before it may rise. */
  dwellMs: number;
  /** Longest wait for the map behind to be ready before rising anyway. */
  readyWaitMs: number;
}

/** The TV's timings: a calm fade down, a slower reveal. */
export const CURTAIN_TIMINGS: CurtainTimings = { fallMs: 700, riseMs: 1000, dwellMs: 300, readyWaitMs: 4000 };

/** One frame's answer. */
export interface CurtainFrame {
  /** The phase after this step. */
  phase: CurtainPhase;
  /** The curtain's opacity, 0–1 (eased). */
  alpha: number;
  /** Whether the scene keeps the state it showed before the curtain fell. */
  hold: boolean;
  /** Whether frames must keep coming (a fade runs or the curtain waits to rise). */
  animating: boolean;
}

/** The curtain's state machine. */
export class CurtainClock {
  private phase: CurtainPhase = 'up';
  private wantDown = false;
  /** Linear progress 0–1 of the curtain's opacity (eased on output). */
  private level = 0;
  private lastAt: number | null = null;
  private downSince = 0;
  private liftAskedAt = 0;

  /** @param timings - the fade and wait times */
  constructor(private readonly timings: CurtainTimings = CURTAIN_TIMINGS) {}

  /** The phase now. */
  get current(): CurtainPhase {
    return this.phase;
  }

  /** Whether the scene must keep its old state (the curtain is falling). */
  get holding(): boolean {
    return this.phase === 'falling';
  }

  /**
   * The state says down or up.
   *
   * @param down - the game's curtain is down
   * @param now - the clock, ms
   * @param snap - jump there without a fade (another game, the first state)
   * @returns whether the scene must hold its old state now
   */
  want(down: boolean, now: number, snap = false): boolean {
    if (snap) {
      this.wantDown = down;
      this.phase = down ? 'down' : 'up';
      this.level = down ? 1 : 0;
      this.downSince = now - this.timings.dwellMs;
      this.lastAt = now;
      return false;
    }
    if (down === this.wantDown) return this.holding;
    this.wantDown = down;
    if (down) {
      if (this.phase === 'up' || this.phase === 'rising') {
        this.phase = 'falling';
        this.lastAt = now;
      }
    } else {
      this.liftAskedAt = now;
    }
    return this.holding;
  }

  /**
   * Steps the clock.
   *
   * @param now - the clock, ms
   * @param mapReady - whether the map behind the curtain is ready to be seen
   * @returns opacity, phase, hold, whether to keep animating
   */
  step(now: number, mapReady: boolean): CurtainFrame {
    const dt = this.lastAt === null ? 0 : Math.max(0, now - this.lastAt);
    this.lastAt = now;
    const t = this.timings;
    if (this.phase === 'falling') {
      this.level = Math.min(1, this.level + dt / t.fallMs);
      if (this.level >= 1) {
        this.phase = 'down';
        this.downSince = now;
      }
    }
    if (this.phase === 'down' && !this.wantDown) {
      const dwelt = now - this.downSince >= t.dwellMs;
      const ready = mapReady || now - this.liftAskedAt >= t.readyWaitMs;
      if (dwelt && ready) this.phase = 'rising';
    } else if (this.phase === 'rising') {
      this.level = Math.max(0, this.level - dt / t.riseMs);
      if (this.level <= 0) this.phase = 'up';
    }
    return {
      phase: this.phase,
      alpha: ease(this.level),
      hold: this.holding,
      animating: this.phase === 'falling' || this.phase === 'rising' || (this.phase === 'down' && !this.wantDown),
    };
  }
}

/** Smooth start and end (sine in-out). */
function ease(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
}
