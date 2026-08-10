// public/sw.js
//
// Deliberately small and conservative -- this app is server-rendered
// (Next.js App Router) and most pages need fresh, tenant-scoped data,
// so the service worker's job here is narrow:
//   1. Let the Driver PWA install (a fetch handler + manifest is what
//      makes Chrome/Edge/Android offer "Add to Home Screen").
//   2. Cache the small set of static assets the /driver shell needs so
//      the form itself still renders with no connection.
//   3. Serve a friendly offline fallback page for other navigations
//      that fail while offline, instead of the browser's default
//      "no internet" error page.
//   4. NEVER cache API responses (GET /api/vehicles, /api/dvir, etc)
//      -- those are tenant/org-unit scoped per signed-in user, and
//      stale or cross-user cached data would be a real correctness
//      and security problem, not just a UX one. Submissions made while
//      offline are queued in IndexedDB by the page itself (see
//      frontend/modules/dvir/lib/*), not by this worker.

const CACHE_VERSION = 'fleet-dvir-shell-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  '/driver',
  '/offline.html',
  '/manifest.json',
  '/icons/dvir-icon.svg',
  '/icons/dvir-icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API calls -- always hit the network so the offline
  // queue (client-side) is the only thing that decides what happens
  // when a request can't reach the server.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first, falling back to the cached app shell
  // page (or the offline page) so re-opening the installed app without
  // a connection still lands somewhere useful.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cachedShell = await cache.match(request.url) || await cache.match('/driver');
        return cachedShell || cache.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Static assets under the app shell: cache-first for speed, with a
  // network fallback that opportunistically updates the cache.
  if (APP_SHELL.some((path) => url.pathname === path)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});

// Progressive enhancement: browsers that support the Background Sync
// API will fire this once connectivity returns, even if the tab isn't
// open. Where supported, this is registered by the page via
// registration.sync.register('dvir-sync') (see ServiceWorkerRegister).
// The actual flush logic lives in the page/client bundle
// (frontend/modules/dvir/lib/sync.ts) so it stays in one place; this
// just wakes any open client to run it, since a service worker can't
// use IndexedDB-backed app logic that depends on the app's own bundle.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'dvir-sync') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'DVIR_FLUSH_QUEUE' }));
    })
  );
});
