/**
 * Prepared reveal areas and secrets of the map on the table (roadmap S7, S9): `area.save`,
 * `area.remove`, `area.reveal`, `secret.save`, `secret.remove`, `secret.found`. Saving and
 * deleting make no undo step — the companion's notice undoes them by saving the old value back
 * (as scenes do); `area.reveal` is a fog change and makes the fog's undo step.
 *
 * @see ../../../docs/features.md "Prepared reveal areas", "Secret doors and traps"
 */
import { maskByteLength, maskCells } from '../geometry/mask.ts';
import { decodeBase64 } from '../geometry/base64.ts';
import { MAX_SHOTS } from '../model/effect.ts';
import type { MapPlay } from '../model/game.ts';
import type { RootState } from '../model/root.ts';
import { areasOf, MAX_AREAS, MAX_SECRETS, secretsOf } from '../model/secrets.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { fogApply } from './fog.ts';
import { ok, onActiveMap, reject, type ApplyResult, type MapChange } from './result.ts';

/** Puts `item` into `list`: replaced in place by id, or inserted at `index` (clamped) / the end. */
function upsert<T extends { id: string }>(list: readonly T[], item: T, index: number | undefined): T[] {
  const at = list.findIndex((x) => x.id === item.id);
  if (at >= 0 && index === undefined) return list.map((x, i) => (i === at ? item : x));
  const rest = list.filter((x) => x.id !== item.id);
  const i = Math.min(index ?? rest.length, rest.length);
  return [...rest.slice(0, i), item, ...rest.slice(i)];
}

/** Whether a mask string is the right size for a map (a mask of another map's size is refused). */
function fitsMap(mask: string, map: MapPlay): boolean {
  try {
    return decodeBase64(mask).length === maskByteLength(map.info.grid.cols * map.info.grid.rows);
  } catch {
    return false;
  }
}

/**
 * `area.save`: add a reveal area (at `index` or the end) or replace the one with its id.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function areaSave(root: RootState, cmd: CommandOf<'area.save'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const areas = areasOf(map);
    if (!fitsMap(cmd.area.cells, map)) return 'That area was drawn for another map.';
    if (!areas.some((a) => a.id === cmd.area.id) && areas.length >= MAX_AREAS) return `A map keeps ${MAX_AREAS} areas at most.`;
    return { map: { ...map, areas: upsert(areas, cmd.area, cmd.index) } };
  });
}

/**
 * `area.remove`: an area leaves the list (an unknown id changes nothing — it is gone already).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function areaRemove(root: RootState, cmd: CommandOf<'area.remove'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const areas = areasOf(map);
    if (!areas.some((a) => a.id === cmd.id)) return { map };
    return { map: { ...map, areas: areas.filter((a) => a.id !== cmd.id) } };
  });
}

/**
 * `area.reveal`: reveal or hide all squares of an area — exactly `fog.apply` with its squares.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function areaReveal(root: RootState, cmd: CommandOf<'area.reveal'>): ApplyResult {
  const game = root.game;
  const map = game ? game.maps[game.activeMapId] : undefined;
  if (!map) return fogApply(root, { type: 'fog.apply', cells: [], value: cmd.value, gesture: cmd.gesture }); // the usual refusal
  const area = areasOf(map).find((a) => a.id === cmd.id);
  if (!area) return reject('That area is gone.');
  const cells = maskCells(area.cells, map.info.grid.cols * map.info.grid.rows);
  return fogApply(root, { type: 'fog.apply', cells, value: cmd.value, gesture: cmd.gesture });
}

/**
 * `secret.save`: add a secret (at `index` or the end) or replace the one with its id.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function secretSave(root: RootState, cmd: CommandOf<'secret.save'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const s = cmd.secret;
    const { cols, rows } = map.info.grid;
    if (s.col < 0 || s.row < 0 || s.col >= cols || s.row >= rows) return 'That square is not on this map.';
    if (s.door !== null && (s.kind !== 'door' || s.door >= map.info.doorCount)) return 'That door does not exist on this map.';
    const secrets = secretsOf(map);
    if (!secrets.some((x) => x.id === s.id) && secrets.length >= MAX_SECRETS) return `A map keeps ${MAX_SECRETS} secrets at most.`;
    return { map: { ...map, secrets: upsert(secrets, s, cmd.index) } };
  });
}

/**
 * `secret.remove`: a secret leaves the map (an unknown id changes nothing).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function secretRemove(root: RootState, cmd: CommandOf<'secret.remove'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const secrets = secretsOf(map);
    if (!secrets.some((s) => s.id === cmd.id)) return { map };
    return { map: { ...map, secrets: secrets.filter((s) => s.id !== cmd.id) } };
  });
}

/**
 * `secret.found`: found / sprung (the players' view shows it) or hidden again; a `shot` given
 * with a find plays on every screen (kept in `live.shots` like `fx.trigger`'s).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function secretFound(root: RootState, cmd: CommandOf<'secret.found'>): ApplyResult {
  const result = onActiveMap(root, (map): MapChange => {
    const secrets = secretsOf(map);
    const s = secrets.find((x) => x.id === cmd.id);
    if (!s) return 'That secret is gone.';
    if (s.found === cmd.found) return { map };
    return { map: { ...map, secrets: secrets.map((x) => (x.id === cmd.id ? { ...x, found: cmd.found } : x)) } };
  });
  if (!result.ok || !cmd.found || !cmd.shot) return result;
  const shot = cmd.shot;
  const live = result.state.live;
  return ok({ ...result.state, live: { ...live, shots: [...live.shots.filter((x) => x.id !== shot.id), shot].slice(-MAX_SHOTS) } });
}
