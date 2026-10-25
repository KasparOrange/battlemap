/**
 * Scene presets (roadmap S2) as plain functions: what a scene captures from the table, and how
 * a scene compares with what is on the table now. The schemas (`Scene`, `Curtain`) live in
 * `game.ts` next to the game that holds them; the commands are `scene.*` and `curtain.set`
 * (`docs/features.md`).
 */
import type { Game, MapPlay, Scene } from './game.ts';
import type { PlacedEffect } from './effect.ts';
import { captureSceneSound } from './sound.ts';

/**
 * Whether a lasting effect belongs in a scene: everything but token-bound effects (an aura
 * follows its token and is part of that token, not of the scene).
 *
 * @param e - a placed effect
 * @returns true when a scene keeps it
 */
export function sceneKeeps(e: PlacedEffect): boolean {
  return e.anchor.kind !== 'token';
}

/**
 * A scene of what is on the table now: the map on the table, its TV framing, its lasting
 * effects (not the token-bound ones), the map lights switch, the fog look and — while the TV
 * plays some — the ambient beds.
 *
 * @param game - the open game
 * @param id - the scene's id (a new one, or the id of the scene to update)
 * @param name - its name
 * @returns the scene, or null when the game has no map on the table
 */
export function captureScene(game: Game, id: string, name: string): Scene | null {
  const map = game.maps[game.activeMapId];
  if (!map) return null;
  const s = game.settings;
  return {
    id,
    name,
    mapId: map.info.id,
    view: map.view,
    effects: map.effects.filter(sceneKeeps),
    mapLights: s.mapLights,
    fog: { style: s.fogStyle, edgeInset: s.fogEdgeInset, fade: s.fogFade },
    ...soundOf(game),
  };
}

/**
 * The `sound` field of a scene captured now: the playing beds, or nothing (`captureSceneSound`).
 *
 * @param game - the open game
 * @returns `{sound}` or an empty object
 */
function soundOf(game: Game): Pick<Scene, 'sound'> {
  const sound = captureSceneSound(game.sound);
  return sound ? { sound } : {};
}

/**
 * A map's lasting effects with a scene's put in: the token-bound ones stay, every other one is
 * replaced by the scene's.
 *
 * @param map - the map's play state now
 * @param scene - the scene
 * @returns the new effects list (token-bound first, then the scene's, in its order)
 */
export function sceneEffects(map: MapPlay, scene: Scene): PlacedEffect[] {
  const kept = map.effects.filter((e) => !sceneKeeps(e));
  const ids = new Set(kept.map((e) => e.id));
  return [...kept, ...scene.effects.filter((e) => !ids.has(e.id))].slice(0, 64);
}

/**
 * Whether the table shows a scene right now: its map on the table, framed the same way, with
 * the same effects, lights and fog look. The Scenes tab marks that row "On the table".
 *
 * @param game - the open game
 * @param scene - the scene
 * @returns true when nothing differs
 */
export function sceneShown(game: Game, scene: Scene): boolean {
  if (game.activeMapId !== scene.mapId) return false;
  const now = captureScene(game, scene.id, scene.name);
  if (!now) return false;
  if (!scene.sound) delete now.sound; // a scene without sound leaves the sound alone
  return sameValue(now, scene);
}

/** Deep equality of plain JSON values (key order does not matter). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => k in rb && sameValue(ra[k], rb[k]));
}
