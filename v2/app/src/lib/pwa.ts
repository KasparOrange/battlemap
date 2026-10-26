/**
 * The installable web companion (roadmap S23): registers the service worker (`public/sw.js`, an
 * offline shell that never caches the API, the WebSocket or map files) so a phone's browser offers
 * "Add to Home Screen" / "Install" with the manifest (`public/manifest.webmanifest`). Only for the
 * companion (and the start screen) in a plain browser, only in a production build: the Android
 * shell has its own bundle store, and the TV and the players' view never need it.
 *
 * @see ../../docs/features.md "Installable companion"
 */
import type { Mode } from './config.ts';
import type { Logger } from './log.ts';

/** Where the page runs, as far as the choice goes. */
export interface PwaContext {
  /** The page's mode (null: the start screen). */
  mode: Mode | null;
  /** Inside the Android shell. */
  inShell: boolean;
  /** A production build (the dev server serves no `/app/assets/`). */
  production: boolean;
  /** The browser has service workers (and a secure context). */
  supported: boolean;
}

/**
 * Whether this page registers the service worker.
 *
 * @param c - the page's context
 * @returns true for the companion or the start screen in a browser, production build
 */
export function wantsServiceWorker(c: PwaContext): boolean {
  return c.supported && c.production && !c.inShell && (c.mode === 'companion' || c.mode === null);
}

/**
 * Registers the service worker when {@link wantsServiceWorker} says so. Never throws; a failure
 * is logged (the app works the same without it).
 *
 * @param c - the page's context
 * @param log - the logger
 * @param base - the app's base path (`/app/`)
 */
export function registerServiceWorker(c: PwaContext, log: Logger, base = '/app/'): void {
  if (!wantsServiceWorker(c)) return;
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(
    (r) => log.info('pwa', 'Service worker registered', { scope: r.scope }),
    (e: unknown) => log.warn('pwa', 'Service worker not registered', { error: String(e) }),
  );
}
