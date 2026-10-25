/**
 * The table this device paired with last, kept even after "Another table" (the page's own
 * `rememberTable` forgets it, so the picker could never mark it "Last used" — rv#21).
 */
const KEY = 'bm.companion.lastUsedTable';

/**
 * The table used last.
 *
 * @returns its room id, or null
 */
export function lastUsedTable(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remembers the table just joined.
 *
 * @param room - its room id
 */
export function rememberUsedTable(room: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, room);
  } catch {
    /* not kept then */
  }
}
