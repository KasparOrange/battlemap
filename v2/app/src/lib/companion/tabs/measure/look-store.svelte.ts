/**
 * The template disc's look remembered on this tablet (parity DS-04): read once from the
 * device's settings, written after every change; every disc this tablet shows takes it.
 */
import '../../library/app-services.ts';
import { services } from '../../library/services.ts';
import { log } from '../../../log.ts';
import { readLook, type DiscLook } from './disc-look.ts';

/** Settings key. */
const KEY = 'discLook';

class LookStore {
  /** The remembered look, null until loaded. */
  look = $state.raw<DiscLook | null>(null);
  private loading: Promise<DiscLook> | null = null;

  /** Loads the look once; later calls get the same answer. */
  load(): Promise<DiscLook> {
    this.loading ??= services()
      .getSetting<unknown>(KEY, null)
      .then((raw) => (this.look = readLook(raw)));
    return this.loading;
  }

  /**
   * Remembers a look.
   *
   * @param look - the new look
   */
  remember(look: DiscLook): void {
    this.look = look;
    void services().putSetting(KEY, look).catch((e: unknown) => log.warn('companion', 'Disc look not kept', { error: String(e) }));
  }
}

/** The one store of this tablet. */
export const discLookStore = new LookStore();
