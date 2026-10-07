/**
 * Llista de jocs que val la pena tornar a resoldre.
 *
 *   node tools/fix-list.mjs                # tots els criteris
 *   node tools/fix-list.mjs --dupes-only   # només imatges idèntiques
 *
 * Escriu `tools/fix-list.txt` (un url per línia), pensat per a
 * `fetch-covers.mjs --only-file=tools/fix-list.txt`.
 *
 * Criteris:
 *
 *   1. comparteixen el MATEIX contingut amb un altre joc (sha1 igual, amb
 *      noms de fitxer diferents: cada joc guarda la seva portada amb el seu
 *      nom, aixi que una imatge repetida no es veu mirant els noms)
 *   2. la font registrada a covers-sources.json te pinta de decoracio
 *      (textures, nivells, captures, logos...)
 *   3. van acabar a la capa mes fluixa (imatges o portal), que es el que
 *      passa quan l'arbre del repo encara no estava caixat o les regles de
 *      tria eren les antigues
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { IMAGES_DIR, ROOT } from './lib/games.mjs';
import { contentHash } from './lib/covers.mjs';
import { readGameList } from './lib/gameList.mjs';

const DUPES_ONLY = process.argv.includes('--dupes-only');
const OUT = join(import.meta.dirname, 'fix-list.txt');
const SOURCES = join(import.meta.dirname, 'covers-sources.json');

const { entries } = readGameList();
const want = new Set();
const dupGroups = [];

/* --- 1 · mateix contingut ---------------------------------------- */
const groups = new Map();
for (const e of entries) {
  const file = (e.image ?? '').slice('assets/images/'.length);
  if (!file) continue;
  let buf;
  try {
    buf = readFileSync(join(IMAGES_DIR, file));
  } catch {
    continue;
  }
  const hash = contentHash(buf);
  if (!groups.has(hash)) groups.set(hash, []);
  groups.get(hash).push(e);
}
for (const [hash, list] of groups) {
  if (list.length < 2) continue;
  // El mateix fitxer compartit a propòsit (shared-*, la icona de Minecraft)
  // es veu a gameList.js i no cal tornar-lo a resoldre: el que s'ha de
  // corregir és el mateix dibuix amb dos noms de fitxer diferents.
  const files = new Set(list.map((e) => e.image));
  if (files.size < 2) continue;
  dupGroups.push({ hash, list });
  for (const e of list) want.add(e.url);
}

const sizes = {
  dupes: want.size,
  suspects: 0,
  weak: 0,
};

if (!DUPES_ONLY && existsSync(SOURCES)) {
  const sources = JSON.parse(readFileSync(SOURCES, 'utf8'));
  delete sources.generated;

  /* --- 2 · font sospitosa ---------------------------------------- */
  const BAD =
    /(texture|atlas|tileset|particles?|level\d|_level|screenshot|screen-shot|capture|gameplay|sprite|sheet|cursor|btn|button|loading|progress|thumb[-_]?sheet|menu|hud|splash|logo)/i;

  /* --- 3 · capa fluixa ------------------------------------------- */
  for (const [url, info] of Object.entries(sources)) {
    if (BAD.test(`${info.src ?? ''} ${info.layer ?? ''}`)) {
      if (!want.has(url)) sizes.suspects++;
      want.add(url);
    }
    if (info.via === 'imatges' || info.via === 'portal') {
      if (!want.has(url)) sizes.weak++;
      want.add(url);
    }
  }
}

const list = [...want].sort();
writeFileSync(OUT, list.join('\n') + '\n', 'utf8');

console.log(`jocs a resoldre : ${list.length}`);
console.log(`  imatge duplicada : ${sizes.dupes} (${dupGroups.length} grups)`);
if (!DUPES_ONLY) {
  console.log(`  font sospitosa   : ${sizes.suspects}`);
  console.log(`  capa fluixa      : ${sizes.weak}`);
}
for (const g of dupGroups.slice(0, 5)) {
  console.log(`    ${g.hash} · ${g.list.length} jocs · ${g.list[0].name}`);
}
if (dupGroups.length > 5) console.log(`    … +${dupGroups.length - 5} grups més`);
console.log(`escrit: ${OUT}`);
