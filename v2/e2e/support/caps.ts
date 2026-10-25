/**
 * What the build under test can do yet — so the game night marks a step `test.fixme` while its
 * feature hasn't landed and turns it green by itself when it does. Each probe is narrow on
 * purpose (a missing route = 404, the TV's literal "can't do … yet" notice, a missing hook), so a
 * feature that landed and then broke shows up as a failure, not as "not built yet".
 */
import { test, type Page } from '@playwright/test';
import { hasHook, type Table } from './table.ts';

/** The capabilities probed. */
export interface Caps {
  /** `POST /files` stores files (server package). */
  files: boolean;
  /** `GET /api/library` answers (server package). */
  library: boolean;
  /** `GET /api/games` answers (server backups). */
  backups: boolean;
  /** The TV answers `lib.list` from storage instead of "can't do yet" (TV + storage packages). */
  tvStorage: boolean;
  /** The TV page exposes `window.__battlemap` (orchestrator's cores). */
  tvHook: boolean;
  /** The companion page exposes `window.__battlemap` with `dispatch`. */
  companionHook: boolean;
  /** The TV hook reports renderer counters (renderer package). */
  renderStats: boolean;
}

const cache = new Map<string, Caps>();

/**
 * Asks the server for a route and tells whether it exists.
 *
 * @param url - the full URL
 * @param init - fetch options
 * @returns false on 404/405 or a network error
 */
async function routeExists(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const r = await fetch(url, init);
    return r.status !== 404 && r.status !== 405;
  } catch {
    return false;
  }
}

/**
 * Whether the TV answers library requests from its storage: `lib.list` must come back as a
 * listing, not as the skeleton's "can't do … yet" notice. (It probed with `game.open` of an
 * unknown id before, which put up the TV's "neither on the TV nor on the server" badge.)
 *
 * @param t - the table
 * @returns true when the TV has storage-backed requests
 */
async function tvAnswersOpen(t: Table): Promise<boolean> {
  try {
    const reply = await t.bot.request({ type: 'lib.list' }, ['lib.listing', 'tv.notice'], 3000);
    return reply.type === 'lib.listing';
  } catch {
    return false;
  }
}

/**
 * The capabilities of the build behind a table (probed once per server and kept).
 *
 * @param t - an open table
 * @returns the capabilities
 */
export async function caps(t: Table): Promise<Caps> {
  const known = cache.get(t.serverUrl);
  if (known) return known;
  const s = t.serverUrl;
  const companion: Page | undefined = t.companions[0];
  const c: Caps = {
    files: await routeExists(`${s}/files?ext=json&format=asis`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }),
    library: await routeExists(`${s}/api/library`),
    backups: await routeExists(`${s}/api/games`),
    tvStorage: await tvAnswersOpen(t),
    tvHook: await hasHook(t.tv),
    companionHook: companion ? await companion.evaluate(() => typeof (window as unknown as { __battlemap?: { dispatch?: unknown } }).__battlemap?.dispatch === 'function') : false,
    renderStats: await t.tv.evaluate(() => {
      const h = (window as unknown as { __battlemap?: { render?: () => unknown } }).__battlemap;
      return typeof h?.render === 'function' && h.render() !== null;
    }),
  };
  cache.set(t.serverUrl, c);
  return c;
}

/**
 * Marks the running test `fixme` when the build lacks a capability.
 *
 * @param t - the table
 * @param need - the capabilities the test needs
 */
export async function needs(t: Table, ...need: (keyof Caps)[]): Promise<void> {
  const c = await caps(t);
  const missing = need.filter((n) => !c[n]);
  test.fixme(missing.length > 0, `not landed yet: ${missing.join(', ')}`);
}
