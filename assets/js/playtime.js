/**
 * playtime.js · compta el temps de joc de debò.
 *
 * Abans el temps es calculava amb el rellotge: des que s'obria el joc
 * fins que es tancava, tant si la pestanya era de fons com si la
 * finestra no tenia el focus. Deixar un joc obert en segon pla inflava
 * els minuts sense que hi jugués ningú.
 *
 * Aquí el temps només corre quan es compleixen tres coses alhora:
 *
 *   1. la pestanya és visible (no minimitzada ni de fons);
 *   2. la finestra té el focus (no n'hi ha cap altra al davant);
 *   3. hi ha hagut una interacció en els últims PLAY_IDLE_MS.
 *
 * El comptador va sumant segons i en desa un grapat cada
 * PLAY_FLUSH_MS, i també en tancar. Així, si el navegador es tanca de
 * cop, com a màxim es perd l'últim tros.
 *
 * Els jocs corren dins d'un iframe del mateix origen. Quan s'hi juga,
 * els esdeveniments els rep el document del joc i no el de fora, de
 * manera que els escoltadors també s'hi enganxen (a `contentDocument`).
 * Sense això, qualsevol partida es pausaria als 60 s perquè la pàgina
 * de fora no veu cap tecla.
 */

import { PLAY_FLUSH_MS, PLAY_IDLE_MS, PLAY_TICK_MS } from './config.js';
import { recordPlaytime } from './state.js';

/**
 * Els gestos que compten com a interacció.
 *
 * `pointermove` ja cobreix el ratolí i el dit; `wheel` i `scroll` són
 * per a qui només mira amunt i avall; `keydown` per al teclat.
 */
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'scroll'];

/** Apunta que l'usuari acaba d'interactuar. */
function activity() {
    lastActivity = Date.now();
}

let tickHandle = null;
let flushHandle = null;

/** Nom del joc que s'està comptant, o null si no n'hi ha cap. */
let name = null;

/** Segons actius que encara no s'han desat (amb decimals). */
let pending = 0;

/** Últim moment en què es va mirar el rellotge, per no comptar salts. */
let lastTick = 0;

/** Última interacció de l'usuari. */
let lastActivity = 0;

let unbindWindow = null;
let unbindFrame = null;

/**
 * Hi ha algú mirant el joc i interactuant-hi?
 *
 * @param {number} at  moment a comprovar, en mil·lisegons
 */
function isActive(at) {
    if (document.visibilityState !== 'visible') return false;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
    return at - lastActivity < PLAY_IDLE_MS;
}

function tick() {
    const at = Date.now();
    const delta = at - lastTick;
    lastTick = at;

    if (delta <= 0 || !isActive(at)) return;

    // Si l'interval s'ha endarrerit (l'ordinador ha estat adormit, la
    // pestanya acaba de tornar), no comptis més d'un tic de cop.
    pending += Math.min(delta, PLAY_TICK_MS) / 1000;
}

/** Desa els segons sencers que ja s'han acumulat; la resta es queda. */
function flush() {
    const whole = Math.floor(pending);
    if (whole <= 0 || !name) return;

    pending -= whole;
    recordPlaytime(name, whole);
}

/** Enganxa els escoltadors d'activitat a una finestra o document. */
function bindActivity(target) {
    for (const type of ACTIVITY_EVENTS) {
        target.addEventListener(type, activity, { capture: true, passive: true });
    }

    return () => {
        for (const type of ACTIVITY_EVENTS) {
            target.removeEventListener(type, activity, { capture: true });
        }
    };
}

/**
 * Reenganxa els escoltadors al document del joc.
 *
 * Cal cridar-ho cada cop que l'iframe acaba de carregar: el document
 * del joc és nou i el vell ja no serveix. Si el joc fos d'un altre
 * origen, `contentDocument` no es pot llegir i es comptaria només amb
 * les interaccions de la pàgina.
 */
export function bindPlaytimeFrame(iframe) {
    if (unbindFrame) {
        unbindFrame();
        unbindFrame = null;
    }

    if (!iframe) return;

    try {
        if (iframe.contentDocument) unbindFrame = bindActivity(iframe.contentDocument);
    } catch {
        unbindFrame = null;
    }
}

/**
 * Comença a comptar el temps del joc.
 *
 * @param {string} gameName
 * @param {HTMLIFrameElement} [iframe]  el joc, per escoltar-hi interaccions
 */
export function startPlaytime(gameName, iframe) {
    if (!gameName) return;

    stopPlaytime();

    name = gameName;
    pending = 0;
    lastTick = Date.now();
    lastActivity = Date.now();

    unbindWindow = bindActivity(window);
    bindPlaytimeFrame(iframe);

    tickHandle = window.setInterval(tick, PLAY_TICK_MS);
    flushHandle = window.setInterval(flush, PLAY_FLUSH_MS);

    // Si la pestanya s'amaga o es tanca, el que hi hagi acumulat no es
    // pot quedar a la memòria.
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
}

/**
 * Atura el comptador i desa el que quedava.
 *
 * És idempotent: cridar-lo sense cap joc obert no fa res.
 */
export function stopPlaytime() {
    if (tickHandle !== null) {
        window.clearInterval(tickHandle);
        tickHandle = null;
    }
    if (flushHandle !== null) {
        window.clearInterval(flushHandle);
        flushHandle = null;
    }

    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);

    if (unbindWindow) {
        unbindWindow();
        unbindWindow = null;
    }
    bindPlaytimeFrame(null);

    flush();

    name = null;
    pending = 0;
}

function onVisibility() {
    if (document.visibilityState === 'hidden') {
        flush();
    } else {
        // Torna a ser visible: no arrosseguis el forat d'haver estat fora.
        lastTick = Date.now();
    }
}

/** Estat per a les proves. */
export function playtimeState() {
    return { game: name, pending };
}
