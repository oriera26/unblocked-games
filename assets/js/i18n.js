/**
 * i18n.js · idiomes de la interfície.
 *
 * Tres peces:
 *
 *   LANGS      els idiomes que ofereix el desplegable de Configuració,
 *              amb el nom que cadascú es dóna a si mateix (una llista
 *              d'idiomes traduïda a una altra llengua és un exercici
 *              absurd: "Deutsch", no "Alemà").
 *
 *   initI18n() carrega el fitxer de l'idioma triat (i el català, que és
 *              la reserva) abans del primer render. Si un fitxer no es
 *              pot carregar, la pàgina segueix en català, que és el que
 *              ja porta el HTML: no hi ha cap pantalla que es quedi buida
 *              perquè una traducció falti.
 *
 *   t()        la clau → el text. Els mòduls que dibuixen text amb codi
 *              (categories, favorits, estadístiques) hi passen per aquí;
 *              el HTML estàtic usa atributs `data-i18n` que applyI18n()
 *              omple en entrar i en canviar d'idioma.
 *
 * Els fitxers són pla (`assets/lang/<codi>.json`), un text per clau. La
 * clau no es tradueix, el valor sí. Si en falta una, es mira en català;
 * si tampoc hi és, es deixa el text que ja hi hagi al element.
 */

import { STORAGE_KEYS } from './config.js';

/**
 * Els idiomes de la web, en l'ordre del desplegable.
 *
 * `code` és el nom del fitxer a assets/lang/ i la clau de desament.
 * `native` és com s'escriu en la pròpia llengua.
 */
export const LANGS = [
    { code: 'ca', native: 'Català' },
    { code: 'en', native: 'English' },
    { code: 'es', native: 'Español' },
    { code: 'por', native: 'Português' },
    { code: 'it', native: 'Italiano' },
    { code: 'fr', native: 'Français' },
    { code: 'de', native: 'Deutsch' },
    { code: 'nl', native: 'Nederlands' },
    { code: 'pl', native: 'Polski' },
    { code: 'ru', native: 'Русский' },
    { code: 'uk', native: 'Українська' },
    { code: 'tr', native: 'Türkçe' },
    { code: 'ro', native: 'Română' },
    { code: 'cs', native: 'Čeština' },
    { code: 'sk', native: 'Slovenčina' },
    { code: 'hu', native: 'Magyar' },
    { code: 'bg', native: 'Български' },
    { code: 'el', native: 'Ελληνικά' },
    { code: 'sv', native: 'Svenska' },
    { code: 'da', native: 'Dansk' },
    { code: 'fi', native: 'Suomi' },
    { code: 'no', native: 'Norsk' },
    { code: 'hr', native: 'Hrvatski' },
    { code: 'sr', native: 'Српски' },
    { code: 'bs', native: 'Bosanski' },
    { code: 'cnr', native: 'Crnogorski' },
    { code: 'mk', native: 'Македонски' },
    { code: 'sq', native: 'Shqip' },
    { code: 'sl', native: 'Slovenščina' },
    { code: 'et', native: 'Eesti' },
    { code: 'lv', native: 'Latviešu' },
    { code: 'lt', native: 'Lietuvių' },
    { code: 'is', native: 'Íslenska' },
    { code: 'ga', native: 'Gaeilge' },
    { code: 'cy', native: 'Cymraeg' },
    { code: 'br', native: 'Brezhoneg' },
    { code: 'eu', native: 'Euskara' },
    { code: 'gl', native: 'Galego' },
    { code: 'an', native: 'Aragonés' },
    { code: 'ast', native: 'Asturianu' },
    { code: 'oc', native: 'Occitan' },
    { code: 'co', native: 'Corsu' },
    { code: 'mt', native: 'Malti' },
    { code: 'he', native: 'עברית' },
    { code: 'ar', native: 'العربية' },
    { code: 'fa', native: 'فارسی' },
    { code: 'ur', native: 'اردو' },
    { code: 'ps', native: 'پښتو' },
    { code: 'ku', native: 'Kurdî' },
    { code: 'hi', native: 'हिन्दी' },
    { code: 'bn', native: 'বাংলা' },
    { code: 'ta', native: 'தமிழ்' },
    { code: 'te', native: 'తెలుగు' },
    { code: 'ml', native: 'മലയാളം' },
    { code: 'kn', native: 'ಕನ್ನಡ' },
    { code: 'mr', native: 'मराठी' },
    { code: 'gu', native: 'ગુજરાતી' },
    { code: 'pa', native: 'ਪੰਜਾਬੀ' },
    { code: 'ne', native: 'नेपाली' },
    { code: 'si', native: 'සිංහල' },
    { code: 'my', native: 'မြန်မာဘာသာ' },
    { code: 'km', native: 'ខ្មែរ' },
    { code: 'lo', native: 'ລາວ' },
    { code: 'th', native: 'ไทย' },
    { code: 'vi', native: 'Tiếng Việt' },
    { code: 'id', native: 'Bahasa Indonesia' },
    { code: 'ms', native: 'Bahasa Melayu' },
    { code: 'tl', native: 'Tagalog' },
    { code: 'jv', native: 'Basa Jawa' },
    { code: 'ja', native: '日本語' },
    { code: 'ko', native: '한국어' },
    { code: 'zh', native: '中文' },
    { code: 'sw', native: 'Kiswahili' },
    { code: 'ha', native: 'Hausa' },
    { code: 'yo', native: 'Yorùbá' },
    { code: 'ig', native: 'Igbo' },
    { code: 'so', native: 'Soomaali' },
    { code: 'om', native: 'Afaan Oromoo' },
    { code: 'am', native: 'አማርኛ' },
    { code: 'zu', native: 'isiZulu' },
    { code: 'xh', native: 'isiXhosa' },
    { code: 'sn', native: 'ChiShona' },
    { code: 'ny', native: 'Chichewa' },
    { code: 'rw', native: 'Kinyarwanda' },
    { code: 'rn', native: 'Kirundi' },
    { code: 'ln', native: 'Lingála' },
    { code: 'wo', native: 'Wolof' },
    { code: 'mg', native: 'Malagasy' },
    { code: 'qu', native: 'Runasimi' },
    { code: 'gn', native: "Avañẽ'õ" },
    { code: 'ay', native: 'Aymara' },
    { code: 'pcm', native: 'Naijá Pidin' },
    { code: 'uz', native: "O'zbekcha" },
    { code: 'az', native: 'Azərbaycanca' },
    { code: 'ka', native: 'ქართული' },
    { code: 'hy', native: 'Հայերեն' },
    { code: 'kk', native: 'Қазақша' },
    { code: 'ky', native: 'Кыргызча' },
    { code: 'tg', native: 'Тоҷикӣ' },
    { code: 'tk', native: 'Türkmençe' }
];

/** Idiomes que es llegeixen de dreta a esquerra. */
const RTL = new Set(['ar', 'he', 'ur', 'fa', 'ps']);

/**
 * El que diu el navegador → el fitxer que tenim.
 *
 * `navigator.language` dona subtags ISO 639-1 (`pt`, `nb`, `fil`) i nosaltres
 * usem ISO 639-2 per al portuguès (`por`). La llista cobreix els casos que
 * surten de debò; la resta es resol per prefix i, si no, cau a català.
 */
const BROWSER_ALIASES = {
    pt: 'por',
    nb: 'no',
    nn: 'no',
    fil: 'tl',
    iw: 'he',
    jw: 'jv',
    in: 'id',
    sh: 'sr'
};

/** Reserva: el text ja hi és al HTML, així que no es pot perdre. */
const FALLBACK_LANG = 'ca';

let current = FALLBACK_LANG;
let dict = {};
let fallback = {};
const listeners = new Set();

/* ================================================================
   Càrrega
   ================================================================ */

async function loadDict(code) {
    try {
        const response = await fetch(`assets/lang/${code}.json`, { cache: 'no-cache' });
        if (!response.ok) return null;
        const data = await response.json();
        return data && typeof data === 'object' ? data : null;
    } catch {
        // Sense xarxa, en file://, o el fitxer no hi és: es continua
        // amb el que ja hi hagi.
        return null;
    }
}

/** El codi que triaríem si ningú no ha escollit res encara. */
function detectLang() {
    const browser = (navigator.languages ?? [navigator.language ?? ''])
        .map((tag) => String(tag).toLowerCase())
        .filter(Boolean);

    for (const tag of browser) {
        const [lang] = tag.split('-');
        const direct = BROWSER_ALIASES[lang] ?? lang;
        if (LANGS.some((l) => l.code === direct)) return direct;
        // `pt-BR`, `zh-Hans-CN`, `sr-Cyrl`…: provem amb el segon tros.
        const region = tag.split('-')[1];
        const second = region ? (BROWSER_ALIASES[region] ?? region) : null;
        if (second && LANGS.some((l) => l.code === second)) return second;
    }

    return FALLBACK_LANG;
}

function savedLang() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.lang);
        return LANGS.some((l) => l.code === saved) ? saved : null;
    } catch {
        return null;
    }
}

/**
 * Carrega l'idioma triat i aplica els `data-i18n`.
 *
 * S'espera abans del primer dibuix: les categories i les estadístiques
 * es construeixen amb `t()`, i treure'ls després seria un parpelleig.
 */
export async function initI18n() {
    current = savedLang() ?? detectLang();

    // El català es carrega sempre: és la reserva de totes les claus.
    const [ca, active] = await Promise.all([
        loadDict(FALLBACK_LANG),
        current === FALLBACK_LANG ? Promise.resolve(null) : loadDict(current)
    ]);

    fallback = ca ?? {};
    dict = active ?? ca ?? {};

    applyI18n();
}

/* ================================================================
   Consulta
   ================================================================ */

/** El text d'una clau, o null si no hi és enlloc. */
function lookup(key) {
    return dict[key] ?? fallback[key] ?? null;
}

/**
 * El text d'una clau, per als mòduls que dibuixen amb codi.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [params] substitucions `{nom}`
 */
export function t(key, params) {
    const text = lookup(key) ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) =>
        params[name] === undefined ? whole : String(params[name])
    );
}

export function currentLang() {
    return current;
}

/** El tag BCP47 per a dates i nombres (`por` → `pt`, que `por` no és vàlid). */
export function localeOf(code = current) {
    return code === 'por' ? 'pt' : code;
}

/* ================================================================
   Aplicació al DOM
   ================================================================ */

/**
 * Omple els elements amb `data-i18n`, `data-i18n-ph` i `data-i18n-aria`.
 *
 * Si una clau no existeix ni en l'idioma actiu ni en català, es deixa el
 * text que ja tingui l'element (el HTML ve amb el català de fàbrica).
 */
export function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const text = lookup(el.dataset.i18n);
        if (text !== null) el.textContent = text;
    });

    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const text = lookup(el.dataset.i18nPh);
        if (text !== null) el.setAttribute('placeholder', text);
    });

    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const text = lookup(el.dataset.i18nAria);
        if (text !== null) el.setAttribute('aria-label', text);
    });

    document.documentElement.lang = current;
    document.documentElement.dir = RTL.has(current) ? 'rtl' : 'ltr';
}

/* ================================================================
   Canvi d'idioma
   ================================================================ */

/**
 * Canvia l'idioma de la web.
 *
 * Els mòduls que han dibuixat text amb `t()` escolten `onLangChange` i
 * es tornen a dibuixar; el HTML estàtic ho repassa `applyI18n`.
 *
 * @param {string} code
 */
export async function setLang(code) {
    if (!LANGS.some((l) => l.code === code)) return;

    const loaded = code === FALLBACK_LANG ? null : await loadDict(code);
    current = code;
    dict = loaded ?? fallback;

    try {
        localStorage.setItem(STORAGE_KEYS.lang, code);
    } catch {
        // Sense desament, l'idioma dura aquesta sessió.
    }

    applyI18n();
    for (const listener of listeners) listener(code);
}

/**
 * Escolta els canvis d'idioma.
 *
 * @param {(code: string) => void} listener
 */
export function onLangChange(listener) {
    listeners.add(listener);
}
