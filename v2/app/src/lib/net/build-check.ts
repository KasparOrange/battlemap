/**
 * Whether a page should offer (companion) or do (TV) a reload because the server serves a newer
 * app build than the one running (rv#13). Pure, so the rules are tested.
 *
 * Only a page the server itself serves can get the new build by reloading: an app bundled in the
 * shell's APK, or a dev build, would reload into the same build again — a loop. So:
 * - own build `dev` (Vite dev server, tests) → never;
 * - no build from the server, or the same one → never;
 * - the page not loaded from the server's origin (shell assets, another host) → never;
 * - a build this page already reloaded for once (`triedBuild`) → never again.
 */

/**
 * @param own - the running page's build (`__BUILD__`)
 * @param served - the build the server serves (`welcome.build` / `server.build`), or null
 * @param pageOrigin - the page's origin (`location.origin`)
 * @param serverUrl - the server the page talks to
 * @param triedBuild - a build this page already reloaded for (from session storage), or null
 * @returns true when reloading would bring the newer build
 */
export function newerBuild(own: string, served: string | null, pageOrigin: string | null, serverUrl: string, triedBuild: string | null): boolean {
  if (own === 'dev' || !served || served === own) return false;
  if (served === triedBuild) return false;
  let serverOrigin: string;
  try {
    serverOrigin = new URL(serverUrl).origin;
  } catch {
    return false;
  }
  return pageOrigin === serverOrigin;
}

const KEY_TRIED = 'battlemap.reloadedForBuild';

/**
 * The build this page already reloaded for (session storage, so a reload loop is impossible).
 *
 * @returns the build, or null
 */
export function triedBuild(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(KEY_TRIED) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remembers that this page reloads for `build` now.
 *
 * @param build - the server's build
 */
export function rememberTried(build: string): void {
  try {
    globalThis.sessionStorage?.setItem(KEY_TRIED, build);
  } catch {
    // private mode: at worst one more reload offer
  }
}
