/**
 * Fase 2 · Reparteix l'<style> inline d'index.html als 4 fitxers CSS.
 *
 * L'objectiu es que la suma dels 4 fitxers equivalents a l'CSS que
 * hi havia abans: cap regla es perd i cap regla es duplica.
 *
 *   node tools/split-css.mjs          informa de com quedaria
 *   node tools/split-css.mjs --apply  escriu els fitxers i neteja l'HTML
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = join(import.meta.dirname, '..');
const HTML = join(ROOT, 'index.html');
const CSS_DIR = join(ROOT, 'assets', 'css');

/**
 * on va cada seccio de l'CSS inline, pel titol exacte de l'encapcalament.
 *
 * Eixir títol -> fitxer, en lloc d'endevinar: aixi no depenem de
 * regex fràgils (els titols porten em dash, accents, etc).
 */
const DEST = {
  'NAV': 'layout.css',
  'CATEGORIES': 'layout.css',
  'LAYOUT': 'layout.css',
  'SEARCH': 'components.css',
  'SETTINGS MENU': 'components.css',
  'CARDS — SQUIRCLE': 'components.css',
  'ESTADÍSTIQUES': 'components.css',
  'MODAL': 'components.css',
};

/** ordre de carrega: el layout ha de venir abans que els components */
const LOAD_ORDER = ['main.css', 'layout.css', 'components.css', 'skeleton.css'];

const BANNER = (file, desc) =>
  `/* ============================================================\n` +
  `   ${file} · ${desc}\n` +
  `   Carregat des d'index.html, abans de l'JS.\n` +
  `   ============================================================ */\n`;

/* ------------------------------------------------------------------ */

const html = readFileSync(HTML, 'utf8');
let match = /[ \t]*<style>\r?\n([\s\S]*?)\r?\n[ \t]*<\/style>/.exec(html);

if (!match) {
  throw new Error(
    "index.html ja no te cap <style> inline (l'script ja s'ha executat abans).\n" +
      "Torna a la versio anterior amb:  git checkout HEAD -- index.html"
  );
}

const css = match[1].replace(/\r\n/g, '\n');
const lines = css.split('\n');

// Encapcalaments de seccio. Tenen forma:
//     /* ============================================
//        TITOL
//        (subtitul, opcional)
//        ============================================ */
// El tancament `*/` pot ser a la linia del titol o mes avall, i hi ha
// seccions amb subtitul, aixi que cal trobar on acaba el comentari en lloc
// de suposar que sempre son 2 o 3 linies.
const heads = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^[ \t]*\/\* =+[ \t]*$/.test(lines[i])) continue;

  let end = i;
  while (end < lines.length && !lines[end].includes('*/')) end++;
  if (end >= lines.length) throw new Error(`Capcalera sense tancar a la linia ${i + 1}`);

  const inner = lines.slice(i + 1, end).map((l) => l.trim());
  const title = (inner[0] ?? '').replace(/\*\//g, '').trim();
  const note = inner.slice(1).filter(Boolean).join(' ').replace(/\*\//g, '').trim();

  heads.push({ from: i, at: end + 1, title, note });
}
if (!heads.length) throw new Error("No s'ha trobat cap encapcalament de seccio al CSS.");

// Hi ha mes d'un @supports (el del squircle, dins de CARDS, i el fallback
// final sense backdrop-filter). Ens interessa el que REDEFINEIX els tokens
// --glass-*: l'identifiquem pel contingut del seu bloc, no per la posicio,
// perquè altrament el squircle es Tallaria pel mig i la resta de CARDS
// aniria a main.css en comptes de components.css.
function findGlassFallback() {
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*@supports\b/.test(lines[i])) continue;
    // fins on arriba el bloc, comptant claus
    let depth = 0;
    let body = '';
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) ?? []).length;
      body += lines[j] + '\n';
      depth -= (lines[j].match(/\}/g) ?? []).length;
      if (depth <= 0 && j > i) break;
    }
    if (/--glass-bg:/.test(body)) return i;
  }
  return -1;
}

const supportsAt = findGlassFallback();
if (supportsAt >= 0) {
  // capcalera sintetica: no ocupa cap linia de capcalera
  heads.push({
    from: supportsAt,
    at: supportsAt,
    title: '@supports (fallback sense backdrop-filter)',
    note: 'redefineix els tokens --glass-*',
  });
  heads.sort((a, b) => a.at - b.at);
}

// ORB i MODE RENDIMENT son globals, no components: tot a main.css
const MAIN_ONLY = new Set(['MODE RENDIMENT', '⚡ OPT #2 + #11: ORB amb PNG pre-desenfocat i CSS keyframes']);

const buckets = new Map();
for (const f of new Set([...Object.values(DEST), 'main.css'])) buckets.set(f, []);

/** l'CSS inline venia tota sangrada 8 espais per dins del <style> */
function dedent(body) {
  const indents = body
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => (/^[ \t]*/.exec(l)[0]).length);
  const min = indents.length ? Math.min(...indents) : 0;
  if (!min) return body;
  return body
    .split('\n')
    .map((l) => l.slice(min))
    .join('\n');
}

// abans del primer encapcalament: tokens + reset (tot a main.css)
const firstHead = heads[0]?.from ?? lines.length;
const head = dedent(lines.slice(0, firstHead).join('\n').replace(/^\n+|\s+$/g, ''));
if (head) buckets.get('main.css').push(`/* --- tokens i reset --- */\n${head}`);

const unmapped = [];
for (let i = 0; i < heads.length; i++) {
  const { at, title, note } = heads[i];
  // la seccio acaba just abans de la capçalera seguent
  const to = heads[i + 1]?.from ?? lines.length;
  const body = dedent(lines.slice(at, to).join('\n').replace(/^\n+|\s+$/g, ''));
  if (!body) continue;

  const marker = note
    ? `/* --- ${title} · ${note} --- */`
    : `/* --- ${title} --- */`;

  const target = MAIN_ONLY.has(title) ? 'main.css' : DEST[title];
  if (!target) {
    unmapped.push(title);
    buckets.get('main.css').push(`${marker}\n${body}`);
    continue;
  }
  buckets.get(target).push(`${marker}\n${body}`);
}
if (unmapped.length) console.log(`  (sense destí a DEST, enviades a main.css: ${unmapped.join(', ')})`);

/* ------------------------------------------------------------------ */

const DESC = {
  'main.css': 'tokens globals, reset, orbe i mode rendiment',
  'layout.css': 'nav, categories, contenidors i grid',
  'components.css': 'botons, targetes, estadístiques i modals',
  'skeleton.css': 'estats de càrrega (script separat)',
};

const written = [];
for (const file of LOAD_ORDER) {
  const parts = buckets.get(file) ?? [];
  if (!parts.length && file === 'skeleton.css') continue; // el faig a mà
  const body = parts.join('\n\n');
  const text = `${BANNER(file, DESC[file])}\n${body}\n`;
  written.push([file, text]);
  console.log(`  ${file.padEnd(16)} ${body.split('\n').length} línies`);
}

/* balance de claus, per comparar amb l'original */
const bal = (t) => [(t.match(/\{/g) ?? []).length, (t.match(/\}/g) ?? []).length];
const [ob, cb] = bal(css);
const [oa, ca] = written.reduce(
  (acc, [, t]) => [acc[0] + bal(t)[0], acc[1] + bal(t)[1]],
  [0, 0]
);

for (const [file, text] of written) {
  const [o, c] = bal(text);
  if (o !== c) console.log(`  ⚠ ${file}: ${o} '{' vs ${c} '}'`);
}

console.log(
  `\n  Claus: abans ${ob}/${cb} | despres ${oa}/${ca} | ` +
    (ob === oa && cb === ca ? 'OK, res perdut' : '⚠ NO COINCIDEIXEN')
);

if (!APPLY) {
  console.log('\nMode informe. Torna a executar amb --apply per escriure els fitxers.');
  process.exit(0);
}

for (const [file, text] of written) {
  writeFileSync(join(CSS_DIR, file), text, 'utf8');
}

/* neteja l'HTML: treu el bloc <style> i enllaça els 4 fitxers */
const links = LOAD_ORDER.filter((f) => f !== 'skeleton.css' || true)
  .map((f) => `    <link rel="stylesheet" href="assets/css/${f}">`)
  .join('\n');

const cleaned = html.replace(match[0], links);
writeFileSync(HTML, cleaned, 'utf8');

console.log('\nEscrits:');
for (const [file] of written) console.log(`  assets/css/${file}`);
console.log('index.html: <style> inline eliminat, 4 <link> afegits.');