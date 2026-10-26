/**
 * The Moments tab's pure parts (`docs/features.md` "table moments"): what a tap does to the
 * spotlight, the words the panel prints for the spotlight, the timer and the handouts, where a
 * note pin sits in board words ("C4") and the timer presets.
 * No Svelte, no DOM — tested under `bun test`.
 */
import {
  clampDuration, formatTimer, MAX_NOTE_TEXT, newTimer, pauseTimer, resetTimer, startTimer, timerLeft, timerPhase,
  type DmNote, type Handout, type MapPlay, type Spotlight, type SpotlightTarget, type TableSide, type Timer, type TimerEndEffect,
} from '@battlemap/shared';

// ── spotlight ───────────────────────────────────────────────────────────────────────────────

/**
 * The spotlight after a tap: on the token under the finger, else on the square; a tap on what is
 * lit already puts it out.
 *
 * @param now - the map's spotlight now
 * @param tokenId - the token under the finger, or null
 * @param square - the square under the finger
 * @param dim - how much the rest of the table dims (this tablet's choice)
 * @returns the new spotlight, or null (out)
 */
export function spotlightAfterTap(
  now: Spotlight | null,
  tokenId: string | null,
  square: { col: number; row: number },
  dim: number,
): Spotlight | null {
  const target: SpotlightTarget = tokenId ? { kind: 'token', tokenId } : { kind: 'square', col: square.col, row: square.row };
  if (now && sameTarget(now.target, target)) return null;
  return { target, dim };
}

/** Whether two spotlight targets are the same token or square. */
function sameTarget(a: SpotlightTarget, b: SpotlightTarget): boolean {
  if (a.kind === 'token' && b.kind === 'token') return a.tokenId === b.tokenId;
  if (a.kind === 'square' && b.kind === 'square') return a.col === b.col && a.row === b.row;
  return false;
}

/**
 * A square in board words: column letters, row number ("A1" top left, "AB12" past Z).
 *
 * @param col - the column (0-based)
 * @param row - the row (0-based)
 * @returns the name
 */
export function squareName(col: number, row: number): string {
  let n = Math.max(0, Math.floor(col));
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${letters}${Math.max(0, Math.floor(row)) + 1}`;
}

/**
 * What the panel says about the spotlight.
 *
 * @param map - the map on the table
 * @returns "Off", "On Goblin (C4)", "On square C4", or "Its token left the map"
 */
export function spotlightText(map: MapPlay): string {
  const s = map.spotlight;
  if (!s) return 'Off';
  const t = s.target;
  if (t.kind === 'square') return `On square ${squareName(t.col, t.row)}`;
  const token = map.tokens.find((k) => k.id === t.tokenId);
  if (!token || !token.placed) return 'Its token left the map';
  const who = token.name.trim() || `Token ${token.label}`;
  return `On ${who} (${squareName(token.col, token.row)})${token.hidden ? ' · hidden from the players' : ''}`;
}

/** The dim choices: id, label, value. */
export const DIM_OPTIONS = [
  { id: 'none', label: 'None', value: 0 },
  { id: 'little', label: 'A little', value: 0.3 },
  { id: 'more', label: 'More', value: 0.5 },
] as const;

/**
 * The dim choice nearest to a value.
 *
 * @param dim - a dim
 * @returns the option id
 */
export function dimOption(dim: number): (typeof DIM_OPTIONS)[number]['id'] {
  let best: (typeof DIM_OPTIONS)[number] = DIM_OPTIONS[1];
  for (const o of DIM_OPTIONS) if (Math.abs(o.value - dim) < Math.abs(best.value - dim)) best = o;
  return best.id;
}

// ── timer ───────────────────────────────────────────────────────────────────────────────────

/** The one-tap lengths, ms. */
export const TIMER_PRESETS = [
  { id: '30', label: '30 s', ms: 30_000 },
  { id: '60', label: '1 min', ms: 60_000 },
  { id: '300', label: '5 min', ms: 300_000 },
] as const;

/**
 * A new countdown that runs at once (a preset tap — the point is to start it).
 *
 * @param ms - its length
 * @param endEffect - what the TV does at the end
 * @param now - the server's clock
 * @returns the running timer
 */
export function presetTimer(ms: number, endEffect: TimerEndEffect, now: number): Timer {
  return startTimer(newTimer(clampDuration(ms), endEffect), now);
}

/** What the Start / Pause button does now. */
export type TimerAction = 'start' | 'pause' | 'resume' | 'again';

/**
 * The main button of a timer now.
 *
 * @param t - the timer
 * @param now - the server's clock
 * @returns start (ready), pause (running), resume (paused), again (ran out)
 */
export function timerAction(t: Timer, now: number): TimerAction {
  const phase = timerPhase(t, now);
  return phase === 'running' ? 'pause' : phase === 'paused' ? 'resume' : phase === 'done' ? 'again' : 'start';
}

/** The button's words per action. */
export const TIMER_ACTION_LABEL: Record<TimerAction, string> = { start: 'Start', pause: 'Pause', resume: 'Resume', again: 'Again' };

/**
 * The timer after its main button.
 *
 * @param t - the timer
 * @param now - the server's clock
 * @returns the new value (`startTimer` restarts one that ran out)
 */
export function timerToggled(t: Timer, now: number): Timer {
  return timerAction(t, now) === 'pause' ? pauseTimer(t, now) : startTimer(t, now);
}

/**
 * The timer at a new length, stopped (the custom stepper).
 *
 * @param t - the timer, or null
 * @param ms - the new length
 * @param endEffect - the end effect for a new timer
 * @returns the reset timer
 */
export function timerWithLength(t: Timer | null, ms: number, endEffect: TimerEndEffect): Timer {
  const d = clampDuration(ms);
  return t ? resetTimer({ ...t, durationMs: d, remainingMs: d }) : newTimer(d, endEffect);
}

/**
 * The status line under the timer's digits.
 *
 * @param t - the timer
 * @param now - the server's clock
 * @returns "Running · of 1:00", "Paused", "Ready · 5:00", "Ran out"
 */
export function timerStatus(t: Timer, now: number): string {
  const phase = timerPhase(t, now);
  const of = formatTimer(t.durationMs);
  if (phase === 'running') return `Running · of ${of}`;
  if (phase === 'paused') return `Paused · of ${of}`;
  if (phase === 'done') return 'Ran out';
  return `Ready · ${of}`;
}

/**
 * When the tablet's readout next changes (it redraws once a second while running, never idle).
 *
 * @param t - the timer
 * @param now - the server's clock
 * @returns ms, or null when nothing changes
 */
export function readoutNextMs(t: Timer, now: number): number | null {
  if (timerPhase(t, now) !== 'running') return null;
  const into = timerLeft(t, now) % 1000;
  return (into === 0 ? 1000 : into) + 8;
}

/** The end effects: id and label. */
export const END_EFFECTS: { id: TimerEndEffect; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glow', label: 'Glow' },
  { id: 'flash', label: 'Flash' },
];

// ── handouts ────────────────────────────────────────────────────────────────────────────────

/** Table sides in the order the panel offers them, with the words for each. */
export const SIDES: { id: TableSide; label: string }[] = [
  { id: 'bottom', label: 'Bottom' },
  { id: 'top', label: 'Top' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

/**
 * A handout's line under its name.
 *
 * @param h - the handout
 * @returns "Picture", "Picture · with a caption", "Letter · 42 words"
 */
export function handoutSub(h: Handout): string {
  if (h.kind === 'picture') return h.text.trim() ? 'Picture · with a caption' : 'Picture';
  const words = h.text.trim() ? h.text.trim().split(/\s+/).length : 0;
  return `Letter · ${words} ${words === 1 ? 'word' : 'words'}`;
}

/**
 * A letter's name from its text when the DM gave none: the first line, short.
 *
 * @param name - what the DM typed as the name
 * @param text - the letter
 * @returns the name ("Letter" when both are empty)
 */
export function letterName(name: string, text: string): string {
  const n = name.trim();
  if (n) return n.slice(0, 120);
  const first = text.trim().split('\n')[0]!.trim();
  if (!first) return 'Letter';
  return first.length > 40 ? `${first.slice(0, 39).trimEnd()}…` : first;
}

/**
 * A picture handout's name from its file name ("Map of the crypt.webp" → "Map of the crypt").
 *
 * @param file - the file name
 * @returns the name
 */
export function pictureName(file: string): string {
  return (file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Picture').slice(0, 120);
}

// ── notes ───────────────────────────────────────────────────────────────────────────────────

/** A finger's grab room around a note pin, CSS px. */
export const NOTE_GRAB_PX = 22;

/**
 * Where a note sits in board words.
 *
 * @param n - the note
 * @returns "at C4"
 */
export function notePlace(n: DmNote): string {
  return `at ${squareName(n.x, n.y)}`;
}

/**
 * A note's text as it is saved: trimmed, at most {@link MAX_NOTE_TEXT} characters.
 *
 * @param text - what the DM typed
 * @returns the text ("" = nothing to save)
 */
export function noteText(text: string): string {
  return text.trim().slice(0, MAX_NOTE_TEXT);
}

/**
 * The notes in list order: top to bottom, then left to right (how the DM reads the map).
 *
 * @param notes - the map's notes
 * @returns a sorted copy
 */
export function notesInOrder(notes: readonly DmNote[]): DmNote[] {
  return [...notes].sort((a, b) => Math.floor(a.y) - Math.floor(b.y) || a.x - b.x || a.id.localeCompare(b.id));
}
