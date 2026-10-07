/**
 * detection.js · detecta que ulaGames ja és instal·lada com a aplicació
 * i ofereix obrir-la en finestres pròpies en comptes d'una pestanya.
 *
 * Com es detecta
 * --------------
 * L'usuari deixa d'estar mirant la pestanya (blur) i hi torna
 * (visibilitychange), i a vegades ho fa quan acaba d'instal·lar l'app.
 * Llavors, si la diferència entre tots dos instants és prou petita,
 * suposem que és el mateix usuari, al mateix dispositiu i sense haver
 * sortit de la pestanya: hi ha moltes probabilitats que el que ha obert
 * l'ha retornada és l'app instal·lada.
 *
 * Per què no un iframe invisible amb setTimeout
 * ---------------------------------------------
 * Es va provar i no serveix. `display:none` i `visibility:hidden` no
 * executen timers: un iframe amagat no arriba mai a cridar setTimeout i
 * la detecció no s'activava mai. Amb `opacity:0` sí que s'executa, però
 * deixa un iframe de 1x1 permanent que consumeix un fil de rendering i
 * pot disparar avisos de contrasteil.
 *
 * Per què no es desa cap marca al servidor
 * -----------------------------------------
 * Un script del servidor no pot saber si el client torna a la pestanya
 * que ha demanat. L'única font de veritat és el client, i el que es
 * desa és "l'usuari ja ha tancat el banner", que és una decisió seva.
 */

import { STORAGE_KEYS } from './config.js';

/** Temps màxim entre l'última mirada i el retorn perquè compti com un intent. */
const RETURN_WINDOW_MS = 15 * 60 * 1000;

/** Temps mínim perquè un retorn tan ràpid no pugui ser un canvi de pestanya. */
const MIN_GAP_MS = 3 * 1000;

let hiddenAt = null;
let alreadyDismissed = false;
let checking = false;

function wasDismissed() {
    try {
        return localStorage.getItem(STORAGE_KEYS.appBannerDismissed) === '1';
    } catch {
        return false;
    }
}

function rememberDismissed() {
    try {
        localStorage.setItem(STORAGE_KEYS.appBannerDismissed, '1');
    } catch {
        // Si no es pot desar, el banner tornarà a sortir en aquesta
        // sessió, que és millor que no sortir mai.
    }
}

/** Hi ha una instal·lació independent del navegador? */
export function isStandalone() {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // Safari iOS encara no suporta display-mode.
    return window.navigator.standalone === true;
}

/** L'app només té sentit com a PWA al mòbil; al navegador d'ordinador està fora de lloc. */
function isWorthOffering() {
    if (isStandalone()) return false;
    // Un escriptori ja té una finestra pròpia, i oferir-hi l'app seria
    // una coincidència menys útil que el banner.
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** Posa el nom de l'app instal·lada, si el navegador el dona. */
async function installedAppName() {
    if (!('getInstalledRelatedApps' in navigator)) return null;
    try {
        const apps = await navigator.getInstalledRelatedApps();
        return apps?.[0]?.name ?? null;
    } catch {
        return null;
    }
}

/**
 * S'ha tornat a la pestanya com si tornés de l'app?
 *
 * @param {number} gap  ms que ha estat amagada
 */
function looksLikeAppReturn(gap) {
    return gap > MIN_GAP_MS && gap < RETURN_WINDOW_MS;
}

/**
 * Mostra el banner, o el deixa passar si no toca.
 * @param {boolean} force  mostra'l igual que estigui marcat com a vist
 */
export async function maybeShowBanner(force = false) {
    if (checking) return;
    checking = true;

    try {
        if (isStandalone()) return;
        if (!force && (alreadyDismissed || wasDismissed())) return;
        if (!isWorthOffering()) return;

        const name = (await installedAppName()) ?? 'ulaGames';
        show(name);
    } catch (err) {
        console.warn('[ula] no s\'ha pogut comprovar la instal·lació', err);
    } finally {
        checking = false;
    }
}

function show(appName) {
    if (document.getElementById('app-banner')) return;

    const banner = document.createElement('aside');
    banner.id = 'app-banner';
    banner.className = 'app-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', `${appName} instal·lada`);

    const text = document.createElement('p');
    text.className = 'app-banner-text';
    text.textContent = `${appName} ja és instal·lada. Obre-la en finestres pròpies.`;

    const actions = document.createElement('div');
    actions.className = 'app-banner-actions';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'app-banner-open';
    open.textContent = 'Obre l\'app';
    open.addEventListener('click', () => {
        // El botó dóna lloc al valor de window, que el navegador llegeix
        // per saber quina app obrir. No hi ha res més a fer.
        window.close();
    });

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'app-banner-dismiss';
    dismiss.setAttribute('aria-label', 'Tanca l\'avís');
    dismiss.textContent = '\u2715';
    dismiss.addEventListener('click', () => {
        alreadyDismissed = true;
        rememberDismissed();
        banner.remove();
    });

    actions.append(open, dismiss);
    banner.append(text, actions);
    document.body.appendChild(banner);
}

/** Muntxa els escoltadors de visibilitat. */
export function startDetection() {
    if (isStandalone()) return;

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            hiddenAt = Date.now();
            return;
        }

        // Torna a ser visible.
        const gap = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;

        if (looksLikeAppReturn(gap)) void maybeShowBanner();
    });

    // Un esdeveniment blur sense ocultar el document es dispara en
    // canviar de finestra o en obrir un selector de fitxers. També
    // indica que l'usuari ha sortit de la pestanya.
    window.addEventListener('blur', () => {
        if (document.visibilityState === 'visible' && hiddenAt === null) {
            hiddenAt = Date.now();
        }
    });

    window.addEventListener('focus', () => {
        const gap = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (looksLikeAppReturn(gap)) void maybeShowBanner();
    });
}

/** Per a les proves: la marca de "ja vist" està posada? */
export function isDismissed() {
    return alreadyDismissed || wasDismissed();
}