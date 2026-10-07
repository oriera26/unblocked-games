/**
 * Fase 1.2 · Descarga de portades.
 *
 * Objectiu: que TOTES les targetes del llistat tinguin una portada servida
 * des del mateix origen. Cap fitxer d'assets/images/ ha de dependre d'un
 * servidor extern en marxa, i cap ruta de gameList.js pot quedar penjant.
 *
 * Es busca en quatre capes, de la mes fiable a la menys:
 *
 *   1. LOCAL    ja hi ha una portada a assets/images/ (cero xarxa)
 *   2. HTML     el mateix HTML del joc en declara una: og:image,
 *               apple-touch-icon, <img>, CSS o una embeguda en base64. Si el
 *               document te <base href="https://cdn...">, les rutes
 *               relatives es resolen contra AQUELL CDN, que es on vivia el
 *               joc: la imatge es pot baixar igual, de la font original.
 *   3. ARBRE    el mateix <base>, pero fent servir la llista completa dels
 *               fitxers del repo (fetch-trees.mjs). Es filtren les imatges
 *               de la carpeta del joc i es puntua cada una pel nom i el pes:
 *               es tria la portada de veritat en lloc d'endevinar-la.
 *   4. PROBE    si no tenim l'arbre, es sondeja una llista de noms tipics
 *               (cover.png, logo.png, thumbnail.jpg...) dins la carpeta.
 *   5. CERCA    es pregunta al buscador d'imatges pel nom del joc
 *               (Yandex / Bing a través de r.jina.ai) i es puntua cada
 *               resultat: quadrat, gran, amb el nom a l'URL, domini de
 *               jocs. Es la capa mes efectiva per als jocs que no tenen
 *               <base> ni repositori darrere.
 *   6. PORTAL   poki, crazygames, lagged... via r.jina.ai, que si que es
 *               pot llegir des d'aqui.
 *
 * El que es baixa sempre passa per images.weserv.nl, que la retalla a
 * 400x400 i la converteix a webp: les ~700 targetes pesen el mateix.
 *
 *   node tools/fetch-covers.mjs                informa, no escriu res
 *   node tools/fetch-covers.mjs --apply        baixa i enganxa els paths
 *   node tools/fetch-covers.mjs --apply --limit=20
 *   node tools/fetch-covers.mjs --apply --only="granny,bowmasters"
 *   node tools/fetch-covers.mjs --apply --placeholders      les sintetiques
 *   node tools/fetch-covers.mjs --apply --duplicated        les compartides
 *   node tools/fetch-covers.mjs --apply --no-probe --no-portal
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

import { readGameList, writeGameList } from './lib/gameList.mjs';
import {
  IMAGES_DIR,
  coverBasename,
  coverFileName,
  findExistingCover,
  toSlug,
} from './lib/games.mjs';
import {
  MIN_BYTES,
  OUT_EXT,
  PROBE_NAMES,
  SMALLEST_USABLE,
  claimContent,
  contentHash,
  decodeEntities,
  headExists,
  mineHtml,
  normalize,
  seedTaken,
  sniffImage,
} from './lib/covers.mjs';
import { ROOT } from './lib/games.mjs';
import { nowISO, updateSection } from './lib/report.mjs';
import { parseBase, jsdelivrUrl } from './lib/cdn.mjs';
import { loadTree, rankFolder, rankRepoRoot } from './lib/treeCovers.mjs';
import { coverFromDocs } from './lib/repoDocs.mjs';
import { searchCovers, MIN_SCORE } from './lib/imgSearch.mjs';

const arg = (name, fallback = '') =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=').slice(1).join('=');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(arg('limit', '0'));
const ONLY = arg('only');
const ONLY_FILE = arg('only-file');
const CONCURRENCY = Number(arg('concurrency', '8'));
const USE_PROBE = !process.argv.includes('--no-probe');
const USE_TREE = !process.argv.includes('--no-tree');
const USE_DOCS = !process.argv.includes('--no-docs');
const USE_PORTAL = !process.argv.includes('--no-portal');
const USE_IMGSEARCH = !process.argv.includes('--no-imgsearch');
/** Printa el resultat de cada joc, no només cada 25. */
const VERBOSE = process.argv.includes('--verbose');
/** Torna a buscar portada fins i tot als jocs que ja en tenen de bo. */
const DUP = process.argv.includes('--duplicated');
const REPLACE = process.argv.includes('--replace') || DUP;

const REPORT = join(import.meta.dirname, 'covers-report.md');
const LOG = join(import.meta.dirname, 'fetch-covers.log');
const SOURCES = join(import.meta.dirname, 'covers-sources.json');

/**
 * Candau perquè un altre programa sàpiga que hi ha una resolució en marxa
 * (check-all.mjs hi espera en lloc de còrrer-ne una de paral·lela que
 * escriuria gameList.js a mig camí). Si el procés que el va deixar ja no
 * viu, el candau es considera mort i es rebutja.
 */
const LOCK = join(import.meta.dirname, 'tmp', 'fetch-covers.lock');

function takeLock() {
  mkdirSync(join(import.meta.dirname, 'tmp'), { recursive: true });
  try {
    const old = JSON.parse(readFileSync(LOCK, 'utf8'));
    process.kill(old.pid, 0);
    return false; // algú altre treballa ara mateix
  } catch {
    /* candau inexistent o del procés mort */
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), 'utf8');
  const drop = () => {
    try {
      rmSync(LOCK, { force: true });
    } catch {
      /* ja desaparegut */
    }
  };
  process.on('exit', drop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { drop(); process.exit(130); });
  return true;
}

/* ---------------------------------------------------------------- *
 * Configuracio
 * ---------------------------------------------------------------- */

const JINA = 'https://r.jina.ai/';
const SCORE_MIN = 40; // llindar per acceptar una candidata declarada
const IMG_MIN = 75; // llindar per acceptar el resultat d'una cerca d'imatges
const ARBRE_MIN = 30; // per sota d'aixo, triar una imatge de la carpeta es una aposta
const PORTAL_TIMEOUT = 20000;
const PROBE_BATCH = 8;
const PROBE_TIMEOUT = 4500;
const LAYERS = `local${REPLACE ? ' (--replace)' : ''} + html + arbre${USE_TREE ? '' : ' (no)'}${USE_TREE && USE_DOCS ? ' + readme' : ''}${USE_PROBE ? ' + probe' : ''}${USE_IMGSEARCH ? ' + cerca imatges' : ''}${USE_PORTAL ? ' + portal' : ''}`;

/**
 * Portals alternatius per ordre de preferència. poki aguanta molt bé;
 * la resta son el pla B per als jocs que poki no coneix.
 */
const PORTALS = [
  { name: 'poki', page: (s) => `https://poki.com/en/g/${s}/` },
  { name: 'crazygames', page: (s) => `https://www.crazygames.com/game/${s}` },
  { name: 'html5games.club', page: (s) => `https://html5games.club/${s}` },
  { name: 'lagged', page: (s) => `https://lagged.com/en/game/${s}` },
];

/* ---------------------------------------------------------------- *
 * Utils
 * ---------------------------------------------------------------- */

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        const why = String(err?.stack ?? err).slice(0, 200);
        results[i] = { ok: false, reason: 'error intern', tried: [] };
        console.error('  ! ' + (items[i]?.url ?? '?') + ' -> ' + why);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * La targeta és pràcticament quadrada, així que la portada ho ha de ser
 * força: `object-fit: cover` retalla els costats, però una imatge de
 * 564x106 (un logo de franja o un full d'sprites) es converteix en una
 * tira al mig de la targeta. S'accepta fins a una relació 2:1, que és el
 * que tenen els cartells 16:9; més enllà ja no és una portada.
 */
function minSideOk(info) {
  if (!info?.width || !info?.height) return true; // SVG o dimensions desconegudes
  if (Math.min(info.width, info.height) < SMALLEST_USABLE) return false;
  const ratio = Math.max(info.width / info.height, info.height / info.width);
  return ratio <= 2;
}

/* ---------------------------------------------------------------- *
 * Capa 3 · Sondes sobre la carpeta del CDN
 * ---------------------------------------------------------------- */

/**
 * Noms a provar dins la carpeta del <base>. A mes del catàleg generic,
 * el nom del propi directori del joc, que molts autors reutilitzen.
 */
function probeNames(base) {
  let folder = '';
  try {
    folder = decodeURIComponent(new URL(base).pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    /* base no parseable: nomes el catàleg generic */
  }

  const names = [...PROBE_NAMES];
  const stem = folder.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  if (stem) names.unshift(`${stem}.png`, `${stem}.jpg`, `${stem}.webp`);
  return [...new Set(names)];
}

async function probeBase(base) {
  const names = probeNames(base);

  for (let i = 0; i < names.length; i += PROBE_BATCH) {
    const slice = names.slice(i, i + PROBE_BATCH);
    const hits = await Promise.all(
      slice.map(async (name) => {
        const url = new URL(name, base).href;
        return (await headExists(url, { timeout: PROBE_TIMEOUT })) ? url : null;
      })
    );
    const hit = hits.find(Boolean);
    if (hit) return hit;
  }

  return null;
}

/* ---------------------------------------------------------------- *
 * Capa 4 · Portals
 * ---------------------------------------------------------------- */

/**
 * Llegeix la pagina del joc via r.jina.ai i en treu la portada.
 *
 * r.jina.ai no torna un codi HTTP d'error sino el TEXT de la pagina
 * d'error del portal. Sense aquesta comprovació, un joc que no hi existeix
 * passaria per "pagina valida" i ens donaria el logo del site.
 */
async function fromPortal(portal, slug) {
  let text;
  try {
    const res = await fetch(JINA + portal.page(slug), {
      headers: { 'user-agent': 'ulaGames-covers/2.0' },
      signal: AbortSignal.timeout(PORTAL_TIMEOUT),
    });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }

  const head = text.slice(0, 400).toLowerCase();
  if (
    head.includes('page not found') ||
    head.includes('404 not found') ||
    head.includes('error 404') ||
    head.includes('site not found') ||
    text.trim().length < 200
  ) {
    return null;
  }

  const urls = [
    ...new Set(
      text.match(/https?:\/\/[^\s\)\]\}"'<>\\]+?\.(?:png|jpe?g|webp|avif)(?:\?[^\s\)\]\}"'<>\\]*)?/gi) ?? []
    ),
  ];
  if (!urls.length) return null;
  return pickBySlug(urls, slug);
}

/** Tria la imatge que mes sembla la portada del joc dintre d'una llista. */
function pickBySlug(urls, slug) {
  const squash = (x) => x.replace(/[^a-z0-9]+/g, '');
  const flatSlug = squash(slug);
  const scored = [];

  for (const url of urls) {
    const lower = url.toLowerCase();
    let score = 0;
    if (lower.includes(`/${slug}`) || lower.includes(`-${slug}`) || lower.includes(`${slug}.`)) score += 100;
    if (/-logo|-cover|-thumb|-poster|-splash/.test(lower)) score += 20;
    if (/\/flag|\/badge|\/logo|\/icon|\/favicon|sprite|placeholder|no-?image|\/ads?\//i.test(lower)) score -= 60;
    const dim = lower.match(/width=(\d+)/);
    if (dim) score += Math.min(Number(dim[1]) / 10, 40);

    /**
     * La URL de les imatges de crazygames i companyia porta el joc a dins
     * (`/games/mahjongg-solitaire/cover_16x9.png`). Si el joc que surt hi
     * es un altre, la pagina que hem llegit no es la del joc demanat sinó
     * una cerca o un 404, i el que baixariem es la imatge que el portal
     * posa per defecte per a tots els jocs que no troba.
     */
    const m = lower.match(/\/games?\/([a-z0-9][a-z0-9-]{1,60})(?:[/_]|\.|$)/);
    if (m && flatSlug) {
      const found = squash(m[1]);
      if (found === flatSlug || found.includes(flatSlug) || flatSlug.includes(found)) score += 100;
      else score -= 300;
    }

    if (score > 0) scored.push({ url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

/* ---------------------------------------------------------------- *
 * Portada sintetica (ultima capa, sense xarxa)
 * ---------------------------------------------------------------- */

/**
 * Portada local per a un joc que no ha donat cap imatge de veritat.
 * Es genera aqui mateix, sense xarxa: SVG de 400x400 amb el titol, de
 * manera que la targeta no mostra mai un requadre buit ni una URL trencada.
 */
function makePlaceholder(name, base) {
  const text = decodeEntities(String(name)).replace(/[<>&"']/g, '').trim() || 'Joc';
  const shown = text.length > 30 ? `${text.slice(0, 29)}…` : text;

  // El color surt del nom del fitxer: el mateix joc, sempre el mateix.
  let hash = 0;
  for (const ch of base) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const hue2 = (hue + 48) % 360;

  const words = shown.split(/\s+/).filter(Boolean);
  const lines = words.length <= 2 ? [shown] : [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')];
  const fontSize = lines.length > 1 ? 34 : shown.length > 14 ? 40 : 46;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="${text}" data-cover="placeholder">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 62% 26%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 58% 14%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="330" cy="86" r="112" fill="hsl(${hue2} 70% 40%)" opacity="0.16"/>
  <circle cx="70" cy="330" r="92" fill="hsl(${hue} 80% 60%)" opacity="0.14"/>
  <rect x="28" y="28" width="344" height="344" rx="28" fill="none" stroke="hsl(${hue} 70% 70%)" stroke-opacity="0.22" stroke-width="2"/>
${lines
    .map(
      (line, i) =>
        `  <text x="200" y="${lines.length > 1 ? 190 + i * 44 : 208}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="0.94" text-anchor="middle">${line}</text>`
    )
    .join('\n')}
</svg>
`;

  return Buffer.from(svg, 'utf8');
}

/* ---------------------------------------------------------------- *
 * Taca un joc
 * ---------------------------------------------------------------- */

/**
 * @returns {Promise<{ok: boolean, via?: string, layer?: string, src?: string,
 *   buf?: Buffer, info?: object, bytes?: number, file?: string, reason?: string,
 *   tried?: string[]}>}
 */
async function resolveCover(entry) {
  const base = coverBasename(entry.url);
  const slug = toSlug(entry.name);
  const tried = [];

  /* --- 1. portada ja present a assets/images/ ------------------- */
  if (!REPLACE) {
    const existing = findExistingCover(entry.url);
    if (existing) {
      const buf = readFileSync(join(IMAGES_DIR, existing));
      const info = sniffImage(buf);
      if (info && minSideOk(info) && buf.length >= MIN_BYTES) {
        return { ok: true, via: 'local', layer: 'ja hi era', file: existing, bytes: buf.length, info };
      }
      tried.push(`local: ${existing} no serveix (${info ? `${info.width}x${info.height}` : 'no identifiable'})`);
    }
  }

  /* --- 2. el que declara el mateix HTML del joc ------------------ */
  const htmlFile = join(ROOT, 'assets', 'games', /\.html?$/i.test(entry.url) ? entry.url : `${entry.url}.html`);
  if (!existsSync(htmlFile)) return { ok: false, reason: 'sense-html', tried };

  const mined = mineHtml(readFileSync(htmlFile, 'utf8'), htmlFile);

  /**
   * Converteix una candidata declarada en portada, o null si no val.
   * Els dos tipus sense xarxa (fitxer del repo i data:image) es resolen
   * primer de tot: son gratis i sempre originals.
   */
  const take = async (c) => {
    // fitxer que ja es del repo: es fa servir tal qual
    if (c.kind === 'local') {
      const buf = readFileSync(join(ROOT, c.url));
      const info = sniffImage(buf);
      if (info && minSideOk(info) && buf.length >= MIN_BYTES && claimContent(buf, entry.url)) {
        return { ok: true, via: 'html-local', layer: c.source, bytes: buf.length, info, copyFrom: c.url };
      }
      return null;
    }

    // imatge embeguda en el propi HTML: es desa a disc
    if (c.kind === 'embed') {
      if (minSideOk(c.info) && c.buf.length >= MIN_BYTES) {
        return { ok: true, via: 'html-embed', layer: c.source, buf: c.buf, bytes: c.buf.length, info: c.info };
      }
      return null;
    }

    tried.push(`html: ${c.url.slice(0, 100)}`);
    const got = await normalize(c.url, entry.url);
    if (!got) return null;
    if (!minSideOk(got.info)) {
      tried.push(`html: massa petita (${got.info.width}x${got.info.height})`);
      return null;
    }
    return { ok: true, via: 'html-remote', layer: c.source, buf: got.buf, bytes: got.buf.length, info: got.info, src: got.url };
  };

  /* --- 2a. metadate explicit: og:image, twitter:image, icon 180 --- */
  for (const c of mined.cands.filter((c) => c.score >= 90)) {
    const got = await take(c);
    if (got) return got;
  }

  /* --- 2b. la carpeta del CDN on viu el joc ---------------------- */
  // Va abans que la resta de candidates perquè tots els noms que es
  // sonden són de portada (cover, logo, thumbnail...) i el que declara un
  // <img> dins el joc sol ser un sprite del joc mateix.
  if (USE_TREE && mined.base) {
    const info = parseBase(mined.base);
    if (info && info.kind !== 'npm') {
      const folder = (info.folder ?? '').replace(/^\/+|\/+$/g, '');

      /**
       * Es mira el ref exacte del joc i, si no hi ha res, la branca per defecte
       * del mateix repo. Els jocs de UGS es tornen a pujar a `main` quan es
       * re-ripen, i la portada hi sol ser; el sha antic, no.
       */
      const refs = [...new Set([info.ref, 'main', 'master'])];
      for (const ref of refs) {
        const tree = loadTree(info.owner, info.repo, ref);
        if (!tree) continue;

        const cands = [
          ...rankFolder(tree, folder, { max: 3, hint: entry.name }),
          ...rankRepoRoot(tree, folder, { max: 1, hint: entry.name }),
        ].filter((c) => c.score >= ARBRE_MIN);
        if (!cands.length) continue;

        for (const c of cands) {
          const remote = jsdelivrUrl(info.owner, info.repo, ref, c.path);
          tried.push(`arbre@${ref}: ${c.path.split('/').pop()} (${c.score}p)`);
          const got = await normalize(remote, entry.url);
          if (got && minSideOk(got.info)) {
            return {
              ok: true,
              via: 'arbre',
              layer: `${c.path.split('/').pop()} · ${c.why.slice(-2).join(' · ')}`,
              buf: got.buf,
              bytes: got.buf.length,
              info: got.info,
              src: remote,
            };
          }
          tried.push(`arbre@${ref}: ${c.path.split('/').pop()} descartada (massa petita o no és imatge)`);
        }
      }

      if (!refs.some((ref) => loadTree(info.owner, info.repo, ref))) {
        tried.push('arbre: repo encara no llistat');
      }

      /* 3b. el README del repo: molts jocs d'Unity no tenen res a la carpeta
         però sí que tenen la portada en el llistat del README. */
      if (USE_DOCS) {
        const remote = await coverFromDocs(info, (info.folder ?? '').replace(/^\/+|\/+$/g, ''));
        if (remote) {
          tried.push(`readme: ${remote.split('/').pop()}`);
          const got = await normalize(remote, entry.url);
          if (got && minSideOk(got.info)) {
            return {
              ok: true,
              via: 'readme',
              layer: 'portada declarada al README del repo',
              buf: got.buf,
              bytes: got.buf.length,
              info: got.info,
              src: remote,
            };
          }
          tried.push('readme: la imatge es massa petita');
        }
      }
    }
  }

  /* --- 2c. el fons de carrega que declara el propi joc ---------------- */
  // L'envolupador d'Unity deixa la imatge que es veu abans que el joc
  // arrenqui. No es tan bona portada com un cover.png triat a ma, pero es
  // molt millor que el logo d'un portal, i nomes costa una peticio.
  for (const c of mined.cands.filter((c) => c.source === 'unity:background')) {
    const got = await take(c);
    if (got) return got;
  }

  if (USE_PROBE && mined.base && /^https?:/i.test(mined.base)) {
    const hit = await probeBase(mined.base);
    if (hit) {
      tried.push(`probe: ${hit.split('/').pop()}`);
      const got = await normalize(hit, entry.url);
      if (got && minSideOk(got.info)) {
        return { ok: true, via: 'probe', layer: 'carpeta del CDN', buf: got.buf, bytes: got.buf.length, info: got.info, src: hit };
      }
      tried.push('probe: la imatge es massa petita');
    } else {
      tried.push('probe: cap nom conegut');
    }
  }

  /* --- 2c. la resta d'imatges declarades, per score -------------- */
  for (const c of mined.cands.filter((c) => c.score >= SCORE_MIN && c.score < 90)) {
    const got = await take(c);
    if (got) return got;
  }

  /* --- 3. cerca d'imatges pel titol ----------------------------- */
  // Es l'ultima carta abans dels portals i, de lluny, la mes efectiva:
  // pregunta pel nom exacte del joc i tria entre ~150 resultats el que
  // mes sembla portada (quadrat, gran, amb el nom a l'URL, domini de jocs).
  if (USE_IMGSEARCH && entry.name) {
    let cands = [];
    try {
      cands = await searchCovers(entry.name);
    } catch (err) {
      tried.push(`cerca: ${String(err.message ?? err).slice(0, 60)}`);
    }

    const good = cands.filter((c) => c.score >= IMG_MIN);
    if (!good.length) tried.push(`cerca: ${cands.length} resultats, cap puntua ${IMG_MIN}`);

    for (const c of good.slice(0, 6)) {
      let host = '';
      try {
        host = new URL(c.url).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      tried.push(`cerca: ${host} (${c.score}${c.w ? ` · ${c.w}x${c.h}` : ''})`);

      const got = await normalize(c.url, entry.url);
      if (got && minSideOk(got.info)) {
        return {
          ok: true,
          via: 'imatges',
          layer: `${host} · ${c.alt ? String(c.alt).slice(0, 60) : 'portada'}`,
          buf: got.buf,
          bytes: got.buf.length,
          info: got.info,
          src: c.url,
        };
      }
      tried.push(`cerca: ${host} descartada (no es una imatge utilitzable)`);
    }
  }

  /* --- 3. portals ---------------------------------------------- */
  if (USE_PORTAL && slug) {
    for (const portal of PORTALS) {
      const remote = await fromPortal(portal, slug);
      if (!remote) continue;
      tried.push(`portal ${portal.name}`);
      const got = await normalize(remote, entry.url);
      if (got && minSideOk(got.info)) {
        return { ok: true, via: 'portal', layer: portal.name, buf: got.buf, bytes: got.buf.length, info: got.info, src: remote };
      }
    }
  }

  return { ok: false, reason: 'sense-portada', tried };
}

/* ---------------------------------------------------------------- *
 * Main
 * ---------------------------------------------------------------- */

const { header, decl, entries, footer } = readGameList();

/** Una portada sintetica porta aquesta marca: aixi es pot tornar a intentar. */
const PLACEHOLDER_MARK = 'data-cover="placeholder"';

/** Etiqueta dins el nom del fitxer: una portada mai no en porta. */
function isPlaceholderFile(file) {
  let head;
  try {
    head = readFileSync(join(IMAGES_DIR, file)).subarray(0, 600).toString('utf8');
  } catch {
    return false;
  }
  if (head.includes(PLACEHOLDER_MARK)) return true;
  // Les generades abans de tenir la marca es reconeixen pel dibuix: el
  // degradat "g" i el marc arrodonit de 28 px son prou unics per identifying.
  return head.includes('linearGradient id="g"') && head.includes('rx="28"');
}

/** Un joc es dona per bo si te path i el fitxer existeix de veritat. */
function satisfied(entry) {
  if (!entry.image) return false;
  if (!/^assets\/images\//.test(entry.image)) return false;
  const file = entry.image.slice('assets/images/'.length);
  if (!existsSync(join(ROOT, entry.image))) return false;
  // Les portades sintetiques no son portada: es tornen a intentar.
  return !isPlaceholderFile(file);
}

const pending = REPLACE ? entries : entries.filter((e) => !satisfied(e));
let targets = pending;

/**
 * `--duplicated` torna a buscar portada als jocs que en comparteixen una
 * amb un altre: passa quan dos jocs acaben agafant la mateixa imatge d'un
 * repositori compartit. Funciona sobre tot el llistat, no nomes els
 * pendents, perque la portada compartida en si ja es considera bona.
 */
if (process.argv.includes('--duplicated')) {
  const times = new Map();
  for (const e of entries) if (e.image) times.set(e.image, (times.get(e.image) ?? 0) + 1);
  targets = entries.filter((e) => (times.get(e.image) ?? 0) > 1);
}

/** `--placeholders` limita el treball a les que van quedar sense portada. */
const ONLY_PLACEHOLDERS = process.argv.includes('--placeholders');

/**
 * `--only=clgranny,clbowmasters` filtra per substring; `--only-file=f`
 * (un url per línia) filtra per equivalència exacta, que és el que es vol
 * quan la llista surt d'una auditoria i no es vol que `clvex3` s'emporti
 * `clvex3xmas` de reball.
 */
const wantedOnly = ONLY.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const exactOnly = ONLY_FILE
  ? readFileSync(ONLY_FILE, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => coverBasename(s))
  : [];

if (wantedOnly.length || exactOnly.length) {
  targets = targets.filter((e) => {
    const base = coverBasename(e.url).toLowerCase();
    if (exactOnly.length && exactOnly.includes(base)) return true;
    if (exactOnly.length && !wantedOnly.length) return false;
    return wantedOnly.some(
      (w) =>
        e.name.toLowerCase().includes(w) ||
        base.includes(w) ||
        toSlug(e.name).includes(w)
    );
  });
}
if (ONLY_PLACEHOLDERS) {
  targets = targets.filter((e) => !e.image || isPlaceholderFile(e.image.slice('assets/images/'.length)));
}
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

if (!takeLock()) {
  console.error(
    `Ja hi ha una resolució de portades en marxa (candau ${LOCK}).\n` +
      `Espera que acabi o esborra el candau si saps que el procés ja no viu.`
  );
  process.exit(2);
}

/**
 * Les imatges que ja són portada d'un altre joc queden reservades: el que
 * es resolgui ara no les podrà tornar a triar. Les dels jocs que es
 * tornen a resoldre no compten, perquè aquella portada es canvia igual.
 */
{
  const replacing = new Set(targets.map((e) => e.url));
  const pairs = [];
  for (const e of entries) {
    if (replacing.has(e.url)) continue;
    const f = (e.image ?? '').slice('assets/images/'.length);
    if (!f) continue;
    try {
      pairs.push([contentHash(readFileSync(join(IMAGES_DIR, f))), e.url]);
    } catch {
      /* fitxer desaparegut: no reserva res */
    }
  }
  seedTaken(pairs);
}

console.log(`Jocs al llistat           : ${entries.length}`);
console.log(`Amb portada ja engegida  : ${entries.length - pending.length}`);
console.log(`A resoldre                : ${targets.length}${targets.length === pending.length ? '' : ` (de ${pending.length} pendents)`}`);
console.log(`Mode                     : ${APPLY ? 'APPLY' : 'informe'}`);
console.log(`Capades                  : ${LAYERS}`);
console.log('');

const started = Date.now();
let done = 0;

const logLines = [`# fetch-covers ${nowISO()}`, `mode=${APPLY ? 'apply' : 'informe'} objectiu=${targets.length}`, ''];
const log = (line) => {
  logLines.push(line);
  if (done % 10 === 0 || done === targets.length) writeFileSync(LOG, logLines.join('\n'), 'utf8');
};

const results = await mapLimit(targets, CONCURRENCY, async (entry) => {
  const res = await resolveCover(entry);
  done++;
  const rate = ((Date.now() - started) / 1000 / done).toFixed(2);
  const detail = res.ok ? `${res.via}${res.layer ? ` · ${res.layer}` : ''}` : res.reason;
  log(`[${String(done).padStart(3)}/${targets.length}] ${res.ok ? 'OK  ' : '--  '} ${entry.name}  ${detail}  (${rate}s/joc)`);
  if (VERBOSE || !res.ok || done % 25 === 0 || done === targets.length) {
    process.stdout.write(`${String(done).padStart(3)}/${targets.length} ${res.ok ? 'OK  ' : '--  '} ${entry.name}  ${detail}\n`);
  }
  return { entry, ...res };
});

/* ---------------------------------------------------------------- *
 * Escriptura
 * ---------------------------------------------------------------- */

if (APPLY) mkdirSync(IMAGES_DIR, { recursive: true });

let written = 0;
let patched = 0;
const saved = [];

if (APPLY) {
  for (const r of results) {
    if (!r.ok) continue;

    const ext = r.via === 'html-local' ? r.info.ext : r.info?.ext ?? OUT_EXT;
    const file = coverFileName(r.entry.url, ext);

    if (r.via === 'local') {
      // ja hi era i es queda tal qual
      r.entry.image = `assets/images/${r.file}`;
    } else if (r.copyFrom) {
      writeFileSync(join(IMAGES_DIR, file), readFileSync(join(ROOT, r.copyFrom)));
      r.entry.image = `assets/images/${file}`;
    } else {
      writeFileSync(join(IMAGES_DIR, file), r.buf);
      r.entry.image = `assets/images/${file}`;
    }
    saved.push(r);
    written++;
  }

  patched = entries.filter((e) => e.image).length;
  writeGameList({ header, decl, entries, footer });
}

/* ---------------------------------------------------------------- *
 * Placeholders per al que no ha donat res
 * ---------------------------------------------------------------- */

const failed = results.filter((r) => !r.ok);
const placeholders = [];

if (APPLY) {
  for (const r of failed) {
    const file = coverFileName(r.entry.url, 'svg');
    writeFileSync(join(IMAGES_DIR, file), makePlaceholder(r.entry.name, coverBasename(r.entry.url)));
    r.entry.image = `assets/images/${file}`;
    placeholders.push(r);
  }
  if (placeholders.length) writeGameList({ header, decl, entries, footer });
}

/* ---------------------------------------------------------------- *
 * Neteja de portades que ja no referencia ningun joc
 * ---------------------------------------------------------------- */

/**
 * Baixar la portada d'un joc pot deixar darrere un fitxer vell: si abans
 * era `clfoo.jpg` i ara surt `clfoo.webp`, el jpg es queda ocupant espai.
 * Es calcula quins fitxers de assets/images/ son de jocs que ja no existeixen
 * o que avui tenen un altre nom, i s'esborren.
 */
function cleanOrphans(allEntries) {
  const referenced = new Set();
  for (const e of allEntries) {
    if (e.image?.startsWith('assets/images/')) referenced.add(e.image.slice('assets/images/'.length));
  }

  const removed = [];
  for (const name of readdirSync(IMAGES_DIR)) {
    if (referenced.has(name)) continue;
    // Les icones i els recursos de la web no son portades de joc
    if (/^orb-|^icon-|^favicon|^apple-touch/i.test(name)) continue;
    removed.push(name);
  }
  return removed;
}

let orphans = [];
if (APPLY) {
  orphans = cleanOrphans(entries);
  for (const name of orphans) rmSync(join(IMAGES_DIR, name), { force: true });
}

/* ---------------------------------------------------------------- *
 * Informe
 * ---------------------------------------------------------------- */

const ok = results.filter((r) => r.ok);
const byVia = new Map();
for (const r of ok) byVia.set(r.via, (byVia.get(r.via) ?? 0) + 1);

const kb = (n) => `${((n ?? 0) / 1024).toFixed(0)} KB`;

updateSection(REPORT, 'removed-orphan', [
  `Generat: ${nowISO()}`,
  '',
  `Portades esborrades perquè cap joc de \`gameList.js\` les referencia: ${orphans.length}.`,
  '',
  orphans.length ? orphans.map((n) => `\`${n}\``).join(' · ') : 'Cap portada orfena.',
  '',
].join('\n'));

updateSection(REPORT, 'found', [
  `Generat: ${nowISO()}`,
  '',
  `**${ok.length}** de ${results.length} jocs resolts amb portada real. Totes son fitxers`,
  'd\'`assets/images/` servits des del mateix origen: no hi ha cap URL externa pendent.',
  '',
  '| Origen | Jocs | que es |',
  '| --- | --- | --- |',
  `| local | ${byVia.get('local') ?? 0} | ja hi era a assets/images/ |`,
  `| html-local | ${byVia.get('html-local') ?? 0} | fitxer del mateix repo declarat a l'HTML |`,
  `| html-embed | ${byVia.get('html-embed') ?? 0} | imatge en base64 dins l'HTML del joc |`,
  `| html-remote | ${byVia.get('html-remote') ?? 0} | declarada a l'HTML (og:image, <img>...) |`,
  `| arbre | ${byVia.get('arbre') ?? 0} | imatge triada dins la carpeta del joc al repo |`,
  `| unity | ${results.filter((r) => r.layer === 'unity:background').length} | fons de càrrega que declara el propi joc |`,
  `| readme | ${byVia.get('readme') ?? 0} | imatge declarada al README del repo |`,
  `| probe | ${byVia.get('probe') ?? 0} | carpeta del CDN a la qual apunta el <base> del joc |`,
  `| imatges | ${byVia.get('imatges') ?? 0} | cerca d'imatges pel títol (Yandex / Bing via r.jina.ai) |`,
  `| portal | ${byVia.get('portal') ?? 0} | poki / crazygames / lagged via r.jina.ai |`,
  '',
  '| Joc | url | fitxer | mida | origen |',
  '| --- | --- | --- | --- | --- |',
  ...ok.map(
    (r) =>
      `| ${r.entry.name} | \`${r.entry.url}\` | \`${APPLY ? `assets/images/${coverFileName(r.entry.url, r.info?.ext ?? OUT_EXT)}` : '(pendent)'}\` | ${kb(r.bytes)} | ${r.layer} |`
  ),
].join('\n'));

updateSection(REPORT, 'missing', [
  `Generat: ${nowISO()}`,
  '',
  `**${placeholders.length}** jocs sense cap portada real (${failed.length} en total si no es generen placeholders).`,
  '',
  placeholders.length
    ? 'Per aquests es genera una portada sintetica local (SVG amb el titol del joc i un color'
      + ' derivat del nom), de manera que la targeta tampou queda mai buida. Fitxer nou per tots.'
    : "No hi ha cap joc sense portada.",
  '',
  "| Joc | url | fitxer | on s'ha buscat |",
  '| --- | --- | --- | --- |',
  ...placeholders.map(
    (r) => `| ${r.entry.name} | \`${r.entry.url}\` | \`assets/images/${coverFileName(r.entry.url, 'svg')}\` | ${(r.tried ?? []).slice(0, 5).join(' · ') || '—'} |`
  ),
].join('\n'));

const secs = ((Date.now() - started) / 1000).toFixed(0);
const withImage = entries.filter((e) => e.image).length;

/* ---------------------------------------------------------------- *
 * De on ha sortit cada portada
 * ---------------------------------------------------------------- */

/**
 * Es deixa un mapa url -> origen per a poder repassar mes endavant només
 * els jocs que han sortit malament, sense tornar a baixar les 700 imatges
 * que ja van bé. Llegeix-lo `tools/audit-covers.mjs`.
 */
if (APPLY) {
  const prev = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, 'utf8')) : {};
  const next = { ...prev, generated: nowISO() };
  for (const r of results) {
    if (!r.ok) continue;
    next[r.entry.url] = {
      name: r.entry.name,
      via: r.via,
      layer: r.layer ?? '',
      src: r.src ?? '',
      file: r.entry.image,
      bytes: r.bytes ?? 0,
      when: nowISO(),
    };
  }
  for (const r of failed) delete next[r.entry.url];
  writeFileSync(SOURCES, JSON.stringify(next, null, 1), 'utf8');
}

console.log('');
console.log(`Portades reals: ${ok.length} | Placeholders: ${placeholders.length} | ${secs}s`);
if (APPLY) {
  console.log(`Escrits a assets/images/: ${written + placeholders.length} fitxers`);
  console.log(`gameList.js amb portada: ${withImage}/${entries.length}`);
  console.log(`Pes de les noves: ${((saved.reduce((n, r) => n + (r.bytes ?? 0), 0) + placeholders.length * 1200) / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log(`Mode informe. Torna a executar amb --apply.`);
}
console.log('Informe: tools/covers-report.md');