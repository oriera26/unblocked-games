// ============================================
// Service Worker lleuger 
// Només intercepta peticions del mateix origen
// No bloqueja CORS ni recursos externs (jocs de tercers)
// ============================================

const CACHE_VERSION = 'ula-shell-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Actius estàtics essencials de l'app shell
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/js/gameList.js',
  '/assets/icons/icon.ico',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-large-dark.png',
  '/assets/icons/icon-large-light.png'
];

// Instal·lació: pre-cachegem el shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activació: neteja caches antics
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Intercepció de peticions: només per al mateix origen
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar completament peticions a altres orígens (jocs externs, APIs de tercers)
  if (url.origin !== location.origin) return;

  // Ignorar mètodes que no siguin GET
  if (event.request.method !== 'GET') return;

  // Estratègia: network-first per als recursos estàtics (amb fallback a offline)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Si la resposta és vàlida, la guardem al cache per a futures visites offline
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si falla la xarxa, intentem servir des del cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Si no hi ha cache i falla la xarxa, mostrem la pàgina offline (per a navegació)
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Offline content not available', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});

// Neteja manual de cache (opcional)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
  }
});
