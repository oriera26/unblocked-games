/**
 * Resolució de fitxers de joc i de portades.
 * Compartit per prune-games.mjs i fetch-covers.mjs.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const GAMES_DIR = join(ROOT, 'assets', 'games');
export const IMAGES_DIR = join(ROOT, 'assets', 'images');

/** Extensions que acceptem com a portada, en ordre de preferència. */
export const COVER_EXT = ['webp', 'png', 'jpg', 'jpeg', 'avif', 'gif', 'svg'];

/** Extensió quefem servir a les portades noves que baixem. */
export const DOWNLOAD_EXT = 'webp';

/**
 * Nom real del fitxer HTML d'un joc.
 * Els urls del llistat son inconsistents: alguns ja porten `.html`,
 * un porta `.htm` i alguns no porten cap extensio.
 */
export function gameFileName(url) {
  if (/\.html?$/i.test(url)) return url;
  return `${url}.html`;
}

/** `clgranny.html` -> `clgranny` */
export function coverBasename(url) {
  return url.replace(/\.html?$/i, '');
}

/**
 * Fitxer de portada d'un joc amb l'extensió que toca.
 * `clgranny.html` + `webp` -> `clgranny.webp`
 *
 * L'extensió no es decideix pel que demana el portal sinó pel que diu de
 * debò la capçalera del fitxer baixat: hi ha CDNs que serveixen un webp
 * darrere d'un `.png`, i escriure'l com a png deixaria el navegador
 * igual, pero el repositori mentint.
 */
export function coverFileName(url, ext) {
  return `${coverBasename(url)}.${ext}`;
}

export function gameExists(url) {
  return existsSync(join(GAMES_DIR, gameFileName(url)));
}

/**
 * Busca la portada ja existent per a un joc.
 * Retorna el nom de fitxer dins assets/images/ o null.
 */
export function findExistingCover(url) {
  const base = coverBasename(url);
  for (const ext of COVER_EXT) {
    const file = `${base}.${ext}`;
    if (existsSync(join(IMAGES_DIR, file))) return file;
  }
  return null;
}

/** ruta relativa que s'escriu dins el camp `image` de gameList.js */
export function coverSrc(file) {
  return `assets/images/${file}`;
}

/**
 * Normalitza un nom de joc al slug que usen els portals (poki, etc.).
 * "10-103 Null Kevin" -> "10-103-null-kevin"
 * "Clrecoil" / "clrecoil.html" -> "recoil"
 */
export function toSlug(text) {
  return String(text)
    .replace(/\.html?$/i, '')
    .replace(/^cl(?=[a-z0-9])/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // treu accents
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Clau de cerca a partir del nom del joc, retaining paraules que
 * NO son del joc: els ports que hi ha al davant son el prefixe `cl`.
 */
export function searchTerms(name) {
  return toSlug(name)
    .split('-')
    .filter(Boolean);
}