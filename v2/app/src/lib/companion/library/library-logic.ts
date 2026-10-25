/**
 * The library screen's plain rules: default game names, "2 h ago", which game the Continue
 * card offers, search matching, the meta lines under cards. No DOM, no IO — tested under
 * `bun test` (`library-logic.test.ts`).
 *
 * @see ../../../../../docs/parity.md §5 "library screen" (CL-04 … CL-07)
 */
import type { FileRef, GameSummary, LibraryEntry, MapInfo } from '@battlemap/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A European short date: "Sat 10 Oct", with the year when it isn't this year's.
 *
 * @param d - the date
 * @param now - today (for the year rule)
 * @returns the text
 */
export function shortDate(d: Date, now: Date = new Date()): string {
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * The name a new game gets: "Session N · Sat 10 Oct", N = games already played on that map + 1
 * (old app rule CL-06).
 *
 * @param mapName - the map the game starts on
 * @param games - the TV's games
 * @param now - the time of the new game
 * @returns the name
 */
export function defaultGameName(mapName: string, games: readonly GameSummary[], now: Date = new Date()): string {
  const onMap = games.filter((g) => g.mapNames.includes(mapName) || g.activeMapName === mapName).length;
  return `Session ${onMap + 1} · ${shortDate(now, now)}`;
}

/**
 * How long ago something happened, for a card's meta line: "just now", "12 min ago",
 * "2 h ago", "3 d ago", else the date.
 *
 * @param iso - the time (ISO text)
 * @param now - now
 * @returns the text ("" for an unreadable time)
 */
export function ago(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (now.getTime() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return shortDate(new Date(t), now);
}

/**
 * The game the Continue card offers: the one saved last among the games this TV holds. A game
 * that is only in the server's backup (`where === 'server'` — often another TV's) is never
 * offered (qa#7; the TV home has the same rule).
 *
 * @param games - the TV's games
 * @returns that game, or null without one on this TV
 */
export function continueGame(games: readonly GameSummary[]): GameSummary | null {
  let best: GameSummary | null = null;
  for (const g of games) {
    if (g.where === 'server') continue;
    if (!best || Date.parse(g.savedAt) > Date.parse(best.savedAt)) best = g;
  }
  return best;
}

/** The library's game list in its two groups. */
export interface GameGroups {
  /** The Continue card's game (when it matches the search), else null. */
  cont: GameSummary | null;
  /** The other games this TV holds, newest first. */
  onTv: GameSummary[];
  /** Games only in the server's backup (this TV lost them, or another TV's), newest first. */
  backups: GameSummary[];
}

/**
 * Splits the TV's games for the library: the Continue game, this TV's other games, then the
 * server-only backups in their own group — each filtered by the search.
 *
 * @param games - the TV's listing
 * @param query - the search ("" = all)
 * @returns the groups
 */
export function groupGames(games: readonly GameSummary[], query: string): GameGroups {
  const cont = continueGame(games);
  const hit = (g: GameSummary) => matchesSearch(gameSearchText(g), query);
  const rest = newestFirst(games).filter((g) => g.id !== cont?.id && hit(g));
  return {
    cont: cont && hit(cont) ? cont : null,
    onTv: rest.filter((g) => g.where !== 'server'),
    backups: rest.filter((g) => g.where === 'server'),
  };
}

/**
 * Games newest first (by last save).
 *
 * @param games - the games
 * @returns a sorted copy
 */
export function newestFirst(games: readonly GameSummary[]): GameSummary[] {
  return [...games].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

/** Lower case without accents, for matching. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Whether a text matches a search: every word of the query occurs somewhere in it (case and
 * accents ignored). An empty query matches everything.
 *
 * @param text - what is searched (name, map names, …)
 * @param query - what the DM typed
 * @returns true on a match
 */
export function matchesSearch(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(text);
  return words.every((w) => hay.includes(w));
}

/**
 * Bytes as "3.2 MB" / "640 KB".
 *
 * @param n - bytes
 * @returns the text
 */
export function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

/** File kinds as the DM reads them. */
const EXT_NAMES: Record<FileRef['ext'], string> = { png: 'PNG', jpg: 'JPEG', webp: 'WebP', json: 'JSON', pdf: 'PDF' };

/**
 * The meta line of a map: "40 × 30 squares · WebP · 3.2 MB" or "40 × 30 squares · Dungeondraft
 * map · 12 MB".
 *
 * @param map - the map
 * @returns the text
 */
export function mapMeta(map: MapInfo): string {
  const kind = map.kind === 'uvtt' ? 'Dungeondraft map' : EXT_NAMES[map.picture.ext];
  return `${map.grid.cols} × ${map.grid.rows} squares · ${kind} · ${formatBytes(map.picture.bytes)}`;
}

/**
 * The meta line of a game card: "Cave level · 2 h ago" (+ "· 3 maps").
 *
 * @param g - the game
 * @param now - now
 * @returns the text
 */
export function gameMeta(g: GameSummary, now: Date = new Date()): string {
  const maps = g.mapNames.length > 1 ? ` · ${g.mapNames.length} maps` : '';
  return `${g.activeMapName}${maps} · ${ago(g.savedAt, now)}`;
}

/**
 * The text a game is searched by.
 *
 * @param g - the game
 * @returns name and map names
 */
export function gameSearchText(g: GameSummary): string {
  return [g.name, g.activeMapName, ...g.mapNames].join(' ');
}

/**
 * Shared library entries newest first, filtered by a search.
 *
 * @param entries - the server's maps
 * @param query - the search
 * @returns the entries to list
 */
export function visibleEntries(entries: readonly LibraryEntry[], query: string): LibraryEntry[] {
  return entries
    .filter((e) => matchesSearch(e.map.name, query))
    .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
}

/**
 * The URL of a file on the server.
 *
 * @param serverUrl - the server's origin (no trailing slash)
 * @param ref - the file
 * @returns `<server>/files/<hash>.<ext>`
 */
export function fileUrl(serverUrl: string, ref: FileRef): string {
  return `${serverUrl.replace(/\/$/, '')}/files/${ref.hash}.${ref.ext}`;
}

/**
 * The map name a file suggests: the file name without extension, `_`/`-` as spaces, a
 * "40x30" size tag dropped, first letter upper case. "cave_level_40x30.webp" → "Cave level".
 *
 * @param fileName - the picked file's name
 * @returns the name ("Map" when nothing is left)
 */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,6}$/i, '');
  const words = base
    .replace(/(?<!\d)\d{1,3}\s*[xX×]\s*\d{1,3}(?!\d)/g, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Map';
  return words[0]!.toUpperCase() + words.slice(1);
}
