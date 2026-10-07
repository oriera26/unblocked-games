/**
 * Comprovació que les referències de fitxer casen EXACTAMENT amb el nom
 * que tenen al repo.
 *
 * A Windows el sistema de fitxers és insensible a majúscules, així que
 * `clhinohomo.html` troba `clHiNoHomo.html` i localment tot sembla
 * correcte; a Linux (CI, Pages) no, i allà la comprovació falla. El que
 * diu `git ls-files` és la referència: és el nom que realment es desa.
 *
 * Comprova dues coses:
 *
 *   1. la url i la portada de cada entrada del catàleg
 *   2. els href/src/url() literals d'index.html, offline.html,
 *      manifest.json, service-worker.js i els CSS
 *
 * Sortida 0 si tot casen, 1 si n'hi ha alguna de discrepant (les que no
 * apunten a cap fitxer, amb cap combinació de majúscules, no són cosa
 * d'aquesta eina: les detecta check-covers).
 *
 *   node tools/check-case.mjs
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGameList } from './lib/gameList.mjs';
import { gameFileName } from './lib/games.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Els noms tal com git els guarda: no poden haver-hi dues versions. */
const tracked = new Set(
    spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
        .stdout.split(/\r?\n/)
        .filter(Boolean)
);

const problems = [];

const ASSET_RE =
    /\.(html?|css|mjs?|json|webp|png|jpe?g|svg|gif|ico|woff2?|ttf|mp3|mp4|wasm)$/i;

/**
 * Comprova una ruta relativa a l'arrel.
 *
 * @param {string} ref     referència tal com apareix al fitxer
 * @param {string} origin  d'on surt, per poder-ho arreglar
 * @param {string} kind    categoria per al resum
 */
function check(ref, origin, kind) {
    const clean = ref
        .replace(/^\.\//, '')
        .replace(/^\//, '')
        .split(/[?#]/)[0];

    if (!clean || /^(https?:|data:|mailto:|#|\{|\$|\w+:)/.test(clean)) return;
    if (!ASSET_RE.test(clean)) return;

    const full = posix.normalize(clean);

    if (tracked.has(full)) return;

    const lower = full.toLowerCase();
    const twin = [...tracked].find((t) => t.toLowerCase() === lower);

    if (twin) problems.push({ kind, ref: full, real: twin, origin });
}

/* --- 1 · catàleg: url i portada de cada joc -------------------------- */

for (const game of readGameList().entries) {
    check(posix.join('assets/games', gameFileName(game.url)), `gameList · ${game.name} (url)`, 'joc');
    check(game.image, `gameList · ${game.name} (image)`, 'portada');
}

/* --- 2 · referències estàtiques de pàgines i CSS --------------------- */

const FILES = [
    'index.html',
    'offline.html',
    'manifest.json',
    'service-worker.js',
    'assets/css/main.css',
    'assets/css/layout.css',
    'assets/css/components.css',
    'assets/css/skeleton.css'
];

for (const file of FILES) {
    let text;
    try {
        text = readFileSync(join(ROOT, file), 'utf8');
    } catch {
        continue;
    }

    const refs = [
        ...[...text.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((m) => m[1]),
        ...[...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]),
        ...[...text.matchAll(/['"`](\/?assets\/[^'"`\s)]+)['"`]/g)].map((m) => m[1])
    ];

    for (const ref of refs) check(ref, file, 'estàtica');
}

/* --- resultat -------------------------------------------------------- */

if (!problems.length) {
    console.log('Majúscules: totes les referències casen amb el nom versionat.');
    process.exit(0);
}

console.log(`${problems.length} referències no casen amb el nom que té git:\n`);

for (const p of problems) {
    console.log(`  [${p.kind}] ${p.ref}`);
    console.log(`      git diu: ${p.real}`);
    console.log(`      referida per: ${p.origin}`);
    console.log('');
}

process.exit(1);
