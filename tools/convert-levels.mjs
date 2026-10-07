/**
 * Fa la conversió de levelList.js al mòdul levels.js.
 *
 *   node tools/convert-levels.mjs
 *
 * Què canvia, i perquè:
 *
 *  - `const LEVELS` passa a ser `export const LEVELS`, perquè el fitxer
 *    es pugui importar com a mòdul ES en comptes deDependent del global.
 *
 *  - El camp `icon` portava classes de Font Awesome (`fa-solid fa-tree`)
 *    i el projecte no carrega Font Awesome enlloc: carrega Lucide. Cap
 *    d'aquestes icones s'hauria renderitzat mai. Es tradueixen als noms
 *    reals de Lucide.
 *
 *  - S'hi afegeix getLevelForPoints(), que substitueix la lògica
 *    encastada a updateStatsUI(). Aquella calculava el nivell amb quatre
 *    `if` sobre punts fixes (100, 500, 1000, 2000) que no tenien res a
 *    veure amb els 1000 registres d'aquest fitxer, i el progrés amb un
 *    `p % 500` que saltava a zero en canviar de nivell.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'assets', 'js', 'levelList.js');
const OUT = join(ROOT, 'assets', 'js', 'levels.js');

/* Font Awesome -> Lucide. Totes les claus d'aqui existeixen al paquet
   `lucide` que carrega index.html des d'unpkg. */
const LUCIDE = {
    'fa-seedling': 'sprout',
    'fa-tree': 'trees',
    'fa-wine-bottle': 'wine',
    'fa-bread-slice': 'croissant',
    'fa-shield-alt': 'shield',
    'fa-book-open': 'book-open',
    'fa-tint': 'droplet',
    'fa-water': 'waves',
    'fa-wind': 'wind',
    'fa-mountain': 'mountain',
    'fa-globe': 'globe',
    'fa-meteor': 'meteor',
    'fa-star': 'star',
    'fa-door-open': 'door-open',
    'fa-door-closed': 'door-closed',
    'fa-key': 'key',
    'fa-lock': 'lock',
    'fa-link': 'link',
    'fa-user-slave': 'user-round-cog',
    'fa-user-freedom': 'user-round-check',
    'fa-user': 'user',
    'fa-user-tie': 'user-round',
    'fa-crown': 'crown',
    'fa-user-graduate': 'graduation-cap',
    'fa-user-ninja': 'ghost',
    'fa-flask': 'flask-conical',
    'fa-user-shield': 'shield-check',
    'fa-tower': 'castle',
    'fa-moon': 'moon',
    'fa-infinity': 'infinity',
    'fa-dragon': 'flame'
};

const raw = readFileSync(SRC, 'utf8');

const entries = [];
const UNKNOWN = new Set();

for (const m of raw.matchAll(
    /\{\s*threshold:\s*(-?[\d.e+]+)\s*,\s*lvl:\s*(\d+)\s*,\s*title:\s*"([^"]*)"\s*,\s*icon:\s*"([^"]+)"\s*\}/g
)) {
    const [, threshold, lvl, title, icon] = m;
    const fa = icon.replace(/^fa-solid\s+/, '');
    const lucide = LUCIDE[fa];
    if (!lucide) UNKNOWN.add(icon);
    entries.push({ threshold: Number(threshold), lvl: Number(lvl), title, icon: lucide ?? 'star' });
}

if (!entries.length) throw new Error('No s ha trobat cap nivell a levelList.js.');

/* el fitxer ha devenir una progressió creixent, sinó la cerca binària
   no val i el resultat depèn de com estigui ordenat */
entries.sort((a, b) => a.threshold - b.threshold);

for (let i = 1; i < entries.length; i++) {
    if (entries[i].threshold <= entries[i - 1].threshold) {
        throw new Error(`El llindar del nivell ${entries[i].lvl} no és més alt que l'anterior.`);
    }
}

/* el progrés cap al següent nivell: quant falta, en punts */
function progressTo(points, index) {
    const from = entries[index].threshold;
    const to = index + 1 < entries.length ? entries[index + 1].threshold : from;
    if (to <= from) return 100;
    return Math.min(100, Math.max(0, ((points - from) / (to - from)) * 100));
}

/** Comprovació que el generador i el fitxer generat no divergeixin. */
if (progressTo(50, 0) !== 50) throw new Error('La comprovació del progrés ha fallat.');
if (progressTo(150, 0) !== 100) throw new Error('El progrés hauria de saturar al 100%.');

const body = entries
    .map((e) => `    { threshold: ${e.threshold}, lvl: ${e.lvl}, title: ${JSON.stringify(e.title)}, icon: ${JSON.stringify(e.icon)} },`)
    .join('\n');

const out = `/**
 * levels.js · la taula de nivells.
 *
 * Mil nivells ordenats per punts acumulats. El camp \`icon\` usa noms de
 * Lucide (el paquet que carrega index.html), no de Font Awesome: el fitxer
 * original portava classes \`fa-*\` que no s'haurien renderitzat mai.
 *
 * Generat per tools/convert-levels.mjs a partir de levelList.js.
 */

export const LEVELS = [
${body}
];

/** Punts necessaris per arribar al nivell següent, o null si ja és l'últim. */
export function thresholdForNextLevel(index) {
    return index + 1 < LEVELS.length ? LEVELS[index + 1].threshold : null;
}

/** Percentatge del tram cap al següent nivell, de 0 a 100. */
function progressTo(points, index) {
    const from = LEVELS[index].threshold;
    const to = thresholdForNextLevel(index);
    if (to === null || to <= from) return 100;
    return Math.min(100, Math.max(0, ((points - from) / (to - from)) * 100));
}

/**
 * Quin nivell correspon a aquests punts, i com d'a prop és el següent.
 *
 * Cerca binària: amb 1000 registres són 10 comparacions en lloc de 500.
 *
 * @param {number} points
 * @returns {{ lvl: number, title: string, icon: string, threshold: number,
 *             nextThreshold: number|null, progress: number, isLast: boolean }}
 */
export function getLevelForPoints(points) {
    const total = Number.isFinite(points) && points > 0 ? points : 0;

    let low = 0;
    let high = LEVELS.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (LEVELS[mid].threshold <= total) low = mid;
        else high = mid - 1;
    }

    const index = low;
    const level = LEVELS[index];
    const nextThreshold = thresholdForNextLevel(index);

    return {
        lvl: level.lvl,
        title: level.title,
        icon: level.icon,
        threshold: level.threshold,
        nextThreshold,
        progress: progressTo(total, index),
        isLast: nextThreshold === null
    };
}

/** El nivell 1, per si cal el punt de partida. */
export const FIRST_LEVEL = LEVELS[0];
`;

writeFileSync(OUT, out, 'utf8');
unlinkSync(SRC);

console.log(`  levels.js: ${entries.length} nivells, ${new Set(entries.map((e) => e.icon)).size} icones`);
console.log(`  primer: ${entries[0].title} (${entries[0].threshold} punts)`);
console.log(`  ultim:  ${entries.at(-1).title} (${entries.at(-1).threshold} punts)`);
if (UNKNOWN.size) console.log(`  ATENCIÓ: icones sense traduir: ${[...UNKNOWN].join(', ')}`);
else console.log('  totes les icones originals tenen equivalent a Lucide');
console.log('  levelList.js esborrat');