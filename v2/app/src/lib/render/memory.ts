/**
 * When Android's memory warnings make the table free textures — pure, tested under `bun test`.
 *
 * The shell forwards every `onTrimMemory` level (rv#3). Only real pressure counts:
 * `RUNNING_LOW` (10) and `RUNNING_CRITICAL` (15) while the app is in front, and `MODERATE` (60)
 * / `COMPLETE` (80) while it is in the background. `RUNNING_MODERATE` (5), `UI_HIDDEN` (20, sent
 * on every trip to Home) and `BACKGROUND` (40) change nothing. After a drop the map comes back
 * at full density once {@link RESTORE_AFTER_MS} pass without another drop.
 *
 * @see ../../../../docs/render.md "map pictures"
 */

/** Android `ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW`. */
export const TRIM_RUNNING_LOW = 10;

/** Android `ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL`. */
export const TRIM_RUNNING_CRITICAL = 15;

/** Android `ComponentCallbacks2.TRIM_MEMORY_MODERATE` (in the background, the process is in the middle of the LRU list). */
export const TRIM_MODERATE = 60;

/** Calm time after the last drop before the map is reloaded at its full density. */
export const RESTORE_AFTER_MS = 120_000;

/**
 * Whether a trim level is real memory pressure that should free textures.
 *
 * @param level - the `onTrimMemory` level the shell sent
 * @returns true for 10, 15 and ≥ 60
 */
export function isMemoryPressure(level: number): boolean {
  return level === TRIM_RUNNING_LOW || level === TRIM_RUNNING_CRITICAL || level >= TRIM_MODERATE;
}
