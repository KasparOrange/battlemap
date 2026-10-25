/**
 * The last log lines of this page, for the Developer screen (parity LG-06: a 500-line buffer).
 * The app's logger (`lib/log.ts`) ships lines to MwLog and keeps none, so this taps it: it wraps
 * the logger's level methods once, records each line here and hands it on unchanged. Lines the
 * forwarder makes internally (its global error catchers) don't pass the methods and are only in
 * MwLog. If `lib/log.ts` grows its own buffer, this module should read that instead.
 */
import type { Level } from 'mwlog/browser';
import { log } from '../../log.ts';

/** One recorded line. */
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
  /** The extra fields, as short JSON ("" without). */
  props: string;
}

/** Lines kept. */
export const BUFFER_LINES = 500;

const lines: BufferedLine[] = [];
let next = 0;
let installed = false;
const listeners = new Set<() => void>();

/** Short JSON of a line's fields (cut at 300 characters). */
function propsText(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return '';
  try {
    const s = JSON.stringify(props);
    return s.length > 300 ? `${s.slice(0, 299)}…` : s;
  } catch {
    return '(unprintable)';
  }
}

/**
 * Records one line (exported for tests and for lines the app wants shown here only).
 *
 * @param level - the level
 * @param area - the area
 * @param msg - the message
 * @param props - its fields
 */
export function record(level: Level, area: string, msg: string, props?: Record<string, unknown>): void {
  lines.push({ n: next++, t: Date.now(), level, area, msg, props: propsText(props) });
  if (lines.length > BUFFER_LINES) lines.splice(0, lines.length - BUFFER_LINES);
  for (const f of listeners) f();
}

/** Starts recording the logger's lines (once per page; later calls do nothing). */
export function installLogBuffer(): void {
  if (installed) return;
  installed = true;
  const target = log as unknown as Record<string, (...a: unknown[]) => void>;
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    const original = target[level]!.bind(log);
    target[level] = (area: unknown, msg: unknown, props?: unknown) => {
      record(level, String(area), String(msg), props as Record<string, unknown> | undefined);
      original(area, msg, props);
    };
  }
  const originalLog = target.log!.bind(log);
  target.log = (level: unknown, area: unknown, msg: unknown, props?: unknown) => {
    record(level as Level, String(area), String(msg), props as Record<string, unknown> | undefined);
    originalLog(level, area, msg, props);
  };
}

/**
 * The recorded lines, oldest first.
 *
 * @returns a copy
 */
export function bufferedLines(): BufferedLine[] {
  return lines.slice();
}

/** Forgets the recorded lines (MwLog keeps them). */
export function clearBuffer(): void {
  lines.length = 0;
  for (const f of listeners) f();
}

/**
 * Calls back on every new line and on clear.
 *
 * @param f - the callback
 * @returns a function that stops it
 */
export function onBufferChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
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
