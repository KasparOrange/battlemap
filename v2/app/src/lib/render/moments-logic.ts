/**
 * The pure parts of the table moments layer (`moments-layer.ts`): where the spotlight sits, what
 * the countdown rings show and when they next change, where the rings sit on the TV, and which
 * notes lie under a finger. No Pixi, no DOM — tested under `bun test`.
 *
 * @see ../../../../docs/features.md "table moments"
 */
import {
  formatTimer, timerEndsAt, timerLeft, timerPhase, TIMER_PULSE_MS,
  type DmNote, type MapPlay, type Point, type Spotlight, type Timer, type TimerPhase,
} from '@battlemap/shared';
import type { Size } from './camera.ts';

/**
 * The centre of the spotlight in squares, or null when it shows nothing: no spotlight, or its
 * token is gone, not on the map, or hidden from the players (on the TV).
 *
 * @param spot - the map's spotlight
 * @param map - the map (its tokens)
 * @param dm - the DM's view (hidden tokens still count there)
 * @returns the centre, or null
 */
export function spotlightCenter(spot: Spotlight | null | undefined, map: MapPlay, dm: boolean): Point | null {
  if (!spot) return null;
  const t = spot.target;
  if (t.kind === 'square') return { x: t.col + 0.5, y: t.row + 0.5 };
  const token = map.tokens.find((k) => k.id === t.tokenId);
  if (!token || !token.placed || (token.hidden && !dm)) return null;
  return { x: token.col + 0.5, y: token.row + 0.5 };
}

/** What the TV's countdown rings show at a moment. */
export interface TimerFace {
  /** `m:ss`. */
  text: string;
  /** How much of the ring is left, 1 (full) to 0. */
  fraction: number;
  /** ready, running, paused or done. */
  phase: TimerPhase;
  /** In the last seconds of a running countdown: the rings pulse. */
  pulse: boolean;
  /** ms until the printed seconds change (null when stopped or done: nothing changes). */
  nextChangeMs: number | null;
  /** ms since it ran out (null unless done after running) — the end effect plays right after. */
  sinceEndMs: number | null;
}

/**
 * The rings' face for a timer at a moment.
 *
 * @param t - the timer
 * @param now - the server's clock now, epoch ms
 * @returns the face
 */
export function timerFace(t: Timer, now: number): TimerFace {
  const left = timerLeft(t, now);
  const phase = timerPhase(t, now);
  const end = timerEndsAt(t);
  const running = phase === 'running';
  // the printed seconds round up, so they change when `left` crosses a whole second
  const intoSecond = left % 1000;
  return {
    text: formatTimer(left),
    fraction: t.durationMs > 0 ? Math.min(1, left / t.durationMs) : 0,
    phase,
    pulse: running && left <= TIMER_PULSE_MS,
    nextChangeMs: running ? (intoSecond === 0 ? 1000 : intoSecond) : null,
    sinceEndMs: phase === 'done' && end !== null ? Math.max(0, now - end) : null,
  };
}

/** How long the end effect plays, ms. */
export const END_EFFECT_MS = 1600;

/**
 * Whether the end effect should play now: the countdown ran out moments ago. A TV that reloads
 * long after the end shows a quiet 0:00 instead of replaying it (like a one-shot that is over).
 *
 * @param face - the face now
 * @returns true within {@link END_EFFECT_MS} of the end
 */
export function endEffectDue(face: TimerFace): boolean {
  return face.sinceEndMs !== null && face.sinceEndMs < END_EFFECT_MS;
}

/** One countdown ring on the TV: its centre (CSS px), radius and turn (radians). */
export interface RingPlace {
  /** Centre x. */
  x: number;
  /** Centre y. */
  y: number;
  /** Outer radius. */
  r: number;
  /** Turn so the digits read upright for that side (0 for the bottom side, π for the top). */
  rotation: number;
}

/**
 * Where the countdown rings sit: one at the middle of each long edge of the screen, each turned
 * upright for the players on that side (the TV lies flat). A portrait screen uses its long edges
 * too (left and right).
 *
 * @param view - the screen in CSS px
 * @returns the two rings
 */
export function ringPlaces(view: Size): RingPlace[] {
  const u = Math.max(view.width, view.height) / 64; // the TV's rem (design.md "the TV")
  const r = u * 2.1;
  const m = u * 0.45 + r;
  if (view.width >= view.height) {
    return [
      { x: view.width / 2, y: view.height - m, r, rotation: 0 },
      { x: view.width / 2, y: m, r, rotation: Math.PI },
    ];
  }
  return [
    { x: m, y: view.height / 2, r, rotation: Math.PI / 2 },
    { x: view.width - m, y: view.height / 2, r, rotation: -Math.PI / 2 },
  ];
}

/**
 * The note whose pin is under a point, nearest first.
 *
 * @param notes - the map's notes
 * @param at - the point in squares
 * @param grab - grab radius in squares (a finger's room at this zoom)
 * @returns the note, or null
 */
export function noteAt(notes: readonly DmNote[], at: Point, grab: number): DmNote | null {
  let best: DmNote | null = null;
  let bestD = grab * grab;
  for (const n of notes) {
    const dx = n.x - at.x;
    const dy = n.y - at.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * A note's label as the DM's map shows it: the first line, cut to fit a pill.
 *
 * @param text - the note's text
 * @param max - most characters (default 28)
 * @returns the label
 */
export function noteLabel(text: string, max = 28): string {
  const first = text.split('\n')[0]!.trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}
