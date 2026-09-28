/* Service worker : rend l'application utilisable entièrement hors ligne.
   - Les listes de mots (dictionnaire 3,4 Mo, mots courants 0,5 Mo) vivent
     dans leur propre cache : elles ne sont PAS retéléchargées à chaque mise
     à jour de l'application (seulement quand DICO change).
   - La page (index.html) est prise sur le réseau d'abord quand il y en a,
     pour qu'une nouvelle version s'affiche vite ; le cache prend le relais
     hors ligne. Tout le reste : cache d'abord. */
var CACHE = 'gggames-v53';
var DICO = 'gggames-dico-2';
var DICO_URLS = ['data/mots.txt', 'data/mots-courants.txt'];
var DICO_RE = /\/data\/(mots|mots-courants)\.txt$/;

var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/games/mots.css',
  'css/games/p4.css',
  'css/games/morpion.css',
  'css/games/pendu.css',
  'css/games/bac.css',
  'css/games/bataille.css',
  'css/games/yams.css',
  'css/games/cochon.css',
  'css/games/memory.css',
  'css/games/sudoku.css',
  'css/games/meles.css',
  'css/games/motus.css',
  'css/games/croises.css',
  'css/games/fleches.css',
  'css/games/imposteur.css',
  'css/games/quiz.css',
  'css/games/huit.css',
  'css/games/cartes.css',
  'css/games/casino.css',
  'css/games/poker.css',
  'css/games/blackjack.css',
  'css/games/solitaire.css',
  'css/games/bonbons.css',
  'css/games/manoir.css',
  'css/games/chat.css',
  'vendor/fonts/fredoka-latin-var.woff2',
  'vendor/fonts/fredoka-latin-ext-var.woff2',
  'vendor/fonts/nunito-latin-var.woff2',
  'vendor/fonts/nunito-latin-ext-var.woff2',
  'vendor/fonts/fraunces-latin-400.woff2',
  'vendor/fonts/fraunces-latin-700.woff2',
  'vendor/qrcode.js',
  'vendor/jsQR.js',
  'js/scrabble.js',
  'js/ai.js',
  'js/ai-worker.js',
  'js/net.js',
  'js/games/registry.js',
  'js/fx.js',
  'js/sfx.js',
  'js/games/cartes.js',
  'js/online.js',
  'js/wallet.js',
  'js/games/motscourants.js',
  'js/games/p4.js',
  'js/games/morpion.js',
  'js/games/pendu.js',
  'js/games/bac.js',
  'js/games/bataille.js',
  'js/games/yams.js',
  'js/games/cochon.js',
  'js/games/memory.js',
  'js/games/sudoku.js',
  'js/games/meles.js',
  'js/games/motus.js',
  'js/games/croises.js',
  'js/games/fleches-data.js',
  'js/games/fleches.js',
  'js/games/imposteur.js',
  'js/games/quiz.js',
  'js/games/proche.js',
  'js/games/huit.js',
  'js/games/poker.js',
  'js/games/blackjack.js',
  'js/games/solitaire.js',
  'js/games/bonbons.js',
  'js/games/manoir.js',
  'js/games/chat.js',
  'js/app.js',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE).then(function (cache) {
        // cache:'reload' contourne le cache HTTP du navigateur : la nouvelle
        // version embarque toujours des fichiers frais, jamais d'anciens
        return cache.addAll(ASSETS.map(function (u) {
          return new Request(u, { cache: 'reload' });
        }));
      }),
      caches.open(DICO).then(function (cache) {
        return Promise.all(DICO_URLS.map(function (u) {
          return cache.match(u).then(function (deja) {
            if (deja) return null;
            return cache.add(new Request(u, { cache: 'reload' }));
          });
        }));
      })
    ]).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE && key !== DICO) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function estLaPage(url) {
  return url.origin === self.location.origin &&
    (url.pathname.slice(-1) === '/' || /\/index\.html$/.test(url.pathname));
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  // les listes de mots : leur cache à elles
  var m = url.origin === self.location.origin && url.pathname.match(DICO_RE);
  if (m) {
    var cle = 'data/' + m[1] + '.txt';
    event.respondWith(
      caches.open(DICO).then(function (cache) {
        return cache.match(cle).then(function (hit) {
          if (hit) return hit;
          return fetch(event.request).then(function (resp) {
            if (resp.ok) cache.put(cle, resp.clone());
            return resp;
          });
        });
      })
    );
    return;
  }
  // la page : réseau d'abord (délai court), cache sinon
  if (estLaPage(url)) {
    event.respondWith(new Promise(function (resolve) {
      var fini = false;
      var secours = function () {
        if (fini) return;
        fini = true;
        caches.match('index.html').then(function (c) {
          resolve(c || fetch(event.request));
        });
      };
      var t = setTimeout(secours, 2500);
      fetch(event.request).then(function (resp) {
        if (fini) return;
        if (!resp.ok) { clearTimeout(t); secours(); return; }
        fini = true;
        clearTimeout(t);
        var copie = resp.clone();
        caches.open(CACHE).then(function (cache) { cache.put('index.html', copie); });
        resolve(resp);
      }).catch(function () { clearTimeout(t); secours(); });
    }));
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        // Met en cache les ressources de même origine récupérées en ligne
        if (resp.ok && url.origin === self.location.origin) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return resp;
      });
    })
  );
});
