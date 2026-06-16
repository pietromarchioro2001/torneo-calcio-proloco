const CACHE_NAME = 'torneo-admin-v4.0';  // ← Aumenta versione
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',   // ← Aggiungi
  './icon-512.png'    // ← Aggiungi
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

  // ✅ NON CACHARE MAI immagini Google Drive/Googleusercontent
  // Questo risolve definitivamente il problema del logo sgranato
  if (url.hostname.includes('googleusercontent.com') || 
      url.hostname.includes('drive.google.com') ||
      url.hostname.includes('google.com')) {
    event.respondWith(fetch(request));
    return;
  }

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
