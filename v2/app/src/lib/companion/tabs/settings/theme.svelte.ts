/**
 * This device's theme (dark — the dim-room default — or light parchment), remembered in
 * localStorage and applied as `data-theme` on `<html>` (design.md "tokens").
 */
const KEY = 'bm.companion.theme';

/** Reads the remembered theme. */
function remembered(): 'dark' | 'light' {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

class Theme {
  /** The theme in use. */
  value = $state<'dark' | 'light'>(remembered());

  /**
   * Switches and remembers the theme.
   *
   * @param t - dark or light
   */
  set(t: 'dark' | 'light'): void {
    this.value = t;
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* not kept then */
    }
  }
}

/** The one theme switch of this device. */
export const theme = new Theme();
if (typeof document !== 'undefined' && theme.value === 'light') document.documentElement.dataset.theme = 'light';
