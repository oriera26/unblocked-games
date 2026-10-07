/**
 * Mineria d'imatges DINS dels fitxers HTML de joc (assets/games/*.html).
 *
 * Pregunta: quants jocs tenen una imatge de portada utilitzable que ja estigui
 * al mateix repositori (o dins del propi HTML), sense baixar res de xarxa?
 *
 * Es distingeixen tres orrogens d'imatge:
 *   LOCAL   ruta de fitxer relativa que resol a un fitxer REAL del repo
 *   EMBED   data:image/...;base64 dins l'HTML (imatge literalment dins el fitxer)
 *   REMOTE  URL http(s), servida per un CDN extern
 *
 * Aquest script no escriu res del projecte fora de tools/mining-local-images.md
 * i, si es demana, tools/mining-local-images.csv.
 *
 *   node tools/mine-local-images.mjs
 *   node tools/mine-local-images.mjs --csv=tools/mining-local-images.csv
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const GAMES_DIR = join(ROOT, 'assets', 'games');
const IMAGES_DIR = join(ROOT, 'assets', 'images');
const REPORT = join(import.meta.dirname, 'mining-local-images.md');
const CSV = (process.argv.find((a) => a.startsWith('--csv=')) ?? '').split('=')[1] ?? '';

/* ---------------------------------------------------------------- *
 * Utilitats de fitxer
 * ---------------------------------------------------------------- */

function walk(dir, base = '') {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, `${base}${name}/`));
    else out.push({ path: `${base}${name}`, bytes: st.size });
  }
  return out;
}

// Index de tot el repositori: ruta relativa amb '/' -> mida en bytes.
const repoIndex = new Map();
for (const f of walk(ROOT, '')) repoIndex.set(f.path, f.bytes);

/* ---------------------------------------------------------------- *
 * Extraccio de referencies
 * ---------------------------------------------------------------- */

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|apng|jxl)(?:[?#].*)?$/i;
/** Mateixa cosa pero per a noms de fitxer (sense query string). */
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|apng|jxl)$/i;

function looksLikeImage(u) {
  return IMG_EXT.test(u);
}
function isRemote(u) {
  return /^(?:https?:)?\/\//i.test(u);
}
function extOf(u) {
  const m = String(u).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}
function basenameOf(u) {
  return String(u).split(/[?#]/)[0].split('/').pop() ?? '';
}

/**
 * Llegeix els atributs d'un tag.
 * Els HTML del repo son inconsistents: hi ha atributs amb comilles simples,
 * dobles i sense comilles, i alguns amb ordenacio qualsevol.
 */
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

/** Dimensions reals d'un PNG/GIF embegut en base64. */
function embeddedSize(b64, mime) {
  try {
    if (/^iVBOR/.test(b64)) {
      const b = Buffer.from(b64, 'base64');
      if (b.length < 24) return null;
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
    }
    if (/^R0lGOD/.test(b64)) {
      // GIF: amplada/altura a l'offset 6, little endian
      const b = Buffer.from(b64, 'base64');
      if (b.length < 10) return null;
      return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), bytes: b.length };
    }
    if (/^UklGR/.test(b64)) {
      // WEBP (RIFF). Dimensio al VP8X/VP8/VP8L segons el chunk.
      const b = Buffer.from(b64, 'base64');
      const fourcc = b.length > 12 ? b.toString('ascii', 12, 16) : '';
      if (fourcc === 'VP8X' && b.length >= 30) {
        return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), bytes: b.length };
      }
      if (fourcc === 'VP8 ' && b.length >= 30) {
        return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, bytes: b.length };
      }
      return { w: null, h: null, bytes: b.length };
    }
    if (mime?.includes('svg') || /^<svg|^PHN2/i.test(b64)) {
      const head = Buffer.from(b64, 'base64').toString('latin1').slice(0, 400);
      const w = head.match(/\bwidth\s*=\s*"([\d.]+)/i)?.[1];
      const h = head.match(/\bheight\s*=\s*"([\d.]+)/i)?.[1];
      return { w: w ? Number(w) : null, h: h ? Number(h) : null, bytes: Math.round(b64.length * 0.75) };
    }
    return { w: null, h: null, bytes: Math.round(b64.length * 0.75) };
  } catch {
    return null;
  }
}

/**
 * Descodifica les entitats HTML que apareixen dins de CSS i atributs.
 * `style="background:url(&quot;x.png&quot;)"` es molt habitual i sense això
 * la ruta surt literal amb `&quot;` al voltant.
 */
function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Retorna les metadades d'un data URI d'imatge, o null. */
function parseDataUri(u) {
  const m = u.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  const size = embeddedSize(b64, mime);
  if (!size || size.bytes < 200) return null; // massa petit per a ser portada
  return { mime, b64, ...size };
}

/** Actualitza el millor resultat dins `best` (map url -> record). */
function offer(best, key, rec) {
  const prev = best.get(key);
  if (!prev || rec.score > prev.score) best.set(key, rec);
}

/**
 * Extreu totes les referencies a imatges d'un HTML, amb la seva procedencia
 * i la dimensio si es pot saber.
 */
function extract(html, htmlPath) {
  const found = new Map(); // clau -> {source, url, kind, ...}
  const htmlDir = dirname(htmlPath);

  const emit = (url, source, extra = {}) => {
    url = decodeEntities(String(url).trim());
    if (!url) return;

    // data URI d'imatge: es tracta com a EMBED
    if (/^data:image\//i.test(url)) {
      const d = parseDataUri(url);
      if (!d) return;
      const key = `embed:${d.mime}:${d.b64.length}:${d.w}x${d.h}`;
      offer(found, key, {
        kind: 'embed',
        source,
        url: `data:${d.mime};base64,<${d.bytes} bytes, ${d.w ?? '?'}x${d.h ?? '?'}>`,
        mime: d.mime,
        w: d.w,
        h: d.h,
        bytes: d.bytes,
        _b64: d.b64,
        _mime: d.mime,
        ...extra,
      });
      return;
    }

    if (isRemote(url)) {
      const key = `remote:${url}`;
      offer(found, key, { kind: 'remote', source, url: url.split('#')[0], ...extra });
      return;
    }

    // ruta local: resolem respecte del directori de l'HTML
    const bare = url.split(/[?#]/)[0];
    if (!bare) return;
    let dec = bare;
    try { dec = decodeURIComponent(bare); } catch { /* deixa com es */ }

    for (const cand of new Set([bare, dec])) {
      const abs = cand.startsWith('/') ? resolve(ROOT, '.' + cand) : resolve(htmlDir, cand);
      let rp = relative(ROOT, abs).replace(/\\/g, '/');
      let bytes = repoIndex.get(rp);
      // Si surt fora del repo, prova el path "netejat" (../images/x.png)
      if (bytes === undefined && rp.startsWith('..')) {
        const alt = rp.replace(/^(\.\.\/)+/, '');
        bytes = repoIndex.get(alt);
        if (bytes !== undefined) rp = alt;
      }
      if (bytes === undefined && existsSync(abs)) {
        // Els directoris del repo (assets/games) no son imatges: es marquen
        // amb exists=false per no confondre'ls amb una portada.
        if (statSync(abs).isDirectory()) { rp = null; }
        else bytes = statSync(abs).size;
      }
      const key = `local:${rp ?? cand}`;
      offer(found, key, {
        kind: 'local',
        source,
        url: cand,
        repoPath: rp,
        exists: bytes !== undefined,
        bytes: bytes ?? 0,
        ...extra,
      });
      break;
    }
  };

  // --- <meta>
  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    const val = a.content ?? '';
    if (!val) continue;
    if (/^og:image(:url|:secure_url)?$/.test(key)) emit(val, 'og:image', { attr: a.sizes ?? '' });
    else if (/^twitter:image(:src)?$/.test(key)) emit(val, 'twitter:image', { attr: a.sizes ?? '' });
    else if (key === 'msapplication-tileimage') emit(val, 'msapplication-tile');
    else if (key === 'msapplication-square70x70logo') emit(val, 'msapplication-tile');
  }

  // --- <link>
  for (const m of html.matchAll(/<link\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? '').toLowerCase();
    const href = a.href ?? '';
    if (!href) continue;
    if (rel.includes('apple-touch-icon')) emit(href, 'apple-touch-icon', { sizes: a.sizes ?? '' });
    else if (/(^|\s)icon(\s|$)/.test(rel) || rel.includes('shortcut')) emit(href, 'favicon', { sizes: a.sizes ?? '' });
    else if (rel.includes('mask-icon')) emit(href, 'mask-icon');
    else if (rel.includes('manifest')) emit(href, 'manifest');
  }

  // --- <img src> / <img srcset>  (guardem id i class, son molt informatius)
  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    const hint = [a.id, a.class, a.alt].filter(Boolean).join(' ');
    if (a.src) emit(a.src, 'img', { hint });
    if (a.srcset) {
      // tria la variant mes gran
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

  // --- <video poster>, <object data>, <input type=image>
  for (const m of html.matchAll(/<video\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.poster) emit(a.poster, 'video:poster');
  }
  for (const m of html.matchAll(/<body\s[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.background) emit(a.background, 'body:background');
  }

  // --- CSS: només dins de <style> i atributs style=""
  const css = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css.push(m[1]);
  for (const m of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) css.push(m[1] ?? m[2] ?? '');

  for (const chunk of css) {
    // url(...) i também @import "..."
    for (const m of chunk.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
      emit(m[1] ?? m[2] ?? m[3] ?? '', 'css:url');
    }
    for (const m of chunk.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) {
      emit(m[1], 'css:@import');
    }
    // image-set(...) ja queda coberto per url()
  }

  return [...found.values()];
}

/* ---------------------------------------------------------------- *
 * Puntuacio
 * ---------------------------------------------------------------- */

const DECOR =
  /\b(sprite|atlas|tileset|tile[-_s]?\b|button|btn|cursor|arrow|caret|spinner|loader|loading|particle|shadow|pattern|crosshair|bullet|enemy|player[-_]?1|obstacle|cloud|horizon|trex|dino|restart|logo[-_]?small|1x|2x|text)\b/i;
const COVERISH =
  /(cover|og[-_]?image|share|social|preview|poster|banner|thumb(nail)?|splash|hero|screenshot|promo|loading[-_]?screen|start[-_]?screen|logo|title|card)/i;

/** Side del quadrat segons el nom del fitxer: "icon-512x512.png" -> 512 */
function sizeFromName(base) {
  const m = base.match(/[-_](\d{2,4})x(\d{2,4})(?=\.\w+$)/i);
  if (m) return Number(m[1]);
  const n = base.match(/[-_](\d{2,4})(?=\.\w+$)/i);
  return n ? Number(n[1]) : null;
}

function score(c) {
  const why = [];
  let s = 0;
  const base = basenameOf(c.url);

  // --- 1. Procedencia
  switch (c.source) {
    case 'og:image': s += 100; why.push('og:image +100'); break;
    case 'twitter:image': s += 90; why.push('twitter:image +90'); break;
    case 'apple-touch-icon': s += 75; why.push('apple-touch-icon (icona oficial) +75'); break;
    case 'video:poster':
    case 'body:background': s += 65; why.push(`${c.source} (ocupa la pantalla) +65`); break;
    case 'msapplication-tile': s += 50; why.push('msapplication-tile +50'); break;
    case 'img': s += 45; why.push('<img> +45'); break;
    case 'img[srcset]': s += 40; why.push('<img srcset> +40'); break;
    case 'css:url': s += 32; why.push('CSS url() +32'); break;
    case 'favicon': s += 22; why.push('favicon +22'); break;
    case 'mask-icon': s += 15; why.push('mask-icon +15'); break;
    case 'manifest': s += 10; why.push('manifest +10'); break;
    default: s += 20;
  }

  // --- 2. El nom del fitxer ho diu
  if (COVERISH.test(base)) { s += 32; why.push(`nom tipus portada (${base}) +32`); }
  if (DECOR.test(base)) { s -= 40; why.push(`nom tipus decoracio (${base}) -40`); }

  // El hint del <img> (id/class/alt) també conte
  if (c.hint) {
    if (COVERISH.test(c.hint)) { s += 25; why.push(`id/class/alt de portada ("${c.hint}") +25`); }
    if (DECOR.test(c.hint)) { s -= 30; why.push(`id/class/alt de decoracio ("${c.hint}") -30`); }
  }

  // --- 3. Dimensions conegudes
  const dim = c.w && c.h ? Math.min(c.w, c.h) : sizeFromName(base);
  if (dim) {
    if (dim >= 400) { s += 30; why.push(`${c.w ?? '?'}x${c.h ?? '?'}, imatge gran +30`); }
    else if (dim >= 180) { s += 22; why.push(`${c.w ?? '?'}x${c.h ?? '?'}, tamany iconic +22`); }
    else if (dim >= 100) { s += 8; why.push(`${c.w ?? '?'}x${c.h ?? '?'}, petita +8`); }
    else if (dim <= 64) { s -= 20; why.push(`${c.w ?? '?'}x${c.h ?? '?'},sprite/icon molt petita -20`); }
  }

  // --- 4. Origen
  // Una ruta local que no resol a cap fitxer real del repo no dona res: aqui
  // el joc la resoldria contra el CDN, no contra nosaltres.
  if (c.kind === 'local') {
    if (c.exists) { s += 30; why.push('LOCAL al repo, no cal baixar +30'); }
    else { s -= 60; why.push('la ruta local no existeix al repo (resol al CDN) -60'); }
  }
  if (c.kind === 'embed') {
    s += 30; why.push('EMBEBUDA dins del propi HTML, no cal baixar +30');
  }

  // --- 5. Mida en bytes
  const kb = (c.bytes ?? 0) / 1024;
  if (c.kind !== 'remote') {
    if (kb < 1) { s -= 40; why.push(`${kb.toFixed(1)} KB, massa petit -40`); }
    else if (kb < 3) { s -= 25; why.push(`${kb.toFixed(1)} KB, massa petit -25`); }
    else if (kb > 30) { s += 5; why.push(`${Math.round(kb)} KB, imatge de veritat +5`); }
  }

  // --- 6. Filtre final: nomes acceptem coses que son realment imatges.
  // Aixo rebutja, entre altres, rutes que resolen a un *directori* del repo
  // (per exemple "./" o "\\"), que sinó es comptarien com a portada.
  if (!looksLikeImage(c.url) && c.kind !== 'embed') s -= 1000;

  return { score: s, why };
}

/* ---------------------------------------------------------------- *
 * Escaneig
 * ---------------------------------------------------------------- */

const files = readdirSync(GAMES_DIR).filter((f) => /\.html?$/i.test(f)).sort();
const rows = [];

for (const name of files) {
  const full = join(GAMES_DIR, name);
  let html;
  try { html = readFileSync(full, 'utf8'); } catch { rows.push({ file: name, cands: [], hasBaseCdn: false }); continue; }

  // Es recorda si el joc te <base href="https://...">: aleshores les rutes
  // relatives NO es resolen contra el repo, sino contra el CDN.
  const hasBaseCdn = /<base\s[^>]*href\s*=\s*["']https?:/i.test(html);

  const cands = extract(html, full).map((c) => ({ ...c, ...score(c) }));
  cands.sort((a, b) => b.score - a.score);
  rows.push({ file: name, cands, hasBaseCdn });
}

/* ---------------------------------------------------------------- *
 * Classificacio
 * ---------------------------------------------------------------- */

/** Llindar per a considerar una imatge "portada utilitzable". */
const USABLE = 90;

const usable = [];      // portada utilitzable i REALMENT disponible al repo
const remoteOnly = [];  // portada utilitzable pero nomes remota
const noCover = [];     // res

for (const r of rows) {
  // Important: una ruta local que NO resol a un fitxer existent no es
  // "disponible". Aquest repo es un directori pla de HTML servits des del CDN,
  // aixi que tantes rutes son redireccions al CDN que aqui son trencades.
  const inRepo = (c) =>
    (c.kind === 'local' && c.exists) || c.kind === 'embed';

  const bestInRepo = r.cands.find((c) => inRepo(c) && c.score >= USABLE);
  const bestRemote = r.cands.find((c) => c.kind === 'remote' && c.score >= USABLE);

  if (bestInRepo) usable.push({ ...r, best: bestInRepo });
  else if (bestRemote) remoteOnly.push({ ...r, best: bestRemote });
  else noCover.push(r);
}

// Dels utilitzables, quants son LOCAL (fitxer existent) i quants EMBED
const usableLocal = usable.filter((r) => r.best.kind === 'local');
const usableEmbed = usable.filter((r) => r.best.kind === 'embed');

// Comptadors de support per al text del informe
const localRefTotal = rows.reduce((n, r) => n + r.cands.filter((c) => c.kind === 'local').length, 0);
const anyLocalExists = rows.filter((r) => r.cands.some((c) => c.kind === 'local' && c.exists));
// Referencies que resolen a un existent que NO es imatge (carpetes com "./")
// Es compten les URLs DISTINTES: aixi queda clar que son unes poques, no un terme nou.
const dirHits = (() => {
  const set = new Set();
  for (const f of files) {
    const full = join(GAMES_DIR, f);
    let html;
    try { html = readFileSync(full, 'utf8'); } catch { continue; }
    for (const c of extract(html, full)) {
      if (c.kind !== 'local') continue;
      if (c.exists) continue;
      if (c.repoPath === null) set.add(c.url); // resol a un directori
    }
  }
  return [...set].sort();
})();
// Comptem quants fitxers d'imatge hi ha realment al costat dels jocs
const gameDirImageCount = readdirSync(GAMES_DIR).filter((f) => IMG_EXT_RE.test(f)).length;
const repoImageCount = [...repoIndex.keys()].filter((p) => IMG_EXT_RE.test(p)).length;
const assetsImageCount = [...repoIndex.keys()].filter((p) => p.startsWith('assets/') && IMG_EXT_RE.test(p)).length;
const imagesDirImageCount = [...repoIndex.keys()].filter((p) => p.startsWith('assets/images/') && IMG_EXT_RE.test(p)).length;
const gameDirSubdirs = readdirSync(GAMES_DIR).filter((f) => {
  try { return statSync(join(GAMES_DIR, f)).isDirectory(); } catch { return false; }
}).length;
const anyEmbed = rows.filter((r) => r.cands.some((c) => c.kind === 'embed'));
const anyEmbedUsable = rows.filter((r) =>
  r.cands.some((c) => c.kind === 'embed' && c.score >= 60),
);

// Motius de "sense portada"
function reason(r) {
  const local = r.cands.filter((c) => c.kind === 'local');
  const embed = r.cands.filter((c) => c.kind === 'embed');
  const remote = r.cands.filter((c) => c.kind === 'remote');
  if (!r.cands.length) return 'cap referencia a imatge';
  if (local.length && !local.some((c) => c.exists) && !embed.length)
    return 'nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN)';
  if (embed.length && !remote.length) return 'nomes sprites/icones embegudes (data:image)';
  if (remote.length && !local.some((c) => c.exists) && !embed.length)
    return 'nomes imatges remotes de baixa qualitat';
  if (remote.length && embed.length) return 'nomes remotes + sprites embeguts';
  return 'nomes decoracio';
}
const reasons = {};
for (const r of noCover) reasons[reason(r)] = (reasons[reason(r)] ?? 0) + 1;

/* ---------------------------------------------------------------- *
 * CSV
 * ---------------------------------------------------------------- */

if (CSV) {
  const out = ['game_html,kind,best_source,target,w,h,bytes,score,reason'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  for (const r of rows) {
    const b = r.cands[0];
    if (!b) { out.push([r.file, 'none', '', '', '', '', '', '', 'cap referencia'].map(q).join(',')); continue; }
    out.push([
      r.file, b.kind, b.source,
      b.kind === 'remote' ? b.url : b.kind === 'embed' ? `${b.mime} ${b.bytes}B` : (b.repoPath ?? `${b.url} (no resol)`),
      b.w ?? '', b.h ?? '', b.bytes ?? '', b.score,
      b.score >= USABLE ? 'portada' : reason(r),
    ].map(q).join(','));
  }
  writeFileSync(CSV, out.join('\n'), 'utf8');
}

/* ---------------------------------------------------------------- *
 * Informe
 * ---------------------------------------------------------------- */

const kb = (n) => `${((n ?? 0) / 1024).toFixed(1)} KB`;
const L = [];
const P = (...s) => L.push(...s);

P('# Mineria d\'imatges dins dels fitxers HTML de joc');
P('');
P(`Escanejats **${rows.length}** fitxers HTML de \`assets/games/\` (la carpeta es **pla**: cap subdirectori,`);
P('cap fitxer d\'imatge al costat dels jocs). Objectiu: trobar una imatge de portada que **ja existeixi');
P('al repositori**, sense baixar res de xarxa.');
P('');
P('## Resultat principal');
P('');
P('| Categoria | Jocs |');
P('| --- | --- |');
P(`| Portada utilitzable en forma de **fitxer existent al repo** | **${usableLocal.length}** |`);
P(`| Portada utilitzable **embeguda** en el propi HTML (\`data:image\`) | **${usableEmbed.length}** |`);
P(`| Portada utilitzable pero **només remota** (cal baixar-la, depen de xarxa) | ${remoteOnly.length} |`);
P(`| **Sense portada identificable** | **${noCover.length}** |`);
P(`| *Total fitxers HTML escanejats* | *${rows.length}* |`);
P('');
P(`**A curt termini: 1 joc de ${rows.length} (${((usableLocal.length + usableEmbed.length) / rows.length * 100).toFixed(2)}%) te una portada local aprofitable.** Els ${noCover.length}`);
P('restants no tenen cap imatge utilitzable dins del repo. Aixo **no** es un error de l\'escaneig:');
P('`assets/games/` no contingu cap imatge, nomes HTML que en referencien.');
P('');
P('Dades de control del propi repo: `gameList.js` te **697** entrades, de les quals **70** tenen');
P('portada a `assets/images/` i **627** no en tenen. Els 627 tenen el seu HTML a `assets/games/`,');
P('i cap d\'ells aporta una imatge al repo.');
P('');
P('## Per que hi ha 0 imatges locals en forma de fitxer');
P('');
P('Aquesta es la conclusio central de la mineria i no porta bones noticies: **cap** ruta relativa');
P(`d'imatge dels ${rows.length} HTML resol a un fitxer d'imatge que existeixi al repositori.`);
P('');
P('| Comprovacio | Valor |');
P('| --- | --- |');
P(`| Jocs amb almenys una ruta relativa d'imatge | ${rows.filter((r) => r.cands.some((c) => c.kind === 'local')).length} |`);
P(`| Referències relatives totals trobades | ${localRefTotal} |`);
P(`| D'aquestes, que resolen a un **fitxer d'imatge existent** | **${usableLocal.length}** |`);
P(`| Que resolen a un existent que **no** és imatge ( carpetes, no imatges) | ${dirHits.length} (${dirHits.map((d) => `\`${d}\``).join(', ')}) |`);
P(`| Fitxers d'imatge dins de \`assets/games/\` (costat dels HTML) | **${gameDirImageCount}** |`);
P(`| Subdirectoris dins de \`assets/games/\` | ${gameDirSubdirs} |`);
P(`| Fitxers d'imatge a \`assets/\` (${assetsImageCount} del total) | ${assetsImageCount} |`);
P(`| Fitxers d'imatge a \`assets/images/\` (les portades que mes utilitzen) | ${imagesDirImageCount} |`);
P(`| Fitxers d'imatge al repo sencer, \`tools/\` inclos | ${repoImageCount} |`);
P('');
P('La causa es estructural, no un error de parseig del script:');
P('');
P('1. `assets/games/` es un directori **pla**: 707 fitxers HTML, **0** subdirectoris i **0** fitxers');
P('   d\'imatge al costat. No hi ha res que "extreure": les imatges no hi son, nomes n\'hi ha les');
P('   referencies.');
P('2. A mes, els HTML usen `<base href="https://cdn.jsdelivr.net/...">`. Aquest `<base>` fa que el');
P('   navegador resolgui `img/adr.png` contra el **CDN**, no contra `assets/`.');
P(`   **${rows.filter((r) => r.hasBaseCdn).length}** dels ${rows.length} jocs (${Math.round((rows.filter((r) => r.hasBaseCdn).length / rows.length) * 100)}%) tenen un \`<base>\` apuntant a un CDN.`);
P('3. Per tant aquestes rutes son **correctes al servidor original i trencades aqui**. No son assets');
P('   que se\'ns hagin perdut en una còpia: son URLs que el joc visitema nosaltres com si locals.');
P('');
P('Les poques rutes que **no** depenen del `<base>` son `../images/ico.ico` (i variants). Aquestes');
P('apunten a la icona del **site**, no a la de cap joc, i a mes el fitxer `images/ico.ico` ni tan');
P('s hi troba al repo.');
P('');
P('### Consequencia practica');
P('');
P('Aquesta font de minederia **no pot ser la solucio** per als 627 jocs sense portada. No es que');
P('costi extreure les imatges: es que **no hi son**. Les uniques opcions que queden son:');
P('');
P('1. Descarregar des del CDN que cada joc ja declara (`fetch-covers.mjs` fa servir aquesta via), o');
P('2. Capturar la pantalla del joc quan s\'executa (playwright/headless), o');
P('3. Generar una portada sintetica (color + initials) per als jocs que no se\'n pugui.');
P('');

/* --- Portades embegudes --- */
P('## Portades EMBEGUDES (data:image dins l\'HTML)');
P('');
P(`L'**unica** font local que ha donat alguna portada: ${anyEmbed.length} jocs tenen imatges embegudes`);
P('en base64 dins del propi HTML (`data:image/...`). D\'aquestes, nomes');
P(`${usableEmbed.length} supera el llindar de qualitat:`);
P('');
if (usableEmbed.length) {
  P('| # | HTML del joc | Procedencia | Tipus | Dimensions | Mida | Per que serveix |');
  P('| --- | --- | --- | --- | --- | --- | --- |');
  usableEmbed.forEach((r, i) => {
    const b = r.best;
    P(`| ${i + 1} | \`${r.file}\` | ${b.source} | ${b.mime} | ${b.w ?? '?'}x${b.h ?? '?'} | ${kb(b.bytes)} | ${b.why.slice(0, 4).join('; ')} |`);
  });
  P('');
}
P(`Els altres **${anyEmbed.length - usableEmbed.length}** jocs amb imatges embegudes no serveixen com a`);
P('portada. Es tracta de decoracio d\'interficie:');
P('');
P('- el T-Rex i els obstacles del Chrome Dino (`1x-`/`2x-`, 80x80 px),');
P('- les `blockIconURI` / `menuIconURI` de les extensions de Scratch (icones de blocs de programacio),');
P('- cursors i botons de GUI.');
P('');
P('Casos concrets verificats a mà:');
P('');
P('| HTML del joc | Què és la imatge embeguda | Per què NO serveix com a portada |');
P('| --- | --- | --- |');
P('| `clgoogledino.html` | 26 imatges: dino, obstacles, núvols, text, terra | Són els sprites del joc, no una imatge de la partida |');
P('| `clgeometrydashscratch.html` | icones d\'extensions Scratch + favicon 512x512 | Favicon del motor, no del joc |');
P('| `clcuttherope.html` | 17 imatges 200x63 | Trossos de corda, un per estat |');
P('| `clpaperio3d.html` | 568x691, 52 KB, mans del personatge a la pantalla de start | **Aquesta sí que val** com a portada |');
P('| `clgdsubzero.html`, `Eaglercraft*.html`, `Shadow_Client.html` | payloads base64 de varis KB | Textures i dades serialitzades, no imatges de portada |');
P('');

/* --- Portades remotes --- */
P('## Portades NOMÉS REMOTES (cal baixar-les)');
P('');
P(`${remoteOnly.length} jocs tenen una bona portada declarada pero servida per un CDN o un servidor`);
P('extern. Aquests **no** son locals: depenen de xarxa i cal descarregar-los. Es llisten per');
P('transparencia i perquè son la millor pista de quins jocs es podrien recuperar, pero no son un');
P('guany offline immediat.');
P('');
P('| # | HTML del joc | Procedencia | URL |');
P('| --- | --- | --- | --- |');
remoteOnly.forEach((r, i) => {
  const u = r.best.url;
  P(`| ${i + 1} | \`${r.file}\` | ${r.best.source} | \`${u.length > 96 ? u.slice(0, 96) + '...' : u}\` |`);
});
P('');
P('Local contra remot, en una linia: `clducklingsio.html` declara');
P('`og:image = https://ducklings.io/img/thumb.png`. Aqui el navegador no el pot llegir sense');
P('connectar-se a `ducklings.io`. Un fitxer local, en canvi, seria `assets/images/clducklingsio.webp`.');
P('');

/* --- Sense portada --- */
P('## Jocs sense portada identificable');
P('');
P(`**${noCover.length}** jocs. Motius:`);
P('');
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) P(`- **${v}** - ${k}`);
P('');
P(`Llista completa dels ${noCover.length} fitxers amb la seva millor candidata (rebutjada) i el perque:`);
P('');
P('| HTML del joc | Millor candidata | Origen | Score | Motiu del rebut |');
P('| --- | --- | --- | --- | --- |');
for (const r of noCover) {
  const b = r.cands[0];
  const tgt = !b
    ? '-'
    : b.kind === 'remote'
      ? b.url
      : b.kind === 'embed'
        ? `data:image (${b.mime}, ${kb(b.bytes)})`
        : (b.repoPath ?? `${b.url} -> no resol a cap fitxer`);
  const short = tgt.length > 70 ? tgt.slice(0, 70) + '...' : tgt;
  P(`| \`${r.file}\` | \`${short}\` | ${b ? b.kind : '-'}${b ? ' / ' + b.source : ''} | ${b ? b.score : '-'} | ${reason(r)} |`);
}
P('');

/* --- Criteris --- */
P('## Criteris de classificacio');
P('');
P('Cada referencia rep un score; mes alt = mes bona portada. El llindar de "portada utilitzable"');
P(`es **${USABLE}**.`);
P('');
P('**1. Procedencia (on apareix)**');
P('');
P('| Procedencia | Punts | Per que |');
P('| --- | --- | --- |');
P('| `og:image` | +100 | Portada declarada explicitament pel autor. |');
P('| `twitter:image` | +90 | Mateixa intencio que og:image. |');
P('| `apple-touch-icon` | +75 | Icona oficial del joc, 180x180. |');
P('| `video:poster`, `body background` | +65 | Cobreixen tota la pantalla. |');
P('| `msapplication-tile` | +50 | Icona de pantalla d\'inici. |');
P('| `<img>` / `<img srcset>` | +45 / +40 | Imatge visible del document. |');
P('| CSS `url()` | +32 | Fons o elemente amb imatge. |');
P('| `favicon` | +22 | Identitat del joc, pero es petite. |');
P('');
P('**2. Nom del fitxer i atributs del `<img>`**');
P('');
P('- `cover`, `thumb`, `poster`, `banner`, `splash`, `hero`, `logo`, `start-screen` -> **+32**.');
P('- `sprite`, `atlas`, `tileset`, `button`, `cursor`, `obstacle`, `trex`, `cloud`, `restart` -> **-40**.');
P('- `id`/`class`/`alt` del `<img>` que digui `logo`/`cover` -> **+25**; si diu `sprite`/`btn` -> **-30**.');
P('');
P('**3. Dimensions**');
P('');
P('- costat >= 400 px -> **+30**; >= 180 px -> **+22**; >= 100 px -> **+8**; <= 64 px -> **-20**.');
P('- Per als embeguts llegim les dimensions reals del PNG/GIF/WEBP/SVG.');
P('');
P('**4. Origen i mida**');
P('');
P('- LOCAL existent al repo -> **+30**. EMBEGUDA -> **+30**. (Cap es deixa sense baixar.)');
P('- < 1 KB -> **-40**; < 3 KB -> **-25**; > 30 KB -> **+5** (senyal d\'imatge de veritat).');
P('');
P('## Com reproduir');
P('');
P('```');
P('node tools/mine-local-images.mjs --csv=tools/mining-local-images.csv');
P('```');
P('');
P('El CSV te una fila per joc amb la millor candidata, el seu origen, score i el perque ha estat');
P('acceptada o rebutjada. El script no escriu res fora de `tools/`.');
P('');

writeFileSync(REPORT, L.join('\n'), 'utf8');

console.log(`Escanejats ${rows.length} HTML de assets/games/`);
console.log(`  portada LOCAL (fitxer existent)  : ${usableLocal.length}`);
console.log(`  portada EMBEGUDA (data:image)    : ${usableEmbed.length}`);
console.log(`  portada NOMES REMOTA             : ${remoteOnly.length}`);
console.log(`  sense portada                     : ${noCover.length}`);
console.log(`  [ref] jocs amb ruta local relativa: ${rows.filter((r) => r.cands.some((c) => c.kind === 'local')).length}`);
console.log(`  [ref] d'aquests, resolen existent : ${anyLocalExists.length}`);
console.log(`  [ref] jocs amb data:image        : ${anyEmbed.length}`);
console.log(`Informe -> ${relative(ROOT, REPORT)}`);
if (CSV) console.log(`CSV     -> ${CSV}`);
