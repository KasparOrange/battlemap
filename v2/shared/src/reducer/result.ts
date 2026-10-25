/**
 * What applying a command gives, and the helpers every handler uses to reach the game and the
 * map on the table without repeating the "is there a game?" checks.
 */
import type { Game, MapPlay } from '../model/game.ts';
import { MAX_UNDO, type History, type RootState, type UndoEntry } from '../model/root.ts';

/** The new state, or why the command was not applied (in words for a notice). */
export type ApplyResult = { ok: true; state: RootState } | { ok: false; reason: string };

/**
 * A successful result.
 *
 * @param state - the new state (the old object itself when nothing changed)
 * @returns the result
 */
export function ok(state: RootState): ApplyResult {
  return { ok: true, state };
}

/**
 * A refusal; the state stays as it was.
 *
 * @param reason - why, in words for a notice
 * @returns the result
 */
export function reject(reason: string): ApplyResult {
  return { ok: false, reason };
}

/** What a map handler returns: the new map and the undo step it makes, or a refusal text. */
export type MapChange = { map: MapPlay; undo?: UndoEntry | undefined } | string;

/**
 * Runs a handler on the map on the table and puts its result back into the state, with its
 * undo step. A handler that returns the same map object and no undo step changes nothing.
 *
 * @param root - the state
 * @param handler - gets the map and the game, returns the new map or a refusal
 * @returns the result
 */
export function onActiveMap(root: RootState, handler: (map: MapPlay, game: Game) => MapChange): ApplyResult {
  const game = root.game;
  if (!game) return reject('No game is open.');
  const map = game.maps[game.activeMapId];
  if (!map) return reject('The game has no map on the table.');
  const change = handler(map, game);
  if (typeof change === 'string') return reject(change);
  if (change.map === map && !change.undo) return ok(root);
  return ok({
    ...root,
    game: change.map === map ? game : withMap(game, game.activeMapId, change.map),
    history: change.undo ? pushUndo(root.history, change.undo) : root.history,
  });
}

/**
 * Runs a handler on the open game.
 *
 * @param root - the state
 * @param handler - gets the game, returns the new game or a refusal
 * @returns the result
 */
export function onGame(root: RootState, handler: (game: Game) => Game | string): ApplyResult {
  const game = root.game;
  if (!game) return reject('No game is open.');
  const next = handler(game);
  if (typeof next === 'string') return reject(next);
  return next === game ? ok(root) : ok({ ...root, game: next });
}

/**
 * The game with one map's play state replaced.
 *
 * @param game - the game
 * @param mapId - the map
 * @param map - its new play state
 * @returns the new game
 */
export function withMap(game: Game, mapId: string, map: MapPlay): Game {
  return { ...game, maps: { ...game.maps, [mapId]: map } };
}

/**
 * Adds an undo step: clears redo, keeps at most `MAX_UNDO`. A step of the same gesture as the
 * newest one (same kind, map and thing) is merged into it — the newest keeps the value from
 * before the gesture began, so one undo takes the whole stroke or drag back.
 *
 * @param history - the history
 * @param entry - the new step
 * @returns the new history
 */
export function pushUndo(history: History, entry: UndoEntry): History {
  const top = history.undo[history.undo.length - 1];
  if (top && sameGesture(top, entry)) return history.redo.length ? { undo: history.undo, redo: [] } : history;
  const undo = [...history.undo, entry];
  return { undo: undo.length > MAX_UNDO ? undo.slice(undo.length - MAX_UNDO) : undo, redo: [] };
}

/** Whether two steps belong to the same gesture on the same thing. */
function sameGesture(a: UndoEntry, b: UndoEntry): boolean {
  if (a.gesture === null || a.gesture !== b.gesture || a.kind !== b.kind || a.mapId !== b.mapId) return false;
  if (a.kind === 'token' && b.kind === 'token') return a.id === b.id;
  if (a.kind === 'door' && b.kind === 'door') return a.index === b.index;
  return true;
}
