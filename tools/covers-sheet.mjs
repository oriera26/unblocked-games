/**
 * Full de contacte de totes les portades, per revisar-les d'un cop d'ull.
 *
 * Els càlculs automàtics trien bé la majoria, però n'hi ha que només es
 * veuen a simple vista: una captura de pantalla en comptes de portada, la
 * portada d'un altre joc, un logo de YouTube... Aquest fitxer ho posa tot
 * en una graella amb el nom del joc, d'on surt la imatge i marques grogues
 * (placeholder) i vermelles (compartida / duplicada) per anar a buscar.
 *
 *   node tools/covers-sheet.mjs          -> tools/covers-review.html
 *   node tools/covers-sheet.mjs --open   (també obre el navegador)
 *
 * No escriu res més enlloc: és només una eina de revisió.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readGameList } from './lib/gameList.mjs';
import { IMAGES_DIR, ROOT } from './lib/games.mjs';

const OUT = join(import.meta.dirname, 'covers-review.html');
const SOURCES = join(import.meta.dirname, 'covers-sources.json');

const sources = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, 'utf8')) : {};
const { entries } = readGameList();

/** Quants jocs fan servir cada fitxer: >1 es portada compartida. */
const times = new Map();
for (const e of entries) if (e.image) times.set(e.image, (times.get(e.image) ?? 0) + 1);

/**
 * MATEIX contingut amb noms diferents: dos jocs que van acabar baixant la
 * mateixa imatge. Es mira el hash, no el nom, perque cada joc guarda la
 * portada amb el seu propi nom i una imatge repetida passa inadvertuda.
 */
const byHash = new Map();
for (const e of entries) {
  const f = (e.image ?? '').slice('assets/images/'.length);
  if (!f) continue;
  let h;
  try {
    h = createHash('sha1').update(readFileSync(join(IMAGES_DIR, f))).digest('hex').slice(0, 12);
  } catch {
    continue;
  }
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(e.url);
}
const sameContent = new Set();
for (const list of byHash.values()) if (list.length > 1) for (const u of list) sameContent.add(u);

const isPlaceholder = (file) => {
  try {
    const head = readFileSync(join(IMAGES_DIR, file)).subarray(0, 600).toString('utf8');
    return head.includes('data-cover="placeholder"') || (head.includes('linearGradient id="g"') && head.includes('rx="28"'));
  } catch {
    return false;
  }
};

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const rows = [];
for (const e of entries) {
  const file = (e.image ?? '').slice('assets/images/'.length);
  const src = sources[e.url] ?? {};
  const ph = file ? isPlaceholder(file) : true;
  const sharedFile = (times.get(e.image) ?? 0) > 1;
  const repeated = sameContent.has(e.url);
  const shared = sharedFile || repeated;
  const tags = [
    ph && '<b class="t ph">placeholder</b>',
    repeated && '<b class="t sh">imatge repetida</b>',
    !repeated && sharedFile && '<b class="t sh">compartida</b>',
    src.via && `<span class="t via">${esc(src.via)}</span>`,
  ].filter(Boolean);

  rows.push(`
    <figure class="${ph ? 'ph' : ''}${shared ? ' sh' : ''}" id="${esc(e.url)}">
      <img src="../${esc(e.image || 'assets/images/missing')}" alt="${esc(e.name)}" loading="lazy"
           onerror="this.classList.add('broken')">
      <figcaption>
        <span class="n">${esc(e.name)}</span>
        <span class="m">${tags.join(' ')}${src.layer ? ` <i>${esc(String(src.layer).slice(0, 60))}</i>` : ''}</span>
      </figcaption>
    </figure>`);
}

const html = `<!doctype html>
<html lang="ca"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisió de portades (${entries.length})</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #14161a; color: #e7e9ee;
         font: 14px/1.4 system-ui, Segoe UI, Roboto, sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: #1b1e24ee;
           backdrop-filter: blur(6px); padding: 14px 18px; border-bottom: 1px solid #2c313a; }
  h1 { margin: 0 0 8px; font-size: 17px; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  input[type=search] { flex: 1 1 240px; min-width: 200px; padding: 7px 10px; border-radius: 8px;
      border: 1px solid #343a45; background: #101216; color: inherit; font: inherit; }
  label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer;
      background: #22262e; padding: 6px 10px; border-radius: 999px; font-size: 13px; }
  .counts { font-size: 13px; color: #98a0ad; margin-top: 8px; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
         gap: 12px; padding: 16px; }
  figure { margin: 0; background: #1b1e24; border: 1px solid #262b33; border-radius: 10px;
           overflow: hidden; }
  figure.sh { border-color: #d9534f; }
  img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #0e1013; }
  img.broken { outline: 3px solid #d9534f; }
  figcaption { padding: 8px 9px 10px; }
  .n { display: block; font-weight: 600; font-size: 13px; line-height: 1.25;
       max-height: 2.5em; overflow: hidden; }
  .m { display: block; margin-top: 5px; font-size: 11px; color: #98a0ad;
       max-height: 3em; overflow: hidden; word-break: break-word; }
  .m i { color: #6f7783; font-style: normal; }
  .t { font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
       padding: 2px 5px; border-radius: 4px; font-weight: 700; }
  .ph { background: #6b5307; color: #ffd95e; }
  .sh { background: #6d1f1c; color: #ff9b95; }
  .via { background: #1f3a5c; color: #8ec3ff; }
  body.ph-only figure:not(.ph) { display: none; }
  body.sh-only figure:not(.sh) { display: none; }
</style></head>
<body>
<header>
  <h1>Revisió de portades · ${entries.length} jocs</h1>
  <div class="filters">
    <input type="search" id="q" placeholder="Cerca pel nom del joc…">
    <label><input type="checkbox" id="ph"> només placeholders</label>
    <label><input type="checkbox" id="sh"> només imatge repetida</label>
  </div>
  <div class="counts" id="counts"></div>
</header>
<main id="grid">${rows.join('')}
</main>
<script>
  const q = document.getElementById('q'), ph = document.getElementById('ph'),
        sh = document.getElementById('sh'), grid = document.getElementById('grid'),
        counts = document.getElementById('counts');
  const all = [...grid.children];
  const total = all.length;
  function apply() {
    const term = q.value.trim().toLowerCase();
    document.body.classList.toggle('ph-only', ph.checked);
    document.body.classList.toggle('sh-only', sh.checked);
    let shown = 0;
    for (const el of all) {
      const hit = !term || el.querySelector('.n').textContent.toLowerCase().includes(term);
      el.style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    counts.textContent = shown + ' de ' + total + ' visibles';
  }
  q.addEventListener('input', apply);
  ph.addEventListener('change', apply);
  sh.addEventListener('change', apply);
  apply();
</script>
</body></html>
`;

writeFileSync(OUT, html, 'utf8');

const ph = entries.filter((e) => {
  const f = (e.image ?? '').slice('assets/images/'.length);
  return f ? isPlaceholder(f) : true;
}).length;
const shared = entries.filter((e) => sameContent.has(e.url)).length;

console.log(`Full de contacte: tools/covers-review.html`);
console.log(`  ${entries.length} portades · ${ph} placeholders · ${shared} amb imatge repetida`);
if (process.argv.includes('--open')) {
  const { execFile } = await import('node:child_process');
  execFile(process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', OUT] : [OUT]);
}
