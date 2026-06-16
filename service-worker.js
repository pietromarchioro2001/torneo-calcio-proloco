const CACHE_NAME = 'torneo-admin-v3.0';  // ← AUMENTATO da v2.4 a v3.0
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ SW: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('🗑 SW: Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ NON CACHARE immagini Google Drive (lascia gestire al browser)
  // Questo risolve il problema del logo sgranato nella PWA
  if (url.hostname === 'lh3.googleusercontent.com' || url.hostname === 'drive.google.com') {
    event.respondWith(fetch(request));
    return;
  }

  // ✅ NON CACHARE font Google (gestiti dal browser)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // API calls to Apps Script: network-first with cache fallback
  if (url.hostname === 'script.google.com' || request.url.includes('action=')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets: cache-first
  if (STATIC_ASSETS.some(asset => request.url.endsWith(asset) || request.url.includes(asset))) {
    event.respondWith(
      caches.match(request)
        .then((cached) => cached || fetch(request))
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});
