/**
 * Lectura i escriptura de assets/js/gameList.js.
 *
 * L'objectiu es conservar el format original byte a byte: una entrada
 * per línia, 3 espais d'indentació, claus doble i coma nomes quan
 * hi ha mes entrades després. Així el diff del fitxer es llegeix.
 *
 * El fitxer realitzat es `export const GAMES = [` ... `];`, de manera que
 * la línia de declaració es conserva tal qual en comptes de reconstruir-la.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './games.mjs';

const FILE = join(ROOT, 'assets', 'js', 'gameList.js');

/** `{ name: "...", url: "...", image: "...", type: "..." }` */
const ENTRY = /^\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,\s*url:\s*"((?:[^"\\]|\\.)*)"\s*,\s*image:\s*"((?:[^"\\]|\\.)*)"\s*,\s*type:\s*"((?:[^"\\]|\\.)*)"\s*\}\s*,?\s*$/;

/** `const GAMES = [` / `export const GAMES = [` */
const DECL = /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\[\s*\]?\s*;?\s*$/;

/**
 * @returns {{header: string[], decl: string, entries: Array<{name:string,url:string,image:string,type:string}>, footer: string[]}}
 */
export function readGameList() {
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);

  const header = [];
  const entries = [];
  const footer = [];
  let decl = '';

  let state = 'header';
  for (const line of lines) {
    if (state === 'header') {
      if (DECL.test(line) || /^\s*\[/.test(line)) {
        // primera línia de l'array
        state = 'body';
        decl = line;
        continue;
      }
      header.push(line);
      continue;
    }

    if (state === 'body') {
      if (/^\s*\];?\s*$/.test(line)) {
        state = 'footer';
        footer.push(line);
        continue;
      }
      const m = ENTRY.exec(line);
      if (!m) throw new Error(`Entrada de gameList.js no reconeguda:\n  ${line}`);
      entries.push({ name: m[1], url: m[2], image: m[3], type: m[4] });
      continue;
    }

    footer.push(line);
  }

  if (!entries.length) throw new Error('gameList.js no conté cap entrada.');
  return { header, decl, entries, footer };
}

/**
 * Els dos numeros del capçal (quants jocs hi ha i quants en tenen portada)
 * es poden quedar obsolets després d'una poda o d'una baixada de portades.
 * Es sincronitzen aqui perquè el fitxer no digui una cosa que ja no és veritat.
 */
function syncHeader(header, entries) {
  const total = entries.length;
  const withCover = entries.filter((e) => e.image).length;

  return header.map((line) =>
    line
      .replace(/^(\s*\*\s*)\d+( jocs?\.)/, `$1${total}$2`)
      .replace(/\ba (\d+) dels (\d+) jocs\b/, `a ${withCover} dels ${total} jocs`)
  );
}

/**
 * La línia de declaració ha d'OBERT l'array: `export const GAMES = [`.
 *
 * Si es llegeix d'un fitxer que ja es va escriure amb `= []` (o el cridant
 * no passa `decl`), es reconstrueix aquí. Escriure `= []` amb les entrades a
 * sota deixa el fitxer sense parsejar: `node --check` i el navegador es
 * queixen amb un `Unexpected token ':'` i el catàleg no carrega.
 */
function openDecl(decl) {
  const d = String(decl ?? '').trim();
  const m = d.match(/^(.*=\s*)\[\s*\]?\s*;?$/);
  if (m) return `${m[1]}[`;
  return d || 'export const GAMES = [';
}

export function writeGameList({ header, decl, entries, footer }) {
  const body = entries.map(
    (e, i) =>
      `   { name: ${JSON.stringify(e.name)}, url: ${JSON.stringify(e.url)}, ` +
      `image: ${JSON.stringify(e.image)}, type: ${JSON.stringify(e.type)} }` +
      (i === entries.length - 1 ? '' : ',')
  );

  const head = syncHeader(header, entries);
  const open = openDecl(decl);

  const text = [...head, open, ...body, ...footer].join('\n');
  writeFileSync(FILE, text, 'utf8');
  return text;
}

export { FILE as GAME_LIST_FILE };