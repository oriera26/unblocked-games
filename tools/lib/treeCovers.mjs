/**
 * Tria de portada dins de l'arbre conegut d'un repo de GitHub.
 *
 * Quan tenim el llistat complet de fitxers d'un repo (vegeu fetch-trees.mjs)
 * no cal endevinar noms: es filtren les imatges de la carpeta del joc i es
 * puntua cada una pel nom que te i pel pes que te. Aixo dona resultats molt
 * millors que sondejar `cover.png`, `logo.png` i companyia a cegues.
 *
 * Les carpetes UGS tenen dos tipus de fitxer:
 *
 *   - decoracio    sprites, atlases, botons, ico, cursors, tipografies
 *   - portada      cover, thumbnail, og, logo, splash, screenshot...
 *
 * El que fa de portada es gairebe sempre un fitxer gran a l'arrel de la
 * carpeta del joc, i el nom ho diu mes o menys clar. El que no es pot saber
 * pel nom son les dimensions, aixi que el pes del fitxer fa de substitut:
 * una portada de 512x512 pesa desenes de KB, un favicon en pesa dos.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { jsdelivrUrl } from './cdn.mjs';

/** Noms que gairebebé sempre son portada. */
const STRONG = /(?:^|[^a-z])(cover|covers|thumbnail|thumbnails|thumb|ogimage|og[-_]?img|og[-_]?image|poster|splash|promo|promotional|social|share|hero|banner|store|appstore|itunes|feature|featured|advert|ad[-_]?img)(?:[^a-z]|$)/i;

/** Noms de decoració del joc: mai son portada. */
const DECOR = /(?:^|[^a-z])(sprite|sprites|atlas|atlases|tileset|tile|tiles|particle|particles|shadow|pattern|crosshair|enemy|enemies|obstacle|restart|font|fonts|typeface|hud|pixel|anim|animation|frames?|sounds?|audio|music|mp3|ogg|wav|placeholder|no[_-]?image|skins?|textures?|loader|mounts?|shaders?)(?:[^a-z]|$)/i;

/**
 * Senyals que delaten decoracio encara que el nom tambe contingui una
 * paraula de portada. `MainAtlas.png` i `carsprites-sheet0.webp` son
 * fulls de textura i mai son portada: el veto es aplica sempre.
 */
const HARD_VETO =
  /atlas|sprite|tileset|cursor|caret|spinner|favicon|webgl|unity|placeholder|no[_-]?image|fullscreen|itch[-_]|enlarge|upsize|expand|webfont|glyph|woff|[-_.]sheet\d*$/i;

/**
 * Senyals que delaten decoracio, pero que es poden perdre contra un nom de
 * portada clar: `cross-promo-btn.png` te "promo" i es un boto; en canvi
 * `cover-btn.png` es una portada. Aquest veto s'aplica només si el nom no
 * diu de cap a les dues coses.
 */
const SOFT_VETO = /btn|button|icons?|badge|chip|minimize|maximize|restore|logo[-_.]?(?:light|dark)/i;

/** Noms que a UGS son la portada malguiats. */
const MAYBE = /^(?:img|image|game|index|main|app|start|play|menu|title|screen|thumb|pic|photo|art|asset|bg|background|loading|splash|cover|thumbnail|poster|logo)(?:[-_.]?\d{1,2})?\.[a-z0-9]+$/i;

/** Noms de portada fluixa: hi son mes sovint, pero tambe hi son decoracio. */
const WEAK = /(?:^|[^a-z])(preview|screenshot|screenshots?|logo|title|wordmark|brand)(?:[^a-z]|$)/i;

/** Carpetes on els autors amaguen les imatges de mostra. */
const IMGFOLD = /^(?:img|imgs|image|images|assets?|art|media|res|resources|static|cover|covers|thumb|thumbs|thumbnail|thumbnails|banner|banners|promo|screens|screenshots|logo|logos|icon|icons)$/i;

const IMG_EXT = /\.(png|jpe?g|webp|gif|avif|svg|ico|bmp)$/i;

/** Fitxers amb nom numeric: son fotogrames o trossos de sprite. */
const NUMBERED = /^\d{1,4}[-_.]\w+\.[a-z0-9]+$/i;

/** Paraules que no identifiquen cap joc. */
const STOP = new Set(['the', 'and', 'for', 'with', 'game', 'games', 'online', 'free', 'play', 'app', 'apps', 'de', 'la', 'el', 'del', 'of']);

/** Paraules d'un nom que es poden cercar dins un path. */
function hintWords(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Els repos d'UGS son repositori compartits: hi ha UNA carpeta per joc i
 * desenes de jocs a l'arrel. Si un joc te la carpeta buida (viu a
 * l'arrel del repo, que es com es quan l'HTML apunta a l'arrel) i es
 * tria qualsevol imatge de l'arbre, surt la portada d'un altre joc.
 *
 * Es mira quants directoris de primer nivell te l'arbre: dos o menys
 * vol dir que el repo es d'un sol joc i tot el que hi ha es seu.
 */
function rootDirs(tree) {
  if (tree.__roots) return tree.__roots;
  const roots = new Set();
  for (const [p] of tree.files ?? []) {
    const i = p.indexOf('/');
    if (i > 0) roots.add(p.slice(0, i));
    if (roots.size > 6) break;
  }
  tree.__roots = [...roots];
  return tree.__roots;
}

/* ------------------------------------------------------------------ *
 * Cache d'arbres
 * ------------------------------------------------------------------ */

const TREES_DIR = join(import.meta.dirname, '..', '..', 'tools', 'tmp', 'trees');

function cachePath(owner, repo, ref) {
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
  return join(TREES_DIR, `${safe(owner)}__${safe(repo)}__${safe(ref)}.json`);
}

const treeCache = new Map();

/** L'arbre en cache d'un repo@ref, o null si encara no s'ha llistat. */
export function loadTree(owner, repo, ref) {
  const key = `${owner}/${repo}@${ref}`;
  if (treeCache.has(key)) return treeCache.get(key);

  const p = cachePath(owner, repo, ref);
  let data = null;
  if (existsSync(p)) {
    try {
      data = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      data = null;
    }
  }
  treeCache.set(key, data);
  return data;
}

/** Tots els repo@ref que l'escriptura fetch-trees ha aconseguit llistar. */
export function treeOwnerRef() {
  return TREES_DIR;
}

/* ------------------------------------------------------------------ *
 * Puntuacio
 * ------------------------------------------------------------------ */

/**
 * Punts d'una imatge candidata dins la carpeta del joc.
 * Tot es decideix pel nom del fitxer, la carpeta on viu i el seu pes: de les
 * dimensions no se'n sap res fins que el fitxer s'ha baixat.
 */
function scoreFile(fullPath, folder, size) {
  const rel = folder ? fullPath.slice(folder.length + 1) : fullPath;
  const name = rel.split('/').pop() ?? '';
  const stem = name.replace(/\.[a-z0-9]+$/i, '');
  const parts = rel.split('/');
  const depth = parts.length - 1;
  const parent = parts[parts.length - 2] ?? '';

  const why = [];
  let s = 0;

  /**
   * El camí sencer, no només el nom: `SWFs/peggle/levels/level10web.jpg`
   * no porta cap paraula de decoració al nom, pero viu dins `levels/`, que
   * es on un repo guarda les pantalles de joc. En un repositori compartit
   * aquesta regla es la que impedeix que vuit jocs acabin amb la mateixa
   * imatge de Peggle.
   */
  if (/(?:^|\/)(?:levels?|sprites?|spritesheets?|textures?|atlas(?:es)?|particles?|tilesets?|animations?|audio|sfx)(?:\/|$)/i.test(rel)) {
    s -= 140;
    why.push(`veto: viu dins ${rel.replace(/\/[^/]*$/, '')}/`);
  }

  /* --- on viu --- */
  if (depth === 0) { s += 34; why.push('a l\'arrel de la carpeta'); }
  else if (depth === 1) {
    s += IMGFOLD.test(parent) ? 18 : -6;
    why.push(IMGFOLD.test(parent) ? `dins ${parent}/` : `dins ${parent}/`);
  } else {
    s -= 18;
    why.push(`${depth} carpetes més endins`);
  }

  /* --- com es diu --- */
  const strong = STRONG.test(stem);
  if (HARD_VETO.test(stem)) {
    s -= 140;
    why.push(`veto: ${stem} és decoració`);
  } else if (strong) { s += 46; why.push(`nom de portada (${stem})`); }
  else if (SOFT_VETO.test(stem)) { s -= 90; why.push(`veto: ${stem} sembla decoració`); }
  else if (DECOR.test(stem)) { s -= 60; why.push(`nom de decoració (${stem})`); }
  else if (WEAK.test(stem)) { s += 14; why.push(`nom de portada fluixa (${stem})`); }
  else if (MAYBE.test(stem)) { s += 16; why.push(`nom generós (${stem})`); }

  if (NUMBERED.test(stem)) { s -= 22; why.push('nom numerat'); }

  // Dimensions escrites al nom: `cover_1024x1024.png` o `thumb.400px.png`.
  // Cal que vinguin amb `px` o el patró `WxH`: `skin_mellon_shine.3c321fe1`
  // conté un `321` dins d'un hash, i aquell numero deia "321px al nom" i
  // pujava un texture de Minecraft per sobre de la portada de Basketball FRVR.
  const dim = stem.match(/(?:^|[^\d])(\d{3,4})px\b/i) ?? stem.match(/(?:^|[^\d])(\d{3,4})x(\d{3,4})(?:[^\d]|$)/i);
  if (dim) {
    const n = Number(dim[1]);
    if (n >= 128 && n <= 1600) { s += 10; why.push(`${n}px al nom`); }
    else if (n > 1600) { s -= 10; }
  }

  /* --- el nom del joc, si el fitxer es diu com la carpeta --- */
  const folderStem = folder.split('/').pop() ?? '';
  if (folderStem && stem.toLowerCase().replace(/[^\w]/g, '') === folderStem.toLowerCase().replace(/[^\w]/g, '')) {
    s += 26;
    why.push('es diu com la carpeta del joc');
  }

  /* --- quant pesa --- */
  const kb = size / 1024;
  if (kb >= 220) { s += 34; why.push(`${Math.round(kb)} KB`); }
  else if (kb >= 60) { s += 26; why.push(`${Math.round(kb)} KB`); }
  else if (kb >= 22) { s += 14; why.push(`${Math.round(kb)} KB`); }
  else if (kb >= 9) { s += 2; why.push(`${Math.round(kb)} KB`); }
  else if (kb > 0) { s -= 30; why.push(`${Math.round(kb)} KB, massa petit`); }
  else { s += 0; } // sense mida: el fitxer pot ser un SVG

  /* --- tipus --- */
  if (/\.svg$/i.test(name)) s += 8;
  if (/\.gif$/i.test(name)) s -= 22; // un GIF de portada son una animacio llarga
  if (/\.ico$/i.test(name)) s -= 45;

  /* --- quina classe de textura --- */
  // A Phaser "textures" son atlas de l'escenari i a Unity "_texture_N" son
  // materials: pesen molt i no tenen res a veure amb la portada.
  if (/textures?|textura/i.test(stem)) { s -= 42; why.push('és una textura d\'escenari'); }
  if (/(?:^|[^a-z])(skin|model|sprite|atlas|bg|bg1|scene|level|map)(?:[-_.]?\d{0,3})$/i.test(stem)) {
    s -= 20;
    why.push('no sembla una portada');
  }

  return { score: s, why };
}

/**
 * Ordena les imatges de la carpeta del joc de mes probable a menys probable.
 *
 * @param {{files: Array<[string, number]>, truncated?: boolean}} tree
 * @param {string} folder carpeta dins el repo (pot ser buida: joc a l'arrel)
 * @param {{max?: number}} opts
 * @returns {Array<{path: string, size: number, score: number, why: string[]}>}
 */
export function rankFolder(tree, folder, { max = 4, hint = '' } = {}) {
  if (!tree?.files?.length) return [];

  const prefix = folder ? `${folder}/` : '';
  const stem = (folder.split('/').pop() ?? '').toLowerCase().replace(/[^\w]/g, '');

  /**
   * Sense carpeta coneguda nomes es pot confiar en l'arbre si el repo es
   * d'un sol joc. En un repositori compartit (UGS te desenes de jocs a
   * l'arrel), triar qualsevol imatge vol dir donar la portada d'un altre
   * joc a tothom: llavors el fitxer ha de portar el nom del joc.
   */
  const shared = !folder && rootDirs(tree).length > 2;
  const words = [...hintWords(hint), ...hintWords(folder)];

  const scored = [];
  for (const [path, size] of tree.files) {
    if (!IMG_EXT.test(path)) continue;
    if (prefix && !path.startsWith(prefix)) continue;

    const rel = prefix ? path.slice(prefix.length) : path;
    if (!rel) continue;
    const low = path.toLowerCase();

    if (shared) {
      if (!words.length || !words.some((w) => low.includes(w))) continue;
    } else if (!folder && stem && !low.includes(stem)) {
      continue;
    }

    const { score, why } = scoreFile(path, folder, size);
    scored.push({ path, size, score, why });
  }

  scored.sort((a, b) => b.score - a.score || b.size - a.size);
  // Res que pugui ser decoracio (score negatiu) no interessa: es preferix
  // que ho intenti la capa seguent abans que anar a una imatge de joc.
  return scored.filter((c) => c.score >= 0).slice(0, max);
}

/**
 * Mateix que `rankFolder`, però considerant també els reposits germans:
 * alguns autors deixen la portada a l'arrel del repo i el joc dins d'una
 * subcarpeta. nomes es mira si la carpeta del joc no porta res.
 *
 * @returns {Array<{path: string, size: number, score: number, why: string[]}>}
 */
export function rankRepoRoot(tree, folder, { max = 2, hint = '' } = {}) {
  if (!tree?.files?.length) return [];
  const depth = folder ? folder.split('/').filter(Boolean).length : 0;
  if (depth !== 1) return []; // a l'arrel del repo no hi ha res a trobar

  // L'arrel del repo es compartida: el fitxer ha de portar el nom del joc
  // (el de la carpeta o el del titol), que sinó es la portada d'un altre.
  const words = [...hintWords(folder.split('/').pop()), ...hintWords(hint)];
  if (!words.length) return [];

  const scored = [];
  for (const [path, size] of tree.files) {
    if (!IMG_EXT.test(path)) continue;
    if (path.includes('/')) continue;
    if (!words.some((w) => path.toLowerCase().includes(w))) continue;
    const { score, why } = scoreFile(path, '', size);
    scored.push({ path, size, score: score - 20, why: [...why, 'a l\'arrel del repo'] });
  }
  scored.sort((a, b) => b.score - a.score || b.size - a.size);
  return scored.filter((c) => c.score >= 20).slice(0, max);
}

/** URL de jsdelivr per a la candidata triada. */
export function candidateUrl(info, path) {
  return jsdelivrUrl(info.owner, info.repo, info.ref, path);
}