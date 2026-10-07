/**
 * settings.js · el menú de configuració, el mode rendiment i la neteja
 * de la memòria cau.
 */

import { SERVICE_WORKER_URL, STORAGE_KEYS } from './config.js';
import { LANGS, currentLang, setLang, t } from './i18n.js';

/* ================================================================
   Idioma
   ================================================================ */

/**
 * Muntxa el desplegable d'idioma de Configuració.
 *
 * Les opcions es diuen cadascuna en la seva llengua («Deutsch», no
 * «Alemany»): qui busca alemany el reconeixerà així, i qui el parla
 * potser no sap com es diu en català.
 */
export function initLangSelect() {
    const select = document.getElementById('langSelect');
    if (!select) return;

    select.replaceChildren();

    for (const lang of LANGS) {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.native;
        select.appendChild(option);
    }

    select.value = currentLang();

    select.addEventListener('change', () => {
        void setLang(select.value);
    });
}

/* ================================================================
   Mode rendiment
   ================================================================ */

function perfModeEnabled() {
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
        button.disabled = true;

        await clearServiceWorkerCache();
        try {
            localStorage.clear();
        } catch (err) {
            console.warn('[ula] no s\'ha pogut buidar localStorage', err);
        }

        if (typeof confirm === 'function' && !confirm(message ?? t('settings.cache.confirm'))) {
            button.disabled = false;
            return;
        }

        window.location.reload();
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

    window.addEventListener(
        'load',
        () => {
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
        },
        { once: true }
    );
}