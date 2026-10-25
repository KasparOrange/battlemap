/**
 * The developer screen's view of this page's last log lines (parity LG-06: 500 lines). The lines
 * themselves live in the logger's own ring (`logRing` in `lib/log.ts`), which gets every line the
 * logger ships — the same lines MwLog gets, including the global error catchers' and the summary
 * lines — in the logger's batches (≤ 3 s). This module only turns them into what the screen
 * shows (a running number, a time, the line's own fields without the page context every line
 * carries) and filters them.
 */
import type { Level } from 'mwlog/browser';
import { logRing } from '../../log.ts';
import type { LogEntry, LogRing } from '../../log-ring.ts';

/** One line as the screen shows it. */
export interface BufferedLine {
  /** Running number (keys the list). */
  n: number;
  /** When, ms since the epoch. */
  t: number;
  /** Its level. */
  level: Level;
  /** The area (`net`, `companion`, …). */
  area: string;
  /** The message. */
  msg: string;
  /** The line's own fields, as short JSON ("" without). */
  props: string;
}

/** Lines kept (the ring's size). */
export const BUFFER_LINES = logRing.size;

/** Fields the logger puts on every line (the page's context) — not worth repeating per line. */
const CONTEXT_KEYS = new Set(['build', 'role', 'deviceId', 'deviceName', 'client', 'table', 'session']);

/** Running numbers per ring entry (stable while the entry is kept, so list keys don't jump). */
const numbers = new WeakMap<LogEntry, number>();
let next = 0;

/** Short JSON of a line's own fields (cut at 300 characters). */
function propsText(props: Record<string, unknown>): string {
  const own = Object.fromEntries(Object.entries(props).filter(([k]) => !CONTEXT_KEYS.has(k)));
  if (Object.keys(own).length === 0) return '';
  try {
    const s = JSON.stringify(own);
    return s.length > 300 ? `${s.slice(0, 299)}…` : s;
  } catch {
    return '(unprintable)';
  }
}

/** A level the screen knows (anything else shows as info). */
function asLevel(level: string): Level {
  return (LEVELS as readonly string[]).includes(level) ? (level as Level) : 'info';
}

/**
 * One ring entry as a screen line.
 *
 * @param e - the entry
 * @returns the line
 */
export function toLine(e: LogEntry): BufferedLine {
  let n = numbers.get(e);
  if (n === undefined) {
    n = next++;
    numbers.set(e, n);
  }
  const t = Date.parse(e.ts);
  return { n, t: Number.isFinite(t) ? t : Date.now(), level: asLevel(e.level), area: e.area, msg: e.msg, props: propsText(e.props) };
}

/**
 * The kept lines, oldest first.
 *
 * @param ring - the ring (default the logger's)
 * @returns the lines
 */
export function bufferedLines(ring: LogRing = logRing): BufferedLine[] {
  return ring.lines().map(toLine);
}

/**
 * Forgets the kept lines (MwLog keeps them).
 *
 * @param ring - the ring (default the logger's)
 */
export function clearBuffer(ring: LogRing = logRing): void {
  ring.clear();
}

/**
 * Calls back on every new line.
 *
 * @param f - the callback
 * @param ring - the ring (default the logger's)
 * @returns a function that stops it
 */
export function onBufferChange(f: () => void, ring: LogRing = logRing): () => void {
  return ring.subscribe(() => f());
}

/** Levels from most to least detail; a filter shows its level and the ones after it. */
export const LEVELS: readonly Level[] = ['debug', 'info', 'warn', 'error'];

/**
 * The lines at or above a level, optionally matching a search.
 *
 * @param all - the lines
 * @param floor - the lowest level shown
 * @param query - text that must occur in area, message or fields ("" = all)
 * @returns the matching lines
 */
export function filterLines(all: readonly BufferedLine[], floor: Level, query = ''): BufferedLine[] {
  const min = LEVELS.indexOf(floor);
  const q = query.trim().toLowerCase();
  return all.filter((l) => LEVELS.indexOf(l.level) >= min && (!q || `${l.area} ${l.msg} ${l.props}`.toLowerCase().includes(q)));
}

/**
 * One line as text for the clipboard: `[HH:MM:SS] LEVEL area msg {props}`.
 *
 * @param l - the line
 * @returns the text
 */
export function lineText(l: BufferedLine): string {
  const d = new Date(l.t);
  const hms = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
  return `[${hms}] ${l.level.toUpperCase().padEnd(5)} ${l.area} ${l.msg}${l.props ? ` ${l.props}` : ''}`;
}
