// service-worker.js
// Versió del cache: ha de coincidir amb cada desplegament
const CACHE_VERSION = 'ula-games-v2.6.3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const GAME_CACHE = `${CACHE_VERSION}-games`;
const GAME_SUB_CACHE = `${CACHE_VERSION}-game-assets`; // Per subrecursos dels jocs
const FALLBACK_CACHE = `${CACHE_VERSION}-fallback`;

// Llista exacta d’actius estàtics que volem pre-cachejar
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',            // Pàgina de fallback
  '/manifest.json',
  '/assets/css/styles.css',   // Si existeix
  '/assets/js/gameList.js',
  '/assets/js/scripts.js',    // El JS principal
  '/assets/icons/favicon.png', // Icona de la pestanya
  // Afegir aquí totes les fonts, icones i CSS que s'utilitzin
  // Exemples:
  // 'https://fonts.googleapis.com/css2?family=...',
];

// Instal·lació: pre-cachegem els recursos estàtics i la pàgina de fallback
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activació: netejar caches antics
self.addEventListener('activate', event => {
  const validCaches = [STATIC_CACHE, GAME_CACHE, GAME_SUB_CACHE, FALLBACK_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!validCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Funció auxiliar: intenta una petició de xarxa i guarda la resposta al cache dinàmic de jocs
async function networkFirstWithGameCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    // Si no hi ha res, forcem offline fallback
    throw error;
  }
}

// Estratègia stale-while-revalidate per a gameList.js
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  // Si tenim cache, el retornem immediatament; sinó esperem la xarxa
  return cachedResponse || fetchPromise;
}

// Intercepció de peticions
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Només gestionem peticions GET
  if (request.method !== 'GET') return;

  // --- 1. Peticions a recursos estàtics (cache-first) ---
  // Comprovar si és un dels assets estàtics (comparant pathname)
  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname === '/' + asset);
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request)
        .then(cached => cached || fetch(request))
    );
    return;
  }

  // --- 2. gameList.js: stale-while-revalidate ---
  if (url.pathname.endsWith('/gameList.js') || url.pathname.endsWith('/assets/js/gameList.js')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // --- 3. HTML dels jocs (/assets/games/*.html) -> network-first ---
  if (url.pathname.startsWith('/assets/games/') && url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstWithGameCache(request, GAME_CACHE));
    return;
  }

  // --- 4. Subrecursos dels jocs (imatges, JS, CSS, etc.) -> cache-first amb actualització en segon pla ---
  if (url.pathname.startsWith('/assets/games/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            const cacheCopy = networkResponse.clone();
            caches.open(GAME_SUB_CACHE).then(cache => cache.put(request, cacheCopy));
          }
          return networkResponse;
        }).catch(() => cached);

        // Si tenim cache, el mostrem immediatament; en cas contrari esperem la xarxa
        return cached || fetchPromise;
      })
    );
    return;
  }

  // --- 5. Altres peticions (fonts, API, etc.) -> network-first ---
  event.respondWith(networkFirstWithGameCache(request, STATIC_CACHE));
});

// Opcional: missatge per forçar neteja des de la interfície
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
  }
});