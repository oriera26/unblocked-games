/**
 * player.js · obrir i tancar un joc dins del modal.
 *
 * Aquesta peça porta l'obertura i el tancament: un spinner que no ha de
 * quedar penjat i un iframe que no ha de quedar carregant una pàgina
 * trencada. El temps de joc el compta `playtime.js`, que només suma els
 * segons que l'usuari hi és de debò.
 *
 * Hi ha una peça més: en un dispositiu tàctil el joc no es carrega de
 * primeres, sinó que abans surt l'avís que la web no està optimitzat
 * per a mòbils. Mentre l'avís és a pantalla, l'iframe segueix a
 * about:blank: no s'ha demanat cap joc encara.
 */

import { FALLBACK_DURATION, LOADER_DURATION, OFFLINE_URL } from './config.js';
import { getGamePerformance, getPlayerZoom, recordPlay } from './state.js';
import { bindPlaytimeFrame, startPlaytime, stopPlaytime } from './playtime.js';
import { bindVolumeGame, clearVolumeGame, gameKeyOf, syncVolumeGame, watchVolumeGame } from './volume.js';
import { perfModeEnabled } from './settings.js';
import { gameSrc } from './game-path.js';
import { downloadGame, isOfflineGame, isOfflineReady } from './offline-games.js';

// Es reexporta perquè les eines (tools/test-server.mjs) l'importen d'aquí.
export { gameSrc } from './game-path.js';

let loaderTimeout = null;
let fallbackTimeout = null;
let hideTimeout = null;

/** Quan s'ha obert el joc actual, i quin és. */
let sessionStart = null;
let currentGame = null;

/**
 * El listener de `load` de l'iframe.
 *
 * Es conserva la referència en comptes de confiar en `{ once: true }`.
 * Abans cada `launchGame` afegia un listener nou sense treure l'anterior:
 * si es tancava el modal abans que l'iframe acabés de carregar, el
 * listener vell sobrevivia i es disparava a la càrrega del joc
 * següent, amagant el spinner del joc nou quan encara no havia carregat.
 */
let onIframeLoad = null;

function clearTimer(handle) {
    if (handle) clearTimeout(handle);
}

/* --- El spinner --------------------------------------------------- */

function showLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (!overlay) return;

    // Si s'està amagant una obertura anterior, cancel·lem-la abans de
    // tornar-lo a ensenya: al cap d'uns segons el seu `display: none`
    // amagaria el spinner nou.
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
}

function hideLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (!overlay) return;

    if (hideTimeout) clearTimeout(hideTimeout);
    overlay.style.opacity = '0';

    hideTimeout = setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.opacity = '';
        hideTimeout = null;
    }, 400);
}

/* --- Avís de mòbil ------------------------------------------------- */

/**
 * Cal posar l'avís abans del joc?
 *
 * `pointer: coarse` és el mateix criteri que usa detection.js: parla
 * de dispositiu tàctil (mòbil o tauleta), no de l'amplada de la
 * finestra. Un ordinador amb la finestra estreta no veurà l'avís, que
 * en parlaria de mòbils.
 */
function needsGate() {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** El joc que s'obrirà quan es pitji «Entesos». */
let gatePending = null;
let gateBound = false;

/** Enganxa el botó «Entesos» un sol cop. */
export function initGate() {
    if (gateBound) return;
    const accept = document.getElementById('gateAccept');
    if (!accept) return;
    gateBound = true;

    accept.addEventListener('click', () => {
        const game = gatePending;
        hideGate();
        if (game) openGame(game);
    });
}

/**
 * Mostra l'avís i deixa el joc a punt.
 *
 * Es desa la identitat del joc, no s'obre res: l'iframe continua a
 * about:blank i, si l'usuari tanca el modal en comptes de pitjar
 * «Entesos», no s'ha carregat ni comptat cap partida.
 */
function showGate(game) {
    const gate = document.getElementById('mobileGate');
    const modal = document.getElementById('gameModal');

    if (!gate || !modal) {
        // Sense elements no hi ha mur possible: segueix tocant el joc.
        openGame(game);
        return;
    }

    gatePending = game;
    gate.hidden = false;
    modal.classList.add('active');
}

function hideGate() {
    gatePending = null;
    const gate = document.getElementById('mobileGate');
    if (gate) gate.hidden = true;
}

/* --- Obertura ----------------------------------------------------- */

export function launch(game) {
    cancelTimers();
    hideLoader();

    // Un joc offline que encara no s'ha baixat no s'obre: s'engega la
    // baixada i prou. La targeta n'ensenya el progrés i, quan acaba, el
    // joc ja es pot obrir. Així no es baixen 50 MB per accident.
    if (isOfflineGame(game) && !isOfflineReady(game)) {
        downloadGame(game);
        return;
    }

    // El volum és de cada joc i la interfície l'ha de tenir abans que
    // l'usuari pugui pitjar res: també quan encara només hi ha l'avís
    // de mòbil a pantalla i el joc no s'ha carregat.
    bindVolumeGame(gameSrc(game));

    if (needsGate()) {
        showGate(game);
        return;
    }

    openGame(game);
}

/**
 * Aplica el mode rendiment i el zoom del joc en obrir-lo.
 *
 * El mode rendiment el pot haver triat l'usuari per a aquell joc des del
 * menú del reproductor; sense tria pròpia, val el que digui l'ajust
 * global. El zoom és una sola tria per a tots els jocs i s'aplica amb
 * `--game-zoom` al modal: el CSS fa la resta (mai amb el zoom de la
 * pàgina, que es menjaria la interfície).
 */
function applyPlayerPreferences(game) {
    const key = gameKeyOf(gameSrc(game));
    const choice = key === null ? null : getGamePerformance(key);

    document.body.classList.toggle('performance-mode', choice === null ? perfModeEnabled() : choice);

    const modal = document.getElementById('gameModal');
    if (modal) modal.style.setProperty('--game-zoom', String(getPlayerZoom() / 100));
}

/**
 * Carrega el joc dins de l'iframe i obre el modal.
 *
 * @param {object} game
 */
function openGame(game) {
    const iframe = document.getElementById('gameIframe');
    const modal = document.getElementById('gameModal');
    if (!iframe || !modal) return;

    currentGame = game;
    sessionStart = Date.now();

    // La tria de mode rendiment d'aquest joc i el zoom que li toca; en
    // tancar, el mode rendiment torna a deixar manar el global (ho fa
    // `close`) i el zoom es queda per al joc següent.
    applyPlayerPreferences(game);
    document.dispatchEvent(new CustomEvent('ula:player', { detail: { game, open: true } }));

    iframe.src = gameSrc(game);
    modal.classList.add('active');
    showLoader();

    // Mentre carrega, volume.js mira de ficar el pedaç de volum al
    // document del joc tan aviat com existeixi.
    watchVolumeGame();

    // El spinner no ha d'aguantar més de LOADER_DURATION: passat aquest
    // temps el joc és del tot alliberat encara que no hagi arribat
    // l'esdeveniment `load`.
    loaderTimeout = setTimeout(() => {
        loaderTimeout = null;
        hideLoader();
    }, LOADER_DURATION);

    // Si passat FALLBACK_DURATION no tenim res carregat, el joc no
    // funciona i és millor mostrar la pàgina d'error que un spinner
    // perpetu. Els jocs offline són molt grossos i triguen més a
    // analitzar-se: amb el mateix termini es marcaria com a trencat un
    // joc que encara s'està carregant.
    const fallbackMs = isOfflineGame(game) ? FALLBACK_DURATION * 4 : FALLBACK_DURATION;
    fallbackTimeout = setTimeout(() => {
        fallbackTimeout = null;
        try {
            const doc = iframe.contentDocument;
            if (!doc || doc.readyState !== 'complete') showOffline();
        } catch {
            // El navegador bloqueja l'accés si el joc és d'un altre
            // origen. Sense poder comprovar-ho, donem per fet que és
            // trencat i mostrem l'error.
            showOffline();
        }
    }, fallbackMs);

    if (onIframeLoad) iframe.removeEventListener('load', onIframeLoad);
    onIframeLoad = () => {
        iframe.removeEventListener('load', onIframeLoad);
        onIframeLoad = null;
        cancelTimers();
        hideLoader();
        // Assegura el pedaç de volum i li passa el valor desat.
        syncVolumeGame();
        // El document del joc és nou: torna-hi a escoltar les interaccions.
        bindPlaytimeFrame(iframe);
    };
    iframe.addEventListener('load', onIframeLoad);

    recordPlay(game.name);
    startPlaytime(game.name, iframe);
}

function showOffline() {
    const iframe = document.getElementById('gameIframe');
    if (iframe) iframe.src = OFFLINE_URL;
    cancelTimers();
    hideLoader();
    // El joc no s'ha carregat: no té sentit comptar-hi temps.
    stopPlaytime();
}

function cancelTimers() {
    clearTimer(loaderTimeout);
    clearTimer(fallbackTimeout);
    loaderTimeout = null;
    fallbackTimeout = null;
}

/* --- L'iframe ------------------------------------------------------ */

/**
 * Crea l'iframe del joc de zero, amb els atributs que toca.
 *
 * Es fa servir per substituir l'iframe vell en tancar: així el
 * navegador destrueix del tot el document del joc en lloc de quedar-se'l
 * en memòria. Els atributs han de coincidir amb el markup d'index.html.
 *
 * El `sandbox` porta `allow-same-origin` perquè els jocs necessiten el
 * mateix origen (storage, el pedaç de volum), de manera que NO és un
 * aïllament real: un joc es pot treure l'atribut amb
 * `window.frameElement`. Serveix per limitar accidents (navegar la
 * finestra de dalt, popups i descàrregues fora de control).
 */
const GAME_SANDBOX =
    'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock ' +
    'allow-orientation-lock allow-modals allow-downloads allow-presentation';

function createGameIframe() {
    const iframe = document.createElement('iframe');
    iframe.id = 'gameIframe';
    iframe.title = 'Joc';
    iframe.setAttribute('sandbox', GAME_SANDBOX);
    iframe.allow = 'autoplay; fullscreen';
    iframe.referrerPolicy = 'no-referrer';
    iframe.src = 'about:blank';
    return iframe;
}

/** Substitueix l'iframe actual per un de nou i el retorna. */
function replaceGameIframe() {
    const old = document.getElementById('gameIframe');
    if (!old || !old.parentNode) return old;

    const fresh = createGameIframe();
    old.parentNode.replaceChild(fresh, old);
    return fresh;
}

/* --- Tancament ----------------------------------------------------- */

/**
 * Sur de la pantalla completa quan es tanca el joc.
 *
 * El botó de sortir-ne és dins del modal: si el modal es tanca i la
 * finestra continua a tota pàgina, el que queda a la pantalla és un
 * contingut amagat i no hi ha cap control per sortir-ne. Per això el
 * tancament sempre ho deixa com estava.
 *
 * Només es toca el que és del modal. Un joc pot haver demanat la
 * pantalla completa per ell mateix, i si l'element és una altra cosa
 * (un vídeo del joc, per exemple) allò és cosa seva, no nostra.
 */
function exitFullscreen() {
    const element = document.fullscreenElement;
    if (!element) return;

    // El joc demana pantalla completa a l'iframe, que és una finestra
    // altra: `closest` hi busca des de dins, i el document del joc no
    // pot veure el del pare.
    if (typeof element.closest !== 'function') return;
    if (!element.closest('#gameModal')) return;

    // Sense `await` i amb `catch`: el navegador pot rebutjar la sortida
    // i això no ha d'impedir tancar el joc.
    document.exitFullscreen().catch(() => {});
}

export function close() {
    exitFullscreen();
    cancelTimers();
    hideLoader();
    // Si l'usuari tanca amb l'avís a pantalla, el joc pendent es
    // descarta: no s'ha carregat i no hi ha res a tancar.
    hideGate();
    clearVolumeGame();

    if (sessionStart && currentGame) {
        // El comptador de temps actiu desa el que quedava i s'atura.
        stopPlaytime();
    }
    sessionStart = null;
    currentGame = null;

    // El mode rendiment que hi havia aplicat era, potser, el d'aquest
    // joc: en sortir, torna a manar l'ajust global. I el menú del
    // reproductor s'assabenta que ja no queda cap joc obert.
    document.body.classList.toggle('performance-mode', perfModeEnabled());
    document.dispatchEvent(new CustomEvent('ula:player', { detail: { game: null, open: false } }));

    const modal = document.getElementById('gameModal');
    if (modal) modal.classList.remove('active');

    const iframe = document.getElementById('gameIframe');
    if (iframe && onIframeLoad) {
        iframe.removeEventListener('load', onIframeLoad);
    }
    onIframeLoad = null;

    // Eliminar l'iframe (i no només buidar-ne la `src`) força el
    // navegador a destruir el document del joc: s'aturen així els
    // setInterval, els requestAnimationFrame, els Web Worker i els
    // AudioContext que amb un `about:blank` podien sobreviure qui sap
    // quant. El proper joc parteix sempre d'un iframe net.
    replaceGameIframe();
}

/** Estat per a les proves. */
export function currentSession() {
    return { game: currentGame, startedAt: sessionStart };
}

/** Hi ha un joc obert ara mateix? */
export function isGameOpen() {
    return currentGame !== null;
}