/**
 * Token commands: add, move (places a waiting token), update, remove, clear.
 */
import type { MapPlay } from '../model/game.ts';
import type { Token } from '../model/pieces.ts';
import type { RootState } from '../model/root.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { clamp } from '../geometry/rect.ts';
import { onActiveMap, type ApplyResult, type MapChange } from './result.ts';

/** A token's square kept inside the map. */
function onMap(map: MapPlay, col: number, row: number): { col: number; row: number } {
  return { col: clamp(col, 0, map.info.grid.cols - 1), row: clamp(row, 0, map.info.grid.rows - 1) };
}

/** The map with one token replaced (same id). */
function replaceToken(map: MapPlay, token: Token): MapPlay {
  return { ...map, tokens: map.tokens.map((t) => (t.id === token.id ? token : t)) };
}

/**
 * `token.add`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tokenAdd(root: RootState, cmd: CommandOf<'token.add'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    if (map.tokens.some((t) => t.id === cmd.token.id)) return 'A token with that id exists already.';
    const token = cmd.token.placed ? { ...cmd.token, ...onMap(map, cmd.token.col, cmd.token.row) } : cmd.token;
    return {
      map: { ...map, tokens: [...map.tokens, token] },
      undo: { kind: 'token', mapId: map.info.id, gesture: null, id: token.id, token: null },
    };
  });
}

/**
 * `token.move`: to a square, placing it if it was off the map.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tokenMove(root: RootState, cmd: CommandOf<'token.move'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const before = map.tokens.find((t) => t.id === cmd.id);
    if (!before) return 'That token is gone.';
    const at = onMap(map, cmd.col, cmd.row);
    if (before.placed && before.col === at.col && before.row === at.row) return { map };
    return {
      map: replaceToken(map, { ...before, ...at, placed: true }),
      undo: { kind: 'token', mapId: map.info.id, gesture: cmd.gesture ?? null, id: before.id, token: before },
    };
  });
}

/**
 * `token.update`: name, label, colour, hidden, or off the map again.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tokenUpdate(root: RootState, cmd: CommandOf<'token.update'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const before = map.tokens.find((t) => t.id === cmd.id);
    if (!before) return 'That token is gone.';
    const after: Token = {
      ...before,
      name: cmd.name ?? before.name,
      label: cmd.label ?? before.label,
      color: cmd.color ?? before.color,
      hidden: cmd.hidden ?? before.hidden,
      placed: cmd.placed ?? before.placed,
    };
    const same = after.name === before.name && after.label === before.label && after.color === before.color &&
      after.hidden === before.hidden && after.placed === before.placed;
    if (same) return { map };
    return {
      map: replaceToken(map, after),
      undo: { kind: 'token', mapId: map.info.id, gesture: null, id: before.id, token: before },
    };
  });
}

/**
 * `token.remove`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function tokenRemove(root: RootState, cmd: CommandOf<'token.remove'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const before = map.tokens.find((t) => t.id === cmd.id);
    if (!before) return { map };
    return {
      map: { ...map, tokens: map.tokens.filter((t) => t.id !== cmd.id) },
      undo: { kind: 'token', mapId: map.info.id, gesture: null, id: before.id, token: before },
    };
  });
}

/**
 * `token.clear`: every token of the map on the table, as one undo step.
 *
 * @param root - the state
 * @returns the result
 */
export function tokenClear(root: RootState): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    if (map.tokens.length === 0) return { map };
    return { map: { ...map, tokens: [] }, undo: { kind: 'tokens', mapId: map.info.id, gesture: null, tokens: map.tokens } };
  });
}
