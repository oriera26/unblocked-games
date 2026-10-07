/**
 * FASE 1.2 (pas 0) · Llista el contingut de cada repo de GitHub on viu un joc.
 *
 * Per triar una portada de veritat no hi ha res millor que saber quins
 * fitxers hi ha dins la carpeta del joc. jsdelivr rebutja el llistat de
 * directoris dels paquets grans i l'HTML de GitHub no es pot llegir de forma
 * fiable, pero l'API de `git/trees` si: una peticio per repo@ref dona la
 * llista COMPLETA de fitxers amb la seva mida, que es justament el que fa
 * falta per triar la imatge mes gran i mes ben anomenada de la carpeta.
 *
 * Sense token de GitHub aixo va a 60 peticions per hora i hi ha ~170
 * repo@ref, així que l'escriptura:
 *
 *   - desa el resultat a tools/tmp/trees/<owner>__<repo>__<ref>.json
 *   - no torna a demanar el que ja hi ha
 *   - quan es queda sense quota espera que es reiniciï i continua
 *   - posa primer els refs que son branques (main, latest, 3-xmas...),
 *     que son els que agrupen mes jocs, i despres els sha
 *
 *   node tools/fetch-trees.mjs              informa del que hi ha i del que falta
 *   node tools/fetch-trees.mjs --fetch      baixa els que falten (pot trigar hores)
 *   node tools/fetch-trees.mjs --fetch --branches-only
 *   node tools/fetch-trees.mjs --report     només cobertura, zero xarxa
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBase } from './lib/cdn.mjs';
import { baseHref } from './lib/covers.mjs';
import { nowISO } from './lib/report.mjs';

const arg = (name, fallback = '') =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=').slice(1).join('=');

const FETCH = process.argv.includes('--fetch');
const REPORT_ONLY = process.argv.includes('--report');
const BRANCHES_ONLY = process.argv.includes('--branches-only');
const FORCE = process.argv.includes('--force');

const TREES = join(import.meta.dirname, 'tmp', 'trees');
const BASES = join(import.meta.dirname, 'bases.json');
const OUT = join(import.meta.dirname, 'trees-report.md');

const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
const UA = 'ulaGames-trees/1.0 (+https://github.com/ula/unblocked-games)';

/** ExtENSIONS que poden servir de portada. */
const IMG = /\.(png|jpe?g|webp|gif|avif|svg|ico|bmp)$/i;

/** Un sha de 40 hex, no una branca. */
const isSha = (ref) => /^[0-9a-f]{7,40}$/i.test(ref);

/** Nom de fitxer segur per a la cache. */
function cacheName(owner, repo, ref) {
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
  return `${safe(owner)}__${safe(repo)}__${safe(ref)}.json`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Quins repos cal llistar
 * ------------------------------------------------------------------ */

const GAMES_DIR = join(import.meta.dirname, '..', 'assets', 'games');
const gameFiles = readdirSync(GAMES_DIR).filter((f) => /\.html?$/i.test(f));

/** @type {Map<string, {owner:string, repo:string, ref:string, folders:Map<string, string[]>, sha:boolean}>} */
const wanted = new Map();

for (const file of gameFiles) {
  let html;
  try {
    html = readFileSync(join(GAMES_DIR, file), 'utf8');
  } catch {
    continue;
  }
  const base = baseHref(html);
  const info = base ? parseBase(base) : null;
  if (!info || info.kind === 'npm') continue;

  const key = `${info.owner}/${info.repo}@${info.ref}`;
  if (!wanted.has(key)) {
    wanted.set(key, {
      key,
      owner: info.owner,
      repo: info.repo,
      ref: info.ref,
      sha: isSha(info.ref),
      folders: new Map(),
    });
  }
  const g = wanted.get(key);
  const folder = (info.folder ?? '').replace(/^\/+|\/+$/g, '');
  if (!g.folders.has(folder)) g.folders.set(folder, []);
  g.folders.get(folder).push(file);
}

/* ------------------------------------------------------------------ *
 * Lectura i escriptura de la cache
 * ------------------------------------------------------------------ */

function cachePath(owner, repo, ref) {
  return join(TREES, cacheName(owner, repo, ref));
}

/** @returns {null|{key:string, files: Array<[string, number]>, truncated: boolean}} */
function readCache(owner, repo, ref) {
  const p = cachePath(owner, repo, ref);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(owner, repo, ref, data) {
  mkdirSync(TREES, { recursive: true });
  writeFileSync(cachePath(owner, repo, ref), JSON.stringify(data), 'utf8');
}

/* ------------------------------------------------------------------ *
 * Descarga d'un arbre
 * ------------------------------------------------------------------ */

let rateLeft = TOKEN ? 5000 : 60;

/** Espera el reinici de la quota quan l'API ha dit que no. */
async function waitForReset(res) {
  const now = Math.floor(Date.now() / 1000);
  let reset = Number(res.headers.get('x-ratelimit-reset') ?? 0);
  if (!reset) reset = now + 60;
  const wait = Math.max(5, reset - now + 5);
  console.log(`  quota esgotada, s'espera ${Math.ceil(wait / 60)} min`);
  await sleep(Math.min(wait, 3700) * 1000);
}

/**
 * @returns {Promise<'ok'|'404'|'other'>}
 */
async function fetchTree(owner, repo, ref) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const headers = { 'user-agent': UA, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    } catch {
      if (attempt === 4) return 'other';
      await sleep(attempt * 2500);
      continue;
    }

    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) rateLeft = Number(remaining);

    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      if (retryAfter > 0 && retryAfter <= 90) {
        await sleep(retryAfter * 1000 + 1000);
        continue;
      }
      await waitForReset(res);
      continue;
    }

    if (res.status === 404) return '404';
    if (res.status === 409) return '404'; // ref buit (arbre buida)
    if (!res.ok) {
      if (attempt === 4) return 'other';
      await sleep(attempt * 3000);
      continue;
    }

    let body;
    try {
      body = await res.json();
    } catch {
      // La lectura del cos també hereta el signal: si el servidor obre la
      // connexió i després no envia res, `json()` acaba amb TimeoutError
      // fora del try de dalt i mata el procés sencer.
      if (attempt === 4) return 'other';
      await sleep(attempt * 3000);
      continue;
    }
    const files = [];
    for (const node of body.tree ?? []) {
      if (node.type !== 'blob') continue;
      if (!IMG.test(node.path)) continue;
      files.push([node.path, node.size ?? 0]);
    }
    writeCache(owner, repo, ref, {
      key: `${owner}/${repo}@${ref}`,
      owner,
      repo,
      ref,
      sha: body.sha ?? null,
      truncated: Boolean(body.truncated),
      total: (body.tree ?? []).length,
      images: files.length,
      files,
      fetched: nowISO(),
    });
    return 'ok';
  }

  return 'other';
}

/* ------------------------------------------------------------------ *
 * Execucio
 * ------------------------------------------------------------------ */

const todo = [...wanted.values()].sort((a, b) => {
  // Primer les branches (agrupen mes jocs), i dins de cada grup les que mes
  // jocs tenen. Despres els sha, del mes nou al mes vell.
  if (a.sha !== b.sha) return a.sha ? 1 : -1;
  const na = [...a.folders.values()].reduce((t, v) => t + v.length, 0);
  const nb = [...b.folders.values()].reduce((t, v) => t + v.length, 0);
  return nb - na;
});

const cached = todo.filter((g) => !FORCE && readCache(g.owner, g.repo, g.ref));
const missing = todo.filter((g) => FORCE || !readCache(g.owner, g.repo, g.ref));
const toFetch = BRANCHES_ONLY ? missing.filter((g) => !g.sha) : missing;

console.log(`Jocs amb <base> de GitHub : ${[...wanted.values()].reduce((t, g) => t + [...g.folders.values()].reduce((s, v) => s + v.length, 0), 0)}`);
console.log(`repo@ref diferents       : ${wanted.size} (${new Set([...wanted.values()].map((g) => `${g.owner}/${g.repo}`)).size} repos)`);
console.log(`Ja a la cache            : ${cached.length}`);
console.log(`Per baixar               : ${toFetch.length}`);
console.log(`Quota de GitHub          : ${TOKEN ? 'amb token' : `sense token, ~${rateLeft} peticions disponibles`}`);
console.log('');

const tally = { ok: 0, notfound: 0, other: 0 };

if (FETCH && toFetch.length) {
  mkdirSync(TREES, { recursive: true });
  console.log('Baixant arbres...');
  for (let i = 0; i < toFetch.length; i++) {
    const g = toFetch[i];
    const r = await fetchTree(g.owner, g.repo, g.ref);
    if (r === 'ok') tally.ok++;
    else if (r === '404') tally.notfound++;
    else tally.other++;

    process.stdout.write(
      `${String(i + 1).padStart(3)}/${toFetch.length} ${r === 'ok' ? 'OK ' : r === '404' ? '-- ' : '!! '} ${g.key} (quota ${rateLeft})\n`
    );
    if ((i + 1) % 5 === 0) writeReport();
    if (r === 'other' && tally.other > 5) break;
  }
}

writeReport();

/* ------------------------------------------------------------------ *
 * Informe
 * ------------------------------------------------------------------ */

/**
 * Quants jocs tenen la seva carpeta dins d'algun arbre que hem pogut llegir.
 * Un joc pot aparar en mes d'un arbre (sha i main): comptem el primer que el
 * conté, que és el de la versió mes propera.
 */
function coverage() {
  const trees = new Map();
  for (const g of wanted.values()) {
    const c = readCache(g.owner, g.repo, g.ref);
    if (c) trees.set(g.key, c);
  }

  const rows = [];
  let inTree = 0;
  let senseCarpeta = 0;
  let senseArbre = 0;
  let senseImatges = 0;

  for (const g of [...wanted.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const tree = trees.get(g.key);
    const n = [...g.folders.values()].reduce((t, v) => t + v.length, 0);
    let state = 'sense arbre';
    let imgs = 0;

    if (tree) {
      const idx = new Map();
      for (const [p, size] of tree.files) idx.set(p, size);
      const hit = new Set();
      let best = 0;
      for (const folder of g.folders.keys()) {
        const prefix = folder ? `${folder}/` : '';
        let count = 0;
        for (const p of idx.keys()) {
          if (prefix && !p.startsWith(prefix)) continue;
          count++;
          const size = idx.get(p);
          if (size > best) best = size;
        }
        if (count) hit.add(folder);
      }
      imgs = best;
      if (hit.size) state = 'carpeta al repo';
      else if (tree.files.length) state = 'carpeta no hi es';
      else state = 'repo sense imatges';
    }

    if (state === 'carpeta al repo') inTree += n;
    else if (state === 'sense arbre') senseArbre += n;
    else if (state === 'repo sense imatges') senseImatges += n;
    else senseCarpeta += n;

    rows.push(`| ${g.key} | ${n} | ${g.folders.size} | ${state} | ${imgs} |`);
  }

  return { rows, inTree, senseCarpeta, senseArbre, senseImatges };
}

function writeReport() {
  const cov = coverage();
  const total = [...wanted.values()].reduce((t, g) => t + [...g.folders.values()].reduce((s, v) => s + v.length, 0), 0);

  writeFileSync(
    OUT,
    [
      `# Arbres de GitHub`,
      '',
      `Generat: ${nowISO()}`,
      '',
      `L'API \`git/trees\` dona la llista completa de fitxers d'un repo amb la mida de cada`,
      'un. Amb aixo es pot triar la portada real de la carpeta del joc en lloc d\'endevinar',
      'noms de fitxer. La cache viu a `tools/tmp/trees/` i es pot tornar a omplir amb',
      '`node tools/fetch-trees.mjs --fetch`.',
      '',
      `Jocs amb base de GitHub: **${total}**`,
      `Carpeta present al repo: **${cov.inTree}**`,
      `Carpeta absent del repo: ${cov.senseCarpeta}`,
      `Repo sense imatges: ${cov.senseImatges}`,
      `Arbre encara no llistat: ${cov.senseArbre}`,
      '',
      '| repo@ref | jocs | carpetes | estat | imatge mes gran (bytes) |',
      '| --- | --- | --- | --- | --- |',
      ...cov.rows,
      '',
    ].join('\n'),
    'utf8'
  );
}

if (FETCH) {
  console.log('');
  console.log(`Baixats ${tally.ok} | no existeixen ${tally.notfound} | errors ${tally.other}`);
}
console.log(`Informe: tools/trees-report.md`);
console.log(`Cache: tools/tmp/trees/ (${existsSync(TREES) ? readdirSync(TREES).length : 0} fitxers)`);
if (!FETCH && toFetch.length && !REPORT_ONLY) {
  console.log('Torna a executar amb --fetch per baixar els que falten.');
}