/**
 * TV mode's screen rules as plain functions: which screen shows, what the problem badge says
 * (and when it says nothing), where Back goes, and the Back debounce. `TvApp.svelte` renders
 * what these decide; `bun test` checks the rules.
 *
 * The badge rule (design.md "TV — home and game", parity TV-21): no chrome while all is well.
 * In the game the top-right badge appears only for a problem, most urgent first — a TV error
 * (shown 8 s), another TV took over, the server refused this build, no server connection
 * (orange while it is reconnecting, red after `OFFLINE_RED_MS`), no tablet in the room. On the
 * home screen the same badge also says "Tablet connected" when all is well — that screen is
 * chrome anyway.
 */
import type { ConnectionState } from '../net/connection.ts';

/** The TV's screens. The calibration pattern is an overlay over any of them. */
export type TvScreen = 'home' | 'library' | 'game';

/** How long a TV error stays in the badge, ms. */
export const PROBLEM_MS = 8000;
/** How long the back arrow stays drawn after a remote key, ms. */
export const CHROME_MS = 5000;
/** Presses of Back closer together than this are one press (Android TV sends key + system back), ms. */
export const BACK_DEBOUNCE_MS = 400;
/** After this long without the server the badge turns red, ms. */
export const OFFLINE_RED_MS = 10_000;

/** A badge to draw. */
export interface Badge {
  /** What it says. */
  text: string;
  /** Its colour: ok (home only), warn (orange), danger (red). */
  tone: 'ok' | 'warn' | 'danger';
  /** Whether it carries the "Take over" button. */
  takeOver: boolean;
}

/** What the badge depends on. */
export interface BadgeInput {
  /** The connection's state. */
  connection: ConnectionState;
  /** Companions in the room. */
  companions: number;
  /** A recent TV error (cleared after `PROBLEM_MS`), or null. */
  problem: string | null;
  /** How long the server has been unreachable, ms (0 while connected). */
  offlineMs: number;
}

/**
 * The problem badge — null while all is well.
 *
 * @param input - connection, companions, recent error
 * @returns the badge, or null
 */
export function problemBadge(input: BadgeInput): Badge | null {
  if (input.problem) return { text: input.problem, tone: 'danger', takeOver: false };
  switch (input.connection) {
    case 'replaced':
      return { text: 'Another TV took over this table', tone: 'danger', takeOver: true };
    case 'refused':
      return { text: 'The server refused this app version — update it', tone: 'danger', takeOver: false };
    case 'open':
      return input.companions === 0 ? { text: 'Tablet not connected', tone: 'warn', takeOver: false } : null;
    default:
      return input.offlineMs >= OFFLINE_RED_MS
        ? { text: 'No connection to the server', tone: 'danger', takeOver: false }
        : { text: 'Connecting to the server…', tone: 'warn', takeOver: false };
  }
}

/**
 * The home screen's badge: the problem badge, or "Tablet connected".
 *
 * @param input - connection, companions, recent error
 * @returns the badge (never null)
 */
export function homeBadge(input: BadgeInput): Badge {
  const p = problemBadge(input);
  if (p?.text === 'Tablet not connected') return { ...p, text: 'Waiting for the tablet' };
  return p ?? { text: input.companions > 1 ? `${input.companions} tablets connected` : 'Tablet connected', tone: 'ok', takeOver: false };
}

/**
 * Which screen shows: the game whenever one is open, else home or the library.
 *
 * @param gameOpen - whether the state has a game
 * @param wanted - the screen the remote asked for (home or library)
 * @returns the screen
 */
export function screenFor(gameOpen: boolean, wanted: 'home' | 'library'): TvScreen {
  return gameOpen ? 'game' : wanted;
}

/** What Back does. */
export type BackAction =
  /** Turn the calibration pattern off. */
  | 'pattern-off'
  /** Lift the curtain (the game stays open). */
  | 'lift-curtain'
  /** Take the handout on the TV off (features.md "table moments"). */
  | 'close-handout'
  /** Save and close the game, then show the library. */
  | 'close-game'
  /** Library → home. */
  | 'home'
  /** Not ours: the shell closes the app (home screen). */
  | 'exit';

/**
 * Where Back goes (parity TV-32): pattern → off, curtain → up, game → library, library → home,
 * home → exit. With the curtain down, Back first lifts it (features.md "the curtain"): the
 * remote's way back to the table when the tablet is gone, never a jump out of the game. A
 * handout on the TV (at the edge or as a full-screen pause) is taken off the same way, after the
 * curtain.
 *
 * @param screen - the screen shown
 * @param patternOn - whether the calibration pattern is up
 * @param curtainDown - whether the game's curtain is down
 * @param handoutShown - whether a handout shows on the table
 * @returns the action
 */
export function backAction(screen: TvScreen, patternOn: boolean, curtainDown = false, handoutShown = false): BackAction {
  if (patternOn) return 'pattern-off';
  if (screen === 'game' && curtainDown) return 'lift-curtain';
  if (screen === 'game' && handoutShown) return 'close-handout';
  if (screen === 'game') return 'close-game';
  if (screen === 'library') return 'home';
  return 'exit';
}

/**
 * Debounces Back: one press of the remote can arrive as a key and as the shell's `back` event.
 *
 * @param now - the clock (tests pass their own)
 * @returns `accept()`: true for a press that counts
 */
export function backGate(now: () => number = () => performance.now()): { accept(): boolean } {
  let last = -Infinity;
  return {
    accept() {
      const t = now();
      if (t - last < BACK_DEBOUNCE_MS) return false;
      last = t;
      return true;
    },
  };
}

/**
 * "2 hours ago", "yesterday", "3 weeks ago" — for library rows.
 *
 * @param iso - the time
 * @param now - now, epoch ms
 * @returns the phrase
 */
export function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (w < 9) return `${w} weeks ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
