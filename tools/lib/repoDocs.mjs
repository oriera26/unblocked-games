/**
 * Portades que només existeixen dins el README d'un repo.
 *
 * Molts jocs de UGS son exportacions d'Unity: la carpeta del joc conté un
 * `TemplateData/` i res més. La imatge de la portada, en canvi, sí que hi
 * és, però al README del repo, on es llisten els jocs amb la seva captura:
 *
 *     <img src="https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/xx/yy.png">
 *
 * Aquesta capa només s'usa quan la carpeta del joc no ha donat res, i és
 * gratuïta en sentit estricte: el README el serveix jsdelivr igual que
 * qualsevol altre fitxer i no compta per a la quota de l'API de GitHub.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { jsdelivrUrl } from './cdn.mjs';

const CACHE = join(import.meta.dirname, '..', 'tmp', 'readmes');
const UA = 'ulaGames-covers/2.0 (+https://github.com/ula/unblocked-games)';

/** Documentos que pot contenir la portada, en ordre de probabilitat. */
const DOCS = ['README.md', 'readme.md', 'index.html'];
const DOC_TIMEOUT = 8000;

const cache = new Map();

function cachePath(owner, repo, ref) {
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
  return join(CACHE, `${safe(owner)}__${safe(repo)}__${safe(ref)}.json`);
}

/**
 * Text del primer document del repo que existeixi, amb l'URL base per
 * resoldre les rutes relatives.
 *
 * @returns {Promise<{url: string, text: string}|null>}
 */
async function loadDoc(info) {
  const key = `${info.owner}/${info.repo}@${info.ref}`;
  if (cache.has(key)) return cache.get(key);

  const cp = cachePath(info.owner, info.repo, info.ref);
  if (existsSync(cp)) {
    try {
      const hit = JSON.parse(readFileSync(cp, 'utf8'));
      cache.set(key, hit);
      return hit;
    } catch {
      /* cache corromput: es torna a demanar */
    }
  }

  let found = null;
  for (const name of DOCS) {
    const url = jsdelivrUrl(info.owner, info.repo, info.ref, name);
    let text;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(DOC_TIMEOUT),
      });
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue;
    }
    if (text.length < 40) continue;
    found = { url, text };
    break;
  }

  cache.set(key, found);
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cp, JSON.stringify(found), 'utf8');
  } catch {
    /* la cache és una optimització, no és essencial */
  }
  return found;
}

const IMG_URL = /(?:src|href)\s*=\s*["']([^"']+?\.(?:png|jpe?g|webp|avif|gif))(?:["'?#][^"']*)?["']/gi;
const MD_IMG = /!\[[^\]]*\]\(\s*<?([^)\s]+?\.(?:png|jpe?g|webp|avif|gif))(?:[?#][^)\s]*)?[^)]*\)/gi;

/** Els mateixos decoratius que a la resta de codi. */
const DECOR =
  /atlas|sprite|tileset|cursor|caret|favicon|webgl|unity|placeholder|no[_-]?image|fullscreen|itch[-_]|-sheet\d*\.|badge|(?:^|[/_-])(?:logo|banner|header|footer|bg|background|pattern|texture|icon)s?(?:[/_.-]|$)/i;

/** Paraules de portada que només tenen sentit dins el NOM del fitxer. */
const COVERISH = /cover|thumb|[-_.]og[-_.]|og[-_]?(?:image|img)|poster|splash|preview|screenshot|hero|promo|title/i;

/**
 * Extreu de la documentació la imatge que sembla la portada del joc de la
 * carpeta donada.
 *
 * La regla que mana és una de sola: **la URL ha de dir el nom del joc**. Un
 * README pot llistar deu jocs diferents i sense aquesta condició es triaria
 * sempre el primer, que no té res a veure. Quan el joc viu a l'arrel del
 * repo (no hi ha carpeta) no es pot filtrar i no es fa res.
 *
 * @param {object} info {owner, repo, ref} del repo
 * @param {string} folder carpeta del joc dins el repo
 * @returns {Promise<string|null>} URL completa de la imatge
 */
export async function coverFromDocs(info, folder) {
  const clean = (folder ?? '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;

  const doc = await loadDoc(info);
  if (!doc) return null;

  const full = clean.toLowerCase();
  const slug = full.replace(/[^\w]+/g, '');
  const words = full.split(/[^\w]+/).filter((w) => w.length >= 4);

  const urls = new Set();
  for (const re of [IMG_URL, MD_IMG]) {
    for (const m of doc.text.matchAll(re)) {
      const raw = m[1];
      let abs;
      try {
        abs = new URL(raw, doc.url).href;
      } catch {
        continue;
      }
      if (/^data:/i.test(abs)) continue;
      urls.add(abs);
    }
  }
  if (!urls.size) return null;

  const scored = [];
  for (const url of urls) {
    const dec = decodeURIComponent(url).toLowerCase();
    const path = dec.replace(/^https?:\/\/[^/]+/, '');
    const name = path.split('/').pop() ?? '';

    // Condicio obligada: la imatge ha de pertànyer a la carpeta del joc.
    let hit = 0;
    if (path.includes(full)) hit = 3;
    else if (slug && path.replace(/[^\w]+/g, '').includes(slug)) hit = 3;
    else if (words.length && words.every((w) => path.includes(w))) hit = 2;
    else if (words.length >= 2 && words.filter((w) => path.includes(w)).length >= words.length - 1) hit = 1;
    if (!hit) continue;

    let score = hit * 40;
    if (COVERISH.test(name)) score += 25;
    if (DECOR.test(name)) score -= 70;
    if (/^https?:/i.test(url)) score += 5; // les remotes de veritat solen ser les bones

    scored.push({ url, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score > 0 ? scored[0].url : null;
}

/** Neteja la cache en memoria (escriptures llargues). */
export function resetDocCache() {
  cache.clear();
}

/** Quants documents s'han llegit fins ara (per a l'informe). */
export function docCacheSize() {
  return cache.size;
}

/** Fitxers de la cache de documentacio. */
export function docCacheFiles() {
  return existsSync(CACHE) ? readdirSync(CACHE).length : 0;
}