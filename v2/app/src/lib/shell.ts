/**
 * The Android shell's bridge (`window.BattlemapShell`), typed from `shell/bridge.d.ts` and
 * harmless in a plain browser: every function here is a no-op (or returns null / nothing) when
 * the page doesn't run inside the shell.
 *
 * @see ../../../docs/shell.md for what the shell does with each call
 */
import type { BattlemapShell, ShellEvent, ShellInfo, ShellLogLine } from '../../../shell/bridge.d.ts';

export type { ShellEvent, ShellInfo, ShellLogLine };

let cachedInfo: ShellInfo | null | undefined;

/**
 * The bridge, or null outside the shell.
 *
 * @returns `window.BattlemapShell` or null
 */
export function shellBridge(): BattlemapShell | null {
  return typeof window !== 'undefined' && window.BattlemapShell ? window.BattlemapShell : null;
}

/**
 * Whether the page runs inside the Android shell.
 *
 * @returns true inside the shell
 */
export function inShell(): boolean {
  return shellBridge() !== null;
}

/**
 * The shell's facts (start mode, device id, server URL, bundle, display), read once.
 *
 * @returns the info, or null outside the shell or when it can't be read
 */
export function shellInfo(): ShellInfo | null {
  if (cachedInfo !== undefined) return cachedInfo;
  const bridge = shellBridge();
  try {
    cachedInfo = bridge ? (JSON.parse(bridge.info()) as ShellInfo) : null;
  } catch {
    cachedInfo = null;
  }
  return cachedInfo;
}

let readySent = false;

/**
 * Tells the shell the app has booted — once per page load. A downloaded bundle that loads three
 * times without this is dropped for the built-in one, so call it only when the app really runs.
 */
export function markShellReady(): void {
  if (readySent) return;
  readySent = true;
  shellBridge()?.ready();
}

/**
 * The shell's buffered log lines; afterwards the shell sends each new line as a `log` event.
 *
 * @returns the lines (empty outside the shell)
 */
export function takeShellLogs(): ShellLogLine[] {
  const bridge = shellBridge();
  if (!bridge) return [];
  try {
    const lines = JSON.parse(bridge.takeLogs()) as unknown;
    return Array.isArray(lines) ? (lines as ShellLogLine[]) : [];
  } catch {
    return [];
  }
}

/**
 * Listens to the shell's events (`back`, `log`, `apk`, `bundle`, `memory`).
 *
 * @param handler - gets each event's detail and the event (call `preventDefault()` on a handled `back`)
 * @returns a function that stops listening
 */
export function onShellEvent(handler: (detail: ShellEvent, event: CustomEvent<ShellEvent>) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: CustomEvent<ShellEvent>) => handler(e.detail, e);
  window.addEventListener('battlemapshell', listener);
  return () => window.removeEventListener('battlemapshell', listener);
}
