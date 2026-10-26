/**
 * The test hook: `window.__battlemap`, present only when the page runs with `?debug=1`
 * (`docs/qa.md` "The test hook"; the type the e2e flows read is `BattlemapHook` in
 * `e2e/support/table.ts`). The sessions attach themselves when they are built, TV mode attaches
 * the renderer's counters, `App.svelte` records the notices. Without `?debug=1` every function
 * here does nothing and the window gets no property.
 */
import type { Command, RootState } from '@battlemap/shared';
import type { RenderStats } from './render/index.ts';

/** One notice as the hook reports it. */
export interface HookNotice {
  /** The notice's text. */
  text: string;
  /** Its kind (`info`, `warning`, …). */
  kind: string;
  /** When it was shown (`Date.now()`). */
  at: number;
}

/** The renderer's counters in the hook's shape (plus the full stats). */
export interface HookRenderStats {
  /** Frames drawn since start. */
  frames: number;
  /** How many texture groups (map, fog, tokens, layers, effects) hold bytes. */
  textures: number;
  /** Texture bytes held in total. */
  textureBytes: number;
  /** The renderer's own stats, unchanged. */
  detail: RenderStats;
}

/** What `window.__battlemap` offers (mirrors `BattlemapHook` in `e2e/support/table.ts`). */
export interface TestHook {
  /** `tv` or `companion`. */
  mode: 'tv' | 'companion';
  /** This page's client id. */
  client: string;
  /** The connection's state (`open`, `connecting`, `replaced`, …). */
  connection(): string;
  /** TV: the authoritative state; companion: what it shows (confirmed + pending). */
  state(): RootState | null;
  /** The confirmed revision. */
  rev(): number;
  /** The epoch (companion: null before the first snapshot). */
  epoch(): string | null;
  /** Companion: commands sent and not yet echoed. */
  pending?(): number;
  /** Companion: the session's `dispatch` (prediction, offline rule and all). */
  dispatch?(cmd: Command): boolean;
  /** Send a request (`game.open`, `lib.list`, …); TV: sent as is. */
  request(msg: { type: string } & Record<string, unknown>): boolean;
  /** The last notices shown (newest last, at most {@link NOTICE_LIMIT}). */
  notices(): HookNotice[];
  /** TV: the renderer's counters, null before it runs (companion: always null). */
  render(): HookRenderStats | null;
  /**
   * TV: whether a reload now reopens what the table shows — the open game saved on the device and
   * remembered as its last game (`TvGames.stored`); companion: always null. Flows wait on it before
   * a reload (qa#34, qa#35).
   */
  stored(): boolean | null;
}

/** How many notices the hook keeps. */
export const NOTICE_LIMIT = 20;

/** Whether this page runs with `?debug=1`. */
export const debugEnabled: boolean = (() => {
  try {
    return new URL(globalThis.location?.href ?? 'http://localhost/').searchParams.get('debug') === '1';
  } catch {
    return false;
  }
})();

const noticeLog: HookNotice[] = [];
let renderStats: (() => RenderStats | null) | null = null;
let tvStored: (() => boolean) | null = null;

/** The session parts the hook reads, as the sessions pass them. */
export type HookSession = Omit<TestHook, 'notices' | 'render' | 'stored'>;

/**
 * Puts the hook on `window` for this session (does nothing without `?debug=1`).
 *
 * @param session - the mode's readers and actions (see {@link TestHook})
 * @see attachRenderStats, recordNotice
 */
export function attachSession(session: HookSession): void {
  if (!debugEnabled) return;
  const hook: TestHook = {
    ...session,
    notices: () => noticeLog.slice(),
    render: () => {
      const s = renderStats?.() ?? null;
      if (!s) return null;
      const parts = [s.textures.map, s.textures.fog, s.textures.tokens, s.textures.layers, s.textures.effects];
      return { frames: s.frames, textures: parts.filter((b) => b > 0).length, textureBytes: s.textures.total, detail: s };
    },
    stored: () => tvStored?.() ?? null,
  };
  (globalThis as unknown as { __battlemap?: TestHook }).__battlemap = hook;
}

/**
 * Lets the hook read the renderer's counters (TV mode).
 *
 * @param read - returns the stats, or null while the renderer isn't there
 */
export function attachRenderStats(read: () => RenderStats | null): void {
  if (debugEnabled) renderStats = read;
}

/**
 * Lets the hook say whether the TV's table is on the device as a reload would reopen it (TV mode).
 *
 * @param read - `TvGames.stored`
 */
export function attachTvStored(read: () => boolean): void {
  if (debugEnabled) tvStored = read;
}

/**
 * Remembers a notice that was shown (kept: the last {@link NOTICE_LIMIT}).
 *
 * @param text - its text
 * @param kind - its kind
 */
export function recordNotice(text: string, kind: string): void {
  if (!debugEnabled) return;
  noticeLog.push({ text, kind, at: Date.now() });
  if (noticeLog.length > NOTICE_LIMIT) noticeLog.splice(0, noticeLog.length - NOTICE_LIMIT);
}
