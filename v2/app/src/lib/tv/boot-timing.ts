/**
 * TV start timing (qa#11): how long a reload takes until the table shows the map again, split
 * into its steps. Each step is a User Timing mark (`bm:<step>`, ms since the page started
 * loading — visible in the browser's performance panel and to the e2e flows) and the whole split
 * goes out once as one log line, area `perf`, when the first frame with the map has been drawn.
 *
 * Steps: `script` (TV mode's code runs), `mounted`, `booted` (calibration + last game read from
 * the device), `renderer` (WebGL ready), `map-loading`, `map-shown` (tiles uploaded), `frame`
 * (the first frame with the map is on screen).
 */
import type { Logger } from '../log.ts';

/** The steps in their usual order. */
export const BOOT_STEPS = ['script', 'mounted', 'booted', 'renderer', 'map-loading', 'map-shown', 'frame'] as const;

/** One step of the start. */
export type BootStep = (typeof BOOT_STEPS)[number];

/** Milliseconds since navigation start per step reached. */
export type BootMarks = Partial<Record<BootStep, number>>;

/**
 * The durations between consecutive steps that were reached (`booted: 120` = 120 ms from the
 * step before it to `booted`), plus the total to the last one.
 *
 * @param marks - ms since navigation start per step
 * @returns step → ms since the previous reached step, and `total`
 */
export function bootSplit(marks: BootMarks): Record<string, number> {
  const out: Record<string, number> = {};
  let prev = 0;
  for (const step of BOOT_STEPS) {
    const at = marks[step];
    if (at === undefined) continue;
    out[step] = Math.round(at - prev);
    prev = at;
  }
  out.total = Math.round(prev);
  return out;
}

/** Records the start's steps once each and logs the split when the map's first frame is drawn. */
export class BootTiming {
  private readonly marks: BootMarks = {};
  private reported = false;

  /**
   * @param log - the logger
   * @param now - ms since navigation start (default `performance.now`)
   */
  constructor(
    private readonly log: Logger,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Marks a step (only its first time; a later map load is not the start any more).
   *
   * @param step - the step reached
   */
  mark(step: BootStep): void {
    if (this.reported || this.marks[step] !== undefined) return;
    const at = this.now();
    this.marks[step] = at;
    try {
      performance.mark(`bm:${step}`, { startTime: at });
    } catch {
      // older engines without mark options: the log line still carries it
    }
  }

  /**
   * The first frame with the map is on screen: logs the split once.
   *
   * @param extra - fields to add (the map's fetch / decode / upload ms)
   */
  report(extra: Record<string, unknown> = {}): void {
    if (this.reported) return;
    this.mark('frame');
    this.reported = true;
    this.log.info('perf', 'TV start → first frame with the map', { ...bootSplit(this.marks), ...extra });
  }

  /** The start ended without a map (no game to reopen): nothing to report any more. */
  noMap(): void {
    if (this.reported) return;
    this.reported = true;
    this.log.info('perf', 'TV start without a map', bootSplit(this.marks));
  }

  /** @returns a copy of the marks so far */
  snapshot(): BootMarks {
    return { ...this.marks };
  }
}
