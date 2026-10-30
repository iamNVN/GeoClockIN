// GeoClockIN service worker: makes repeat launches instant by serving the
// splash images, icons and the hashed app bundle from a local cache.
//
// - Page navigations: network first (always the latest deploy), cached copy
//   when offline.
// - /assets/* (hashed by Vite) and /brand/* images, icons: cache first.
// - /api/branding/logo: served from cache, refreshed in the background.
// - Rest of /api/*: never cached — attendance must always reach the server.
// - /admin/*: left alone — the admin dashboard is a separate app.
//
// Bump VERSION when files in /brand change (they keep the same URL).
const VERSION = 'v3';
const LOGO_PATH = '/api/branding/logo';
const STATIC_CACHE = `geoclockin-static-${VERSION}`;
const PAGE_CACHE = `geoclockin-pages-${VERSION}`;
const PRECACHE = ['/brand/logo.webp', '/brand/office-scene.svg', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname === LOGO_PATH) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/brand/') ||
    /\.(png|webp|svg|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    // Every route serves the same app shell, so one cached copy covers them all.
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  event.waitUntil(refresh.then(() => undefined));
  return cached ?? refresh;
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
