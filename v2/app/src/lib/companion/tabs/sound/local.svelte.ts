/**
 * The Sound tab's device-local state (this tablet only, never synced): the starred one-shot
 * pads, and the library's catalogue once it is fetched.
 *
 * @see ./SoundPanel.svelte
 */
import { log } from '../../../log.ts';
import { loadSoundCatalogue, type SoundCatalogue } from '../../../sound/catalogue.ts';

const KEY = 'battlemap.companion.sound';

/** The default favourites: what a DM reaches for most. */
const DEFAULT_FAVOURITES = ['door-creak', 'thunder', 'monster-roar'];

/** Most starred pads. */
export const SOUND_FAVOURITES_MAX = 12;

/**
 * Reads the stored favourites.
 *
 * @returns the starred ids (defaults when nothing is stored or it can't be read)
 */
function loadFavourites(): string[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as { favourites?: unknown } | null;
    if (!raw || !Array.isArray(raw.favourites)) return [...DEFAULT_FAVOURITES];
    return raw.favourites.filter((x): x is string => typeof x === 'string').slice(0, SOUND_FAVOURITES_MAX);
  } catch {
    return [...DEFAULT_FAVOURITES];
  }
}

/** The tab's local state (reactive). */
class SoundLocal {
  /** Starred one-shot ids, in the order they were starred. */
  favourites = $state<string[]>(loadFavourites());
  /** The library, once fetched. */
  catalogue = $state<SoundCatalogue | null>(null);
  /** Why the library couldn't be fetched, or null. */
  error = $state<string | null>(null);
  /** A fetch is under way. */
  loading = $state(false);

  /**
   * Stars or unstars a pad and stores the list.
   *
   * @param id - the one-shot's library id
   */
  toggleFavourite(id: string): void {
    this.favourites = this.favourites.includes(id) ? this.favourites.filter((x) => x !== id) : [...this.favourites, id].slice(-SOUND_FAVOURITES_MAX);
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ favourites: this.favourites }));
    } catch {
      /* private mode: the stars last for this page */
    }
  }

  /** Fetches the library once (again after a failure). */
  async load(): Promise<void> {
    if (this.catalogue || this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      this.catalogue = await loadSoundCatalogue();
      log.info('companion', 'Sound library loaded', { beds: this.catalogue.beds.length, oneShots: this.catalogue.oneShots.length });
    } catch (e) {
      this.error = String(e);
      log.warn('companion', 'Sound library failed to load', { error: this.error });
    } finally {
      this.loading = false;
    }
  }
}

/** The one instance. */
export const soundLocal = new SoundLocal();
