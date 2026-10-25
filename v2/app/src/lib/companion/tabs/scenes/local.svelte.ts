/**
 * The Scenes tab's device-local settings (never synced, remembered on this tablet): whether a
 * tap on a scene switches under the curtain, and whether a switch is running (the buttons wait).
 */

const KEY = 'battlemap.companion.scenes';

/** The tablet-local Scenes state. */
class ScenesLocal {
  /** Switch scenes behind the curtain (lower, switch, lift). On by default: no spoilers. */
  underCurtain = $state(true);
  /** The scene being switched to right now, or null. */
  switching = $state<string | null>(null);

  constructor() {
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as { underCurtain?: unknown } | null;
      if (typeof raw?.underCurtain === 'boolean') this.underCurtain = raw.underCurtain;
    } catch {
      // nothing remembered
    }
  }

  /** Remembers the settings on this device. */
  save(): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ underCurtain: this.underCurtain }));
    } catch {
      // private mode
    }
  }
}

/** The one instance. */
export const scenesLocal = new ScenesLocal();
