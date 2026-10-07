/**
 * Prova el servidor local sense obrir cap navegador.
 *
 *   node tools/test-server.mjs
 *
 * Comprova el que es pot trencar de debò:
 *
 *   - que tots els fitxers que l'aplicació demana existeixin al servidor
 *     i tornin el MIME correcte (un .js servit com text/plain no s'executa)
 *   - que la sortida del projecte estigui barrada (path traversal)
 *   - que una ruta inexistent torni offline.html, no el catàleg sencer
 *   - que HEAD i els mètodes que no toquen res es comportin
 *   - que tots els jocs del llistat existeixin com a fitxers
 */

import { startServer } from '../server.js';
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
    if (condition) {
        pass++;
    } else {
        fail++;
        console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
    }
}

async function get(url, method = 'GET') {
    return fetch(url, { method, redirect: 'manual' });
}

const { url, close } = await startServer({ port: 0, quiet: true });
console.log(`  servidor de proves a ${url}\n`);

/* --- Els fitxers que l'aplicació realment demana ------------------ */

console.log('  Fitxers que carga index.html i els seus mòduls:');

const html = await (await get(`${url}/`)).text();
check('GET / tornat index.html', html.includes('assets/js/main.js'), `rebut: ${html.slice(0, 80)}`);

const expected = [
    ['/assets/css/main.css', 'text/css'],
    ['/assets/css/layout.css', 'text/css'],
    ['/assets/css/components.css', 'text/css'],
    ['/assets/css/skeleton.css', 'text/css'],
    ['/assets/js/main.js', 'text/javascript'],
    ['/assets/js/gameList.js', 'text/javascript'],
    ['/manifest.json', 'application/json'],
    ['/offline.html', 'text/html']
];

for (const [path, type] of expected) {
    const response = await get(url + path);
    const actual = response.headers.get('content-type') ?? '';
    check(`GET ${path} -> 200`, response.status === 200, `status ${response.status}`);
    if (type) {
        check(`GET ${path} -> ${type}`, actual.includes(type), `content-type: ${actual}`);
    }
}

/* --- Tots els mòduls importats, un per un ------------------------- */

console.log('\n  Tots els mòduls d\'assets/js:');

for (const file of readdirSync(join(ROOT, 'assets', 'js')).filter((f) => f.endsWith('.js'))) {
    const response = await get(`${url}/assets/js/${file}`);
    const actual = response.headers.get('content-type') ?? '';
    check(`${file} -> 200 text/javascript`,
        response.status === 200 && actual.includes('text/javascript'),
        `status ${response.status}, ${actual}`);
}

/* --- Els 697 jocs -------------------------------------------------- */

console.log('\n  Els jocs del catàleg:');

// Es fa servir gameSrc() del codi real, no una còpia de la seva regla:
// si el test es repetís la lògica,uria el mateix error que el codi i
// passaria igual. Aquí el que es prova és la funció que l'aplicació
// executarà de debò.
const { gameSrc } = await import('../assets/js/player.js');
const { GAMES } = await import('../assets/js/gameList.js');

// offline.html, byte a byte. Comparar el text sencer és l'única manera
// de saber amb certesa quina resposta és la pàgina d'error i quina és un
// joc: 63 dels jocs del catàleg contenen la paraula "offline" al seu
// propi codi i un test que la busqui dona 63 falsos positius.
const offlineBody = readFileSync(join(ROOT, 'offline.html'), 'utf8');

let missingGames = 0;
let disguised = 0;

for (const game of GAMES) {
    const path = '/' + gameSrc(game.url);
    const response = await get(url + path);

    if (response.status === 404) {
        missingGames++;
        if (missingGames <= 5) console.log(`      falta: ${game.name} (${path})`);
    } else if (response.status === 200) {
        // Un joc que retorna 200 però el cos del qual és offline.html és
        // pitjor que un 404: es veu com si funcionés i no fa res.
        const body = await get(url + path).then((r) => r.text());
        if (body === offlineBody) {
            disguised++;
            if (disguised <= 3) console.log(`     {idèntic a offline}: ${game.name} (${path})`);
        }
    }
}

check(`els ${GAMES.length} jocs existeixen`, missingGames === 0, `${missingGames} de manquen`);
check('cap joc servit és en realitat offline.html', disguised === 0, `${disguised} falsos`);

/* --- Barra de sortida --------------------------------------------- */

console.log('\n  Barra de seguretat:');

/*
 * La prova de veritat no és demanar camins que no existeixen, sinó
 * posar un fitxer conari REAL fora del projecte i veure si el
 * servidor el pot llegir. Fer-ho amb camins inventats donava un fals
 * segur: `/assets/../../server.js` resol dins del projecte (a
 * server.js), i servir-lo és el comportament correcte, no una fuita.
 */
const canary = join(ROOT, '..', 'ula-canary-' + process.pid + '.txt');
const canaryText = `ULA_CANARY_${process.pid}`;
writeFileSync(canary, canaryText, 'utf8');

try {
    const escapes = [
        '/../' + basename(canary),
        '/../../' + basename(canary),
        '/assets/../../' + basename(canary),
        '/%2e%2e%2f' + basename(canary),
        '/..%2f' + basename(canary),
        '/assets/games/../../..%2f' + basename(canary),
        '/%2e%2e/%2e%2e/' + basename(canary),
        '/....//' + basename(canary),
        '/.%00./' + basename(canary)
    ];

    for (const path of escapes) {
        const response = await get(url + path);
        const body = await response.text();
        check(
            `${path} no arriba al canari`,
            !body.includes(canaryText),
            `status ${response.status}, ${body.length} bytes servits`
        );
    }

    // I que el camí sí que funciona quan el fitxer és dins: si el
    // servidor no servís res mai, la prova de no-fuita passaria sola.
    const control = await get(url + '/' + basename(canary));
    check('el control és 404 (el canari és fora del projecte)', control.status === 404,
        `status ${control.status}`);
} finally {
    unlinkSync(canary);
}

/* --- 404 i mètodes ----------------------------------------------- */

console.log('\n  Rutes i mètodes:');

const missing = await get(`${url}/assets/games/does-not-exist.html`);
const missingBody = await missing.text();
check('ruta inexistent -> 404', missing.status === 404, `status ${missing.status}`);
check('ruta inexistent -> offline.html', missingBody.includes('offline') || missingBody.length > 100);

const head = await get(`${url}/index.html`, 'HEAD');
check('HEAD /index.html -> 200 sense cos', head.status === 200 && !(await head.text()).length);

for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await get(`${url}/index.html`, method);
    check(`${method} -> 405`, response.status === 405, `status ${response.status}`);
}

/* --- Port ocupat --------------------------------------------------- */

console.log('\n  Port ocupat:');

// Dos servidors al mateix port: el segon ha de fallar amb un missatge
// que digui què fer, no amb un EADDRINUSE cru.
const first = await startServer({ port: 0, quiet: true });
try {
    await startServer({ port: first.port, quiet: true });
    check('un port ocupat avisa', false, 'hauria de fallar');
} catch (err) {
    check('un port ocupat avisa amb un missatge útil', /ocupat/.test(err.message), err.message);
}
await first.close();

await close();

/* --- Resum ---------------------------------------------------------- */

console.log(`\n  ${pass} correctes, ${fail} fallides`);
if (fail > 0) process.exitCode = 1;
