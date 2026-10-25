/**
 * The game's own commands: maps joining, switching, leaving, renamed and re-gridded; effects;
 * the game's name and settings.
 */
import { newMapPlay, type Game } from '../model/game.ts';
import { MAX_SHOTS } from '../model/effect.ts';
import type { RootState } from '../model/root.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { emptyMask } from '../geometry/mask.ts';
import { clamp } from '../geometry/rect.ts';
import { ok, onActiveMap, onGame, reject, type ApplyResult, type MapChange } from './result.ts';

/** The state with the live measure line and stroke cleared (they belong to the old map). */
function clearLiveTools(root: RootState): RootState {
  if (!root.live.measure && !root.live.stroke) return root;
  return { ...root, live: { ...root.live, measure: null, stroke: null } };
}

/**
 * `map.add`: a map joins the game, on the table at once with `activate`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function mapAdd(root: RootState, cmd: CommandOf<'map.add'>): ApplyResult {
  const result = onGame(root, (game): Game | string => {
    if (game.maps[cmd.map.id]) return 'That map is in the game already.';
    return {
      ...game,
      mapOrder: [...game.mapOrder, cmd.map.id],
      activeMapId: cmd.activate ? cmd.map.id : game.activeMapId,
      maps: { ...game.maps, [cmd.map.id]: newMapPlay(cmd.map) },
    };
  });
  return result.ok && cmd.activate ? ok(clearLiveTools(result.state)) : result;
}

/**
 * `map.switch`: another of the game's maps goes on the table, with its own fog, tokens and
 * view as they were left.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function mapSwitch(root: RootState, cmd: CommandOf<'map.switch'>): ApplyResult {
  const result = onGame(root, (game): Game | string => {
    if (!game.maps[cmd.mapId]) return 'That map is not in this game.';
    return game.activeMapId === cmd.mapId ? game : { ...game, activeMapId: cmd.mapId };
  });
  return result.ok && result.state !== root ? ok(clearLiveTools(result.state)) : result;
}

/**
 * `map.remove`: a map leaves the game (not the last one); its undo steps go with it.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function mapRemove(root: RootState, cmd: CommandOf<'map.remove'>): ApplyResult {
  const game = root.game;
  if (!game) return reject('No game is open.');
  if (!game.maps[cmd.mapId]) return reject('That map is not in this game.');
  if (game.mapOrder.length <= 1) return reject('A game needs at least one map.');
  const mapOrder = game.mapOrder.filter((id) => id !== cmd.mapId);
  const maps = { ...game.maps };
  delete maps[cmd.mapId];
  const wasActive = game.activeMapId === cmd.mapId;
  const next: RootState = {
    ...root,
    game: { ...game, mapOrder, maps, activeMapId: wasActive ? mapOrder[0]! : game.activeMapId },
    history: {
      undo: root.history.undo.filter((e) => e.mapId !== cmd.mapId),
      redo: root.history.redo.filter((e) => e.mapId !== cmd.mapId),
    },
  };
  return ok(wasActive ? clearLiveTools(next) : next);
}

/**
 * `map.rename`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function mapRename(root: RootState, cmd: CommandOf<'map.rename'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const map = game.maps[cmd.mapId];
    if (!map) return 'That map is not in this game.';
    if (map.info.name === cmd.name) return game;
    return { ...game, maps: { ...game.maps, [cmd.mapId]: { ...map, info: { ...map.info, name: cmd.name } } } };
  });
}

/**
 * `map.regrid`: a new picture grid on the picture map on the table. The same counts keep the
 * fog, the preview and the window (a fine adjustment); new counts start the fog over and drop
 * the map's fog undo steps (they meant other squares). Tokens are kept inside the map.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function mapRegrid(root: RootState, cmd: CommandOf<'map.regrid'>): ApplyResult {
  let recounted = false;
  let mapId = '';
  const result = onActiveMap(root, (map): MapChange => {
    if (map.info.kind !== 'picture') return 'Only picture maps take a new grid.';
    mapId = map.info.id;
    const drawGrid = cmd.drawGrid ?? map.info.drawGrid;
    const info = { ...map.info, grid: cmd.grid, drawGrid };
    const showGrid = cmd.drawGrid ?? map.showGrid;
    const same = map.info.grid.cols === cmd.grid.cols && map.info.grid.rows === cmd.grid.rows;
    if (same) return { map: { ...map, info, showGrid } };
    recounted = true;
    const { cols, rows } = cmd.grid;
    return {
      map: {
        ...map,
        info,
        showGrid,
        fog: { ...map.fog, revealed: emptyMask(cols * rows), staged: null, live: null },
        view: { ...map.view, col: null, row: null },
        tokens: map.tokens.map((t) => ({ ...t, col: clamp(t.col, 0, cols - 1), row: clamp(t.row, 0, rows - 1) })),
      },
    };
  });
  if (!result.ok || !recounted) return result;
  const keep = (e: { kind: string; mapId: string }) => !(e.kind === 'fog' && e.mapId === mapId);
  return ok({ ...result.state, history: { undo: result.state.history.undo.filter(keep), redo: result.state.history.redo.filter(keep) } });
}

/**
 * `fx.place`: a lasting effect added, or replaced by id.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fxPlace(root: RootState, cmd: CommandOf<'fx.place'>): ApplyResult {
  return onActiveMap(root, (map): MapChange => {
    const exists = map.effects.some((e) => e.id === cmd.effect.id);
    if (!exists && map.effects.length >= 64) return 'This map has 64 effects already.';
    const effects = exists ? map.effects.map((e) => (e.id === cmd.effect.id ? cmd.effect : e)) : [...map.effects, cmd.effect];
    return { map: { ...map, effects } };
  });
}

/**
 * `fx.remove`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fxRemove(root: RootState, cmd: CommandOf<'fx.remove'>): ApplyResult {
  return onActiveMap(root, (map) => (map.effects.some((e) => e.id === cmd.id) ? { map: { ...map, effects: map.effects.filter((e) => e.id !== cmd.id) } } : { map }));
}

/**
 * `fx.trigger`: a one-shot joins the live state (the last `MAX_SHOTS` are kept).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function fxTrigger(root: RootState, cmd: CommandOf<'fx.trigger'>): ApplyResult {
  if (!root.game) return reject('No game is open.');
  const shots = [...root.live.shots.filter((s) => s.id !== cmd.shot.id), cmd.shot].slice(-MAX_SHOTS);
  return ok({ ...root, live: { ...root.live, shots } });
}

/**
 * `game.rename`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function gameRename(root: RootState, cmd: CommandOf<'game.rename'>): ApplyResult {
  return onGame(root, (game) => (game.name === cmd.name ? game : { ...game, name: cmd.name }));
}

/**
 * `game.settings`: some settings changed.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function gameSettings(root: RootState, cmd: CommandOf<'game.settings'>): ApplyResult {
  return onGame(root, (game) => {
    const settings = { ...game.settings };
    if (cmd.settings.fogStyle !== undefined) settings.fogStyle = cmd.settings.fogStyle;
    if (cmd.settings.fogEdgeInset !== undefined) settings.fogEdgeInset = cmd.settings.fogEdgeInset;
    if (cmd.settings.fogFade !== undefined) settings.fogFade = cmd.settings.fogFade;
    if (cmd.settings.effects !== undefined) settings.effects = cmd.settings.effects;
    return { ...game, settings };
  });
}
