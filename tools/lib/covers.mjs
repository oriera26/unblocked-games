/**
 * Utilitats de portades: identificar imatges, baixar-les i triar la
 * millor candidata que declara cada joc.
 *
 * Tot el que surt d'aqui acaba dins assets/images/ i es referenciat des
 * d'assets/js/gameList.js. La web només serveix fitxers del mateix
 * origen: cap portada depèn d'un servidor extern en marxa.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

import { GAMES_DIR, IMAGES_DIR, ROOT } from './games.mjs';
import { parseBase } from './cdn.mjs';

/* ------------------------------------------------------------------ *
 * Identificació d'imatges
 * ------------------------------------------------------------------ */

/** Extensió webp que usem per a les portades noves. */
export const OUT_EXT = 'webp';

/** Costat i qualitat de les portades. `object-fit: cover` les retalla. */
export const SIZE = 400;
export const QUALITY = 72;

/** Per sota d'això no és una portada: és un sprite o un placeholder. */
export const MIN_BYTES = 1500;

/**
 * Costat curt mínim d'una portada. La targeta es pinta a uns 260-300 px, de
 * manera que per sota de 150 px surt borrosa: 100x100 i 128x128 son icones
 * de barra de tasques, no portades.
 */
export const SMALLEST_USABLE = 150;

/**
 * Es reconeix el tipus i les dimensions mirant la capçalera del fitxer,
 * no l'extensió: moltes URL de CDN acaben en `.png` però serven un webp,
 * i alguns `favicon.png` són en realitat un GIF de 16x16.
 *
 * @returns {{ext: string, width: number|null, height: number|null}|null}
 */
export function sniffImage(buf) {
  if (!buf || buf.length < 32) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, després IHDR
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
    return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: "GIF87a"/"GIF89a", dimensions en little endian
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') {
    return { ext: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // RIFF/WEBP
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    const fourcc = buf.subarray(12, 16).toString('latin1');
    if (fourcc === 'VP8X' && buf.length >= 30) {
      return {
        ext: 'webp',
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      return { ext: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return { ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { ext: 'webp', width: null, height: null };
  }

  // JPEG: cal saltar els segments fins a un SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 menys DHT (c4), JPG (c8) i DAC (cc)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { ext: 'jpg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return { ext: 'jpg', width: null, height: null };
  }

  // AVIF/HEIF: caixa ftyp. Les dimensions viuen dins de la caixa 'ispe',
  // que te 20 bytes exactes: mida(4) + tipus(4) + versió/flags(4)
  // + amplada(4) + alçada(4), dins de meta/iprp/ipco. Es busca la
  // seqüència 'ispe' amb el tamany 20 al costat, que es una comprovacio
  // prou estricte per a no confondre amb un 'ispe' que surti de rebot.
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (brand.startsWith('avif') || brand.startsWith('avis') || brand.startsWith('mif1')) {
      const limit = Math.min(buf.length - 16, 16384);
      for (let i = 20; i < limit; i++) {
        if (
          buf[i] === 0x69 &&
          buf[i + 1] === 0x73 &&
          buf[i + 2] === 0x70 &&
          buf[i + 3] === 0x65 &&
          buf[i - 4] === 0 &&
          buf[i - 3] === 0 &&
          buf[i - 2] === 0 &&
          buf[i - 1] === 20
        ) {
          return { ext: 'avif', width: buf.readUInt32BE(i + 8), height: buf.readUInt32BE(i + 12) };
        }
      }
      return { ext: 'avif', width: null, height: null };
    }
  }

  // ICO
  if (buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const n = buf.readUInt16LE(4);
    let best = 0;
    for (let i = 0; i < n; i++) {
      const o = 6 + i * 16;
      const w = buf[o] === 0 ? 256 : buf[o];
      if (w > best) best = w;
    }
    return { ext: 'ico', width: best, height: best };
  }

  // SVG
  const head = buf.subarray(0, 512).toString('utf8');
  if (/<svg[\s>]/i.test(head)) {
    const num = (re) => {
      const m = head.match(re);
      if (!m) return null;
      const v = Number.parseFloat(m[1]);
      return Number.isFinite(v) ? v : null;
    };
    let width = num(/\bwidth\s*=\s*["']?([\d.]+)/i);
    let height = num(/\bheight\s*=\s*["']?([\d.]+)/i);
    if (!width || !height) {
      const vb = head.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
      if (vb) { width = Number(vb[1]); height = Number(vb[2]); }
    }
    return { ext: 'svg', width, height };
  }

  return null;
}

/** Costat menor de la imatge, o 0 si no se'n sap. */
export function smallestSide(info) {
  if (!info?.width || !info?.height) return 0;
  return Math.min(info.width, info.height);
}

/* ------------------------------------------------------------------ *
 * Xarxa
 * ------------------------------------------------------------------ */

const UA = 'ulaGames-covers/2.0 (+https://github.com/ula/unblocked-games)';

/** Descàrrega directa. Retorna null si no és una imatge utilitzable. */
export async function grab(url, { timeout = 25000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  const info = sniffImage(buf);
  if (!info || buf.length < MIN_BYTES) return null;

  return { buf, info, url: res.url || url };
}

/**
 * Igual que `grab`, però el fitxer pot ser molt gran: només en volem el
 * codi i el content-type. Per això no es llegeix el cos.
 */
export async function headExists(url, { timeout = 12000 } = {}) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/^image\//i.test(type)) return false;
    const len = Number(res.headers.get('content-length') ?? '0');
    return !len || len >= MIN_BYTES;
  } catch {
    return false;
  }
}

/**
 * Passa la imatge per images.weserv.nl, que la retalla a SIZE x SIZE i la
 * converteix a webp. Així les 700 targetes pesen el mateix i el navegador
 * nomes ha de decodificar un format.
 *
 * Si el proxy falla es torna a demanar sense parametres i, si tampoc, es
 * guarda el original tal qual: una portada una mica gran val mes que cap.
 */
/**
 * Prepara una URL per a que images.weserv.nl la pugui llegir.
 *
 * Les carpetes del CDN porten espais i altres caràcters, de manera que
 * `new URL()` ja els deixa codificats (`%20`). Si es passes el resultat a
 * `encodeURIComponent` tal qual, el `%` es tornaria `%25` i el proxy aniria a
 * buscar un fitxer que es diu `2022.05.25%20Mons.jpg` i no trobaria res.
 * Per això es decodifica abans de codificar.
 */
function forWeserv(remote) {
  const bare = remote.replace(/^https?:/i, '');
  let decoded = bare;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    /* percentatges mal formats: es deixa tal qual */
  }
  return encodeURIComponent(decoded);
}

/* ------------------------------------------------------------------ *
 * Mateix contingut per a jocs diferents
 *
 * Els repos compartits tenen una imatge genèrica a cada carpeta i els
 * portals tenen una imatge per defecte: quan una candidata baixa, abans
 * d'acceptar-la es mira si un altre joc ja se la va endur. Si és així es
 * descarta i es continua amb la següent, que és el que evita que noranta
 * jocs acabin amb la mateixa portada de "mahjong solitaire".
 * ------------------------------------------------------------------ */

/** sha1 curt del contingut, independent del nom del fitxer. */
export const contentHash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12);

/** hash -> url del joc que ja fa servir aquesta imatge. */
const taken = new Map();

/** Reserva les imatges que ja són portada d'un altre joc. */
export function seedTaken(pairs) {
  for (const [hash, owner] of pairs) if (!taken.has(hash)) taken.set(hash, owner);
}

/**
 * true si aquest contingut encara no el fa servir cap altre joc.
 *
 * `owner` és el joc que s'està resolent: sense ell, dues portades iguals
 * es rebutjarien entre elles i cap joc se la podrà endur. La crida és
 * síncrona, així que amb descàrregues concurrents guanya el primer.
 */
export function claimContent(buf, owner = null) {
  const hash = contentHash(buf);
  const who = taken.get(hash);
  if (who && who !== owner) return false;
  taken.set(hash, owner ?? '?');
  return true;
}

export async function normalize(remote, owner = null) {
  const key = forWeserv(remote);
  const url = `https://images.weserv.nl/?url=${key}&w=${SIZE}&h=${SIZE}&fit=cover&output=${OUT_EXT}&q=${QUALITY}&we`;

  const direct = await grab(url, { timeout: 30000 });
  const passthrough = direct
    ? null
    : await grab(`https://images.weserv.nl/?url=${key}&output=${OUT_EXT}&we`, { timeout: 30000 });
  const original = direct || passthrough ? null : await grab(remote, { timeout: 30000 });

  const got = direct
    ? { ...direct, via: 'weserv' }
    : passthrough
      ? { ...passthrough, via: 'weserv-direct' }
      : original
        ? { ...original, via: 'original' }
        : null;

  if (!got) return null;
  // Mateixa imatge que un altre joc? No: que segueixin mirant.
  if (!claimContent(got.buf, owner)) return null;
  return got;
}

/* ------------------------------------------------------------------ *
 * Mineria dels HTML de joc
 * ------------------------------------------------------------------ */

/** Els mateixos decoratius que distingueix mine-local-images.mjs. */
const DECOR =
  /\b(sprite|atlas|tileset|tile[-_s]?\b|button|btn|cursor|arrow|caret|spinner|loader|particle|shadow|pattern|crosshair|bullet|enemy|obstacle|trex|dino|restart|caret|font|typeface|ui[-_]|gui|blocks?|audio|sound)\b/i;

/** Els noms que sí que solen ser portada. */
const COVERISH =
  /(cover|og[-_]?image|share|social|preview|poster|banner|thumb(nail)?|splash|hero|screenshot|promo|loading[-_]?screen|start[-_]?screen|logo|title|card)/i;

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** L'<base href> del document, que decideix on es resolen les rutes. */
export function baseHref(html) {
  const m = html.match(/<base\s[^>]*href\s*=\s*["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Dedueix la carpeta del CDN a partir de les URL que hi ha escrites dins
 * l'HTML, per quan el document no te <base>.
 *
 * Molts envolupadors d'Unity d'UGS no tenen <base> sinó que escriuen els
 * fitxers amb ruta completa dins un <script>:
 *
 *     var loaderUrl = "https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@abc/bounty%20of%20one/x.loader.js";
 *
 * Sense això es per la capa de sondes, que no sabria on és la carpeta. Es
 * mira quina URL és la més profunda: la que porta mésirectoris és la del
 * joc, perquè els altres fitxers del joc comparteixen prefix.
 */
export function inferBase(html) {
  const urls = html.match(/https?:\/\/[^\s"'<>)\\]+/gi) ?? [];

  /** carpeta -> quantes URL hi cauen dins, i amb quin CDN s'hi arriba */
  const counts = new Map();

  for (const raw of urls) {
    let dir;
    try {
      const u = new URL(decodeEntities(raw.replace(/['"`,;]+$/, '')));
      // El que interessa és la CARPETA, no el fitxer: "…/TemplateData/style.css"
      // ha de comptar com a carpeta "…/TemplateData/".
      u.pathname = u.pathname.replace(/[^/]*$/, '');
      u.search = '';
      u.hash = '';
      dir = u.href;
    } catch {
      continue;
    }

    const info = parseBase(dir);
    if (!info || info.kind === 'npm') continue;

    const folder = info.folder ?? '';
    const key = `${info.owner}/${info.repo}@${info.ref}/${folder}`;
    const entry = counts.get(key) ?? { n: 0, folder, base: `${info.cdn}${folder ? `${folder}/` : ''}` };
    entry.n++;
    counts.set(key, entry);
  }

  if (!counts.size) return null;

  // Guanya la carpeta que agrupa mes URL: la del joc sol ser la del quatre
  // o cinc fitxers de l'export, mentre que "TemplateData/" només en té un.
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n || (entry.n === best.n && entry.folder.length > best.folder.length)) {
      best = entry;
    }
  }
  return best.base;
}

function parseDataUri(url) {
  const m = url.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  const info = sniffImage(buf);
  if (!info || buf.length < MIN_BYTES) return null;
  return { buf, info };
}

/**
 * Extreu les imatges que declara un HTML de joc i les puntua.
 *
 * El resultado son tres tipus diferents i tots valen igual de cara al
 * resultat final, però es resolen de maneres diferents:
 *
 *   local   un fitxer que ja és al repo: es fa servir tal qual, zero xarxa
 *   embed   un data:image dins l'HTML: es desa a disc, zero xarxa
 *   remote  una URL: cal baixar-la
 *
 * @returns {{base: string|null, cands: Array<object>}}
 */
export function mineHtml(html, htmlPath) {
  const base = baseHref(html) ?? inferBase(html);
  const found = new Map();
  const dir = dirname(htmlPath);

  const emit = (raw, source, extra = {}) => {
    const url = decodeEntities(String(raw).trim());
    if (!url) return;

    if (/^data:image\//i.test(url)) {
      const d = parseDataUri(url);
      if (!d) return;
      found.set(`embed:${d.buf.length}`, { kind: 'embed', source, buf: d.buf, info: d.info, url: '', ...extra });
      return;
    }

    if (/^(?:https?:)?\/\//i.test(url)) {
      const abs = url.startsWith('//') ? `https:${url}` : url;
      found.set(`remote:${abs}`, { kind: 'remote', source, url: abs.split('#')[0], ...extra });
      return;
    }

    // Ruta relativa: primer contra el <base>, si n'hi ha.
    const bare = url.split(/[?#]/)[0];
    if (base) {
      try {
        const abs = new URL(bare, base).href;
        found.set(`remote:${abs}`, { kind: 'remote', source, url: abs.split('#')[0], ...extra });
      } catch { /* base no resolable: es prova com a ruta local */ }
    }

    // I si no hi ha <base> (o no resol), contra el repositori.
    try {
      const abs = join(dir, decodeURIComponent(bare));
      const rp = relative(ROOT, abs).replace(/\\/g, '/');
      if (rp.startsWith('..')) return;
      if (existsSync(abs) && statSync(abs).isFile()) {
        found.set(`local:${rp}`, { kind: 'local', source, url: rp, bytes: statSync(abs).size, ...extra });
      }
    } catch { /* ruta no interpretable */ }
  };

  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    const val = a.content ?? '';
    if (!val) continue;
    if (/^og:image(:url|:secure_url)?$/.test(key)) emit(val, 'og:image');
    else if (/^twitter:image(:src)?$/.test(key)) emit(val, 'twitter:image');
    else if (key === 'msapplication-tileimage' || key === 'msapplication-square70x70logo') emit(val, 'msapplication-tile');
  }

  for (const m of html.matchAll(/<link\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? '').toLowerCase();
    if (!a.href) continue;
    if (rel.includes('apple-touch-icon')) emit(a.href, 'apple-touch-icon', { hint: a.sizes ?? '' });
    else if (/(^|\s)icon(\s|$)/.test(rel) || rel.includes('shortcut')) emit(a.href, 'favicon', { hint: a.sizes ?? '' });
  }

  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const hint = [a.id, a.class, a.alt].filter(Boolean).join(' ');
    if (a.src) emit(a.src, 'img', { hint });
    if (a.srcset) {
      const best = a.srcset
        .split(',')
        .map((p) => {
          const bits = p.trim().split(/\s+/);
          return { u: bits[0], w: Number((bits[1] ?? '').replace(/x$/i, '')) || 1 };
        })
        .sort((x, y) => y.w - x.w)[0];
      if (best?.u) emit(best.u, 'img[srcset]', { hint: `${hint} ${best.w}x` });
    }
  }

  for (const m of html.matchAll(/<video\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.poster) emit(a.poster, 'video:poster');
  }
  for (const m of html.matchAll(/<body\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.background) emit(a.background, 'body:background');
  }

  const css = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css.push(m[1]);
  for (const m of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) css.push(m[1] ?? m[2] ?? '');
  for (const chunk of css) {
    for (const m of chunk.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
      emit(m[1] ?? m[2] ?? m[3] ?? '', 'css:url');
    }
  }

  /**
   * L'envolupador d'Unity posa la imatge de fons del moment de càrrega així:
   *
   *     canvas.style.background = "url('" + buildUrl + "/2022.05.25 Game.jpg') center / cover";
   *
   * A `url()` li toca un text que sembla una ruta, però en realitat és JavaScript
   * i el fitxer que hi ha darrere és exactament la portada que es veu quan el
   * joc arrenca. Es captura el nom del fitxer i es resol com a ruta relativa
   * respecte de la carpeta del joc.
   */
  for (const m of html.matchAll(/\+\s*buildUrl\s*\+\s*["']\s*\/\s*([^"']+?\.(?:png|jpe?g|webp|gif|avif))["']/gi)) {
    emit(m[1], 'unity:background');
  }

  const cands = [...found.values()].map((c) => ({ ...c, ...scoreCandidate(c) }));
  cands.sort((a, b) => b.score - a.score);
  return { base, cands };
}

function scoreCandidate(c) {
  const why = [];
  let s = 0;

  switch (c.source) {
    case 'og:image': s += 100; why.push('og:image'); break;
    case 'twitter:image': s += 90; why.push('twitter:image'); break;
    case 'unity:background': s += 78; why.push('fons de càrrega del joc'); break;
    case 'apple-touch-icon': s += 75; why.push('apple-touch-icon'); break;
    case 'video:poster': case 'body:background': s += 65; why.push(c.source); break;
    case 'msapplication-tile': s += 50; why.push('msapplication-tile'); break;
    case 'img': s += 45; why.push('<img>'); break;
    case 'img[srcset]': s += 40; why.push('<img srcset>'); break;
    case 'css:url': s += 32; why.push('CSS url()'); break;
    case 'favicon': s += 22; why.push('favicon'); break;
    default: s += 20;
  }

  const name = (c.url || '').split('/').pop() ?? '';
  if (COVERISH.test(name)) { s += 32; why.push(`nom de portada (${name})`); }
  if (DECOR.test(name)) { s -= 40; why.push(`nom de decoracio (${name})`); }
  if (c.hint) {
    if (COVERISH.test(c.hint)) { s += 25; why.push('id/class/alt de portada'); }
    if (DECOR.test(c.hint)) { s -= 30; why.push('id/class/alt de decoracio'); }
  }

  const side = smallestSide(c.info);
  if (side >= 400) s += 30;
  else if (side >= 180) s += 22;
  else if (side >= 100) s += 8;
  else if (side > 0 && side <= 64) s -= 25;

  if (c.kind === 'local') {
    if (existsSync(join(ROOT, c.url))) s += 30;
    else s -= 60;
  }
  if (c.kind === 'embed') s += 30;

  const kb = (c.info ? c.bytesSize ?? 0 : c.bytes ?? 0) / 1024;
  if (c.kind !== 'remote' && kb > 0) {
    if (kb < 3) s -= 25;
    else if (kb > 30) s += 5;
  }

  return { score: s, why };
}

/* ------------------------------------------------------------------ *
 * Sondes sobre la carpeta del CDN
 * ------------------------------------------------------------------ */

/**
 * Noms que els autors deixen dins la carpeta del joc al CDN. No hi ha
 * directori indexable (jsdelivr rebutja el llistat de paquets grans),
 * així que la unica opcio es preguntar un a un.
 */
export const PROBE_NAMES = [
  'cover.png', 'cover.jpg', 'cover.webp', 'cover.jpeg',
  'img/cover.png', 'img/cover.jpg', 'images/cover.png', 'image/cover.png', 'assets/cover.png',
  'thumbnail.png', 'thumbnail.jpg', 'thumb.png', 'thumb.jpg',
  'og.png', 'og.jpg', 'ogimage.png', 'og-image.png',
  'logo.png', 'logo.jpg',
  'icon.png', 'icon.jpg', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'favicon.png',
  'screenshot.png', 'screenshot.jpg', 'screenshot1.png', 'banner.png', 'banner.jpg',
  'preview.png', 'preview.jpg', 'splash.png', 'splash.jpg', 'hero.png', 'poster.png',
  'promo.png', 'card.png', 'title.png', 'game.png', 'image.png', 'background.png', 'play.png',
];

/** HTML del joc dins assets/games/, si hi és. */
export function gameHtmlPath(url) {
  const name = /\.html?$/i.test(url) ? url : `${url}.html`;
  const full = join(GAMES_DIR, name);
  return existsSync(full) ? full : null;
}

export function readGameHtml(url) {
  const full = gameHtmlPath(url);
  if (!full) return null;
  try {
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

export { IMAGES_DIR };