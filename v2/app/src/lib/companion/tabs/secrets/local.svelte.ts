/**
 * The Secrets tab's device-local state (never synced): what a tap on the map places, and the
 * secret selected for editing (ringed on the map). The kind is remembered on this device.
 */
import type { SecretKind } from '@battlemap/shared';

const KEY = 'battlemap.companion.secrets';

/** The tablet-local Secrets tab state. */
class SecretsLocal {
  /** What a tap on an empty square places. */
  place = $state<SecretKind>('trap');
  /** The secret being edited, or null. */
  selected = $state<string | null>(null);

  constructor() {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw === 'door' || raw === 'mark' || raw === 'trap') this.place = raw;
    } catch {
      // no storage: the default
    }
  }

  /** Remembers the kind on this device. */
  save(): void {
    try {
      globalThis.localStorage?.setItem(KEY, this.place);
    } catch {
      // private mode: not remembered, no harm
    }
  }
}

/** The one instance. */
export const secretsLocal = new SecretsLocal();
