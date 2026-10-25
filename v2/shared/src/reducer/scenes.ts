/**
 * The curtain over the TV and the game's scene presets (roadmap N8, S2): `curtain.set`,
 * `scene.save`, `scene.remove`, `scene.rename`, `scene.order`, `scene.apply`. None of them make
 * an undo step — the companion's notices undo a delete by saving the scene back.
 *
 * @see ../../../docs/features.md
 */
import { MAX_SCENES, type Game, type Scene } from '../model/game.ts';
import type { RootState } from '../model/root.ts';
import { sceneEffects } from '../model/scene.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { clearLiveTools } from './maps.ts';
import { ok, onGame, type ApplyResult } from './result.ts';

/**
 * `curtain.set`: down or up; the plate and its line kept when the command leaves them out.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function curtainSet(root: RootState, cmd: CommandOf<'curtain.set'>): ApplyResult {
  return onGame(root, (game): Game => {
    const c = game.curtain;
    const next = { down: cmd.down, plate: cmd.plate ?? c.plate, text: cmd.text ?? c.text };
    if (next.down === c.down && next.plate === c.plate && next.text === c.text) return game;
    return { ...game, curtain: next };
  });
}

/**
 * `scene.save`: add a scene (at `index` or the end) or replace the one with its id.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function sceneSave(root: RootState, cmd: CommandOf<'scene.save'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const scene = cmd.scene;
    if (!game.maps[scene.mapId]) return 'That scene’s map is not in this game.';
    const at = game.scenes.findIndex((s) => s.id === scene.id);
    if (at < 0 && game.scenes.length >= MAX_SCENES) return `A game keeps ${MAX_SCENES} scenes at most.`;
    let scenes: Scene[];
    if (at >= 0 && cmd.index === undefined) {
      scenes = game.scenes.map((s, i) => (i === at ? scene : s));
    } else {
      const rest = game.scenes.filter((s) => s.id !== scene.id);
      const index = Math.min(cmd.index ?? rest.length, rest.length);
      scenes = [...rest.slice(0, index), scene, ...rest.slice(index)];
    }
    return { ...game, scenes };
  });
}

/**
 * `scene.remove`: a scene leaves the list (an unknown id changes nothing — it is gone already).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function sceneRemove(root: RootState, cmd: CommandOf<'scene.remove'>): ApplyResult {
  return onGame(root, (game) => {
    if (!game.scenes.some((s) => s.id === cmd.id)) return game;
    return { ...game, scenes: game.scenes.filter((s) => s.id !== cmd.id) };
  });
}

/**
 * `scene.rename`.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function sceneRename(root: RootState, cmd: CommandOf<'scene.rename'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const scene = game.scenes.find((s) => s.id === cmd.id);
    if (!scene) return 'That scene is gone.';
    if (scene.name === cmd.name) return game;
    return { ...game, scenes: game.scenes.map((s) => (s.id === cmd.id ? { ...s, name: cmd.name } : s)) };
  });
}

/**
 * `scene.order`: the list in a new order — refused unless it names every scene exactly once
 * (another companion added or deleted one meanwhile).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function sceneOrder(root: RootState, cmd: CommandOf<'scene.order'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const byId = new Map(game.scenes.map((s) => [s.id, s]));
    if (cmd.ids.length !== byId.size || new Set(cmd.ids).size !== byId.size || cmd.ids.some((id) => !byId.has(id))) {
      return 'The scenes changed meanwhile — try again.';
    }
    if (cmd.ids.every((id, i) => game.scenes[i]!.id === id)) return game;
    return { ...game, scenes: cmd.ids.map((id) => byId.get(id)!) };
  });
}

/**
 * `scene.apply`: the scene's map on the table, framed as saved, with the scene's effects (the
 * map's token-bound ones stay), map lights and fog look. Fog, doors, tokens, drawings untouched.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function sceneApply(root: RootState, cmd: CommandOf<'scene.apply'>): ApplyResult {
  const before = root.game?.activeMapId;
  const result = onGame(root, (game): Game | string => {
    const scene = game.scenes.find((s) => s.id === cmd.id);
    if (!scene) return 'That scene is gone.';
    const map = game.maps[scene.mapId];
    if (!map) return 'That scene’s map left the game.';
    const settings = {
      ...game.settings,
      mapLights: scene.mapLights,
      fogStyle: scene.fog.style,
      fogEdgeInset: scene.fog.edgeInset,
      fogFade: scene.fog.fade,
    };
    return {
      ...game,
      activeMapId: scene.mapId,
      settings,
      maps: { ...game.maps, [scene.mapId]: { ...map, view: scene.view, effects: sceneEffects(map, scene) } },
    };
  });
  if (!result.ok || result.state.game?.activeMapId === before) return result;
  return ok(clearLiveTools(result.state));
}
