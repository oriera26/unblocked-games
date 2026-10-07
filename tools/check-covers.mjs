/**
 * Fase 1.3 · Comprovació que res queda penjant.
 *
 * Després de baixar les portades i de podar el llistat hi ha quatre coses
 * que poden fallar sense que es vegin a simple vista:
 *
 *   1. una entrada de gameList.js sense portada, o amb portada trencada
 *   2. dues entrades que comparteixen portada (o una portada que no és de
 *      ningú, ocupant espai al repo)
 *   3. un HTML de joc que no existeix
 *   4. una ruta local d'index.html, del CSS, del manifest o del service
 *      worker que apunta a un fitxer que no hi és
 *
 * Sortida 0 si tot és correcte, 1 si hi ha algun problema, de manera que es
 * pugui encadenar en un script de CI.
 *
 *   node tools/check-covers.mjs
 *   node tools/check-covers.mjs --quiet
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';

import { readGameList } from './lib/gameList.mjs';
import { GAMES_DIR, IMAGES_DIR, ROOT, gameExists, gameFileName } from './lib/games.mjs';
import { MIN_BYTES, contentHash, sniffImage } from './lib/covers.mjs';
import { nowISO } from './lib/report.mjs';

const QUIET = process.argv.includes('--quiet');
const problems = [];
const notes = [];

const fail = (msg) => problems.push(msg);
const say = (line) => {
  if (!QUIET) console.log(line);
};

/* ------------------------------------------------------------------ *
 * 1-3 · gameList.js
 * ------------------------------------------------------------------ */

const { entries, decl, footer } = readGameList();

/**
 * El fitxer ha de ser parsejable pel navegador: la línia de declaració ha
 * d'obrir l'array i l'última ha de tancar-lo. Si no, `readGameList` igual
 * llegiria les entrades (llegeix línia a línia) i tots els altres controls
 * passarien mentre el catàleg no carrega a cap navegador.
 */
{
  const open = String(decl ?? '').trim();
  const close = [...footer].reverse().map((l) => l.trim()).find((l) => l) ?? '';
  if (!/=\s*\[$/.test(open)) {
    fail(`gameList.js: la declaració no obre l'array: ${open}`);
  }
  if (!/^\];?$/.test(close)) {
    fail(`gameList.js: l'última línia no tanca l'array: ${close}`);
  }
}
const usedImages = new Map();
/** sha1 -> [nom del joc]: dues portades idèntiques amb noms diferents. */
const byHash = new Map();

for (const entry of entries) {
  if (!gameExists(entry.url)) {
    fail(`«${entry.name}» apunta a ${entry.url} però no hi ha ${gameFileName(entry.url)}`);
  }

  const image = entry.image ?? '';
  if (!image) {
    fail(`«${entry.name}» no té portada`);
    continue;
  }
  if (!image.startsWith('assets/images/')) {
    fail(`«${entry.name}» té una portada fora d'assets/images/: ${image}`);
    continue;
  }

  const file = image.slice('assets/images/'.length);
  /**
   * `shared-*.webp` és la convenció per a una portada compartida: la icona
   * oficial de Minecraft que fan servir totes les versions. Tot lo demés
   * ha de ser d'un sol joc, que és com es detecta una portada copiada per
   * error d'un altre joc.
   */
  const shared = /^shared-/i.test(file);
  if (usedImages.has(file) && !shared) {
    fail(`«${entry.name}» i «${usedImages.get(file)}» comparteixen la portada ${file}`);
  }
  usedImages.set(file, entry.name);

  const full = join(ROOT, image);
  if (!existsSync(full)) {
    fail(`«${entry.name}»: no existeix ${image}`);
    continue;
  }

  const buf = readFileSync(full);
  const info = sniffImage(buf);
  if (!info) {
    fail(`«${entry.name}»: ${file} no és una imatge reconeixible (${buf.length} bytes)`);
    continue;
  }
  const side = info.width && info.height ? Math.min(info.width, info.height) : null;
  if (side !== null && side < 64) fail(`«${entry.name}»: ${file} és molt petita (${info.width}x${info.height})`);
  // En un SVG la mida no diu res: un vector de 800 bytes pot ocupar tota la
  // pantalla i un PNG de 300 pot ser un pixel. Els pesos minims son per a
  // raster (que es el que sol trencar-se amb una URL de mida real zero).
  if (info.ext !== 'svg' && buf.length < MIN_BYTES) {
    fail(`«${entry.name}»: ${file} pesa només ${buf.length} bytes`);
  }

  const hash = contentHash(buf);
  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push({ name: entry.name, file });
}

/* ------------------------------------------------------------------ *
 * 2b · Imatges que no són de ningú
 * ------------------------------------------------------------------ */

const onDisk = existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR) : [];
for (const name of onDisk) {
  if (usedImages.has(name)) continue;
  if (/^(?:orb-|icon-|favicon|apple-touch|logo-|brand)/i.test(name)) continue;
  notes.push(`assets/images/${name} no el referencia cap joc del llistat`);
}

/* ------------------------------------------------------------------ *
 * 2c · El mateix dibuix per a jocs diferents
 *
 * Cada joc guarda la seva portada amb el seu propi nom, així que dues
 * portades iguals no es veuen en el control anterior: passa quan varis
 * jocs acaben baixant la imatge per defecte d'un portal o la imatge
 * genèrica d'una carpeta d'un repositori compartit.
 *
 * L'excepció és quan els jocs apunten al MATEIX fitxer: llavors la
 * compartició es veu a gameList.js i és a propòsit (la icona de Minecraft
 * que fan servir totes les versions). El que no es veu és el mateix dibuix
 * amb dos noms de fitxer diferents.
 * ------------------------------------------------------------------ */

for (const [hash, list] of byHash) {
  if (list.length < 2) continue;
  const files = new Set(list.map((x) => x.file));
  if (files.size < 2) continue;
  const names = list.map((x) => x.name);
  fail(`imatge idèntica per a ${names.length} jocs (${hash}): ${names.slice(0, 6).join(', ')}${names.length > 6 ? `, … +${names.length - 6}` : ''}`);
}

/* ------------------------------------------------------------------ *
 * 4 · Rutes locals d'index.html, CSS, manifest i service worker
 * ------------------------------------------------------------------ */

const REFS = [
  ...['index.html', 'offline.html', 'manifest.json', 'service-worker.js', 'sw.js']
    .filter((f) => existsSync(join(ROOT, f)))
    .map((f) => ({ file: f, text: readFileSync(join(ROOT, f), 'utf8') })),
  ...walk(join(ROOT, 'assets', 'css'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ file: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') })),
];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Qualsevol ruta local que aparegui en un atribut o una regla de CSS. */
const LOCAL_RE = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi;

/**
 * En un `.js` no hi ha atributs, sinó cadenes dins d'un llistat de
 * cache (`'/assets/icons/icon.png'`). Només es miren les que acaben en
 * una extensió coneguda: `new URL(request.url)` o `'/jocs/' + id` no
 * son fitxers del repo i no es poden comprovar.
 */
const JS_REF =
  /['"]((?:\/|\.\.?\/)[^'"\s]*\.(?:html?|css|js|mjs|json|webmanifest|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|txt|xml|map))(?:[?#][^'"\s]*)?['"]/gi;

for (const { file, text } of REFS) {
  const pairs = file.endsWith('.js')
    ? [...text.matchAll(JS_REF)].map((m) => [file, m[1]])
    : [...text.matchAll(LOCAL_RE)].map((m) => [file, m[1] ?? m[2] ?? '']);

  for (const [, raw0] of pairs) {
    const raw = raw0.trim();
    if (!raw || raw.startsWith('#')) continue;
    if (/^(?:https?:)?\/\//i.test(raw)) continue;
    if (/^(?:data|blob|mailto|javascript|about):/i.test(raw)) continue;
    // el service worker llistar URLs amb query string
    const clean = raw.split(/[?#]/)[0];
    if (!clean) continue;

    /**
     * Una ruta relativa es resol contra el fitxer que la conté, no contra
     * l'arrel: `url('../images/orb.png')` dins de assets/css/main.css és
     * assets/images/orb.png. Resoldre-la contra l'arrel (el que es feia)
     * donava un fals positiu a tot CSS que pugi un nivell, que és exactament
     * el que s'ha de fer perquè funcioni també a GitHub Pages.
     */
    const full = clean.startsWith('/')
        ? resolve(ROOT, clean.slice(1))
        : resolve(dirname(join(ROOT, file)), clean);
    if (!existsSync(full)) fail(`${file}: ${raw} no existeix`);
  }
}

/* ------------------------------------------------------------------ *
 * Sortida
 * ------------------------------------------------------------------ */

const covers = entries.filter((e) => e.image).length;
const placeholders = entries.filter((e) => {
  const f = (e.image ?? '').slice('assets/images/'.length);
  if (!f) return false;
  try {
    const head = readFileSync(join(IMAGES_DIR, f)).subarray(0, 600).toString('utf8');
    return head.includes('data-cover="placeholder"') || (head.includes('linearGradient id="g"') && head.includes('rx="28"'));
  } catch {
    return false;
  }
}).length;

say(`Jocs al llistat        : ${entries.length}`);
say(`Amb portada            : ${covers}`);
say(`Portades sintetiques   : ${placeholders}`);
say(`Imatges a assets/images: ${onDisk.length}`);
say(`HTML de joc            : ${readdirSync(GAMES_DIR).filter((f) => /\.html?$/i.test(f)).length}`);
say('');

if (notes.length) {
  say(`Avisos (${notes.length}):`);
  for (const n of notes) say(`  - ${n}`);
  say('');
}

if (problems.length) {
  console.error(`PROBLEMES (${problems.length}) · ${nowISO()}`);
  for (const p of problems) console.error(`  x ${p}`);
  process.exitCode = 1;
} else {
  say('Tot correcte: cap portada trencada, cap ruta local penjant.');
}