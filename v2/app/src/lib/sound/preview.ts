/**
 * The tablet's preview: the DM listens to a bed or a one-shot on the tablet itself, quietly
 * (ceiling 0.3 — headphones-friendly), before or without sending it to the TV. One engine per
 * page, made on the first preview tap (a gesture, so the browser lets it play). A bed preview
 * stops by itself after {@link PREVIEW_BED_MS}.
 */
import { defaultSoundscape } from '@battlemap/shared';
import { log } from '../log.ts';
import { loadSoundCatalogue } from './catalogue.ts';
import { SoundEngine } from './engine.ts';

/** How long a bed preview plays before it fades out by itself. */
export const PREVIEW_BED_MS = 15_000;

/** The preview's ceiling: everything at most this loud. */
export const PREVIEW_CEILING = 0.3;

let engine: SoundEngine | null = null;
let bed: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(bed: string | null) => void>();

/** The preview's engine, made on first use. */
function previewEngine(): SoundEngine {
  engine ??= new SoundEngine({ log, catalogue: () => loadSoundCatalogue(), ceiling: PREVIEW_CEILING, budgetBytes: 24 * 1024 * 1024 });
  return engine;
}

/** Tells the listeners which bed previews now. */
function changed(next: string | null): void {
  bed = next;
  for (const l of listeners) l(bed);
}

/**
 * Previews a bed on the tablet (another bed's preview fades into it); the same bed again stops.
 *
 * @param id - the bed's library id
 */
export function previewBed(id: string): void {
  const e = previewEngine();
  void e.unlock();
  if (timer) clearTimeout(timer);
  if (bed === id) {
    stopPreview();
    return;
  }
  e.apply({ ...defaultSoundscape(), on: true, master: 1, shots: 1, beds: [{ sound: id, volume: 1 }] });
  log.info('sound', 'Preview bed', { sound: id });
  changed(id);
  timer = setTimeout(stopPreview, PREVIEW_BED_MS);
}

/**
 * Previews a one-shot on the tablet.
 *
 * @param id - the one-shot's library id
 */
export function previewShot(id: string): void {
  const e = previewEngine();
  void e.unlock();
  if (!bed) e.apply({ ...defaultSoundscape(), on: true, master: 1, shots: 1, beds: [] });
  log.info('sound', 'Preview one-shot', { sound: id });
  void e.playShot(id, 1, `preview-${id}`);
}

/** Fades the preview out. */
export function stopPreview(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  engine?.apply({ ...defaultSoundscape(), on: false, master: 1, shots: 1 });
  if (bed) changed(null);
}

/**
 * Listens for the previewing bed (null = none).
 *
 * @param listener - called on every change
 * @returns stops listening
 */
export function onPreviewChange(listener: (bed: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
