/**
 * 🏆 Service Worker - Torneo Admin
 * Cache strategy: Cache-first for static assets, Network-first for API
 */

const CACHE_NAME = 'torneo-admin-v2.4';
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

  // API calls to Apps Script: network-first with cache fallback
  if (url.hostname === 'script.google.com' || request.url.includes('action=')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses (short TTL)
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
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

  // Images: cache-first with background update
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          }).catch(() => null);
          return cached || networkFetch;
        })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

// Background sync for offline actions (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-torneo-actions') {
    event.waitUntil(
      // TODO: replay pending actions when back online
      console.log('🔄 SW: Background sync triggered')
    );
  }
});
