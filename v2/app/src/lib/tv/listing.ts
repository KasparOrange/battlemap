/**
 * The TV's library rows: a stored game's summary, the device's and the server's games merged,
 * the open game kept current, and the name of a game the TV starts by itself. Pure functions.
 */
import type { Game, GameSummary, MapInfo } from '@battlemap/shared';

/**
 * The summary a library row shows for a game.
 *
 * @param game - the game
 * @param savedAt - when it was last saved (ISO)
 * @param where - where it is stored
 * @returns the summary (no thumbnail)
 */
export function summarize(game: Game, savedAt: string, where: GameSummary['where']): GameSummary {
  return {
    id: game.id, name: game.name, createdAt: game.createdAt, savedAt,
    mapNames: game.mapOrder.map((id) => game.maps[id]?.info.name ?? '?'),
    activeMapName: game.maps[game.activeMapId]?.info.name ?? '?',
    thumb: null, where,
  };
}

/**
 * Merges the device's games with the server's backups: one row per game, `both` when it is in
 * both places (the device's copy and the server's thumbnail), newest save first.
 *
 * @param local - summaries of the games on the device
 * @param remote - the server's backups, or null when the server couldn't be asked
 * @returns the merged list
 */
export function mergeListings(local: GameSummary[], remote: GameSummary[] | null): GameSummary[] {
  const byId = new Map<string, GameSummary>();
  for (const g of local) byId.set(g.id, g);
  for (const r of remote ?? []) {
    const l = byId.get(r.id);
    if (l) byId.set(r.id, { ...l, where: 'both', thumb: l.thumb ?? r.thumb });
    else byId.set(r.id, { ...r, where: 'server' });
  }
  return [...byId.values()].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

/**
 * Puts the open game's live names into its row (qa#9): the stored copy lags up to one autosave
 * behind, so right after a map switch it still names the previous map. A game not stored yet is
 * added on top.
 *
 * @param rows - the merged listing
 * @param open - the game on the table, or null
 * @param nowIso - its `savedAt` when it isn't stored yet
 * @returns the listing with the open game current
 */
export function withOpenGame(rows: GameSummary[], open: Game | null, nowIso: string): GameSummary[] {
  if (!open) return rows;
  const i = rows.findIndex((r) => r.id === open.id);
  if (i < 0) return [summarize(open, nowIso, 'tv'), ...rows];
  const live = summarize(open, rows[i]!.savedAt, rows[i]!.where);
  const out = rows.slice();
  out[i] = { ...live, thumb: rows[i]!.thumb };
  return out;
}

/**
 * The name of a game the TV starts by itself from a shared map (the remote's fallback).
 *
 * @param map - the map
 * @param now - the time
 * @returns e.g. "Tower floor 2 · Sun 25 Oct"
 */
export function gameNameFor(map: MapInfo, now: Date): string {
  const day = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${map.name} · ${day}`.slice(0, 120);
}

/** The TV's games: requests, autosave, backup and restore. */
