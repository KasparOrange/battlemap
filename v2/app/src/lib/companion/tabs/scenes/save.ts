/**
 * Saving scenes from the table: a new scene of what the TV shows now, or an existing one
 * updated from now (same id, name and place in the list). The scene is made from the predicted
 * state with the shared `captureScene`, so the TV stores exactly what the DM sees.
 */
import { captureScene, MAX_SCENES, newId, type Scene } from '@battlemap/shared';
import { log } from '../../../log.ts';
import { notify } from '../../../ui/notice.svelte.ts';
import type { GameContext } from '../../game/tabs.ts';
import { nextSceneName } from './scenes-logic.ts';

/**
 * Saves the table as a new scene (named "<map> · n", renamed later), with a notice.
 *
 * @param ctx - the game screen's context
 * @returns the new scene, or null when it wasn't saved
 */
export function saveNewScene(ctx: GameContext): Scene | null {
  if (ctx.game.scenes.length >= MAX_SCENES) {
    notify(`A game keeps ${MAX_SCENES} scenes — delete one first.`, { kind: 'warning' });
    return null;
  }
  const scene = captureScene(ctx.game, newId(), nextSceneName(ctx.game));
  if (!scene || !ctx.dispatch({ type: 'scene.save', scene })) return null;
  log.info('companion', 'Scene saved', { scene: scene.id, map: scene.mapId, effects: scene.effects.length });
  notify(`Saved “${scene.name}” — hold ⋯ to rename`, { kind: 'success' });
  return scene;
}

/**
 * Updates a scene from what the table shows now (its name and place stay).
 *
 * @param ctx - the game screen's context
 * @param scene - the scene
 * @returns whether it was sent
 */
export function updateScene(ctx: GameContext, scene: Scene): boolean {
  const next = captureScene(ctx.game, scene.id, scene.name);
  if (!next || !ctx.dispatch({ type: 'scene.save', scene: next })) return false;
  log.info('companion', 'Scene updated', { scene: scene.id, map: next.mapId, effects: next.effects.length });
  return true;
}
