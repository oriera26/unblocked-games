/**
 * Fase 1.1 · Poda del llistat de jocs.
 *
 * Trellis coses que es poden haver trencat sense que ningú se'n adoni:
 *
 *   1. entrades el fitxer HTML de les quals no existeix a assets/games/
 *   2. entrades que apunten al mateix URL (duplicats: la mateixa partida
 *      apareixent dues vegades amb dos noms diferents)
 *   3. portades de assets/images/ que ja no referencia cap joc
 *
 * Els tres es resolen en un sol pas: el fitxer HTML ha d'existir, cada URL
 * hi pot aparèixer una sola vegada i totes les imatges de la carpeta han
 * de pertànyer a alguna entrada viva.
 *
 *   node tools/prune-games.mjs          informa i no escriu
 *   node tools/prune-games.mjs --apply  aplica els canvis
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readGameList, writeGameList } from './lib/gameList.mjs';
import { GAMES_DIR, IMAGES_DIR, findExistingCover, gameExists, gameFileName } from './lib/games.mjs';
import { sniffImage } from './lib/covers.mjs';
import { nowISO, stamp, updateSection } from './lib/report.mjs';

const APPLY = process.argv.includes('--apply');
const REPORT = join(import.meta.dirname, 'pruned-games.md');
const COVERS_REPORT = join(import.meta.dirname, 'covers-report.md');

const { header, entries, footer } = readGameList();

/* ------------------------------------------------------------------ *
 * 1 · Entrades sense fitxer HTML
 * ------------------------------------------------------------------ */

const noHtml = [];
const rest = [];

for (const entry of entries) {
  if (gameExists(entry.url)) rest.push(entry);
  else noHtml.push(entry);
}

/* ------------------------------------------------------------------ *
 * 2 · Duplicats: la mateixa URL dues vegades
 * ------------------------------------------------------------------ */

/**
 * Es queda la primera entrada de cada URL, pero si una de les duplicades te
 * portada real i l'altre no, es queda la que la te: així la poda no es
 * queda sense la imatge que ja s'havia aconseguit.
 */
const byUrl = new Map();
const dupes = [];

for (const entry of rest) {
  const prev = byUrl.get(entry.url);
  if (!prev) {
    byUrl.set(entry.url, entry);
    continue;
  }
  const prevCover = findExistingCover(prev.url);
  const thisCover = findExistingCover(entry.url);
  let winner = prev;
  let loser = entry;
  if (thisCover && !prevCover) {
    winner = entry;
    loser = prev;
  }
  dupes.push({ url: entry.url, kept: winner.name, dropped: loser.name, cover: thisCover ?? prevCover ?? '' });
  byUrl.set(entry.url, winner);
}

const kept = [...byUrl.values()];

/* ------------------------------------------------------------------ *
 * 3 · Portades orfenes
 * ------------------------------------------------------------------ */

const referenced = new Set();
for (const e of kept) {
  if (e.image?.startsWith('assets/images/')) referenced.add(e.image.slice('assets/images/'.length));
  else {
    const cover = findExistingCover(e.url);
    if (cover) referenced.add(cover);
  }
}

// Les imatges que no son d'un joc (icones de la web) no es toquen.
const NOT_A_COVER = /^(?:orb-|icon-|favicon|apple-touch|logo-|brand)/i;

const orphans = existsSync(IMAGES_DIR)
  ? readdirSync(IMAGES_DIR).filter((n) => !referenced.has(n) && !NOT_A_COVER.test(n))
  : [];

const orphansOfRemoved = [];
for (const e of [...noHtml, ...dupes.map((d) => ({ url: d.url }))]) {
  const cover = findExistingCover(e.url);
  if (cover && orphans.includes(cover)) orphansOfRemoved.push({ game: e.name ?? '', url: e.url, cover });
}

/* ------------------------------------------------------------------ *
 * HTML de joc que no referencia cap entrada
 * ------------------------------------------------------------------ */

const usedHtml = new Set(entries.map((e) => gameFileName(e.url)));
const htmlFiles = existsSync(GAMES_DIR)
  ? readdirSync(GAMES_DIR).filter((f) => /\.html?$/i.test(f))
  : [];
const unreferenced = htmlFiles.filter((f) => !usedHtml.has(f));

/* ------------------------------------------------------------------ *
 * Portades que no son imatges (o son massa petites)
 * ------------------------------------------------------------------ */

const broken = [];
for (const name of existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR) : []) {
  if (!referenced.has(name)) continue;
  const p = join(IMAGES_DIR, name);
  const buf = readFileSync(p);
  const info = sniffImage(buf);
  if (!info) broken.push({ name, why: 'no és una imatge' });
  else if (buf.length < 400) broken.push({ name, why: `només ${buf.length} bytes` });
}

/* ------------------------------------------------------------------ *
 * Aplicació
 * ------------------------------------------------------------------ */

if (APPLY) {
  writeGameList({ header, entries: kept, footer });
  for (const name of orphans) rmSync(join(IMAGES_DIR, name), { force: true });
}

/* ------------------------------------------------------------------ *
 * Informes
 * ------------------------------------------------------------------ */

const lines = [];
lines.push('# Jocs podats');
lines.push('');
lines.push(`- Generat: ${nowISO()}`);
lines.push(`- Mode: ${APPLY ? 'aplicat' : 'informe (--apply per escriure)'}`);
lines.push(`- Abans: **${entries.length}** entrades`);
lines.push(`- Després: **${kept.length}** entrades`);
lines.push(`- Sense fitxer HTML: **${noHtml.length}**`);
lines.push(`- Duplicats: **${dupes.length}**`);
lines.push(`- Portades orfenes esborrades: **${orphans.length}**`);
lines.push('');

if (noHtml.length) {
  lines.push('## Entrades sense fitxer HTML');
  lines.push('');
  lines.push('| Joc | url | fitxer buscat |');
  lines.push('| --- | --- | --- |');
  for (const e of noHtml) lines.push(`| ${e.name} | \`${e.url}\` | \`${gameFileName(e.url)}\` |`);
  lines.push('');
}

if (dupes.length) {
  lines.push('## Duplicats');
  lines.push('');
  lines.push("| url | es queda | s'elimina |");
  lines.push('| --- | --- | --- |');
  for (const d of dupes) lines.push(`| \`${d.url}\` | ${d.kept} | ${d.dropped} |`);
  lines.push('');
}

if (orphans.length) {
  lines.push('## Portades orfenes');
  lines.push('');
  lines.push('Cap entrada de `gameList.js` les referencia:');
  lines.push('');
  for (const n of orphans) lines.push(`- \`${n}\``);
  lines.push('');
}

if (broken.length) {
  lines.push('## Portades trencades');
  lines.push('');
  lines.push('| fitxer | problema |');
  lines.push('| --- | --- |');
  for (const b of broken) lines.push(`| \`${b.name}\` | ${b.why} |`);
  lines.push('');
}

if (unreferenced.length) {
  lines.push('## HTML de joc sense entrada al llistat');
  lines.push('');
  lines.push(`Hi ha ${unreferenced.length} fitxers a \`assets/games/\` que cap joc del llistat no obre.`);
  lines.push('No es toquen (poden ser jocs nous per afegir), pero son rebutjau:');
  lines.push('');
  for (const f of unreferenced) lines.push(`- \`${f}\``);
  lines.push('');
}

writeFileSync(REPORT, lines.join('\n'), 'utf8');

/* portada orfena: secció compartida amb fetch-covers.mjs */
const orphanRows = [
  `Generat: ${nowISO()}`,
  '',
  `**${orphans.length}** imatges de \`assets/images/\` que cap joc de \`gameList.js\` no referencia.`,
  orphans.length ? '' : 'No hi ha cap portada orfena.',
  '',
  ...orphans.map((n) => `| \`${n}\` |${orphansOfRemoved.some((o) => o.cover === n) ? ` joc eliminat o duplicat (${orphansOfRemoved.find((o) => o.cover === n).game})` : ' sense entrada'} |`),
].join('\n');
console.log(`  covers-report.md [removed-orphan]: ${updateSection(COVERS_REPORT, 'removed-orphan', orphanRows) ? 'actualitzat' : 'sense canvis'}`);

if (!broken.length) stamp(COVERS_REPORT, 'rejected', `Generat: ${nowISO()} — cap portada trencada.`);

console.log(`  ${entries.length} -> ${kept.length} entrades (${noHtml.length} sense HTML, ${dupes.length} duplicats)`);
console.log(`  ${orphans.length} portada(s) orfena(es)${APPLY ? ' esborrada(s)' : ''}`);
console.log(`  ${unreferenced.length} HTML de joc sense entrada al llistat`);
console.log(`  ${broken.length} portada(es) trencada(es)`);
console.log(`  informe: tools/${REPORT.split(/[\\/]/).pop()}`);
if (!APPLY) console.log('Mode informe. Torna a executar amb --apply per aplicar.');