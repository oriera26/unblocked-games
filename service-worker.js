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

/**
 * El pedaç de volum que corre dins de cada joc.
 *
 * S'insereix a l'HTML del joc abans que cap dels seus scripts, que és
 * l'únic moment en què es pot interceptar el so de Web Audio. El camí és
 * absolut perquè l'HTML el resol contra la URL del joc
 * (`assets/games/...`), no contra la d'aquest fitxer.
 */
const VOLUME_SRC = new URL('./assets/js/game-volume.js', self.location.href).href;

/** Marca que deixa el pedaç al document, per no ficar-lo dues vegades. */
const VOLUME_TAG_ID = '__ulaVolumeTag';

/* Recursos essencials per funcionar offline */
const PRECACHE_URLS = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    './assets/js/gameList.js',
    './assets/js/game-volume.js',
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
   VOLUM · el pedaç que cada joc carrega abans dels seus scripts
   ============================================================ */

/**
 * Posició just després de l'etiqueta d'obertura del `<head>`.
 *
 * Si no n'hi ha, es fa servir el `<!doctype>`: inserir abans del
 * doctype posaria el document en mode quirks i el joc sortiria tot
 * torçat. I si no hi ha cap dels dos, no s'insereix res — millor un
 * joc sense control de volum que un joc trencat.
 */
function headEndIndex(html) {
    const head = html.match(/<head(?:\s[^>]*)?>/i);
    if (head) return head.index + head[0].length;

    const doctype = html.match(/<!doctype[^>]*>/i);
    if (doctype) return doctype.index + doctype[0].length;

    return -1;
}

/**
 * Lliura un joc amb el pedaç de volum dins del seu HTML.
 *
 * La resposta es llegeix i es torna a construir amb una línia més; el
 * que es desa a la cache és el fitxer original, així que el pedaç es
 * reinserta cada cop i mai no es pot encabir dues vegades.
 *
 * Qualsevol error torna la resposta tal com ve: un joc sense pedaç és
 * un joc que no es pot abaixar de volum, que és molt millor que un joc
 * que no s'obre.
 *
 * @param {Request} request
 * @param {URL} url
 */
async function serveGame(request, url) {
    const cache = await caches.open(GAMES_CACHE);
    let response = await cache.match(request);

    if (!response) {
        response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
    }

    return withVolumeTag(response, url);
}

async function withVolumeTag(response, url) {
    try {
        if (!response || !response.ok) return response;

        const type = response.headers.get('content-type') || '';
        const isHtml = /\.(html?|xhtml)$/i.test(url.pathname) || type.includes('text/html');
        if (!isHtml) return response;

        const html = await response.text();
        const at = headEndIndex(html);
        const tag = `<script src="${VOLUME_SRC}" id="${VOLUME_TAG_ID}"></scr` + 'ipt>';

        // Sempre es reconstrueix: un cop llegit el cos, la resposta
        // original ja no serveix. Si el pedaç hi és o no hi ha on
        // encabir-lo, es torna el mateix HTML sense tocar-lo.
        const patched = at >= 0 && !html.includes(VOLUME_TAG_ID)
            ? html.slice(0, at) + tag + html.slice(at)
            : html;

        const headers = new Headers(response.headers);
        // El cos ja no és el que deia l'origen: mida i compressió
        // deixen de correspondre-hi i el navegador no el sabria obrir.
        headers.delete('content-length');
        headers.delete('content-encoding');

        return new Response(patched, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    } catch (err) {
        console.warn('[SW] No s\'ha pogut insertar el pedaç de volum:', err);
        return response;
    }
}

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

    /* Jocs: cache-first amb fallback a xarxa, i amb el pedaç de volum
       insertat a l'HTML abans de lliurar-lo. */
    if (url.pathname.startsWith(GAMES_PATH)) {
        event.respondWith(serveGame(request, url));
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
