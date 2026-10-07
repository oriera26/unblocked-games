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
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
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
                    'Cache-Control': 'no-cache'
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

        response.writeHead(200, {
            'Content-Type': type,
            'Content-Length': size,
            // L'aplicació es desa durant la sessió, però els fitxers es
            // poden tornar a baixar si l'usuari neteja la memòria cau.
            'Cache-Control': 'no-cache',
            // Un joc carregat dins d'un iframe hauria de poder dibuixar
            // i llegir del mateix origen que la resta de l'app.
            'X-Content-Type-Options': 'nosniff'
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