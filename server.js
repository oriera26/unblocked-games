/**
 * server.js · el servidor local d'ulaGames.
 *
 * Sense dependències, només amb els mòduls que venen amb Node. Fa tres
 * coses i prou:
 *
 *   1. Serveix el projecte com a fitxes estàtiques.
 *   2. Es queda escoltant un port i avisa quan ja hi és.
 *   3. Engega offline.html per a qualsevol ruta que no existeixi.
 *
 * Per què cal un servidor i es pot obrir el fitxer directament
 * ---------------------------------------------------------------
 * Perquè l'aplicació ja usa mòduls ES. El navegador rebutja
 * `import` des d'un fitxer obert amb file:// (el mòdul no seria del
 * mateix origen i el navegador el bloqueja), de manera que index.html
 * s'ha d'obrir per http. A més hi ha un service worker, que tampoc es
 * registra mai des de file://.
 *
 * El 404 canvia a offline.html i no a index.html perquè un error de
 * xarxa en un joc ha de mostrar la pàgina d'"aquest joc no funciona",
 * no el catàleg sencer com si res.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

export const DEFAULT_PORT = 3000;

/** Extensió -> tipus MIME. Els tipus que no hi consten no es serveixen. */
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',

    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',

    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',

    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function mimeOf(filePath) {
    return MIME[extname(filePath).toLowerCase()] ?? null;
}

/* Capçaleres de seguretat.

   Només s'apliquen aquí (servidor local i Electron). A GitHub Pages no
   es poden enviar capçaleres: allà l'equivalent és el <meta
   http-equiv="Content-Security-Policy"> d'index.html, que no cobreix
   `frame-ancestors`, COOP ni CORP perquè el meta no els admet.

   NO s'hi posa `Cross-Origin-Embedder-Policy` (ni `credentialless`): en
   Chromium, un document amb COEP només pot incrustar marcs que també en
   portin, i això faria fallar l'iframe del joc amb
   `ERR_BLOCKED_BY_RESPONSE`. Com que l'aplicació no necessita aïllament
   d'origen creuat, s'omet i s'hi confia en `COOP` i `CORP`.

   `img-src` inclou `data:` i `blob:` per les portades incrustades i els
   SVG; `style-src` necessita `'unsafe-inline'` pels estils en línia que
   posa l'aplicació (display del loader, delays de revelat...).

   Els dominis de Firebase són els del compte: vegeu AUTH_ORIGINS, aquí
   sota. Són els mateixos que porta el <meta> de index.html, perquè a
   GitHub Pages no hi ha capçaleres; tools/check-firebase.mjs comprova
   que tots dos parlin del projecte de firebase-config.js. */

/**
 * El domini propi del projecte: és on viu l'iframe que fa de pont amb
 * el popup de Google.
 */
const AUTH_DOMAIN = 'https://unblocked-games-by-ula.firebaseapp.com';

/**
 * Els orígens del projecte de Firebase que necessita el compte.
 *
 * `identitytoolkit` és entrar i crear compte; `securetoken`, renovar el
 * token; `firestore`, la sincronització.
 */
const AUTH_ORIGINS = [
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    AUTH_DOMAIN
];

/**
 * D'on baixa el SDK el carregador de Google (`gapi`).
 *
 * El popup de Google no és només una finestra: abans d'obrir-la, el SDK
 * carrega `https://apis.google.com/js/api.js` DINS de la nostra pàgina i
 * fa servir el seu `gapi.iframes` per parlar amb l'iframe del projecte.
 * Sense aquest domini a `script-src`, el popup ni s'arriba a obrir.
 */
const GAPI_ORIGIN = 'https://apis.google.com';

/**
 * imgbb: la foto de perfil del Social. Les pujades van a `api.imgbb.com`
 * i les imatges resultants es mostren des de `i.ibb.co` (i els seus
 * subdominis). Si mai no es fa servir la foto de perfil, es poden treure.
 */
const IMGBB_UPLOAD = 'https://api.imgbb.com';
const IMGBB_IMAGES = ['https://i.ibb.co', 'https://*.ibb.co'];

function csp(frameAncestors) {
    return [
        "default-src 'self'",
        `script-src 'self' ${GAPI_ORIGIN}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${IMGBB_IMAGES.join(' ')}`,
        "media-src 'self' blob:",
        "font-src 'self'",
        `frame-src 'self' ${AUTH_DOMAIN}`,
        `connect-src 'self' ${AUTH_ORIGINS.join(' ')} ${IMGBB_UPLOAD}`,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        `frame-ancestors ${frameAncestors}`
    ].join('; ');
}

const APP_SECURITY_HEADERS = {
    'Content-Security-Policy': csp("'none'"),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), usb=()',
    /* `same-origin` deixaria el popup de Google sense accés a
       `window.opener`, i sense això el pont que retorna la resposta no
       pot parlar amb la pàgina: el popup s'obre, però en tornar no passa
       res. `same-origin-allow-popups` és la mateixa protecció, amb
       l'excepció que els popups oberts per la pròpia pàgina sí que hi
       tenen accés. */
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin'
};

/* offline.html es mostra DINS de l'iframe del joc quan un joc no
   carrega: si portés `frame-ancestors 'none'` com la resta, el navegador
   es negaria a pintar-la dins de l'aplicació. Per això se serveix amb
   `'self'`. */
const FRAMABLE_SECURITY_HEADERS = {
    ...APP_SECURITY_HEADERS,
    'Content-Security-Policy': csp("'self'")
};

/** Capçaleres que toquen a un fitxer servit (offline.html és el cas especial). */
function securityHeadersFor(filePath) {
    return basename(filePath).toLowerCase() === 'offline.html'
        ? FRAMABLE_SECURITY_HEADERS
        : APP_SECURITY_HEADERS;
}

/* Els jocs són codi de tercers: una CSP estricta els trencaria (inline,
   eval, wasm, CDNs propis...). Només se'ls impedeix que una altra web
   els embedeixi. */
const GAME_SECURITY_HEADERS = {
    'Content-Security-Policy': "frame-ancestors 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
};

/* Volum: els HTML dels jocs surten amb el pedaç de volum a dins.

   A la web això ho fa el service worker; aquí, que no n'hi ha (ni a
   l'app d'Escripteri ni al servidor local), es posa al vol quan se
   serveix cada joc. El pedaç ha d'anar abans dels scripts del joc, i la
   seva URL, absoluta, perquè un joc amb `<base href>` no la desviï.

   Els jocs de `assets/offline/` també són jocs i necessiten les
   capçaleres de joc (sense elles hi ha `frame-ancestors 'none'` i el
   navegador es nega a pintar-los dins de l'aplicació), però no porten
   pedaç: com que són fitxers grossos, es transmeten tal qual. */
const GAMES_ROOT = join(ROOT, 'assets', 'games') + sep;
const OFFLINE_GAMES_ROOT = join(ROOT, 'assets', 'offline') + sep;
const VOLUME_TAG_ID = '__ulaVolumeTag';

function injectVolumeTag(html, tag) {
    if (html.includes(VOLUME_TAG_ID)) return html;

    const head = /<head(?:\s[^>]*)?>/i.exec(html);
    if (head) {
        const at = head.index + head[0].length;
        return html.slice(0, at) + tag + html.slice(at);
    }

    const doctype = /<!doctype[^>]*>/i.exec(html);
    if (doctype) {
        const at = doctype.index + doctype[0].length;
        return html.slice(0, at) + tag + html.slice(at);
    }

    // Sense cap ancoratge fiable, val més deixar el joc intacte que
    // trencar-lo: es continua sense control de volum.
    return html;
}

/**
 * Converteix l'URL en un camí dins del projecte, o null si tries d'escapar.
 *
 * Sense aquesta comprovació, `GET /../../Windows/System32/config` o un
 * `%2e%2e%2f` equivalent sortirien del directori del projecte. `normalize`
 * deixa els `..` al camí i `startsWith` els detecta un cop resolts.
 */
function safePath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
    } catch {
        return null; // percentatges mal formats
    }

    // Es treu la barra inicial: resolve() la tractaria com a arrel.
    const candidate = normalize(decoded).replace(/^([/\\])+/, '');
    const full = resolve(ROOT, candidate);

    if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
    return full;
}

function send(response, status, body, headers = {}) {
    response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...APP_SECURITY_HEADERS,
        ...headers
    });
    response.end(body);
}

/**
 * Troba el fitxer que s'ha demanat.
 *
 * `index.html` s'implica quan es demana un directori. A més, alguns
 * sistemes de fitxers no distingeixen majuscules de minúscules i altres
 * sí que hi ha index.html i index.htm alhora; es prioritza el .html.
 */
function resolveFile(fullPath) {
    if (existsSync(fullPath) && statSync(fullPath).isFile()) return fullPath;

    const asIndex = join(fullPath, 'index.html');
    if (existsSync(asIndex) && statSync(asIndex).isFile()) return asIndex;

    return null;
}

/**
 * Crea el servidor. No el fa escoltar encara: retorna l'`http.Server`
 * perquè el qui el crea decideixi quan i on escolta.
 */
export function createStaticServer() {
    return createServer((request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            send(response, 405, 'Mètode no permès', { Allow: 'GET, HEAD' });
            return;
        }

        const full = safePath(request.url ?? '/');
        if (full === null) {
            send(response, 403, '403');
            return;
        }

        const file = resolveFile(full);

        if (file === null) {
            // Ruta inexistent: es serveix offline.html amb codització 404,
            // que és el que han de veure els enllaços de joc trencats.
            const offline = join(ROOT, 'offline.html');
            if (existsSync(offline)) {
                response.writeHead(404, {
                    'Content-Type': MIME['.html'],
                    'Cache-Control': 'no-cache',
                    ...FRAMABLE_SECURITY_HEADERS
                });
                if (request.method === 'HEAD') {
                    response.end();
                    return;
                }
                createReadStream(offline).pipe(response);
                return;
            }
            send(response, 404, '404');
            return;
        }

        const type = mimeOf(file);
        if (type === null) {
            send(response, 415, 'Tipus de fitxer no servit');
            return;
        }

        const { size } = statSync(file);

        // Els jocs porten el pedaç de volum; la resta de fitxers van tal
        // com són i es poden transmetre en streaming.
        const isHtmlGame = type === MIME['.html'] && file.startsWith(GAMES_ROOT);
        const isOfflineGame = type === MIME['.html'] && file.startsWith(OFFLINE_GAMES_ROOT);

        if (isHtmlGame || isOfflineGame) {
            // Els offline no es llegeixen sencers per pedaçar-los: es
            // transmeten tal qual.
            const body = isHtmlGame
                ? Buffer.from(
                      injectVolumeTag(
                          readFileSync(file, 'utf8'),
                          `<script src="${new URL(
                              '/assets/js/game-volume.js',
                              `http://${request.headers.host || `127.0.0.1:${DEFAULT_PORT}`}`
                          ).href}" id="${VOLUME_TAG_ID}"></scr` + 'ipt>'
                      ),
                      'utf8'
                  )
                : null;

            response.writeHead(200, {
                'Content-Type': type,
                'Content-Length': body ? body.length : size,
                'Cache-Control': 'no-cache',
                ...GAME_SECURITY_HEADERS
            });

            if (request.method === 'HEAD') {
                response.end();
                return;
            }

            if (body) {
                response.end(body);
            } else {
                createReadStream(file).pipe(response);
            }
            return;
        }

        response.writeHead(200, {
            'Content-Type': type,
            'Content-Length': size,
            // L'aplicació es desa durant la sessió, però els fitxers es
            // poden tornar a baixar si l'usuari neteja la memòria cau.
            'Cache-Control': 'no-cache',
            ...securityHeadersFor(file)
        });

        if (request.method === 'HEAD') {
            response.end();
            return;
        }

        createReadStream(file).pipe(response);
    });
}

/**
 * Engega el servidor i resol quan ja escolta.
 *
 * Aquesta promesa és el que Electron ha d'esperar abans de crear la
 * finestra: si es crea abans, la finestra carrega index.html abans que
 * hi hagi res escoltant i es veu un error de connexió que no té res a
 * veure amb la pàgina.
 *
 * @param {{port?: number, host?: string, quiet?: boolean}} [options]
 * @returns {Promise<{server: import('node:http').Server, port: number, url: string, close: () => Promise<void>}>}
 */
export function startServer(options = {}) {
    const { port = DEFAULT_PORT, host = '127.0.0.1', quiet = false } = options;

    return new Promise((resolvePromise, reject) => {
        const server = createStaticServer();

        const onError = (err) => {
            server.removeListener('listening', onListening);
            if (err.code === 'EADDRINUSE') {
                reject(
                    new Error(
                        `El port ${port} ja és ocupat. Tanca el programa que l'utilitza ` +
                            'o engega el servidor amb un altre port.'
                    )
                );
            } else {
                reject(err);
            }
        };

        const onListening = () => {
            server.removeListener('error', onError);

            const actual = server.address();
            const boundPort = typeof actual === 'object' && actual ? actual.port : port;
            const url = `http://${host}:${boundPort}`;

            const close = () =>
                new Promise((done) => {
                    server.closeAllConnections?.();
                    server.close(() => done());
                });

            if (!quiet) {
                console.log(`[ula] servidor a ${url}`);
                console.log('[ula] Ctrl+C per aturar-lo');
            }

            resolvePromise({ server, port: boundPort, url, close });
        };

        server.once('error', onError);
        server.once('listening', onListening);

        // port 0 deixa que el sistema operatiu trii un port lliure, cosa
        // que evita que dues còpies del servidor es barallin pel 3000. El
        // port real es llegeix de server.address() dins de onListening.
        server.listen(port, host);
    });
}

// Engegat directe: `node server.js` o `node server.js 8080`
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    const asked = Number(process.argv[2]);
    const port = Number.isInteger(asked) && asked > 0 ? asked : DEFAULT_PORT;

    startServer({ port }).catch((err) => {
        console.error(`[ula] no s'ha pogut engegar el servidor: ${err.message}`);
        process.exitCode = 1;
    });
}