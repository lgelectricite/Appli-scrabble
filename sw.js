/* Service worker : rend l'application utilisable entièrement hors ligne. */
var CACHE = 'gggames-v7';

var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/scrabble.js',
  'js/ai.js',
  'js/net.js',
  'js/app.js',
  'js/games/registry.js',
  'js/games/p4.js',
  'js/games/morpion.js',
  'js/games/pendu.js',
  'js/games/bac.js',
  'js/games/bataille.js',
  'js/games/yams.js',
  'js/games/cochon.js',
  'js/games/memory.js',
  'js/games/poker.js',
  'js/games/manoir.js',
  'data/mots.txt',
  'vendor/qrcode.js',
  'vendor/jsQR.js',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        // Met en cache les ressources de même origine récupérées en ligne
        var url = new URL(event.request.url);
        if (resp.ok && url.origin === self.location.origin) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return resp;
      });
    })
  );
});
