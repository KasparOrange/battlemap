/**
 * Editing the DM layer list (bottom first, as the state keeps it): add, eye, opacity, order,
 * remove and put back. Every function returns a new list; the tab sends the whole list with
 * `layers.set`. Pure, tested (`layers-logic.test.ts`).
 *
 * @see ../../../../../../docs/parity.md §12 (LY-01 … LY-07)
 */
import type { DmLayer, FileRef } from '@battlemap/shared';

/** Opacity of a new layer (LY-04). */
export const DEFAULT_LAYER_OPACITY = 0.6;

/**
 * A new layer on top.
 *
 * @param list - the layers, bottom first
 * @param id - the new layer's id
 * @param name - its name (the picked file's)
 * @param file - its picture
 * @returns the new list
 */
export function addLayer(list: readonly DmLayer[], id: string, name: string, file: FileRef): DmLayer[] {
  return [...list, { id, name: name.slice(0, 200), file, visible: true, opacity: DEFAULT_LAYER_OPACITY }];
}

/**
 * Changes one layer.
 *
 * @param list - the layers
 * @param id - which
 * @param change - the fields to set
 * @returns the new list (the same list when the id is unknown)
 */
export function updateLayer(list: readonly DmLayer[], id: string, change: Partial<Pick<DmLayer, 'visible' | 'opacity' | 'name'>>): DmLayer[] {
  return list.map((l) => (l.id === id ? { ...l, ...change } : l));
}

/**
 * Moves a layer one step up (towards the top, drawn later) or down.
 *
 * @param list - the layers, bottom first
 * @param id - which
 * @param dir - `up` or `down`
 * @returns the new list (unchanged at the end)
 */
export function moveLayer(list: readonly DmLayer[], id: string, dir: 'up' | 'down'): DmLayer[] {
  const i = list.findIndex((l) => l.id === id);
  const j = dir === 'up' ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/**
 * Removes a layer, keeping where it was for the Undo notice.
 *
 * @param list - the layers
 * @param id - which
 * @returns the new list, the removed layer and its index (null when unknown)
 */
export function removeLayer(list: readonly DmLayer[], id: string): { list: DmLayer[]; removed: DmLayer | null; index: number } {
  const index = list.findIndex((l) => l.id === id);
  if (index < 0) return { list: [...list], removed: null, index: -1 };
  return { list: list.filter((l) => l.id !== id), removed: list[index]!, index };
}

/**
 * Puts a removed layer back at its index (Undo).
 *
 * @param list - the layers now
 * @param layer - the removed layer
 * @param index - where it was
 * @returns the new list (unchanged when it is already back)
 */
export function restoreLayer(list: readonly DmLayer[], layer: DmLayer, index: number): DmLayer[] {
  if (list.some((l) => l.id === layer.id)) return [...list];
  const out = [...list];
  out.splice(Math.min(Math.max(index, 0), out.length), 0, layer);
  return out;
}

/**
 * The layers as the tab lists them: top first.
 *
 * @param list - bottom first
 * @returns top first
 */
export function topFirst(list: readonly DmLayer[]): DmLayer[] {
  return [...list].reverse();
}

/**
 * The text after adding pictures (LY-02).
 *
 * @param added - how many were added
 * @param skipped - names that failed
 * @returns the notice text
 */
export function addedText(added: number, skipped: readonly string[]): string {
  if (skipped.length === 0) return added === 1 ? 'Layer added — only you see it' : `${added} layers added — only you see them`;
  const head = added > 0 ? `${added} added, ` : '';
  return `${head}${skipped.length} skipped: ${skipped.join(', ')}`;
}
