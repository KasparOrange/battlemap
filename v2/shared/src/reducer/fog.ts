/**
 * Fog and door commands — what the players can see of the map: reveal and hide squares, the
 * whole map, the preview ("Preview first"), the live circle, doors (port of the fog and portal
 * parts of `lib/state/vtt_state.dart`).
 */
import type { MapPlay } from '../model/game.ts';
import type { Mask } from '../model/basics.ts';
import { applyPreview, emptyMask, fullMask, setMaskCells } from '../geometry/mask.ts';
import type { CommandOf } from '../protocol/commands.ts';
import type { RootState } from '../model/root.ts';
import { onActiveMap, onGame, type ApplyResult, type MapChange } from './result.ts';

/** Number of squares of a map (the length of its masks). */
function cellCount(map: MapPlay): number {
  return map.info.grid.cols * map.info.grid.rows;
}

/**
 * `fog.apply`: reveal or hide squares — straight away, or staged in the preview.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fogApply(root: RootState, cmd: CommandOf<'fog.apply'>): ApplyResult {
  return onActiveMap(root, (map, game): MapChange => {
    const n = cellCount(map);
    const on = cmd.value === 'reveal';
    if (game.previewFirst) return { map: stage(map, n, cmd.cells, on, cmd.gesture, cmd.live) };
    if (cmd.live === 'replace') return { map }; // nothing staged to swap without the preview
    const { mask, changed } = setMaskCells(map.fog.revealed, n, cmd.cells, on);
    if (changed === 0) return { map };
    return {
      map: { ...map, fog: { ...map.fog, revealed: mask, live: null } },
      undo: { kind: 'fog', mapId: map.info.id, gesture: cmd.gesture, revealed: map.fog.revealed },
    };
  });
}

/** Puts squares into the preview (reveal or hide), handling the live circle. */
function stage(map: MapPlay, n: number, cells: readonly number[], on: boolean, gesture: string, live: 'start' | 'replace' | undefined): MapPlay {
  const fog = map.fog;
  let reveal: Mask = fog.staged?.reveal ?? emptyMask(n);
  let hide: Mask = fog.staged?.hide ?? emptyMask(n);
  let keep = null as MapPlay['fog']['live'];
  if (live === 'replace') {
    if (!fog.live || fog.live.gesture !== gesture) return map; // that circle is gone
    reveal = fog.live.baseReveal;
    hide = fog.live.baseHide;
    keep = fog.live;
  } else if (live === 'start') {
    keep = { gesture, baseReveal: reveal, baseHide: hide };
  }
  if (on) {
    reveal = setMaskCells(reveal, n, cells, true).mask;
    hide = setMaskCells(hide, n, cells, false).mask;
  } else {
    hide = setMaskCells(hide, n, cells, true).mask;
    reveal = setMaskCells(reveal, n, cells, false).mask;
  }
  return { ...map, fog: { ...fog, staged: { reveal, hide }, live: keep } };
}

/**
 * `fog.all`: reveal or hide the whole map (staged with the preview on).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fogAll(root: RootState, cmd: CommandOf<'fog.all'>): ApplyResult {
  return onActiveMap(root, (map, game): MapChange => {
    const n = cellCount(map);
    if (game.previewFirst) {
      const staged = cmd.value === 'reveal'
        ? { reveal: fullMask(n), hide: emptyMask(n) }
        : { reveal: emptyMask(n), hide: map.fog.revealed };
      return { map: { ...map, fog: { ...map.fog, staged, live: null } } };
    }
    const revealed = cmd.value === 'reveal' ? fullMask(n) : emptyMask(n);
    if (revealed === map.fog.revealed) return { map };
    return {
      map: { ...map, fog: { ...map.fog, revealed, live: null } },
      undo: { kind: 'fog', mapId: map.info.id, gesture: null, revealed: map.fog.revealed },
    };
  });
}

/**
 * `fog.enable`: fog on or off for the map on the table.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fogEnable(root: RootState, cmd: CommandOf<'fog.enable'>): ApplyResult {
  return onActiveMap(root, (map) => (map.fog.on === cmd.on ? { map } : { map: { ...map, fog: { ...map.fog, on: cmd.on } } }));
}

/**
 * `fog.preview`: preview first on or off. Either way whatever was staged on any map is
 * discarded (the old app did the same).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fogPreview(root: RootState, cmd: CommandOf<'fog.preview'>): ApplyResult {
  return onGame(root, (game) => {
    const maps = { ...game.maps };
    for (const [id, map] of Object.entries(game.maps)) {
      if (map.fog.staged || map.fog.live) maps[id] = { ...map, fog: { ...map.fog, staged: null, live: null } };
    }
    return { ...game, previewFirst: cmd.on, maps };
  });
}

/**
 * `fog.commit`: apply the preview of the map on the table as one undo step.
 *
 * @param root - the state
 * @returns the result
 */
export function fogCommit(root: RootState): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const staged = map.fog.staged;
    if (!staged) return { map };
    const revealed = applyPreview(map.fog.revealed, staged.reveal, staged.hide, cellCount(map));
    const next = { ...map, fog: { ...map.fog, revealed, staged: null, live: null } };
    if (revealed === map.fog.revealed) return { map: next };
    return { map: next, undo: { kind: 'fog', mapId: map.info.id, gesture: null, revealed: map.fog.revealed } };
  });
}

/**
 * `fog.discard`: throw the preview of the map on the table away.
 *
 * @param root - the state
 * @returns the result
 */
export function fogDiscard(root: RootState): ApplyResult {
  return onActiveMap(root, (map) => (map.fog.staged || map.fog.live ? { map: { ...map, fog: { ...map.fog, staged: null, live: null } } } : { map }));
}

/**
 * `door.set`: open or close a door of the map on the table.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function doorSet(root: RootState, cmd: CommandOf<'door.set'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    if (cmd.index >= map.info.doorCount) return 'That door does not exist on this map.';
    const wasOpen = map.doorsOpen.includes(cmd.index);
    if (wasOpen === cmd.open) return { map };
    const doorsOpen = cmd.open
      ? [...map.doorsOpen, cmd.index].sort((a, b) => a - b)
      : map.doorsOpen.filter((i) => i !== cmd.index);
    return {
      map: { ...map, doorsOpen },
      undo: { kind: 'door', mapId: map.info.id, gesture: null, index: cmd.index, open: wasOpen },
    };
  });
}
