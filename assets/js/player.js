/**
 * player.js · obrir i tancar un joc dins del modal.
 *
 * Aquesta peça la porta tota la lògica de temps: un spinner que no ha
 * de quedar penjat, un iframe que no ha de quedar carregant una pàgina
 * trencada, i el temps de joc que s'ha d'anar a comptar.
 *
 * Hi ha una peça més: en un dispositiu tàctil el joc no es carrega de
 * primeres, sinó que abans surt l'avís que la web no està optimitzat
 * per a mòbils. Mentre l'avís és a pantalla, l'iframe segueix a
 * about:blank: no s'ha demanat cap joc encara.
 */

import { FALLBACK_DURATION, GAMES_DIR, LOADER_DURATION, OFFLINE_URL } from './config.js';
import { recordPlay, recordSession } from './state.js';
import { bindVolumeGame, clearVolumeGame, syncVolumeGame, watchVolumeGame } from './volume.js';

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

/**
 * URL del fitxer d'un joc.
 *
 * Al llistat hi ha tres formes de nom i s'han d respected totes:
 *
 *   crossbarchallenge.html  -> tal qual
 *   clextremerun3d          -> sense extensió, hi afegim .html
 *   clsuperkidadventure.htm -> extensió .htm, NO hi afegim .html
 *
 * El cas .htm és el que fa que no es pugui decidir amb un `endsWith('.html')`:
 * hi ha un joc que es diu exactament així i el fitxer real és
 * `clsuperkidadventure.htm`. Afegir-hi .html donava un 404.
 */
export function gameSrc(url) {
    const hasExtension = /\.[a-z0-9]+$/i.test(url);
    return `${GAMES_DIR}${hasExtension ? url : `${url}.html`}`;
}

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

    // El volum és de cada joc i la interfície l'ha de tenir abans que
    // l'usuari pugui pitjar res: també quan encara només hi ha l'avís
    // de mòbil a pantalla i el joc no s'ha carregat.
    bindVolumeGame(gameSrc(game.url));

    if (needsGate()) {
        showGate(game);
        return;
    }

    openGame(game);
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

    iframe.src = gameSrc(game.url);
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
    // perpetu.
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
    }, FALLBACK_DURATION);

    if (onIframeLoad) iframe.removeEventListener('load', onIframeLoad);
    onIframeLoad = () => {
        iframe.removeEventListener('load', onIframeLoad);
        onIframeLoad = null;
        cancelTimers();
        hideLoader();
        // Assegura el pedaç de volum i li passa el valor desat.
        syncVolumeGame();
    };
    iframe.addEventListener('load', onIframeLoad);

    recordPlay();
}

function showOffline() {
    const iframe = document.getElementById('gameIframe');
    if (iframe) iframe.src = OFFLINE_URL;
    cancelTimers();
    hideLoader();
}

function cancelTimers() {
    clearTimer(loaderTimeout);
    clearTimer(fallbackTimeout);
    loaderTimeout = null;
    fallbackTimeout = null;
}

/* --- Tancament ----------------------------------------------------- */

export function close() {
    cancelTimers();
    hideLoader();
    // Si l'usuari tanca amb l'avís a pantalla, el joc pendent es
    // descarta: no s'ha carregat i no hi ha res a tancar.
    hideGate();
    clearVolumeGame();

    if (sessionStart && currentGame) {
        recordSession(currentGame.name, (Date.now() - sessionStart) / 1000);
    }
    sessionStart = null;
    currentGame = null;

    const modal = document.getElementById('gameModal');
    if (modal) modal.classList.remove('active');

    const iframe = document.getElementById('gameIframe');
    if (iframe) {
        if (onIframeLoad) {
            iframe.removeEventListener('load', onIframeLoad);
            onIframeLoad = null;
        }
        // `src = ''` fa que alguns navegadors tornin a carregar el
        // document actual dins de l'iframe. 'about:blank' és el buit
        // explícit i no genera cap petició.
        iframe.src = 'about:blank';
    }
}

/** Estat per a les proves. */
export function currentSession() {
    return { game: currentGame, startedAt: sessionStart };
}