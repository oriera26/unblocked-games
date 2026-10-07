/**
 * Inventari de les carpetes del CDN que declaren els jocs.
 *
 * Cada HTML de assets/games/ te un <base href="https://cdn.jsdelivr.net/gh/...">
 * que apunta a la carpeta original del joc. Aquesta escriptura no baixa res:
 * nomes llegeix els HTML i escriu tools/bases.json amb dues coses:
 *
 *   bases   [grup repo@ref -> quants jocs i quantes carpetes hi ha]
 *   files   [cada HTML -> {owner, repo, ref, folder}]
 *
 * El segon apartat es el que consumeixen fetch-trees.mjs (per llistar cada
 * repo via l'API de GitHub) i fetch-covers.mjs (per triar la portada dins de
 * la carpeta del joc sense endevinar noms).
 *
 *   node tools/survey-bases.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './lib/games.mjs';
import { baseHref } from './lib/covers.mjs';
import { parseBase, repoKey, repoFolder } from './lib/cdn.mjs';

const GAMES = join(ROOT, 'assets', 'games');
const OUT = join(import.meta.dirname, 'bases.json');

const files = readdirSync(GAMES).filter((f) => /\.html?$/i.test(f));

/** @type {Array<{file: string, base: string|null, info: object|null}>} */
const rows = [];

for (const file of files) {
  let html;
  try {
    html = readFileSync(join(GAMES, file), 'utf8');
  } catch {
    continue;
  }

  const base = baseHref(html);
  rows.push({ file, base: base ?? null, info: base ? parseBase(base) : null });
}

const withBase = rows.filter((r) => r.base);
const parsed = withBase.filter((r) => r.info);

/* --- agrupació per repo@ref --------------------------------------- */

const groups = new Map();
for (const r of parsed) {
  const key = repoKey(r.info);
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      kind: r.info.kind,
      owner: r.info.owner,
      repo: r.info.repo,
      ref: r.info.ref,
      hosts: new Set(),
      folders: new Map(),
    });
  }
  const g = groups.get(key);
  g.hosts.add(r.info.host);
  const folder = repoFolder(r.info);
  if (!g.folders.has(folder)) g.folders.set(folder, []);
  g.folders.get(folder).push(r.file);
}

const unknown = withBase.filter((r) => !r.info);
const hosts = new Map();
for (const r of unknown) {
  let host = '?';
  try {
    host = new URL(r.base).host.toLowerCase();
  } catch {
    /* base no parseable */
  }
  hosts.set(host, (hosts.get(host) ?? 0) + 1);
}

/* --- informe ------------------------------------------------------ */

const totalGames = [...groups.values()].reduce((t, g) => t + [...g.folders.values()].reduce((s, v) => s + v.length, 0), 0);

console.log(`HTML a assets/games/        : ${files.length}`);
console.log(`Amb <base href>             : ${withBase.length}`);
console.log(`Sense <base href>           : ${rows.length - withBase.length}`);
console.log(`Base de repo de GitHub      : ${totalGames}`);
console.log(`Base d'un altre o no resolta: ${unknown.length}`);
console.log('');
console.log(`Grups repo@ref a llistar    : ${groups.size}`);
console.log(`Repos diferents             : ${new Set([...groups.values()].map((g) => `${g.owner}/${g.repo}`)).size}`);
console.log('');
console.log('| repo@ref | jocs | carpetes | hosts |');
console.log('| --- | --- | --- | --- |');
for (const g of [...groups.values()].sort((a, b) => b.folders.size - a.folders.size)) {
  const n = [...g.folders.values()].reduce((t, v) => t + v.length, 0);
  console.log(`| ${g.key} | ${n} | ${g.folders.size} | ${[...g.hosts].join(', ')} |`);
}
if (hosts.size) {
  console.log('');
  console.log('Bases que no son de GitHub:');
  for (const [h, n] of [...hosts].sort((a, b) => b[1] - a[1])) console.log(`  ${h}: ${n}`);
}

/* --- escriptura --------------------------------------------------- */

const serialised = [...groups.values()].map((g) => ({
  key: g.key,
  kind: g.kind,
  owner: g.owner,
  repo: g.repo,
  ref: g.ref,
  hosts: [...g.hosts],
  cdn: `https://cdn.jsdelivr.net/gh/${g.owner}/${g.repo}@${g.ref}/`,
  folders: Object.fromEntries(g.folders),
}));

const fileMap = {};
for (const r of parsed) {
  fileMap[r.file] = {
    key: repoKey(r.info),
    kind: r.info.kind,
    owner: r.info.owner,
    repo: r.info.repo,
    ref: r.info.ref,
    folder: repoFolder(r.info),
    cdn: r.info.cdn,
  };
}

writeFileSync(
  OUT,
  JSON.stringify({ generated: new Date().toISOString(), groups: serialised, files: fileMap }, null, 1),
  'utf8'
);
console.log('');
console.log(`Escrit: tools/bases.json (${serialised.length} grups, ${Object.keys(fileMap).length} jocs)`);