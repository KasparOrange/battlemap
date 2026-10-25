/**
 * Undo and redo. A step holds a value from before; applying it swaps that value with the
 * current one, and the swapped-out value is the step for the other stack — so undo and redo
 * are the same operation in two directions.
 */
import type { Game, MapPlay } from '../model/game.ts';
import type { RootState, UndoEntry } from '../model/root.ts';
import { ok, reject, withMap, type ApplyResult } from './result.ts';

/**
 * Applies a step to its map.
 *
 * @returns the new map and the step that reverses it, or null when the map is gone
 */
function swap(game: Game, entry: UndoEntry): { map: MapPlay; inverse: UndoEntry } | null {
  const map = game.maps[entry.mapId];
  if (!map) return null;
  switch (entry.kind) {
    case 'fog':
      return {
        map: { ...map, fog: { ...map.fog, revealed: entry.revealed } },
        inverse: { ...entry, revealed: map.fog.revealed },
      };
    case 'door': {
      const open = map.doorsOpen.includes(entry.index);
      const doorsOpen = entry.open
        ? [...new Set([...map.doorsOpen, entry.index])].sort((a, b) => a - b)
        : map.doorsOpen.filter((i) => i !== entry.index);
      return { map: { ...map, doorsOpen }, inverse: { ...entry, open } };
    }
    case 'token': {
      const current = map.tokens.find((t) => t.id === entry.id) ?? null;
      let tokens = map.tokens.filter((t) => t.id !== entry.id);
      if (entry.token) {
        tokens = current ? map.tokens.map((t) => (t.id === entry.id ? entry.token! : t)) : [...tokens, entry.token];
      }
      return { map: { ...map, tokens }, inverse: { ...entry, token: current } };
    }
    case 'tokens':
      return { map: { ...map, tokens: entry.tokens }, inverse: { ...entry, tokens: map.tokens } };
    case 'strokes': {
      const remove = new Set(entry.remove);
      const removed = map.strokes.filter((s) => remove.has(s.id));
      const strokes = [...map.strokes.filter((s) => !remove.has(s.id)), ...entry.restore];
      return { map: { ...map, strokes }, inverse: { ...entry, remove: entry.restore.map((s) => s.id), restore: removed } };
    }
    case 'effects':
      return { map: { ...map, effects: entry.effects }, inverse: { ...entry, effects: map.effects } };
  }
}

/** Takes the newest step from one stack, applies it, puts its inverse on the other. */
function step(root: RootState, direction: 'undo' | 'redo'): ApplyResult {
  const game = root.game;
  if (!game) return reject('No game is open.');
  const from = direction === 'undo' ? root.history.undo : root.history.redo;
  const to = direction === 'undo' ? root.history.redo : root.history.undo;
  const entry = from[from.length - 1];
  if (!entry) return reject(direction === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
  const rest = from.slice(0, -1);
  const done = swap(game, entry);
  const history = done
    ? (direction === 'undo' ? { undo: rest, redo: [...to, done.inverse] } : { undo: [...to, done.inverse], redo: rest })
    : (direction === 'undo' ? { undo: rest, redo: to } : { undo: to, redo: rest });
  return ok({ ...root, game: done ? withMap(game, entry.mapId, done.map) : game, history });
}

/**
 * `history.undo`.
 *
 * @param root - the state
 * @returns the result
 */
export function historyUndo(root: RootState): ApplyResult {
  return step(root, 'undo');
}

/**
 * `history.redo`.
 *
 * @param root - the state
 * @returns the result
 */
export function historyRedo(root: RootState): ApplyResult {
  return step(root, 'redo');
}
