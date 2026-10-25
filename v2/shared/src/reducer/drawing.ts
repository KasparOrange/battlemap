/**
 * Drawing and tool commands: strokes (finished and live), the measure line, the ruler, the
 * template disc, DM layers.
 */
import type { RootState } from '../model/root.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { normalizeDisc } from '../geometry/disc.ts';
import { ok, onActiveMap, reject, type ApplyResult, type MapChange } from './result.ts';

/**
 * `draw.add`: a finished stroke; the live stroke ends.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function drawAdd(root: RootState, cmd: CommandOf<'draw.add'>): ApplyResult {
  if (cmd.stroke.points.length % 2 !== 0) return reject('A stroke needs pairs of coordinates.');
  const result = onActiveMap(root, (map): MapChange => {
    if (map.strokes.some((s) => s.id === cmd.stroke.id)) return 'A stroke with that id exists already.';
    return {
      map: { ...map, strokes: [...map.strokes, cmd.stroke] },
      undo: { kind: 'strokes', mapId: map.info.id, gesture: null, remove: [cmd.stroke.id], restore: [] },
    };
  });
  if (!result.ok || result.state.live.stroke === null) return result;
  return ok({ ...result.state, live: { ...result.state.live, stroke: null } });
}

/**
 * `draw.remove`: one stroke.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function drawRemove(root: RootState, cmd: CommandOf<'draw.remove'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const stroke = map.strokes.find((s) => s.id === cmd.id);
    if (!stroke) return { map };
    return {
      map: { ...map, strokes: map.strokes.filter((s) => s.id !== cmd.id) },
      undo: { kind: 'strokes', mapId: map.info.id, gesture: null, remove: [], restore: [stroke] },
    };
  });
}

/**
 * `draw.clear`: every stroke of the map on the table, as one undo step.
 *
 * @param root - the state
 * @returns the result
 */
export function drawClear(root: RootState): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    if (map.strokes.length === 0) return { map };
    return { map: { ...map, strokes: [] }, undo: { kind: 'strokes', mapId: map.info.id, gesture: null, remove: [], restore: map.strokes } };
  });
}

/**
 * `draw.live`: the stroke being drawn (live state, not saved).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function drawLive(root: RootState, cmd: CommandOf<'draw.live'>): ApplyResult {
  if (!root.game) return reject('No game is open.');
  if (cmd.stroke && cmd.stroke.points.length % 2 !== 0) return reject('A stroke needs pairs of coordinates.');
  return ok({ ...root, live: { ...root.live, stroke: cmd.stroke } });
}

/**
 * `measure.set`: the measure line (live state, not saved).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function measureSet(root: RootState, cmd: CommandOf<'measure.set'>): ApplyResult {
  if (!root.game) return reject('No game is open.');
  return ok({ ...root, live: { ...root.live, measure: cmd.line } });
}

/**
 * `ruler.set`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function rulerSet(root: RootState, cmd: CommandOf<'ruler.set'>): ApplyResult {
  return onActiveMap(root, (map) => ({ map: { ...map, ruler: cmd.ruler } }));
}

/**
 * `disc.set` (sizes sorted, rotation normalised).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function discSet(root: RootState, cmd: CommandOf<'disc.set'>): ApplyResult {
  return onActiveMap(root, (map) => ({ map: { ...map, disc: normalizeDisc(cmd.disc) } }));
}

/**
 * `layers.set`: the whole DM layer list.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function layersSet(root: RootState, cmd: CommandOf<'layers.set'>): ApplyResult {
  if (new Set(cmd.layers.map((l) => l.id)).size !== cmd.layers.length) return reject('Two layers have the same id.');
  return onActiveMap(root, (map) => ({ map: { ...map, layers: cmd.layers } }));
}
