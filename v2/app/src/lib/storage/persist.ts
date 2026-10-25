/**
 * Persistent storage: asks the browser not to clear this origin's data under storage pressure
 * (the TV's games live only here and in the server's backup). Chrome and the Android WebView
 * grant it silently by their own rules, Safari mostly does, Firefox may ask; where the API is
 * missing (plain http in LAN play) nothing happens. Logs the outcome and the space in use.
 */
import type { Logger } from '../log.ts';

/** What the request found. */
export interface PersistResult {
  /** Whether the data is now protected from eviction (null: the API isn't there). */
  persisted: boolean | null;
  /** Bytes in use by this origin, if known. */
  usage: number | null;
  /** The origin's quota in bytes, if known. */
  quota: number | null;
}

/**
 * Asks for persistent storage once and reports the space in use.
 *
 * @param log - the logger
 * @param storage - the StorageManager (default `navigator.storage`; tests pass a fake)
 * @returns whether it is persisted and the usage / quota
 */
export async function requestPersistence(
  log: Logger,
  storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<PersistResult> {
  const result: PersistResult = { persisted: null, usage: null, quota: null };
  if (!storage) {
    log.info('storage', 'No storage manager here — persistence not requested');
    return result;
  }
  try {
    if (storage.persisted && (await storage.persisted())) result.persisted = true;
    else if (storage.persist) result.persisted = await storage.persist();
  } catch (err) {
    log.warn('storage', 'Persistent storage request failed', { error: String(err) });
  }
  try {
    const est = await storage.estimate?.();
    result.usage = est?.usage ?? null;
    result.quota = est?.quota ?? null;
  } catch {
    /* estimate is optional */
  }
  const mb = (n: number | null) => (n === null ? null : Math.round(n / 1048576));
  log[result.persisted === false ? 'warn' : 'info']('storage', 'Persistent storage', {
    persisted: result.persisted,
    usageMb: mb(result.usage),
    quotaMb: mb(result.quota),
  });
  return result;
}
