/**
 * settings.js · el menú de configuració, el mode rendiment i la neteja
 * de la memòria cau.
 */

import { SERVICE_WORKER_URL, STORAGE_KEYS } from './config.js';
import { LANGS, currentLang, onLangChange, setLang, t } from './i18n.js';

/* ================================================================
   Idioma
   ================================================================ */

/**
 * Muntxa el desplegable d'idioma de Configuració.
 *
 * És un desplegable fet a casa i no un <select>: amb ~100 files, la
 * cara nativa del sistema (blanca al Windows) trencava el vidre i no
 * es podia estilitzar. El botó ensenya l'idioma actual i la llista
 * s'obre amb scroll propi; el teclat hi entra amb les fletxes i
 * Inici/Final, i cada fila és un botó que es tria amb Retorn.
 *
 * Les opcions es diuen cadascuna en la seva llengua («Deutsch», no
 * «Alemany»): qui busca alemany el reconeixerà així, i qui el parla
 * potser no sap com es diu en català.
 */
export function initLangSelect() {
    const root = document.getElementById('langSelect');
    const trigger = document.getElementById('langTrigger');
    const menu = document.getElementById('langMenu');
    const current = document.getElementById('langCurrent');
    if (!root || !trigger || !menu || !current) return;

    menu.replaceChildren();

    for (const lang of LANGS) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'lang-option';
        option.dataset.code = lang.code;
        option.setAttribute('role', 'option');
        option.textContent = lang.native;
        option.addEventListener('click', () => {
            close();
            trigger.focus();
            void setLang(lang.code);
        });
        menu.appendChild(option);
    }

    const isOpen = () => root.classList.contains('open');

    /** El botó i la fila marcada segueixen l'idioma actiu. */
    function syncChoice() {
        const code = currentLang();
        const lang = LANGS.find((l) => l.code === code);
        current.textContent = lang ? lang.native : code;

        for (const option of menu.children) {
            const on = option.dataset.code === code;
            option.classList.toggle('active', on);
            option.setAttribute('aria-selected', String(on));
        }

        return menu.querySelector('.lang-option.active');
    }

    function open() {
        root.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');

        // Amb ~100 files, la tria actual ha de quedar a la vista en obrir.
        const active = syncChoice();
        if (active) {
            menu.scrollTop = active.offsetTop - menu.clientHeight / 2 + active.offsetHeight / 2;
        }
    }

    function close() {
        root.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', () => {
        if (isOpen()) close();
        else open();
    });

    // Les fletxes obren la llista i hi fan entrar el focus per la tria
    // actual, que és on vol ser qui hi arriba amb el teclat.
    trigger.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        if (!isOpen()) open();

        const marked = menu.querySelector('.lang-option.active');
        (marked ?? menu.firstElementChild)?.focus();
    });

    menu.addEventListener('keydown', (event) => {
        const options = [...menu.children];
        const index = options.indexOf(document.activeElement);

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = options[(index + step + options.length) % options.length];
            next?.focus();
            next?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const next = options[event.key === 'Home' ? 0 : options.length - 1];
            next?.focus();
            next?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Escape') {
            // Que no arribi al menú de configuració: aquí només es plega
            // la llista d'idiomes.
            event.stopPropagation();
            close();
            trigger.focus();
        } else if (event.key === 'Tab') {
            close();
        }
    });

    // Clic fora del control: la llista es plega. El de dins (una fila o
    // el propi botó) no compta com a fora.
    document.addEventListener('click', (event) => {
        if (isOpen() && !root.contains(event.target)) close();
    });

    // L'idioma pot canviar per altres camins (la sincronització, un
    // enllaç…): el botó i la marca interior s'han de posar al dia igual.
    onLangChange(syncChoice);

    syncChoice();
}

/* ================================================================
   Mode rendiment
   ================================================================ */

/**
 * El mode rendiment global està engegat?
 *
 * El fa servir també `player.js`: en obrir un joc sense tria pròpia i en
 * tancar-lo (per restaurar el que hi havia abans de la tria per joc).
 */
export function perfModeEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEYS.performanceMode) === '1';
    } catch {
        return false;
    }
}

function setPerfMode(enabled) {
    document.body.classList.toggle('performance-mode', enabled);

    const item = document.getElementById('perfModeItem');
    if (item) {
        item.classList.toggle('on', enabled);
        item.setAttribute('aria-checked', String(enabled));
    }

    try {
        localStorage.setItem(STORAGE_KEYS.performanceMode, enabled ? '1' : '0');
    } catch (err) {
        console.warn('[ula] no s\'ha pogut desar el mode rendiment', err);
    }
}

/**
 * Muntxa el menú de configuració.
 *
 * Es tanca amb clic fora, amb Escape i en clicar un element: abans el
 * clic interior d'un item del menú propagava fins al document, que el
 * tan immediatament, de manera que el menú s'obria i es tancava al
 * mateix clic.
 */
export function initSettings() {
    const button = document.getElementById('settingsBtn');
    const menu = document.getElementById('settingsMenu');
    const perfItem = document.getElementById('perfModeItem');
    if (!button || !menu) return;

    const isOpen = () => menu.classList.contains('open');

    function open() {
        menu.classList.add('open');
        button.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
    }

    function close() {
        menu.classList.remove('open');
        button.classList.remove('active');
        button.setAttribute('aria-expanded', 'false');
    }

    // Aplica l'estat desat abans d'escoltar, perquè el menú nunca
    // mostri un interruptor que no correspon al que hi ha.
    setPerfMode(perfModeEnabled());

    button.addEventListener('click', () => {
        if (isOpen()) close();
        else open();
    });

    if (perfItem) {
        const toggle = () => setPerfMode(!document.body.classList.contains('performance-mode'));
        perfItem.addEventListener('click', toggle);
        perfItem.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
    }

    document.addEventListener('click', (event) => {
        if (!isOpen()) return;
        // `contains` cobreix l'interior del menú, de manera que clicar un
        // item no el tanca. El clic que el tanca és el del propi item,
        // que ja ha corregit l'estat i després provoca el clic fora.
        if (!menu.contains(event.target) && !button.contains(event.target)) close();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isOpen()) {
            close();
            button.focus();
        }
    });
}

/* ================================================================
   Memòria cau
   ================================================================ */

async function clearServiceWorkerCache() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: 'CLEAR_CACHE' });
    } catch (err) {
        console.warn('[ula] no s\'ha pogut buidar la memòria del service worker', err);
    }
}

/**
 * Esborra només les dades d'aquesta aplicació.
 *
 * Abans era `localStorage.clear()`, que matava TOTES les claus de
 * l'origen: si un dia hi ha una altra app a oriera26.github.io, la
 * neteja de la cau d'aquesta se l'enduria. Les nostres claus comencen
 * totes per `ula` (vegeu STORAGE_KEYS).
 */
function clearUlaStorage() {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ula')) keys.push(key);
        }
        for (const key of keys) localStorage.removeItem(key);
    } catch (err) {
        console.warn('[ula] no s\'ha pogut buidar localStorage', err);
    }
}

/**
 * Neteja tota la memòria cau i torna a carregar.
 *
 * El `alert` i el `location.reload` eren l'única forma de buidar-ho.
 * Aquí el botó és un <button> de debò i, si en un entorn sense
 * `alert` (una finestra d'Electron, per exemple) no es pot confirmar,
 * es neteja igual.
 *
 * El missatge es resol en clicar i no en carregar: la persona pot
 * haver canviat d'idioma després d'entrar.
 *
 * @param {string} [buttonId]
 * @param {string|null} [message]  text propi; `null` = l'idioma actiu
 */
export function initCacheControl(buttonId = 'clearCacheBtn', message = null) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.addEventListener('click', async () => {
        // Primer es confirma i després es neteja: abans es buidava
        // l'emmagatzematge i tot seguit es demanava confirmació, de
        // manera que qui cancel·lava ja ho havia perdut tot.
        // En un entorn sense `confirm` (una finestra d'Electron, per
        // exemple) es neteja igual.
        if (typeof confirm === 'function' && !confirm(message ?? t('settings.cache.confirm'))) {
            return;
        }

        button.disabled = true;

        await clearServiceWorkerCache();
        clearUlaStorage();

        window.location.reload();
    });
}

/* ================================================================
   Progrés
   ================================================================ */

/**
 * Enganxa el botó de restablir el progrés.
 *
 * Només toca les estadístiques: els preferits, els volums i els desats
 * dels jocs es queden com eren. `onDone` és qui repinta el que calgui
 * (per exemple, la pantalla d'estadístiques si hi som en aquell moment).
 *
 * @param {string} buttonId
 * @param {() => void} onDone
 */
export function initProgressReset(buttonId, onDone) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.addEventListener('click', () => {
        // Primer es pregunta i després s'esborra: si es fes al revés,
        // qui cancel·lés ja hauria perdut el progrés.
        if (typeof confirm === 'function' && !confirm(t('settings.reset.confirm'))) return;
        onDone();
    });
}

/* ================================================================
   Service worker
   ================================================================ */

/**
 * Registra el service worker.
 *
 * Fora d'Electron no es pot (i no cal) registrar: l'app es serveix des
 * d'un fitxer local, on no hi ha scope ni https. Registrar-hi deixaria
 * una entrada al navegador que no pot tornar a validar.
 *
 * @param {boolean} isDesktop  l'app corre dins d'Electron
 */
export function registerServiceWorker(isDesktop) {
    if (isDesktop || !('serviceWorker' in navigator)) return;

    const register = () => {
        navigator.serviceWorker
            .register(SERVICE_WORKER_URL)
            .then((registration) => {
                console.info('[ula] service worker registrat a', registration.scope);
            })
            .catch((err) => {
                // Sense service worker l'aplicació continua fent
                // serves, només que no serà offline.
                console.warn('[ula] no s\'ha pogut registrar el service worker', err);
            });
    };

    // Arribats aquí amb la pàgina ja carregada (arrencada ràpida: el
    // `load` pot haver passat abans que `start()` acabi), cal registrar
    // de seguida: esperar un `load` que no tornarà deixaria l'app sense
    // service worker per sempre.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
}