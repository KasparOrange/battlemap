/*
 * battlemap's service worker (roadmap S23: the installable web companion). Only an offline
 * shell: the page itself (network first, the last copy when offline) and the build's hashed
 * files under /app/assets/ (cache first — a new build has new names). Everything else — the
 * API, the WebSocket, map files, logs, build.json, other origins, anything but GET — goes to
 * the network untouched; the table never runs from a cache. Old caches go when a new worker
 * takes over. Registered by the companion in a browser only (never in the Android shell or TV
 * mode): app/src/lib/pwa.ts.
 */
const CACHE = 'battlemap-shell-v1';
const SCOPE = new URL(self.registration.scope).pathname; // "/app/"

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

/** Whether a request is the app page itself (a navigation inside the scope). */
function isPage(req, url) {
  return req.mode === 'navigate' && url.pathname.startsWith(SCOPE) && !url.pathname.slice(SCOPE.length).includes('.');
}

/** Whether a request is one of the build's hashed, never-changing files. */
function isHashedAsset(url) {
  return url.pathname.startsWith(`${SCOPE}assets/`);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isPage(req, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) await cache.put(SCOPE, res.clone());
        return res;
      } catch (e) {
        const kept = await cache.match(SCOPE);
        if (kept) return kept;
        throw e;
      }
    })());
    return;
  }
  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const kept = await cache.match(req);
      if (kept) return kept;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })());
  }
  // anything else: not intercepted (API, WebSocket, /files, logs, build.json, sounds, effects)
});
