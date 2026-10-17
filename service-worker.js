/* ============================================================
   SERVICE WORKER · ulaGames
   ============================================================ */

const CACHE_VERSION = 'ula-v1.14.0';
const STATIC_CACHE = CACHE_VERSION + '-static';
const GAMES_CACHE = CACHE_VERSION + '-games';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/**
 * Cau dels jocs offline. Nom fix (no porta la versió del SW): un joc de
 * 50 MB no s'ha de tornar a baixar cada cop que canvia una línia del
 * codi. Si es vol esborrar, hi ha la neteja de memòria cau.
 *
 * Ha de coincidir amb `OFFLINE_CACHE_NAME` de config.js (el SW no pot
 * importar-lo).
 */
const OFFLINE_CACHE = 'ula-offline-games';

/* Sostres de les caches. `cache.put()` no té límit i, sense podar-les,
   les caches de jocs i d'assets creixien indefinidament a cada visita.
   Es trauen les entrades més antigues (la Cache API retorna les claus en
   ordre d'inserció, que és el més a prop d'un LRU que hi ha). */
const GAMES_CACHE_MAX = 40;
const RUNTIME_CACHE_MAX = 80;

/* Els jocs que passen d'aquest pes no s'emmagatzemen sols: obrir un
   client de 70 MB ompliria la cau sense que l'usuari hagi demanat res, i
   aquests jocs ja es tornen a baixar a demanda cada cop que es juguen.
   El comptatge es fa sobre el cos descomprimit de debò: la
   `content-length` de GitHub Pages mesura la mida comprimida. */
const GAMES_CACHE_MAX_BYTES = 20 * 1024 * 1024;

/* Frescor de les imatges del catàleg. Dins d'aquesta finestra la cau
   mana i no es toca la xarxa; passada, es revalida de fons. Sense això,
   cada vista tornava a demanar cada portada (el servidor local envia
   `no-cache` i el navegador no té res a què agafar-se). */
const IMAGE_REVALIDATE_MS = 24 * 60 * 60 * 1000;

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
 * Carpeta dels jocs offline. Es reconeix pel camí perquè el SW no
 * coneix el catàleg: aquests jocs es serveixen des de la cau pròpia,
 * sense el pedaç de volum (seria llegir 50 MB de text a cada obertura)
 * i sense desar-los automàticament a la xarxa.
 */
const OFFLINE_GAMES_PATH = new URL('./assets/offline/', self.location.href).pathname;

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

/* Recursos essencials per funcionar offline.

   Els CSS hi són perquè, sense ells, la primera visita sense xarxa
   mostraria index.html sense estil. offline.js també, que la pàgina
   «sense connexió» no pot córrer amb scripts en línia. */
const PRECACHE_URLS = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    './assets/css/main.css',
    './assets/css/layout.css',
    './assets/css/components.css',
    './assets/css/skeleton.css',
    './assets/css/responsive.css',
    './assets/css/social.css',
    './assets/js/gameList.js',
    './assets/js/game-volume.js',
    './assets/js/offline.js',
    './assets/js/boot-watch.js',
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
                const failures = [];
                return Promise.all(
                    PRECACHE_URLS.map((url) =>
                        cache.add(url).catch((err) => {
                            failures.push(url);
                            console.warn('[SW] No s\'ha pogut precachejar:', url, err);
                        })
                    )
                ).then(() => {
                    // Un sol avís agregat: si alguna cosa no s'ha pogut
                    // precachejar, ha de quedar clar quina.
                    if (failures.length) {
                        console.warn(`[SW] precache incomplet (${failures.length}):`, failures.join(', '));
                    }
                });
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
                        .filter(
                            (key) =>
                                key.startsWith('ula-') &&
                                key !== STATIC_CACHE &&
                                key !== GAMES_CACHE &&
                                key !== RUNTIME_CACHE &&
                                key !== OFFLINE_CACHE
                        )
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
/**
 * Poda una cau si passa del màxim, traient les entrades més antigues.
 *
 * @param {string} cacheName
 * @param {number} max
 */
async function trimCache(cacheName, max) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        if (keys.length <= max) return;
        const excess = keys.length - max;
        await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
    } catch (err) {
        console.warn('[SW] no s\'ha pogut podar la cau', cacheName, err);
    }
}

/**
 * Desa un joc a la cau tret que passi del sostre de mida.
 *
 * El cos es va comptant mentre passa; si se supera el sostre, la
 * insercció s'avorta i no queda res desat (la Cache API no confirma
 * l'entrada fins que el cos acaba sencer). L'usuari no en pateix res:
 * el joc li arriba per l'altra branca del `clone`, que va a part.
 */
function storeGame(cache, request, response) {
    const body = response.body;

    // Sense cos o sense TransformStream (navegadors vells) es desa tal
    // com es feia abans; hi ha marge de sobres a la cau.
    if (!body || typeof TransformStream !== 'function') {
        return cache.put(request, response)
            .then(() => trimCache(GAMES_CACHE, GAMES_CACHE_MAX))
            .catch(() => {});
    }

    let seen = 0;
    const counted = body.pipeThrough(
        new TransformStream({
            transform(chunk, controller) {
                seen += chunk.byteLength;
                if (seen > GAMES_CACHE_MAX_BYTES) {
                    controller.error(new Error('el joc passa del sostre de la cau'));
                    return;
                }
                controller.enqueue(chunk);
            }
        })
    );

    // El cos que arriba aquí ja ve descomprimit: les capçaleres de mida
    // i de compressió de l'origen deixarien de ser certes.
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    const storable = new Response(counted, {
        status: response.status,
        statusText: response.statusText,
        headers
    });

    return cache.put(request, storable)
        .then(() => trimCache(GAMES_CACHE, GAMES_CACHE_MAX))
        .catch(() => {
            /* passat del sostre: no es desa, i prou */
        });
}

async function serveGame(request, url, event) {
    const cache = await caches.open(GAMES_CACHE);
    let response = await cache.match(request);

    if (!response) {
        response = await fetch(request);
        if (response.ok) {
            // No s'espera: el joc ha d'arribar de seguida. El
            // `waitUntil` manté el service worker viu fins que la cau
            // confirma l'entrada (o la descarta, si el joc és gros).
            event.waitUntil(storeGame(cache, request, response.clone()));
        }
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
   OFFLINE · jocs grossos que només es baixen a petició
   ============================================================ */

/**
 * Serveix un joc offline des de la seva cau, si hi és.
 *
 * Si no hi és, es deixa passar la xarxa sense desar-lo: aquests jocs
 * només s'incorporen a la cau amb `DOWNLOAD_OFFLINE`, quan l'usuari ho
 * demana. Així navegar pel catàleg no baixa 50 MB.
 *
 * Sense pedaç de volum a propòsit: inserir-lo obligaria a llegir el
 * fitxer sencer com a text. `game-volume.js` ja sap injectar-se des de
 * la pàgina mare quan el SW no l'hi ha posat.
 */
async function serveOffline(request) {
    const cache = await caches.open(OFFLINE_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    return fetch(request);
}

/** Envia un missatge al client que ha demanat la baixada. */
function postToClient(client, data) {
    try {
        if (client && client.postMessage) client.postMessage(data);
    } catch {
        /* el client pot haver-se tancat */
    }
}

/**
 * Baixa un joc offline amb avenç i el desa a la cau.
 *
 * El cos es compta mentre passa i s'entrega a la cau tal qual, sense
 * retenir-lo sencer a memòria. Abans s'acumulaven tots els trossos en un
 * array i al final es feia un Blob: per un joc de 50 MB això volia dir
 * uns 50 MB a RAM (o més, si el Blob copiava). Els avisos de progrés es
 * limiten per temps perquè un fitxer gran no generi milers de missatges.
 */
async function downloadOffline(absUrl, client) {
    try {
        const cache = await caches.open(OFFLINE_CACHE);
        const response = await fetch(absUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const type = response.headers.get('content-type') || 'text/html';
        const total = Number(response.headers.get('content-length')) || 0;

        let bytes = 0;
        let lastTick = 0;
        let body = response.body;

        if (body && typeof TransformStream === 'function') {
            const counter = new TransformStream({
                transform(chunk, controller) {
                    bytes += chunk.byteLength;

                    const now = Date.now();
                    if (now - lastTick > 150) {
                        lastTick = now;
                        postToClient(client, { type: 'OFFLINE_PROGRESS', url: absUrl, received: bytes, total });
                    }

                    controller.enqueue(chunk);
                }
            });
            body = body.pipeThrough(counter);
        }

        let storable;
        if (body) {
            storable = new Response(body, { status: 200, headers: { 'Content-Type': type } });
        } else {
            const blob = await response.blob();
            bytes = blob.size;
            storable = new Response(blob, { status: 200, headers: { 'Content-Type': type } });
        }

        await cache.put(absUrl, storable);
        postToClient(client, { type: 'OFFLINE_DONE', url: absUrl, bytes: total || bytes });
    } catch (err) {
        console.warn('[SW] baixada offline fallida:', absUrl, err);
        postToClient(client, { type: 'OFFLINE_ERROR', url: absUrl });
    }
}

/**
 * Serveix una imatge des de la cau d'assets.
 *
 * Dins de la finestra de frescor no es toca la xarxa: el catàleg sencer
 * es pot recórrer amb una sola descàrrega per portada. Passada la
 * finestra, es lliura la còpia de seguida i s'actualitza de fons (el
 * mateix tracte que la resta d'assets, però sense la petició a cada
 * vista). Si encara no hi ha còpia, es baixa i es desa.
 *
 * Quan la xarxa falla es mira a les altres caches: el logotip i l'orba
 * surten del precache d'INSTALL i han de seguir sortint sense xarxa.
 */
async function serveImage(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);

    if (cached && Date.now() - dateOf(cached) < IMAGE_REVALIDATE_MS) return cached;

    const network = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone()).then(() => trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX));
            }
            return response;
        })
        .catch(() => cached || caches.match(request).then((r) => r || Response.error()));

    return cached || network;
}

/** Quan es va rebre una resposta (0 si la capçalera no ho diu). */
function dateOf(response) {
    return Date.parse(response.headers.get('date') || '') || 0;
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

    /* Jocs offline: només des de la cau pròpia, sense pedaç de volum. */
    if (url.pathname.startsWith(OFFLINE_GAMES_PATH)) {
        event.respondWith(serveOffline(request));
        return;
    }

    /* Jocs: cache-first amb fallback a xarxa, i amb el pedaç de volum
       insertat a l'HTML abans de lliurar-lo. */
    if (url.pathname.startsWith(GAMES_PATH)) {
        event.respondWith(serveGame(request, url, event));
        return;
    }

    /* HTML / navegació: network-first amb fallback offline.html */
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches
                        .open(RUNTIME_CACHE)
                        .then((cache) => cache.put(request, copy).then(() => trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX)));
                    return response;
                })
                .catch(() => {
                    // Fallback robust: provem d'obrir offline.html des del STATIC_CACHE
                    // (on es va precachejar a l'install). Si no hi és, tornem l'error.
                    const offlineUrl = new URL('./offline.html', self.location.href).href;
                    return caches.open(STATIC_CACHE).then((cache) => {
                        return cache.match(offlineUrl).then((offlineResponse) => {
                            return offlineResponse || Response.error();
                        });
                    });
                })
        );
        return;
    }

    /* Imatges del catàleg: cau amb revalidació diària */
    if (request.destination === 'image') {
        event.respondWith(serveImage(request));
        return;
    }

    /* Assets estàtics: cache-first amb revalidació */
    event.respondWith(
        caches.open(RUNTIME_CACHE).then((cache) => {
            return cache.match(request).then((cached) => {
                const fetchPromise = fetch(request)
                    .then((response) => {
                        if (response && response.ok) {
                            cache.put(request, response.clone()).then(() => trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX));
                        }
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
/**
 * El missatge ve de la pàgina de l'aplicació i no d'un joc.
 *
 * Els jocs viuen al mateix origen i també són clients del service
 * worker: sense aquest filtre, un joc qualsevol podria enviar
 * `CLEAR_CACHE`, `DOWNLOAD_OFFLINE` o `SKIP_WAITING` i abusar dels
 * privilegis del SW (DoS buidant caches, forçar una actualització...).
 * Es descarten els clients la URL dels quals és un joc.
 */
function isAppClient(event) {
    const source = event.source;
    if (!source || typeof source.url !== 'string' || !source.url) return false;

    let pathname;
    try {
        pathname = new URL(source.url).pathname;
    } catch {
        return false;
    }

    return !pathname.startsWith(GAMES_PATH) && !pathname.startsWith(OFFLINE_GAMES_PATH);
}

/**
 * L'URL és un joc offline legítim: mateix origen, dins de
 * `assets/offline/` i un fitxer directe de la carpeta (ni `..` ni
 * subcarpetes). Així un joc no pot fer que el SW baixi o esborri res
 * de fora d'aquella carpeta.
 */
function isOfflineGameUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;

    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }

    if (url.origin !== self.location.origin) return false;
    if (!url.pathname.startsWith(OFFLINE_GAMES_PATH)) return false;
    if (url.pathname.includes('..')) return false;

    const rest = url.pathname.slice(OFFLINE_GAMES_PATH.length);
    return rest.length > 0 && !rest.includes('/');
}

self.addEventListener('message', (event) => {
    if (!event.data) return;

    // Els missatges privilegiats només s'accepten de la pàgina de
    // l'aplicació, mai d'un joc.
    if (!isAppClient(event)) return;

    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((keys) =>
                    // Només les caches d'aquesta aplicació: `caches.keys()`
                    // les retorna totes les de l'origen i esborrar-les totes
                    // mataria les d'altres apps que hi visquin.
                    Promise.all(keys.filter((k) => k.startsWith('ula-')).map((k) => caches.delete(k)))
                )
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

    if (event.data.type === 'DOWNLOAD_OFFLINE') {
        if (!isOfflineGameUrl(event.data.url)) return;
        event.waitUntil(downloadOffline(event.data.url, event.source));
    }

    if (event.data.type === 'DELETE_OFFLINE') {
        if (!isOfflineGameUrl(event.data.url)) return;
        event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.delete(event.data.url)));
    }
});
