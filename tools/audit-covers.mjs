/**
 * Revisio de les portades ja baixades.
 *
 * `fetch-covers.mjs` tria la portada puntuant els noms i els pesos dels
 * fitxers, i s'acaba equivocant de vegades: un full de textura es diu
 * "logo.png", un atlas es diu "cover.png"... Aquesta escriptura mira les
 * imatges que ja tenim a disc i senala les que no haurien de ser portada,
 * per tornar a buscar-les solament a aquestes:
 *
 *   node tools/audit-covers.mjs                 informa
 *   node tools/audit-covers.mjs --only-suspect  imprimeix el --only= a copiar
 *
 * Els indicis que fa servir son objectius:
 *
 *   - el fitxer triat ja no puntua com a portada amb les regles d'ara
 *   - la imatge té una proporcio extrema: un atlas es molt allargat
 *   - la imatge té el costat curt per sota del mínim: surt borrosa
 *   - la imatge pesa menys que MIN_BYTES (o mes del que toca)
 *
 * Els bytes van amb compte: una webp a q72 d'art pla (pixelat, icona)
 * pesa 2 KB de veritat, aixi que abans hi havia un llindar de 2600 B que
 * senyalava portades reals. El que no te sentit es per sota de MIN_BYTES,
 * que es exactament el que ja rebutja `check-covers.mjs`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, IMAGES_DIR } from './lib/games.mjs';
import { sniffImage, MIN_BYTES, SMALLEST_USABLE } from './lib/covers.mjs';
import { parseBase } from './lib/cdn.mjs';
import { loadTree, rankFolder, rankRepoRoot } from './lib/treeCovers.mjs';
import { nowISO } from './lib/report.mjs';

const ONLY_SUSPECT = process.argv.includes('--only-suspect');
const SOURCES = join(import.meta.dirname, 'covers-sources.json');

if (!existsSync(SOURCES)) {
  console.error('No hi ha tools/covers-sources.json. Executa abans `node tools/fetch-covers.mjs --apply`.');
  process.exit(1);
}

const sources = JSON.parse(readFileSync(SOURCES, 'utf8'));
delete sources.generated;

const rows = [];
const suspect = [];

for (const [url, info] of Object.entries(sources)) {
  const reasons = [];

  /* --- el fitxer triat encara es considera portada? --- */
  if (info.via === 'arbre' && info.src) {
    const html = join(ROOT, 'assets', 'games', /\.html?$/i.test(url) ? url : `${url}.html`);
    const base = existsSync(html)
      ? (readFileSync(html, 'utf8').match(/<base\s[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1] ?? null)
      : null;
    const parsed = base ? parseBase(base.replace(/&amp;/g, '&')) : null;
    if (parsed && parsed.kind !== 'npm') {
      const tree = loadTree(parsed.owner, parsed.repo, parsed.ref);
      const folder = (parsed.folder ?? '').replace(/^\/+|\/+$/g, '');
      const cands = [...rankFolder(tree, folder, { max: 3 }), ...rankRepoRoot(tree, folder, { max: 1 })];
      const name = info.src.split('/').pop() ?? '';
      const best = cands.find((c) => decodeURIComponent(c.path.split('/').pop() ?? '') === name);
      if (best && best.score < 0) reasons.push(`ara puntua ${best.score} (${best.why.slice(-2).join(' · ')})`);
      else if (!best) reasons.push('ja no surt entre les candidates de la carpeta');
    }
  }

  /* --- forma del fitxer --- */
  const file = (info.file ?? '').replace(/^assets\/images\//, '');
  const full = join(IMAGES_DIR, file);
  let w = 0;
  let h = 0;
  let bytes = 0;
  if (existsSync(full)) {
    const buf = readFileSync(full);
    bytes = buf.length;
    const info2 = sniffImage(buf);
    if (info2) {
      w = info2.width ?? 0;
      h = info2.height ?? 0;
    }
    if (!info2) reasons.push('no és una imatge');
    if (info2?.ext === 'gif') reasons.push('és un GIF (animació llarga)');
    if (info2?.ext === 'ico') reasons.push('és un ICO');
    if (buf.length < MIN_BYTES) reasons.push(`pesa ${buf.length} bytes, per sota de MIN_BYTES`);
    if (buf.length > 400_000) reasons.push(`pesa ${Math.round(buf.length / 1024)} KB, massa gran`);
  } else {
    reasons.push('el fitxer no existeix');
  }

  if (w && h) {
    const ratio = Math.max(w / h, h / w);
    if (ratio > 2.2) reasons.push(`proporció ${w}x${h}: sembla un atlas, no una portada`);
    if (Math.min(w, h) < SMALLEST_USABLE) {
      reasons.push(`costat curt ${Math.min(w, h)} px (< ${SMALLEST_USABLE}): surt borrosa`);
    }
  }

  rows.push({ url, info, reasons });
  if (reasons.length) suspect.push({ url, info, reasons });
}

/* ------------------------------------------------------------------ */

if (ONLY_SUSPECT) {
  console.log(suspect.map((s) => s.url.replace(/\.html?$/i, '')).join(','));
} else {
  console.log(`Portades registrades : ${rows.length}`);
  console.log(`Sospitoses           : ${suspect.length}`);
  console.log(`Generat              : ${nowISO()}`);
  console.log('');
  if (suspect.length) {
    console.log('| joc | fitxer | motiu |');
    console.log('| --- | --- | --- |');
    for (const s of suspect) {
      console.log(`| ${s.info.name} | \`${(s.info.file ?? '').replace(/^assets\/images\//, '')}\` | ${s.reasons.join(' · ')} |`);
    }
    console.log('');
    console.log('Torna a buscar-les amb:');
    console.log(`node tools/fetch-covers.mjs --apply --replace --only="${suspect
      .map((s) => s.url.replace(/\.html?$/i, ''))
      .join(',')}"`);
  }
}