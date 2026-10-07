/* ============================================================
   SERVICE WORKER · ulaGames
   ============================================================ */

const CACHE_VERSION = 'ula-v1.4.0';
const STATIC_CACHE = CACHE_VERSION + '-static';
const GAMES_CACHE = CACHE_VERSION + '-games';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/**
 * Tot es resol respecte d'aquest mateix fitxer.
 *
 * El mateix lloc es publica a l'arrel (server.js local, Electron) i a un
 * subdirectori (GitHub Pages el serveix a /unblocked-games/). Un path que
 * comença per `/` apuntaria sempre a l'arrel del domini i, allà dalt,
 * precachejaria 404 i cauria offline. Resolt contra `self.location`, en
 * canvi, funciona als dos llocs sense cap configuració.
 */
const rel = (path) => new URL(path, self.location.href).href;

/** Carpeta dels jocs, tal com es veu a l'URL d'aquesta publicació. */
const GAMES_PATH = new URL('./assets/games/', self.location.href).pathname;

/* Recursos essencials per funcionar offline */
const PRECACHE_URLS = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    './assets/js/gameList.js',
    './assets/vendor/lucide.min.js',
    './assets/images/orb-blurred.webp',
    './assets/icons/icon-256x256.png',
    './assets/icons/icon-512x512.png',
    './assets/icons/icon-large-dark.png',
    './assets/icons/icon-large-light.png'
];

/* ============================================================
   INSTALL · Precache
   ============================================================ */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                return Promise.all(
                    PRECACHE_URLS.map((url) => {
                        return cache.add(url).catch((err) => {
                            console.warn('[SW] No s\'ha pogut precachejar:', url, err);
                        });
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

/* ============================================================
   ACTIVATE · Neteja caches antigues
   ============================================================ */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key.startsWith('ula-') && key !== STATIC_CACHE && key !== GAMES_CACHE && key !== RUNTIME_CACHE)
                        .map((key) => caches.delete(key))
                );
            })
            .then(() => self.clients.claim())
    );
});

/* ============================================================
   FETCH · Estratègies per tipus de recurs
   ============================================================ */
self.addEventListener('fetch', (event) => {
    const request = event.request;

    /* Ignora mètodes no-GET */
    if (request.method !== 'GET') return;

    /* Ignora peticions a altres orígens (analytics, CDN externs, etc.) */
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    /* Jocs: cache-first amb fallback a xarxa */
    if (url.pathname.startsWith(GAMES_PATH)) {
        event.respondWith(
            caches.open(GAMES_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
                    if (cached) return cached;
                    return fetch(request).then((response) => {
                        if (response.ok) cache.put(request, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    /* HTML / navegació: network-first amb fallback offline.html */
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cached) => {
                        return cached || caches.match(rel('./offline.html'));
                    });
                })
        );
        return;
    }

    /* Assets estàtics: cache-first amb revalidació */
    event.respondWith(
        caches.open(RUNTIME_CACHE).then((cache) => {
            return cache.match(request).then((cached) => {
                const fetchPromise = fetch(request)
                    .then((response) => {
                        if (response && response.ok) cache.put(request, response.clone());
                        return response;
                    })
                    .catch(() => cached);
                return cached || fetchPromise;
            });
        })
    );
});

/* ============================================================
   MISSATGES · Neteja de cache des de l'app
   ============================================================ */
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                .then(() => {
                    if (event.source && event.source.postMessage) {
                        event.source.postMessage({ type: 'CACHE_CLEARED' });
                    }
                })
        );
    }

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
