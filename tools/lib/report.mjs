/**
 * Informe markdown de portada amb seccions.
 *
 * Cada script es responsable de la seva propia secció i les altres es
 * conserven, per aixè prune-games.mjs i fetch-covers.mjs es poden
 * executar en qualsevol ordre sense perdre el treball de l'altre.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const HEADER = [
  '# Portades · ulaGames',
  '',
  '<!-- Generat per tools/prune-games.mjs i tools/fetch-covers.mjs. No editar a ma. -->',
  '',
].join('\n');

/** ordre canonic de les seccions del fitxer */
const ORDER = ['removed-orphan', 'found', 'missing', 'rejected'];

function parse(file) {
  if (!existsSync(file)) return new Map();

  const raw = readFileSync(file, 'utf8');
  const sections = new Map();
  const re = /^## +(.+)$/gm;

  const hits = [...raw.matchAll(re)];
  for (let i = 0; i < hits.length; i++) {
    const title = hits[i][1].trim();
    const from = hits[i].index + hits[i][0].length;
    const to = i + 1 < hits.length ? hits[i + 1].index : raw.length;
    sections.set(title, raw.slice(from, to).trim());
  }
  return sections;
}

/**
 * Escriu `body` dins la secció `title`, conservant les altres.
 * Retorna true si el contingut ha canviat (per no escriure si no cal).
 */
export function updateSection(file, title, body) {
  const sections = parse(file);
  const next = String(body ?? '').trim();

  if (sections.get(title) === next) return false;

  sections.set(title, next);

  const titles = [
    ...ORDER.filter((t) => sections.has(t)),
    ...[...sections.keys()].filter((t) => !ORDER.includes(t)),
  ];

  const out =
    HEADER +
    titles
      .map((t) => `\n## ${t}\n\n${sections.get(t)}\n`)
      .join('');

  writeFileSync(file, out, 'utf8');
  return true;
}

/** Marca una secció amb un timestamp, sense perdre el contingut existent. */
export function stamp(file, title, stampISO) {
  const current = parse(file).get(title);
  const next = current
    ? `${stampISO}\n\n${current}`
    : `${stampISO}`;
  return updateSection(file, title, next);
}

export function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}