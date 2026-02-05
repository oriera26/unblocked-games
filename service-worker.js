// Nom del cache i versions
const CACHE_NAME = 'ulaGames-v2.6.3';
const DYNAMIC_CACHE_NAME = 'ulaGames-dynamic-v1';

// Recursos a cachejar durant la instal·lació
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/stats.html',
  '/assets/css/styles.css',
  '/assets/css/skeleton.css',
  '/assets/js/scripts.js',
  '/assets/js/gameList.js',
  '/icons/favicon.png',
  '/manifest.json',
  
  // Fonts de Google
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap',
  
  // Font Awesome
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  
  // Video de loading
  '/assets/videos/loading.mp4'
];

// Instal·lació del Service Worker
self.addEventListener('install', event => {
  console.log('[Service Worker] Instal·lant...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Emmagatzemant recursos estàtics');
        return cache.addAll(STATIC_ASSETS)
          .catch(error => {
            console.warn('[Service Worker] Error afegint alguns recursos:', error);
          });
      })
      .then(() => {
        console.log('[Service Worker] Instal·lació completada');
        return self.skipWaiting();
      })
  );
});

// Activació del Service Worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activant...');
  
  // Netejar caches antics
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Eliminant cache antic:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Ara controla tots els clients');
      return self.clients.claim();
    })
  );
});

// Estratègia de cache: Cache First, després xarxa
self.addEventListener('fetch', event => {
  // Excloure les peticions POST i altres mètodes no GET
  if (event.request.method !== 'GET') return;
  
  // Excloure les peticions a jocs (per a que sempre es carreguin frescos)
  if (event.request.url.includes('/assets/games/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // Per a la resta, estratègia Cache First
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Actualitzar el cache en segon pla
          event.waitUntil(
            updateCache(event.request)
          );
          return cachedResponse;
        }
        
        // Si no està al cache, anar a la xarxa
        return fetch(event.request)
          .then(networkResponse => {
            // Cachejar la resposta per a properes vegades
            if (isCacheable(event.request, networkResponse)) {
              addToCache(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('[Service Worker] Error de xarxa:', error);
            
            // Si és una pàgina HTML, retornar la pàgina offline
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
            
            return new Response('Sense connexió', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Estratègia: Xarxa primer, després cache (per a jocs)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Si la xarxa funciona, retornar resposta i cachejar
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Si falla la xarxa, intentar del cache
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Joc no disponible fora de línia', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Actualitzar el cache en segon pla
async function updateCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) {
      cache.put(request, response);
    }
  } catch (error) {
    // No fer res si falla l'actualització
  }
}

// Afegir al cache dinàmic
async function addToCache(request, response) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  cache.put(request, response);
}

// Verificar si una resposta es pot cachejar
function isCacheable(request, response) {
  // No cachejar respostes no OK
  if (!response || response.status !== 200) return false;
  
  // No cachejar respostes d'imatges de jocs (els jocs necessiten ser sempre frescos)
  if (request.url.includes('/assets/games/')) return false;
  
  // No cachejar respostes no GET
  if (request.method !== 'GET') return false;
  
  // Cachejar recursos estàtics i pàgines
  const contentType = response.headers.get('content-type');
  return (
    contentType &&
    (contentType.includes('text/html') ||
     contentType.includes('text/css') ||
     contentType.includes('application/javascript') ||
     contentType.includes('image/') ||
     contentType.includes('font/') ||
     contentType.includes('application/json'))
  );
}

// Event per rebre missatges de l'aplicació
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName);
      });
    });
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    caches.keys().then(cacheNames => {
      const cachePromises = cacheNames.map(cacheName => {
        return caches.open(cacheName)
          .then(cache => cache.keys())
          .then(requests => requests.length);
      });
      
      Promise.all(cachePromises).then(sizes => {
        const totalSize = sizes.reduce((a, b) => a + b, 0);
        event.ports[0].postMessage({
          cacheCount: cacheNames.length,
          totalItems: totalSize
        });
      });
    });
  }
});

// Sincronització en segon pla
self.addEventListener('sync', event => {
  if (event.tag === 'sync-stats') {
    console.log('[Service Worker] Sincronitzant estadístiques...');
    // Aquí pots implementar la sincronització de dades
  }
});

// Notificacions push (implementació bàsica)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificació d\'ulaGames',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Obrir jocs',
        icon: '/icons/action-game.png'
      },
      {
        action: 'close',
        title: 'Tancar',
        icon: '/icons/action-close.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('ulaGames', options)
  );
});

// Gestionar clics en notificacions
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notificació clicada');
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/index.html')
    );
  } else if (event.action === 'close') {
    // No fer res
  } else {
    // Clic a la notificació (no a una acció)
    event.waitUntil(
      clients.openWindow('/index.html')
    );
  }
});