/**
 * The Effects tab's device-local lists, as pure functions: favourites (the DM's stars, in the
 * order starred) and recently used (newest first, at most {@link RECENT_MAX}), and how both are
 * read back from storage safely. Tested in `effects-logic.test.ts`.
 */

/** How many recently used effects are kept. */
export const RECENT_MAX = 8;

/** How many favourites are kept. */
export const FAVOURITES_MAX = 24;

/**
 * Stars or unstars an effect.
 *
 * @param list - favourites now
 * @param id - the effect
 * @returns the new list (a new star goes to the end; the oldest falls off past the cap)
 */
export function toggleFavourite(list: readonly string[], id: string): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return [...list, id].slice(-FAVOURITES_MAX);
}

/**
 * Notes an effect as just used.
 *
 * @param list - recent now, newest first
 * @param id - the effect
 * @param max - how many to keep
 * @returns the new list, `id` first, no duplicates
 */
export function pushRecent(list: readonly string[], id: string, max = RECENT_MAX): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/**
 * The quick strip at the top of the browser: favourites first, then recent ones not starred,
 * only ids the catalogue knows.
 *
 * @param favourites - starred ids
 * @param recent - recent ids, newest first
 * @param known - whether the catalogue has an id
 * @param max - the strip's length
 * @returns ids with where each comes from
 */
export function quickStrip(favourites: readonly string[], recent: readonly string[], known: (id: string) => boolean, max = 12): Array<{ id: string; from: 'favourite' | 'recent' }> {
  const out: Array<{ id: string; from: 'favourite' | 'recent' }> = [];
  for (const id of favourites) if (known(id)) out.push({ id, from: 'favourite' });
  for (const id of recent) if (known(id) && !favourites.includes(id)) out.push({ id, from: 'recent' });
  return out.slice(0, max);
}

/**
 * Reads a list of ids from stored JSON, dropping anything that isn't a short string.
 *
 * @param raw - the stored value
 * @param max - the cap
 * @returns the ids
 */
export function readIds(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80))].slice(0, max);
}
