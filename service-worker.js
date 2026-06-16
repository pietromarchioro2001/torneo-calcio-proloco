const CACHE_NAME = 'torneo-admin-v5.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json'
];

// Install: cache static assets + SVUOTA TUTTE LE VECCHIE CACHE
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log('🗑 SW: Deleting old cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => {
      return caches.open(CACHE_NAME).then((cache) => {
        console.log('✅ SW: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate
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

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ IMMAGINI GOOGLE: SEMPRE NETWORK (MAI CACHE)
  if (url.hostname.includes('googleusercontent.com') || 
      url.hostname.includes('drive.google.com') ||
      url.hostname.includes('google.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // ✅ FONT GOOGLE: SEMPRE NETWORK
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // ✅ API Apps Script: network-first
  if (url.hostname === 'script.google.com' || request.url.includes('action=')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Solo fallback offline, senza cache
          return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
}

  // ✅ Static assets: cache-first
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
