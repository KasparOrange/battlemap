/**
 * The `settings` store: small device settings that must survive a reload and are too
 * structured for localStorage — the TV's calibration (`TableState`), the companion's remembered
 * template-disc look, the Store-as choice, the TV's last open game. Values are stored as plain
 * JSON copies (no `$state` proxies, no later mutation).
 *
 * Mode, device id and last table stay in localStorage (`config.ts`): they are read
 * synchronously before anything else starts.
 */
import { committed, done, isQuotaError } from './db.ts';
import { FULL_TEXT, type StorageContext } from './context.ts';

/** The setting names in use, one place to find them. */
export const SETTING = {
  /** TV: its calibration, a `TableState` (pattern off on load). */
  table: 'tv.table',
  /** TV: the game it had open, a game id or null. */
  lastGame: 'tv.lastGame',
  /** Companion: the template disc look (`TemplateDisc` without position). */
  discLook: 'companion.discLook',
  /** Companion: how uploads are stored, a `StoreAs` (`lib/api`). */
  storeAs: 'companion.storeAs',
} as const;

/** The settings store's API (the storage seam). */
export interface SettingsStore {
  /**
   * Reads a setting.
   *
   * @param key - its name (see {@link SETTING})
   * @returns the stored value, or null when it was never set
   */
  get<T = unknown>(key: string): Promise<T | null>;
  /**
   * Writes a setting.
   *
   * @param key - its name
   * @param value - any JSON value (null clears it)
   * @throws the quota error when the device is full (after a notice)
   */
  put(key: string, value: unknown): Promise<void>;
  /** Removes a setting. */
  delete(key: string): Promise<void>;
}

/**
 * Creates the settings store.
 *
 * @param ctx - database, logger, notifier
 * @returns the store
 */
export function createSettingsStore(ctx: StorageContext): SettingsStore {
  const { log } = ctx;
  return {
    async get<T>(key: string) {
      const db = await ctx.db();
      const val = (await done(db.transaction('settings').objectStore('settings').get(key))) as T | undefined;
      return val ?? null;
    },

    async put(key, value) {
      const db = await ctx.db();
      const tx = db.transaction('settings', 'readwrite');
      if (value === null || value === undefined) tx.objectStore('settings').delete(key);
      else tx.objectStore('settings').put(JSON.parse(JSON.stringify(value)), key);
      try {
        await committed(tx);
      } catch (err) {
        if (isQuotaError(err)) ctx.notify(FULL_TEXT, 'warning');
        log.error('storage', 'Setting not saved', { key, error: String(err) });
        throw err;
      }
      log.debug('storage', 'Setting saved', { key });
    },

    async delete(key) {
      const db = await ctx.db();
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').delete(key);
      await committed(tx);
      log.debug('storage', 'Setting removed', { key });
    },
  };
}
