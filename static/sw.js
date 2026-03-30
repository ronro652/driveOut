var CACHE_NAME = 'driveout-v1';
var STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/form.js',
  '/static/js/favorites.js',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Network-first for HTML/API, cache-first for static assets
  if (e.request.mode === 'navigate' || e.request.method === 'POST') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match('/');
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
          return response;
        });
      })
    );
  }
});
