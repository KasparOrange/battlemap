/**
 * What the reveal areas' controls do (roadmap S7): reveal or hide an area in one tap (with the
 * notice's Undo), start drawing a new area or editing one, save the draft, rename, delete (Undo
 * saves it back at its place). Each sends at most one command.
 *
 * Save and delete make no undo step on the TV (an area is prep, not play — the same rule as
 * scenes); the notice's Undo puts the old area back instead. A reveal is a fog change: it is the
 * fog's undo step, so the notice's Undo is the history's.
 */
import { maskCells, maskFromCells, newId, type RevealArea } from '@battlemap/shared';
import type { GameContext } from '../../../game/tabs.ts';
import { withUndo } from '../../../game/undo.ts';
import { log } from '../../../../log.ts';
import { notify } from '../../../../ui/notice.svelte.ts';
import { areasLocal } from './local.svelte.ts';
import { areaIndex, areaLabel, type AreaReveal, nextValue } from './logic.ts';

/** Longest area name (the shared `Name`). */
const NAME_MAX = 80;

/**
 * Reveals an area that is hidden or partly shown, hides one that is fully shown.
 *
 * @param ctx - the game context
 * @param area - the area
 * @param index - its place in the list (for its label)
 * @param state - its state now
 * @returns whether it was sent
 */
export function toggleArea(ctx: GameContext, area: RevealArea, index: number, state: AreaReveal): boolean {
  const value = nextValue(state);
  const label = areaLabel(area, index);
  const preview = ctx.game.previewFirst;
  const r = withUndo(() => ctx.session.view, (c) => ctx.dispatch(c), { type: 'area.reveal', id: area.id, value, gesture: ctx.newGesture() }, (t) => notify(t));
  if (!r.sent) return false;
  log.info('companion', value === 'reveal' ? 'Area revealed' : 'Area hidden', { area: area.id, preview, changed: r.changed });
  if (preview) notify(`“${label}” ${value === 'reveal' ? 'revealed' : 'hidden'} in the preview — apply it to ${value === 'reveal' ? 'show' : 'hide it from'} the players.`);
  else if (!r.changed) notify('Nothing changed.');
  else notify(`“${label}” ${value === 'reveal' ? 'revealed' : 'hidden'}`, r.options);
  return true;
}

/**
 * Starts drawing a new area (the Fog tab's finger now edits it).
 *
 * @param ctx - the game context
 */
export function startNewArea(ctx: GameContext): void {
  areasLocal.draft = { id: newId(), mapId: ctx.map.info.id, isNew: true, name: '', cells: new Set(), poly: [] };
  areasLocal.selected = null;
  areasLocal.add = true;
  log.info('companion', 'Area drawing started');
}

/**
 * Starts editing an area's squares and name.
 *
 * @param ctx - the game context
 * @param area - the area
 */
export function startEditArea(ctx: GameContext, area: RevealArea): void {
  const { cols, rows } = ctx.map.info.grid;
  areasLocal.draft = { id: area.id, mapId: ctx.map.info.id, isNew: false, name: area.name, cells: new Set(maskCells(area.cells, cols * rows)), poly: [] };
  areasLocal.selected = area.id;
  log.info('companion', 'Area editing started', { area: area.id });
}

/**
 * Saves the draft (one `area.save`) and ends editing.
 *
 * @param ctx - the game context
 * @returns whether it was sent
 */
export function saveDraft(ctx: GameContext): boolean {
  const d = areasLocal.draft;
  if (!d || d.cells.size === 0) return false;
  if (d.mapId !== ctx.map.info.id) {
    areasLocal.draft = null;
    notify('The map changed — that area was not saved.', { kind: 'warning' });
    return false;
  }
  const { cols, rows } = ctx.map.info.grid;
  const area: RevealArea = { id: d.id, name: d.name.trim().slice(0, NAME_MAX), cells: maskFromCells(cols * rows, [...d.cells]) };
  if (!ctx.dispatch({ type: 'area.save', area })) return false;
  const areas = ctx.map.areas ?? [];
  const label = areaLabel(area, Math.max(0, areaIndex(areas, area.id)));
  log.info('companion', d.isNew ? 'Area added' : 'Area changed', { area: area.id, cells: d.cells.size });
  notify(d.isNew ? `“${label}” saved — one tap in the list reveals it` : `“${label}” saved`, { kind: 'success' });
  areasLocal.draft = null;
  areasLocal.selected = area.id;
  return true;
}

/**
 * Renames an area (its squares stay).
 *
 * @param ctx - the game context
 * @param area - the area
 * @param name - the new name
 * @returns whether it was sent
 */
export function renameArea(ctx: GameContext, area: RevealArea, name: string): boolean {
  const n = name.trim().slice(0, NAME_MAX);
  if (n === area.name) return false;
  if (!ctx.dispatch({ type: 'area.save', area: { ...area, name: n } })) return false;
  log.info('companion', 'Area renamed', { area: area.id });
  return true;
}

/**
 * Deletes an area; the notice's Undo saves it back at its place.
 *
 * @param ctx - the game context
 * @param area - the area
 * @param index - its place in the list
 * @returns whether it was sent
 */
export function deleteArea(ctx: GameContext, area: RevealArea, index: number): boolean {
  if (!ctx.dispatch({ type: 'area.remove', id: area.id })) return false;
  if (areasLocal.selected === area.id) areasLocal.selected = null;
  log.info('companion', 'Area deleted', { area: area.id });
  notify(`Deleted “${areaLabel(area, index)}”`, {
    kind: 'success',
    action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'area.save', area, index: Math.max(0, index) }) },
  });
  return true;
}
