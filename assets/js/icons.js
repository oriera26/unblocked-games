/**
 * icons.js · icones SVG de Lucide, en linea i cachejades.
 *
 * Lucide s carrega des d'un CDN com un UMD global. El problema de
 * llegir-ne els noms un a un i construir l'etiqueta és que hi ha moltes
 * icones dibuixades (fins a MAX_DOM_CARDS de cop) i el mateix nom surt
 * centenars de vegades. Aquí el resultat es memoïtzar per
 * nom + mida + classe + ompliment.
 *
 * Lucide és una dependència externa: si el CDN no respon, cap funció
 * d'aquest fitxer llança. Totes retornen '' o no fan res, de manera que
 * la interfície segueix sent utilitzable sense icones. Per això
 * `hydrate()` és aïllada i mai impedeix el paint.
 */

/** Lucide publia els noms en kebab-case i en PascalCase. */
function toPascalCase(kebab) {
    return kebab
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/**
 * Els nodes d'una icona de Lucide són parelles `[etiqueta, atributs]`.
 * Retorna l'etiqueta d'aquest parell, o '' si no té la forma esperada.
 */
function tagOf(node) {
    return Array.isArray(node) && typeof node[0] === 'string' ? node[0] : '';
}

function nodesFor(name) {
    const global = globalThis.lucide;
    if (!global?.icons) return null;

    const direct = global.icons[name];
    if (Array.isArray(direct)) return direct;

    const pascal = global.icons[toPascalCase(name)];
    return Array.isArray(pascal) ? pascal : null;
}

/** Existeix aquesta icona al paquet carregat? */
export function hasIcon(name) {
    return nodesFor(name) !== null;
}

/** Escapa un valor per posar-lo dins d'un atribut entre comilles dobles. */
function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const markupCache = new Map();

/**
 * Etiqueta SVG completa, en forma de text.
 *
 * Es prefereix el text a un element perquè la meitat de les icones
 * s'han de posar dins d'un `innerHTML` en construir una targeta. El
 * `mountIcon` de més avall cobreix el cas contrari.
 *
 * @param {string} name    nom de Lucide, en kebab-case
 * @param {{size?: number, className?: string, fill?: string, style?: string}} [opts]
 * @returns {string} '' si la icona no existeix
 */
export function iconMarkup(name, opts = {}) {
    const size = opts.size ?? 24;
    const className = opts.className ?? '';
    const fill = opts.fill ?? '';
    const style = opts.style ?? '';

    const key = `${name}|${size}|${className}|${fill}|${style}`;
    const hit = markupCache.get(key);
    if (hit !== undefined) return hit;

    const nodes = nodesFor(name);
    if (!nodes) return '';

    let inner = '';
    for (const node of nodes) {
        const tag = tagOf(node);
        if (!tag) continue;

        const attrs = node[1] ?? {};
        let attrText = '';
        for (const [key_, value] of Object.entries(attrs)) {
            if (value === null || value === undefined || value === false) continue;
            attrText += ` ${key_}="${escapeAttr(value)}"`;
        }
        inner += `<${tag}${attrText}/>`;
    }

    let svgAttrs =
        'xmlns="http://www.w3.org/2000/svg"' +
        ` width="${size}" height="${size}" viewBox="0 0 24 24"` +
        ` fill="${escapeAttr(fill || 'none')}"` +
        ' stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round"';
    if (className) svgAttrs += ` class="${escapeAttr(className)}"`;
    if (style) svgAttrs += ` style="${escapeAttr(style)}"`;

    const svg = `<svg ${svgAttrs}>${inner}</svg>`;
    markupCache.set(key, svg);
    return svg;
}

/**
 * Posa una icona dins d'un element existent, en comptes de substituir
 * l'element.
 *
 * Substituir l'element (el que feia el canvi de tema, amb
 * `el.outerHTML = ...`) obliga a tornar a buscar-lo pel mateix id i a
 * reinjectar-lo a mà. Aquí l'element es queda viu i només se n'hi
 * canvia el contingut, de manera que els id, els referenciats i els
 * escoltadors de l'element sobreviuen al canvi d'icona.
 *
 * @param {Element|null} el
 * @param {string} name
 * @param {object} [opts]  vegeu iconMarkup
 * @returns {boolean} hi ha hagut icona o no
 */
export function mountIcon(el, name, opts = {}) {
    if (!el) return false;

    const svg = iconMarkup(name, opts);
    if (!svg) return false;

    el.innerHTML = svg;
    // L'SVG ha de poder heretar el color i les mides del contenidor.
    el.classList.add('ula-icon');
    return true;
}

/**
 * Substitueix els `[data-lucide]` que quedin al HTML.
 *
 * Es crida un sol cop, en/arribar, per les icones estàtiques de la
 * navegació. A partir d'aquí el codi demana les icones amb
 * `iconMarkup` o `mountIcon`, que són més ràpides.
 *
 * @param {ParentNode} [root]
 * @returns {number} quantes icones s'han muntat
 */
export function hydrateDataLucide(root = document) {
    const placeholders = root.querySelectorAll('[data-lucide]');
    let mounted = 0;

    for (const el of placeholders) {
        const name = el.getAttribute('data-lucide');
        const size = parseInt(el.dataset.size, 10) || 16;

        const svg = iconMarkup(name, { size, className: el.className });
        if (!svg) continue;

        // No es pot fer `el.outerHTML = svg` i prou: el nom de la classe
        // del <svg> resultant pot diferir del que tenia el marcador, i
        // alguns marcadors tenen width/height propis.
        const template = document.createElement('template');
        template.innerHTML = svg;
        const node = template.content.firstElementChild;
        if (!node) continue;

        el.replaceWith(node);
        mounted++;
    }

    return mounted;
}

/** Buida la memòria de les icones. Només per a les proves. */
export function clearIconCache() {
    markupCache.clear();
}