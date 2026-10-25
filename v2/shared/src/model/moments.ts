/**
 * Table moments (roadmap S6, S8, S10, S11): the spotlight under one mini, the countdown on the
 * TV, handouts shown to the players, and the DM's own notes pinned to the map. The schemas live
 * here; `game.ts` holds them in the game and its maps. The commands are `spotlight.set`,
 * `timer.set`, `handout.*` and `note.*` (`docs/features.md` "table moments").
 *
 * The timer is plain data stamped with the **server's clock** (like one-shot effects, rv#16):
 * `startedAt` says when it last started, `remainingMs` what was left then, so any screen — a TV
 * that just reloaded too — works out what is left now with {@link timerLeft}. The reducer never
 * reads a clock; the companion makes the new value with {@link startTimer} / {@link pauseTimer}.
 */
import * as v from 'valibot';
import { Count, FileRef, Id, Num } from './basics.ts';
import type { RootState } from './root.ts';

// ── spotlight (S8) ──────────────────────────────────────────────────────────────────────────

/** Where the spotlight sits: a square, or a token (it follows the token). */
export const SpotlightTarget = v.variant('kind', [
  /** A square of the map. */
  v.object({ kind: v.literal('square'), col: Count, row: Count }),
  /** A token: the light follows it and goes out while it is hidden or off the map. */
  v.object({ kind: v.literal('token'), tokenId: Id }),
]);
/** A spotlight target; see the schema of the same name. */
export type SpotlightTarget = v.InferOutput<typeof SpotlightTarget>;

/** How much the rest of the table dims at most (0.6 = 60 % darker). */
export const MAX_SPOTLIGHT_DIM = 0.6;

/** The spotlight of one map: a soft light ring under a mini, the rest of the table a little dimmer. */
export const Spotlight = v.object({
  /** Where it sits. */
  target: SpotlightTarget,
  /** How much the rest of the table dims (0 = not at all, {@link MAX_SPOTLIGHT_DIM} at most). */
  dim: v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_SPOTLIGHT_DIM)),
});
/** A spotlight; see the schema of the same name. */
export type Spotlight = v.InferOutput<typeof Spotlight>;

/** The dim levels the companion offers ("None", "A little", "More"). */
export const SPOTLIGHT_DIMS = [0, 0.3, 0.5] as const;

// ── timer (S11) ─────────────────────────────────────────────────────────────────────────────

/** The longest countdown (99 minutes 59 seconds). */
export const MAX_TIMER_MS = (99 * 60 + 59) * 1000;

/** What the TV does when the countdown runs out. */
export const TimerEndEffect = v.picklist(['none', 'glow', 'flash']);
/** `none`: it just reads 0:00; `glow`: the rings flare gold; `flash`: the table flashes warm white once. */
export type TimerEndEffect = v.InferOutput<typeof TimerEndEffect>;

/** The countdown on the TV. */
export const Timer = v.object({
  /** The full length, ms (what Reset goes back to). */
  durationMs: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(MAX_TIMER_MS)),
  /** What was left when it last started or paused, ms. */
  remainingMs: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_TIMER_MS)),
  /** When it last started (the server's clock, epoch ms); null while it is stopped. */
  startedAt: v.nullable(Num),
  /** What the TV does when it runs out. */
  endEffect: TimerEndEffect,
});
/** The countdown; see the schema of the same name. */
export type Timer = v.InferOutput<typeof Timer>;

/** The countdown's last seconds, in which the TV's rings pulse gently. */
export const TIMER_PULSE_MS = 10_000;

/** What a timer is doing. */
export type TimerPhase = 'ready' | 'running' | 'paused' | 'done';

/**
 * A new, stopped countdown.
 *
 * @param durationMs - its length, ms (clamped to 1 s – 99:59)
 * @param endEffect - what happens when it runs out
 * @returns the timer
 */
export function newTimer(durationMs: number, endEffect: TimerEndEffect = 'glow'): Timer {
  const d = clampDuration(durationMs);
  return { durationMs: d, remainingMs: d, startedAt: null, endEffect };
}

/**
 * A length clamped to what a timer can count, whole ms.
 *
 * @param ms - a length
 * @returns 1 s to 99:59, whole ms
 */
export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return 60_000;
  return Math.min(MAX_TIMER_MS, Math.max(1000, Math.round(ms)));
}

/**
 * What is left now.
 *
 * @param t - the timer
 * @param now - the server's clock now, epoch ms
 * @returns ms left (0 once it ran out; never more than when it started — a clock behind the
 *   server's doesn't add time)
 */
export function timerLeft(t: Timer, now: number): number {
  if (t.startedAt === null) return t.remainingMs;
  return Math.max(0, t.remainingMs - Math.max(0, now - t.startedAt));
}

/**
 * When a running timer runs out.
 *
 * @param t - the timer
 * @returns the server's clock at the end, epoch ms; null while stopped
 */
export function timerEndsAt(t: Timer): number | null {
  return t.startedAt === null ? null : t.startedAt + t.remainingMs;
}

/**
 * What a timer is doing now.
 *
 * @param t - the timer
 * @param now - the server's clock now
 * @returns `ready` (stopped at its full length), `running`, `paused` (stopped part-way) or `done`
 */
export function timerPhase(t: Timer, now: number): TimerPhase {
  const left = timerLeft(t, now);
  if (left <= 0) return 'done';
  if (t.startedAt !== null) return 'running';
  return left >= t.durationMs ? 'ready' : 'paused';
}

/**
 * Starts (or resumes) a timer now; one that ran out starts over from its full length.
 *
 * @param t - the timer
 * @param now - the server's clock now
 * @returns the running timer (the same object when it already runs)
 */
export function startTimer(t: Timer, now: number): Timer {
  if (t.startedAt !== null && timerLeft(t, now) > 0) return t;
  const left = timerLeft(t, now);
  return { ...t, remainingMs: left > 0 ? left : t.durationMs, startedAt: now };
}

/**
 * Pauses a timer now, keeping what is left.
 *
 * @param t - the timer
 * @param now - the server's clock now
 * @returns the stopped timer
 */
export function pauseTimer(t: Timer, now: number): Timer {
  if (t.startedAt === null) return t;
  return { ...t, remainingMs: Math.round(timerLeft(t, now)), startedAt: null };
}

/**
 * Back to the full length, stopped.
 *
 * @param t - the timer
 * @returns the reset timer
 */
export function resetTimer(t: Timer): Timer {
  return { ...t, remainingMs: t.durationMs, startedAt: null };
}

/**
 * The countdown as the TV and the tablet print it: whole seconds rounded up ("1:00" for a full
 * minute, "0:01" for its last second, "0:00" when done).
 *
 * @param ms - ms left
 * @returns `m:ss`
 */
export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── handouts (S10) ──────────────────────────────────────────────────────────────────────────

/** Longest text of a letter handout. */
export const MAX_HANDOUT_TEXT = 2000;
/** Most handouts one game keeps. */
export const MAX_HANDOUTS = 32;

/** A picture or a short letter the DM can show the players on the TV. */
export const Handout = v.object({
  /** Made by the companion that added it. */
  id: Id,
  /** Its name in the list (a letter's title on the TV). */
  name: v.pipe(v.string(), v.maxLength(120)),
  /** A picture, or a letter (text). */
  kind: v.picklist(['picture', 'letter']),
  /** The picture (null for a letter). */
  file: v.nullable(FileRef),
  /** The letter's text, or a picture's caption ("" = none). */
  text: v.pipe(v.string(), v.maxLength(MAX_HANDOUT_TEXT)),
});
/** A handout; see the schema of the same name. */
export type Handout = v.InferOutput<typeof Handout>;

/** A side of the table (the TV lies flat): the people sitting there read things upright. */
export const TableSide = v.picklist(['bottom', 'top', 'left', 'right']);
/** A side of the table; see the schema of the same name. */
export type TableSide = v.InferOutput<typeof TableSide>;

/** Which handout the TV shows, how and for which side. */
export const HandoutShown = v.object({
  /** The handout. */
  id: Id,
  /** `edge`: a card at the table's edge (in the margin around the window), the map stays; `full`: a pause card over the whole TV. */
  place: v.picklist(['edge', 'full']),
  /** The side it reads upright for. */
  side: TableSide,
});
/** The shown handout; see the schema of the same name. */
export type HandoutShown = v.InferOutput<typeof HandoutShown>;

/**
 * The clockwise turn (degrees) that makes something upright for people at a side of the table:
 * bottom 0, left 90, top 180, right −90 (as `render/label-facing.ts` turns token labels).
 *
 * @param side - the table side
 * @returns degrees
 */
export function sideTurn(side: TableSide): number {
  return side === 'bottom' ? 0 : side === 'top' ? 180 : side === 'left' ? 90 : -90;
}

// ── DM notes (S6) ───────────────────────────────────────────────────────────────────────────

/** Longest text of a DM note. */
export const MAX_NOTE_TEXT = 200;
/** Most notes one map keeps. */
export const MAX_NOTES = 200;

/** A sticky note pinned to the map — seen only on the tablet, never by the players. */
export const DmNote = v.object({
  /** Made by the companion that added it. */
  id: Id,
  /** Where the pin sits, in squares (fractional). */
  x: Num,
  /** Where the pin sits, in squares (fractional). */
  y: Num,
  /** "Trap here", "DC 15 lock". */
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_NOTE_TEXT)),
});
/** A DM note; see the schema of the same name. */
export type DmNote = v.InferOutput<typeof DmNote>;

/**
 * The state with every DM note taken out — the maps' notes and their undo steps. Whatever is
 * handed to players (a player view, S12) goes through this first: notes are the DM's secrets.
 * The TV holds them (it saves the game) but never draws them.
 *
 * @param root - the full state
 * @returns the state without notes (the same object when there were none)
 */
export function withoutDmNotes(root: RootState): RootState {
  const game = root.game;
  const noteSteps = root.history.undo.some((e) => e.kind === 'notes') || root.history.redo.some((e) => e.kind === 'notes');
  const mapsWithNotes = game ? Object.values(game.maps).some((m) => (m.notes?.length ?? 0) > 0) : false;
  if (!noteSteps && !mapsWithNotes) return root;
  const maps = game && mapsWithNotes
    ? Object.fromEntries(Object.entries(game.maps).map(([id, m]) => [id, m.notes?.length ? { ...m, notes: [] } : m]))
    : game?.maps;
  return {
    ...root,
    game: game && maps ? { ...game, maps } : game,
    history: noteSteps
      ? { undo: root.history.undo.filter((e) => e.kind !== 'notes'), redo: root.history.redo.filter((e) => e.kind !== 'notes') }
      : root.history,
  };
}
