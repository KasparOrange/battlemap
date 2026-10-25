/**
 * "Store as": how the server keeps an uploaded picture, remembered on this device (default
 * "As is" — the opt-in rule; WebP is recommended). Parity SL-04.
 */
import type { SegmentOption } from '../../ui/Segmented.svelte';
import { services, type StoreAs } from './services.ts';

/** Settings key of the remembered choice. */
const KEY = 'storeAs';

/** The options of the Segmented control, with the old app's hints. */
export const STORE_AS_OPTIONS: SegmentOption[] = [
  { id: 'webp', label: 'WebP', hint: 'recommended' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'png', label: 'PNG' },
  { id: 'asis', label: 'As is' },
];

/** One sentence per choice, shown under the control. */
export const STORE_AS_HINTS: Record<StoreAs, string> = {
  webp: 'Smallest, looks the same. Line art stays lossless.',
  jpeg: 'Small and safe everywhere, slightly softer lines.',
  png: 'Lossless, but big for painted maps.',
  asis: 'Stored exactly as it came.',
};

/**
 * The remembered choice.
 *
 * @returns the choice ("As is" when none was made)
 */
export async function loadStoreAs(): Promise<StoreAs> {
  const v = await services().getSetting<string>(KEY, 'asis');
  return v === 'webp' || v === 'jpeg' || v === 'png' ? v : 'asis';
}

/**
 * Remembers the choice.
 *
 * @param v - the choice
 */
export async function saveStoreAs(v: StoreAs): Promise<void> {
  await services().putSetting(KEY, v);
}
