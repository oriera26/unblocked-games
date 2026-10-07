/**
 * Cerca de portades per titol.
 *
 * Quan cap capa anterior no ha donat res (el joc no te <base>, el repo no
 * te imatges, l'HTML no en declara cap), l'ultim recurs abans dels portals
 * es preguntar a un buscador d'imatges pel nom del joc.
 *
 * Es fa servir Yandex Images a través de r.jina.ai, perque es l'unic que
 * torna el JSON complet dels resultats sense Javascript ni clau d'API:
 * cada resultat porta `origUrl`, `width`, `height`, el titol i les
 * duplicades (que sovint son la mateixa portada en un altre lloc).
 *
 * Les cerques es memoritzen a tools/tmp/imgsearch/ perque tornar a
 * executar la pipeline no torni a gastar la quota del proxy.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname, '..', 'tmp', 'imgsearch');
const JINA = 'https://r.jina.ai/';
const UA = 'ulaGames-covers/4.0';

/** L'ordre en que es miren els resultats depen del domini. */
const GOOD =
  /funnygames|poki\.com|crazygames|y8\.com|lagged|itch\.io|kongregate|sgames|steamstatic|steamcdn|wikipedia|wikimedia|roblox|newgrounds|armor\.games|gameflare|miniclip|html5games|ubg77|scratch|gamejolt|gamedistribution|gamenora|y9free|plays\.org|html5\.games|gameday|crazygames|igdb|gog\.com|epicgames|apps\.apple|playstation|nintendo|gamescribe|ozone/i;

/** Domains que mai no son una portada. */
const BAD_HOST =
  /pinterest|pinimg|facebook|twitter\.|x\.com|instagram|reddit|etsy|aliexpress|wish\.com|ebay|amazon\.|linkedin|tiktok|tumblr|dreamstime|shutterstock|alamy|istockphoto|gettyimages|depositphotos|123rf|vecteezy|freepik|canstock|adobe\s*stock|stockphoto|pngtree|wikifeet|listennotes|dzcdn|allegroimg|yavitrina|drawception|wixmp|deviantart|tiermaker|itemsatis|goclecd|cdkeys|kinguin|g2a\.|eneba|gamivo|instant-gaming|playerauctions|epicnpc|offgamers/i;

/**
 * Generadors d'IA. La cerca troba `«Woodworm» - image created in Shedevrum`
 * abans que la portada de l'IGDB perque el titol coincideix al mil·limetre,
 * pero es una imatge feta per la IA a partir del nom del joc, no la portada.
 * -250 els deixa per sota del minim: si no hi ha res mes, surt el
 * placeholder en lloc d'una imatge inventada.
 */
const AI_ART =
  /shedevrum|masterpiecer|midjourney|openai|dall[-.\s]?e|civitai|lexica|leonardo\.ai|getimg|stability\.ai|stable\s*diffusion|sora\./i;

/**
 * Domins que no es poden baixar: Cloudflare ho bloqueja tant des del proxy
 * com des de weserv (403). Mesurar-los per punts no serveix de res, millor
 * apartar-los de cop perquè la llista segueixi amb el que si que baixa.
 */
const UNFETCHABLE = /fandom\.com|nocookie\.net|playminigames\.net/i;

/** Imatges que sabem que no son portada. */
const BAD_NAME =
  /logo|favicon|sprite|sheet|avatar|badge|icon[-_.]|keyboard|mouse|merch|t-?shirt|wallpaper|steamcommunity|economy\/image|ytimg|youtube|yt[0-9]\.googleusercontent|soundtrack|[-_ ]ost[-_. ]|soundcloud|sndcdn|bandcamp|discogs|workshop|lvl[-_]|forum/i;

/**
 * Musica, no jocs. Els resultats d'Apple Music i Spotify porten el nom del
 * joc al titol (`Альбом "Woodworm - Single" - Tebler - Apple Music`) i el
 * nom del fitxer tambe, aixi que puntuaven com si fossin portada. Un cop
 * de -250 els aparta sense tocar les captures de l'App Store, que si que son
 * imatges de joc: aquestes no porten `album`/`single` al titol.
 */
const MUSIC =
  /\b(?:albums?|singles?|discograph\w*|apple\s*music|itunes|spotify|deezer|sound\s*track)\b|альбом|сингл|музыка|music\.apple|open\.spotify|mzstatic\.com\/image\/thumb\/Music|(?:song\s*lyrics.{0,40}music\s*videos|music\s*videos.{0,40}song\s*lyrics)/i;

/**
 * Pagines de llistes i de ressenyes. Porten el nom d'un altre joc al titol
 * (`Games Like D4: Dark Dreams Don't Die` surt quan cerques «Dying Dreams»)
 * i la imatge es la daquell altre joc. Si el titol del resultat te el nom
 * del que cerques no es toca: llavors la imatge si que es la seva.
 */
const LISTICLE = /games\s+like|game\s+pass\s+compare|backloggd|mygamelist|similar\s+games|more\s+games\s+like/i;

/** Paraules que no diuen res del joc. */
const STOP = new Set(['the', 'and', 'for', 'with', 'game', 'games', 'online', 'free', 'play', 'app', 'apps', 'apk', 'de', 'la', 'el', 'del', 'of', 'a']);

const tokens = (title) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

/* ------------------------------------------------------------------ *
 * Lector dels resultats
 * ------------------------------------------------------------------ */

const unesc = (s) => s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');

/**
 * Yandex embolica el JSON en HTML escapant les cometes. Cada resultat es
 * `{"alt":"titol","width":W,"height":H,...,"origUrl":"..."}` i sovint
 * porta a mes les duplicades, que son la mateixa imatge en un altre lloc.
 */
export function parseYandex(html) {
  const dec = html.replace(/&quot;/g, '"').replace(/&#x2F;|&#47;/g, '/').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'");
  const out = [];

  const re =
    /"alt":"((?:[^"\\]|\\.)*)","width":(\d+),"height":(\d+),"origWidth":\d+,"origHeight":\d+,"origUrl":"(https?:[^"]+)"/g;
  let m;
  while ((m = re.exec(dec))) {
    out.push({ alt: unesc(m[1]), w: +m[2], h: +m[3], url: unesc(m[4]) });
  }

  // Les duplicades venen dins "dups":[{url,w,h},...] i s'associen per ordre
  // a l'origUrl que les precedeix.
  const origs = [...dec.matchAll(/"origUrl":"(https?:[^"]+)"/g)].map((x) => unesc(x[1]));
  let i = 0;
  for (const block of dec.matchAll(/"dups":\[(.*?)\]/g)) {
    const of = origs[i++];
    if (!of) break;
    for (const d of block[1].matchAll(/\{"url":"(https?:[^"]+)","fileSizeInBytes":\d+,"w":(\d+),"h":(\d+)/g)) {
      out.push({ alt: '', w: +d[2], h: +d[3], url: unesc(d[1]), dup: true, of });
    }
  }
  return out;
}

/** Bing, per si Yandex no torna res. El cos es un `m="{...}"` escapat. */
export function parseBing(html) {
  const dec = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x2F;/g, '/');
  const out = [];
  for (const m of dec.matchAll(/"murl":"(https?:[^"]+)","t":(\d+)/g)) {
    out.push({ alt: '', w: +m[2], h: 0, url: unesc(m[1]) });
  }
  if (!out.length) {
    for (const m of dec.matchAll(/"murl":"(https?:[^"]+)"/g)) out.push({ alt: '', w: 0, h: 0, url: unesc(m[1]) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Puntuacio
 * ------------------------------------------------------------------ */

/**
 * Una bona portada es quadrada o una mica apaïsada, gran, amb el nom del
 * joc dins l'URL o el titol, i d'un domini de jocs. Tot lo que la
 * desqualifica (xarxes socials, logos, captures d'una altra versio) resta.
 *
 * Es re-puntua cada vegada que es llegeix la cache: aixi una millora dels
 * criteris també corregeix les cerques ja fetes, sense gastar el proxy.
 */
export function scoreCandidate(c, toks, title = '') {
  let s = 0;
  const url = c.url.toLowerCase();
  const alt = (c.alt || '').toLowerCase();
  const hay = `${url} ${alt}`;
  /**
   * `Moto%20X3M%20Bike.webp` o `moto-x3m-bike.png` no contenen `motox3m`,
   * aixi que el nom del joc "no apareix" i el resultat es rebutja tot i ser
   * la portada correcta. Es compara també amb tots els separadors tretos.
   */
  const flat = hay.replace(/[^a-z0-9]+/g, '');
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

  if (c.w && c.h) {
    const r = c.w / c.h;
    if (r >= 0.85 && r <= 1.2) s += 48;
    else if (r >= 0.7 && r <= 1.5) s += 26;
    else if (r >= 0.55 && r <= 1.9) s += 0;
    else s -= 50;
    // Molt apaïsada: es una captura de pantalla i al centre en surt molt.
    if (r > 1.6 || r < 0.62) s -= 15;

    const min = Math.min(c.w, c.h);
    if (min >= 512) s += 26;
    else if (min >= 300) s += 18;
    else if (min >= 200) s += 4;
    else s -= 35;
  }

  const hits = toks.filter((t) => hay.includes(t) || flat.includes(t.replace(/[^a-z0-9]+/g, ''))).length;
  s += Math.min(hits, 4) * 22;
  if (toks.length && hits === 0) s -= 45;

  // Que el PROPI fitxer es digui com el joc (`deltatraveler_15703.png`) es la
  // senyal mes forta que existeix: el nom de l'arxiu es posa per descriure
  // allò que hi ha a dins. Sense aixo, un joc de paraula única amb prou feines
  // arriba al minim i acaba triant el logo per defecte d'un portal.
  const stem = (url.split('?')[0].split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
  const flatStem = stem.replace(/[^a-z0-9]+/g, '');
  if (flatStem && toks.some((t) => flatStem.includes(t.replace(/[^a-z0-9]+/g, '')))) s += 14;

  // Que el titol de la pagina sigui AQUEST joc, i no un de semblant.
  if (title && alt) {
    const nt = norm(title);
    const na = norm(alt);
    if (nt && na.includes(nt)) s += 34;
    else if (nt && nt.split(' ').length > 1 && nt.split(' ').every((w) => w.length < 3 || na.includes(w))) s += 22;
  }

  if (BAD_HOST.test(url)) s -= 130;
  if (UNFETCHABLE.test(url)) s -= 400;
  if (AI_ART.test(url) || AI_ART.test(alt ?? '')) s -= 250;
  if (MUSIC.test(title ?? '') || MUSIC.test(alt ?? '') || MUSIC.test(url)) s -= 250;
  if (alt && LISTICLE.test(alt) && !norm(alt).includes(norm(title))) s -= 150;
  if (GOOD.test(url)) s += 24;
  if (BAD_NAME.test(url) || BAD_NAME.test(alt)) s -= 50;
  if (/1024x1024|\/square|_square|-cover\.|cover[-_]\w+\.(?:jpg|png|webp)|_1000x1000|\/cover\//.test(url)) s += 16;
  if (/screenshot|screen-shot|capture|gameplay|thumb[-_]?sheet|\/ugc\//.test(url)) s -= 30;

  return { ...c, score: s, hits };
}

/* ------------------------------------------------------------------ *
 * Xarxa, amb cua i cache
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
let chain = Promise.resolve();

/**
 * Tothom passa per aqui: un sol torn, amb una mica de distania entre
 * peticions. El proxy gratuit de r.jina.ai deixa de respondre si es
 * massifica, i mes val perdre un segon que perdre la finestra sencera.
 */
function gate(ms = 1100) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCall + ms - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
  });
  chain = run.catch(() => {});
  return run;
}

async function jina(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    await gate();
    let res;
    try {
      res = await fetch(JINA + url, {
        headers: { 'user-agent': UA, 'x-respond-with': 'html' },
        signal: AbortSignal.timeout(70000),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (res.status === 200) return res.text();
    // 429/403: el proxy gratuït te limit de peticions per minut.
    if (res.status === 429 || res.status === 403) {
      await new Promise((r) => setTimeout(r, 15000 * (i + 1)));
      continue;
    }
    return null;
  }
  return null;
}

/** Cache: la mateixa consulta mai no es dos cops. */
function cacheFile(key) {
  return join(TMP, `${key.replace(/[^\w.-]+/g, '_').slice(0, 90)}.json`);
}

/** Puntuacio minima per considerar que un resultat es la portada. */
export const MIN_SCORE = 75;

/**
 * Cerca les imatges d'un joc i les torna ordenades.
 *
 * La cache guarda els resultats en brut (sense puntuar): aixi, quan es
 * millora `scoreCandidate`, les cerques ja fetes es re-puntuen igualment.
 *
 * @param {string} title nom del joc
 * @param {{force?: boolean, extra?: string[]}} [opts]
 * @returns {Promise<Array<{url: string, w: number, h: number, alt: string, score: number}>>}
 */
export async function searchCovers(title, opts = {}) {
  const queries = [`${title} game`, ...((opts.extra ?? []).map((e) => `${title} ${e}`))];
  const key = queries[0].toLowerCase().replace(/[^\w]+/g, '-');
  const file = cacheFile(key);
  const toks = tokens(title);

  const rank = (raw) => raw.map((c) => scoreCandidate(c, toks, title)).sort((a, b) => b.score - a.score);

  /** En brut, sense puntuar: la cache es re-puntua cada vegada. */
  const merged = new Set();
  let raw = null;
  if (!opts.force && existsSync(file)) {
    try {
      const hit = JSON.parse(readFileSync(file, 'utf8'));
      const list = hit.raw ?? hit.cands ?? [];
      if (list.length) {
        raw = list;
        // Les consultes que ja hi son dins: sense aixo, tota repetició tornaria
        // a demanar-les i una cerca que mai no arriba al minim gastaria el
        // proxy infinitament.
        for (const q of hit.merged ?? []) merged.add(q);
        merged.add(queries[0]);
      }
    } catch {
      /* cache trencat: es torna a cercar */
    }
  }

  let ranked = rank(raw ?? []);

  if (!raw) {
    raw = dedup(await fetchRaw(queries[0]));
    merged.add(queries[0]);
    ranked = rank(raw);
  }

  // Si amb la primera consulta no surt res de bo, es proven altres mes
  // explicites ("... cover art", "... official art") i es fusionen totes:
  // cada peticio extra costa un clica de gate i n'arregla mes d'un joc que
  // d'una altra manera acabaria amb el logo per defecte d'un portal.
  for (const extra of ['cover art', 'official art']) {
    if (opts.force || ranked[0]?.score >= MIN_SCORE) break;
    const q = `${title} ${extra}`;
    if (merged.has(q)) continue;
    const more = await fetchRaw(q);
    merged.add(q);
    raw = dedup([...raw, ...more]);
    ranked = rank(raw);
  }

  mkdirSync(TMP, { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ when: new Date().toISOString(), title, merged: [...merged], raw: ranked.slice(0, 60) }),
    'utf8'
  );
  return ranked;
}

function dedup(list) {
  const seen = new Set();
  return list.filter((c) => c?.url && (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/** Una consulta: Yandex i, si en torna poc, Bing com a reforç. */
async function fetchRaw(query) {
  const out = [];
  const y = await jina('https://yandex.com/images/search?text=' + encodeURIComponent(query));
  if (y) out.push(...parseYandex(y));
  if (out.length < 15) {
    const b = await jina('https://www.bing.com/images/search?q=' + encodeURIComponent(query));
    if (b) out.push(...parseBing(b));
  }
  return out;
}

export { tokens as titleTokens };
