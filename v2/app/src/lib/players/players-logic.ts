/**
 * The players' page's pure parts (S12): the box the table is drawn in (the TV's shape, as big
 * as the screen allows), the state scaled to that box, the table found by its code, and the
 * players' link.
 */
import { check, tableCode, ToPlayers, type RootState } from '@battlemap/shared';

/** A size in CSS px. */
export interface Box {
  /** Width. */
  width: number;
  /** Height. */
  height: number;
}

/** The TV's shape when it hasn't told its size yet (16:9). */
const DEFAULT_TV: Box = { width: 1920, height: 1080 };

/**
 * The largest box of the TV's shape that fits the screen.
 *
 * @param screen - the page's size
 * @param tv - the TV's viewport (null = 16:9)
 * @returns the box, whole px, at least 1 × 1
 */
export function fitBox(screen: Box, tv: Box | null): Box {
  const t = tv && tv.width > 0 && tv.height > 0 ? tv : DEFAULT_TV;
  const scale = Math.min(screen.width / t.width, screen.height / t.height);
  return { width: Math.max(1, Math.floor(t.width * scale)), height: Math.max(1, Math.floor(t.height * scale)) };
}

/**
 * The players' state as drawn in `box`: the TV's viewport replaced by the box. The renderer works
 * out the table window from the viewport and the TV's width in inches, so a box of the TV's
 * shape shows the same squares as the TV, only smaller.
 *
 * @param state - the players' state from the TV
 * @param box - the box it is drawn in
 * @returns the state to draw
 */
export function stateForBox(state: RootState, box: Box): RootState {
  return { ...state, table: { ...state.table, viewport: { width: box.width, height: box.height } } };
}

/**
 * A `players.state` message, checked; null when it isn't one.
 *
 * @param raw - the peer message as it arrived
 * @returns the revision and the state, or null
 */
export function readPlayersMessage(raw: unknown): { rev: number; state: RootState } | null {
  const r = check(ToPlayers, raw);
  return r.ok ? { rev: r.value.rev, state: r.value.state } : null;
}

/**
 * The room whose table code is `code` (the TV home shows it), among the tables online.
 *
 * @param tables - the server's tables (`GET /api/tables`)
 * @param code - what the player typed (any case, spaces ignored)
 * @returns the room id, or null when none (or more than one) matches
 */
export function roomForCode(tables: readonly { room: string }[], code: string): string | null {
  const want = code.replace(/\s+/g, '').toUpperCase();
  if (!want) return null;
  const hits = tables.filter((t) => tableCode(t.room) === want);
  return hits.length === 1 ? hits[0]!.room : null;
}

/**
 * The players' link for a table: the app on this server in players' mode.
 *
 * @param appUrl - the app's address (`https://…/app/`)
 * @param room - the table's room id
 * @param serverUrl - the server to talk to, when it isn't the app's own
 * @returns the link
 */
export function playersLink(appUrl: string, room: string, serverUrl?: string | null): string {
  const u = new URL(appUrl);
  u.search = '';
  u.hash = '';
  u.searchParams.set('mode', 'players');
  u.searchParams.set('table', room);
  if (serverUrl && new URL(serverUrl).origin !== u.origin) u.searchParams.set('server', serverUrl);
  return u.toString();
}
