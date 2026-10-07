/**
 * Lectura de l'<base href> que declaren els HTML de joc.
 *
 * Els jocs de assets/games/ son envelopadors UGS: el document original es
 * servia des d'un CDN i el `<base href>` encara hi apunta. Aquesta base es
 * la font de veritat de dues coses:
 *
 *   - on viu el joc (rutes relatives que el joc resoldra en marxa)
 *   - on hi ha les imatges originals que es volen guardar com a portada
 *
 * Hi ha cinc CDNs diferents al repositori i cap d'ells coincideix exactament:
 * jsdelivr accepta la branca pegada al repo, githack/statically posen el ref
 * sempre i raw.githubusercontent no es pot llistar. Tots ells, pero, tenen la
 * mateixa forma `/owner/repo/@ref/carpeta/`, que es el que ens interessa.
 */

/** Els quatre CDN que son repositoris de GitHub servits per una altrea xarxa. */
const GITHUB_CDNS = new Set([
  'cdn.jsdelivr.net',
  'rawcdn.githack.com',
  'bbcdn.githack.com',
  'cdn.statically.io',
  'raw.githubusercontent.com',
  'fastly.jsdelivr.net',
]);

/** Els CDN de GitHub comencen el camí amb `/gh/`; raw no en posa cap. */
function stripLeading(pathname) {
  let p = pathname;
  // jsdelivr i statically-ho posen davant: /gh/owner/repo...
  p = p.replace(/^\/(?:gh|github)\//, '/');
  // raw.githubusercontent.com va directe a /owner/repo...
  p = p.replace(/^\/+/, '/');
  // Hi ha bases amb barres dobles al final (".../clickspeed//")
  return p.replace(/\/{2,}/g, '/');
}

/**
 * @returns {null|{kind: string, host: string, owner: string, repo: string,
 *   ref: string, folder: string, cdn: string}}
 *   null si la base no correspon a cap repo de GitHub conegut.
 */
export function parseBase(href) {
  if (!href || !/^https?:/i.test(href)) return null;

  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }

  const host = u.host.toLowerCase();
  const p = decodeURIComponent(stripLeading(u.pathname));

  /* Paquets npm de jsdelivr: /npm/pkg@versio/carpeta/ */
  const npm = p.match(/^\/npm\/([^/]+)@([^/]+)(\/.*)?$/);
  if (host === 'cdn.jsdelivr.net' && npm) {
    const [, pkg, ref, rest = ''] = npm;
    return {
      kind: 'npm',
      host,
      owner: pkg,
      repo: pkg,
      ref,
      folder: rest.replace(/^\/+|\/+$/g, ''),
      cdn: `https://cdn.jsdelivr.net/npm/${pkg}@${ref}/`,
    };
  }

  if (!GITHUB_CDNS.has(host)) return null;

  /* Amb ref pegat: /owner/repo@ref/carpeta/ */
  const pinned = p.match(/^\/([^/]+)\/([^/]+)@([^/]+)(\/.*)?$/);
  if (pinned) {
    const [, owner, repo, ref, rest = ''] = pinned;
    return {
      kind: 'gh',
      host,
      owner,
      repo,
      ref,
      folder: rest.replace(/^\/+|\/+$/g, ''),
      cdn: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/`,
    };
  }

  /* Sense ref: /owner/repo/branch/carpeta/ (jsdelivr accepta la branca). */
  const loose = p.match(/^\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (loose) {
    const [, owner, repo, ref, rest = ''] = loose;
    return {
      kind: 'gh-branch',
      host,
      owner,
      repo,
      ref,
      folder: rest.replace(/^\/+|\/+$/g, ''),
      cdn: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/`,
    };
  }

  /* Sense res mes: /owner/repo/. Aleshores el CDN serveix la branca main. */
  const root = p.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (root) {
    const [, owner, repo] = root;
    return {
      kind: 'gh-root',
      host,
      owner,
      repo,
      ref: 'main',
      folder: '',
      cdn: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/`,
    };
  }

  return null;
}

/** Identificador únic de repo+versió, independent del CDN que el servia. */
export function repoKey(info) {
  return `${info.owner}/${info.repo}@${info.ref}`;
}

/** Carpeta dins el repo on viu el joc (sempre sense barres als extrems). */
export function repoFolder(info) {
  return (info.folder ?? '').replace(/^\/+|\/+$/g, '');
}

/**
 * URL de jsdelivr per a un fitxer concret del repo. Es construeix sempre amb
 * jsdelivr perquè és l'únic dels CDNs que accepta la branca i el sha sense
 * problemes i perquè images.weserv.nl el pot llegir.
 */
export function jsdelivrUrl(owner, repo, ref, filePath) {
  const clean = String(filePath).replace(/^\/+/, '');
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${clean
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')}`;
}