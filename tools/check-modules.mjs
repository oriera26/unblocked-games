/**
 * Comprova que el graf de mòduls d'assets/js està ben connectat.
 *
 *   node tools/check-modules.mjs
 *
 * Un `import` mal escrit no dona cap error quan el fitxer es llegeix:
 * només en peta quan el navegador el resol, i aleshores la pàgina queda
 * en blanc sense cap missatge útil. Aquí es comprova, sense navegador:
 *
 *   - que cada import apunti a un fitxer que existeixi
 *   - que cada importació anomenada existeixi realment al fitxer destí
 *   - que cap mòdul importi alguna cosa que no exporti
 *   - que index.html carregui un únic punt d'entrada, i que existeixi
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const JS_DIR = join(ROOT, 'assets', 'js');
const HTML = join(ROOT, 'index.html');

let problems = 0;
const fail = (msg) => {
    console.log(`  ✗ ${msg}`);
    problems++;
};

/** Els `export` que ofereix un fitxer, en les seves tres formes habituals. */
function exportsOf(source) {
    const found = new Set();
    const declare = (name) => found.add(name);

    for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        declare(m[1]);
    }
    for (const m of source.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
        declare(m[1]);
    }
    for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        // Pot ser { a, b as c } i pot ocupar varies línies.
        for (const part of m[1].split(',')) {
            const alias = part.trim().split(/\s+as\s+/);
            const name = (alias[1] ?? alias[0]).trim();
            if (name) declare(name);
        }
    }
    if (/^export\s+default\b/m.test(source)) declare('default');

    return found;
}

/** Els `import ... from './x.js'` d'un fitxer. */
function importsOf(source) {
    const list = [];
    const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of source.matchAll(re)) {
        const [, clause, specifier] = m;

        const braces = /\{([\s\S]*)\}/.exec(clause);
        const names = braces
            ? braces[1]
                  .split(',')
                  .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
                  .filter(Boolean)
            : [];

        const defaultName = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s+as\s+/, '').trim();
        if (defaultName && !defaultName.startsWith('*')) names.push('default');

        list.push({ specifier, names });
    }
    return list;
}

const files = readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();
const sources = new Map(files.map((f) => [f, readFileSync(join(JS_DIR, f), 'utf8')]));

console.log(`  ${files.length} mòduls a assets/js\n`);

for (const [file, source] of sources) {
    const imports = importsOf(source);

    for (const { specifier, names } of imports) {
        if (!specifier.startsWith('.')) continue; // paquet extern

        const target = resolve(dirname(join(JS_DIR, file)), specifier);
        const targetName = relative(JS_DIR, target).replace(/\\/g, '/');

        if (!existsSync(target)) {
            fail(`${file} importa ${specifier}, que no existeix`);
            continue;
        }

        const targetSource = sources.get(targetName) ?? readFileSync(target, 'utf8');
        const available = exportsOf(targetSource);

        for (const name of names) {
            if (!available.has(name)) {
                fail(`${file} importa { ${name} } de ${targetName}, però ${targetName} no l'exporta`);
            }
        }
    }
}

/* --- El punt d'entrada ------------------------------------------- */

const html = readFileSync(HTML, 'utf8');
const entries = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map((m) => m[1]);

if (entries.length === 0) fail('index.html no carrega cap mòdul');
if (entries.length > 1) fail(`index.html carrega ${entries.length} mòduls com a entrada; hauria de ser un`);

for (const entry of entries) {
    if (!existsSync(join(ROOT, entry))) fail(`index.html apunta a ${entry}, que no existeix`);
}

/* --- Que res deixi exposat a window ------------------------------ */

for (const [file, source] of sources) {
    const leaked = [...source.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]);
    if (leaked.length) {
        for (const name of leaked) fail(`${file} assigna a window.${name}; hauria de ser un mòdul`);
    }
}

/* --- Resum --------------------------------------------------------- */

const total = [...sources.values()].reduce((n, s) => n + (s.match(/\n/g) ?? []).length + 1, 0);
console.log(`  ${total} línies de JS en ${files.length} mòduls`);
console.log(`  entrada: ${entries[0] ?? '(cap)'}`);

if (problems === 0) {
    console.log('\n  Graf de mòduls correcte.');
} else {
    console.log(`\n  ${problems} problemes.`);
    process.exitCode = 1;
}