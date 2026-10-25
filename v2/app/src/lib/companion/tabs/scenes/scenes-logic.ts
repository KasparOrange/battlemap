/**
 * The Scenes tab and the curtain button as plain functions (tested in `scenes-logic.test.ts`):
 * a new scene's name, a scene's one-line summary, the part of the map a scene shows (for its
 * thumbnail), moving a scene in the list, the curtain's long-press menu, and the switch "under
 * the curtain" (lower, apply, lift).
 *
 * @see ../../../../../../docs/features.md
 */
import { tvView, windowSquares, type Command, type Curtain, type Game, type MapPlay, type Rect, type Scene, type TableState } from '@battlemap/shared';
import { screenToSquares } from '../../../render/camera.ts';
import type { MenuItem } from '../../../ui/Menu.svelte';

/**
 * The name a new scene gets: "<map name> · <n>" with the next free number for that map, so
 * the DM can save first and rename later.
 *
 * @param game - the open game
 * @returns the name
 */
export function nextSceneName(game: Game): string {
  const map = game.maps[game.activeMapId]?.info.name || 'Scene';
  const taken = new Set(game.scenes.map((s) => s.name));
  for (let n = 1; ; n++) {
    const name = `${map} · ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * A short, readable name of an effect from its library id (`rain-heavy` → "rain heavy").
 *
 * @param effect - the library id
 * @returns words
 */
export function effectWords(effect: string): string {
  return effect.replace(/^(weather|screen|fx)[-.]/, '').replace(/[-_.]+/g, ' ').trim();
}

/**
 * A scene's line under its name: the map, its weather, how many map loops, lights, fog look.
 *
 * @param game - the open game
 * @param scene - the scene
 * @returns e.g. "The crypt · rain · 2 map loops · lights · cloud fog"; "map gone" when its map left
 */
export function sceneSummary(game: Game, scene: Scene): string {
  const map = game.maps[scene.mapId];
  if (!map) return 'Its map left the game';
  const parts = [map.info.name];
  const on = scene.effects.filter((e) => e.on);
  const weather = on.filter((e) => e.anchor.kind === 'global').map((e) => effectWords(e.effect));
  if (weather.length) parts.push(weather.join(', '));
  const loops = on.length - weather.length;
  if (loops > 0) parts.push(loops === 1 ? '1 map loop' : `${loops} map loops`);
  if (scene.mapLights) parts.push('lights');
  if (scene.fog.style !== 'standard') parts.push(`${scene.fog.style} fog`);
  if (scene.view.mode === 'fit') parts.push('whole map');
  return parts.join(' · ');
}

/**
 * The part of its map a scene shows on the TV, in squares: the one-inch window in table mode,
 * the whole map in fit mode, the free camera's view otherwise. Without a TV viewport yet the
 * whole map.
 *
 * @param table - the TV's state (calibration, viewport)
 * @param map - the scene's map
 * @param scene - the scene
 * @returns the rectangle in squares, clipped to the map
 */
export function sceneFrame(table: TableState, map: MapPlay, scene: Scene): Rect {
  const { cols, rows } = map.info.grid;
  const whole = { x: 0, y: 0, width: cols, height: rows };
  const tv = tvView(table, { ...map, view: scene.view });
  if (!tv || scene.view.mode === 'fit') return whole;
  let r: Rect;
  if (tv.layout) {
    r = windowSquares(tv.layout);
  } else {
    const size = { width: tv.grid.width, height: tv.grid.height };
    const a = screenToSquares(tv.camera, size, { x: 0, y: 0 });
    const b = screenToSquares(tv.camera, size, { x: size.width, y: size.height });
    r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(cols, r.x + r.width);
  const y1 = Math.min(rows, r.y + r.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : whole;
}

/** CSS for a thumbnail box showing part of a map picture (`background-*`). */
export interface ThumbStyle {
  /** `background-size`. */
  size: string;
  /** `background-position`. */
  position: string;
}

/**
 * Crops a map picture to a rectangle of squares for a thumbnail box (cover: the box is filled,
 * the frame centred). Works for the picture and its smaller table copy alike — the numbers are
 * in percent of the picture.
 *
 * @param map - the map (its picture grid)
 * @param frame - the squares to show
 * @param box - the thumbnail's size, px
 * @returns the background size and position
 */
export function thumbStyle(map: MapPlay, frame: Rect, box: { width: number; height: number }): ThumbStyle {
  const g = map.info.grid;
  const cx = g.x + frame.x * g.cellW;
  const cy = g.y + frame.y * g.cellH;
  const cw = Math.max(1, frame.width * g.cellW);
  const ch = Math.max(1, frame.height * g.cellH);
  const scale = Math.max(box.width / cw, box.height / ch);
  const left = (box.width - cw * scale) / 2 - cx * scale;
  const top = (box.height - ch * scale) / 2 - cy * scale;
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  return { size: `${px(g.pictureW * scale)} ${px(g.pictureH * scale)}`, position: `${px(left)} ${px(top)}` };
}

/**
 * The scene ids with one moved up or down.
 *
 * @param scenes - the list
 * @param id - the scene to move
 * @param dir - up (towards the start) or down
 * @returns the new order, or null when it can't move that way
 */
export function moveScene(scenes: readonly Scene[], id: string, dir: 'up' | 'down'): string[] | null {
  const ids = scenes.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}

/**
 * The curtain button's long-press menu: the default (lower / lift) first, then black or the
 * plate, then the plate's line.
 *
 * @param curtain - the game's curtain
 * @returns the rows
 */
export function curtainMenu(curtain: Curtain): MenuItem[] {
  return [
    { id: 'toggle', label: curtain.down ? 'Lift the curtain' : 'Lower the curtain', icon: curtain.down ? 'reveal' : 'hide', description: curtain.down ? 'The players see the table again, in one fade' : 'The TV fades out until you lift it' },
    { id: 'black', label: 'Black', icon: 'moon', checked: !curtain.plate, description: 'Nothing but black', divider: true },
    { id: 'plate', label: 'Next scene plate', icon: 'candle', checked: curtain.plate, description: 'The game’s name, your line, a slow glow' },
    { id: 'text', label: 'Plate text…', icon: 'edit', description: curtain.text ? `“${curtain.text}”` : 'A line under the game’s name', divider: true },
  ];
}

/** How long the companion waits for the TV's curtain to be fully down, ms (its fall is 700). */
export const CURTAIN_DOWN_WAIT_MS = 900;
/** How long the TV gets to start the new map behind the curtain before the lift is sent, ms. */
export const CURTAIN_LIFT_AFTER_MS = 600;

/** What {@link switchScene} needs. */
export interface SwitchDeps {
  /** Sends a command (false = not sent; a notice said why). */
  dispatch: (cmd: Command) => boolean;
  /** Waits. */
  sleep: (ms: number) => Promise<void>;
  /** The game's curtain now (read again after each wait). */
  curtain: () => Curtain | null;
}

/**
 * Puts a scene on the table. Under the curtain (and the curtain up): lower it, wait until the
 * TV is black, apply, give the TV a moment, lift — the TV itself waits for the new map before
 * it fades in. A curtain that is already down stays down (the DM lifts it). Without the curtain
 * the scene applies at once.
 *
 * @param id - the scene
 * @param underCurtain - switch behind the curtain
 * @param deps - dispatch, sleep, the curtain now
 * @returns whether the scene was applied
 */
export async function switchScene(id: string, underCurtain: boolean, deps: SwitchDeps): Promise<boolean> {
  const before = deps.curtain();
  if (!underCurtain || !before || before.down) return deps.dispatch({ type: 'scene.apply', id });
  if (!deps.dispatch({ type: 'curtain.set', down: true })) return false;
  await deps.sleep(CURTAIN_DOWN_WAIT_MS);
  const applied = deps.dispatch({ type: 'scene.apply', id });
  await deps.sleep(applied ? CURTAIN_LIFT_AFTER_MS : 0);
  // the DM may have taken the curtain over meanwhile (lifted it already): leave it be
  if (deps.curtain()?.down) deps.dispatch({ type: 'curtain.set', down: false });
  return applied;
}
