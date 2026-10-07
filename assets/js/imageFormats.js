/**
 * imageFormats.js · extensions d'imatge acceptades i com es resolen.
 *
 * Venia de imageFormatList.js, que era una constant global sense cap
 * consumidor. Ara és un mòdul i, a més de la llista, ofereix les dues
 * operacions que de veritat calen quan hi ha una portada: reconèixer si
 * un fitxer és una imatge i en quin ordre provar les extensions.
 */

/**
 * Extensions conegudes, sense el punt.
 *
 * 'svgz' és SVG comprimit amb gzip. El reconeixem perquè pot aparèixer
 * en llistes de fitxers, però mai no l'haurem de generar: el navegador
 * no el renderitza amb un <img> si el servidor no serveix
 * Content-Encoding: gzip.
 */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'svgz', 'webp', 'avif'];

/** Formats que podem generar des d'un original: WEBP és el més lleu. */
export const GENERATED_FORMATS = ['webp', 'jpg', 'png'];

/** Format per defecte de les noves portades. */
export const DEFAULT_FORMAT = 'webp';

/** Tipus MIME que corresponen a cada extensió generable. */
export const MIME_TYPES = {
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml'
};

/**
 * Extensió en minúsculas d'un camí, sense el punt. '' si no en té.
 * @param {string} path
 */
export function extensionOf(path) {
    if (typeof path !== 'string') return '';
    const name = path.split(/[?#]/, 1)[0]; // sense query ni fragment
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return '';
    return name.slice(dot + 1).toLowerCase();
}

/** Un fitxer és una imatge coneguda? No mira el contingut, només el nom. */
export function isImagePath(path) {
    return IMAGE_EXTENSIONS.includes(extensionOf(path));
}

/** El MIME type d'un camí, o '' si no és una imatge coneguda. */
export function mimeTypeOf(path) {
    return MIME_TYPES[extensionOf(path)] ?? '';
}

/**
 * Canvia l'extension d'un nom de fitxer, per provar una portada en un
 * altre format sense tornar-la a escriure.
 * @param {string} path
 * @param {string} format  sense punt, vegeu GENERATED_FORMATS
 */
export function withFormat(path, format) {
    const ext = extensionOf(path);
    if (!ext) return `${path}.${format}`;
    return path.slice(0, -(ext.length + 1)) + '.' + format;
}