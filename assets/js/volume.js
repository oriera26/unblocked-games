/**
 * volume.js · el control de volum del modal del joc.
 *
 * Un control per a cada joc, no un de global: el valor que es mou aquí
 * es desa sota la clau del fitxer del joc (`STORAGE_KEYS.gameVolumes`),
 * així que tornar a obrir un joc el troba tal com es va deixar.
 *
 * El panell cau verticalment cap avall des del botó i no mostra cap
 * percentatge: la pista, el polsador i la icona (que canvia amb el
 * nivell), prou.
 *
 * La part difícil no és la interfície sinó arribar a l'àudio de dins de
 * l'iframe: el joc sona al seu propi document i el volum no s'hi pot
 * tocar des de fora. Qui ho fa és `game-volume.js`, el pedaç que
 * corre a dins del joc. Aquí només es desa el valor, es pinta i se li
 * mana:
 *
 *   · el service worker (a la web) i server.js (a l'app d'Escripteri i
 *     al servidor local) l'insereixen a l'HTML del joc abans que cap
 *     script del joc, que és l'únic moment en què es poden interceptar
 *     els contextos de Web Audio;
 *   · si cap dels dos hi ha passat — la primera visita, abans que el
 *     service worker mani — `watchVolumeGame()` mira de ficar-lo tant
 *     aviat com l'iframe tingui document, i `syncVolumeGame()` el fica en
 *     acabar de carregar com a últim recurs. Arribant tan tard els
 *     `<audio>`/`<video>` es controlen igualment, però els contextos
 *     d'àudio ja creats no.
 */

import { GAMES_DIR, OFFLINE_GAMES_DIR } from './config.js';
import { getGameVolume, setGameVolume } from './state.js';

/**
 * URL absoluta del pedaç.
 *
 * No es pot posar `assets/js/game-volume.js` a seques: un `<script>`
 * resol la seva `src` contra el document al qual pertany, i aquest serà
 * el del joc (`assets/games/...`), no el de la pàgina mare.
 *
 * Es calcula a dins d'una funció — i no com a constant de mòdul — perquè
 * aquest fitxer també s'importa fora del navegador (tools/test-server.mjs
 * carrega player.js per provar-lo), i allà `document` no existeix.
 */
function patchSrc() {
    return new URL('assets/js/game-volume.js', document.baseURI).href;
}

/** Id del `<script>` que hi posa el pedaç: evita ficar-lo dues vegades. */
const PATCH_TAG_ID = '__ulaVolumeTag';

/** Marca que deixa el pedaç al document (vegeu game-volume.js). */
const PATCH_MARK = 'ula-volume-bridge';

/** Tipus del missatge que entén game-volume.js. */
const MESSAGE_TYPE = 'ula.volume';

/** Quant de temps es mira d'injectar el pedaç mentre l'iframe carrega. */
const WATCH_MS = 15000;

/** Cada quant es fa la comprovació del document de l'iframe. */
const WATCH_EVERY_MS = 10;

/** Nom del fitxer del joc obert (`cl2048.html`), o null si no n'hi ha. */
let targetKey = null;
let panelOpen = false;
let watchTimer = null;
let watchStart = 0;

function byId(id) {
    return document.getElementById(id);
}

function clamp(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return number < 0 ? 0 : number > 1 ? 1 : number;
}

/** Volum del lliscant (0–100) com a valor de 0 a 1. */
function sliderVolume() {
    const slider = byId('volumeSlider');
    const value = Number(slider?.value);
    if (!Number.isFinite(value)) return 1;
    return clamp(value / 100);
}

/* --- El control ----------------------------------------------------- */

/**
 * Pinta el valor: al lliscant i a la icona.
 *
 * La icona només té tres estats (alt, baix, mut) i no diu cap número,
 * que és el que demana un control mínim. Els estats són excloents: si
 * sonés el joc mut, també li tocaria «baix» i es pintarien dues icones.
 */
function paint(volume) {
    const value = clamp(volume);

    const slider = byId('volumeSlider');
    if (slider) slider.value = String(Math.round(value * 100));

    const button = byId('volumeModal');
    if (!button) return;

    const muted = value <= 0;
    const low = !muted && value < 0.5;

    button.classList.toggle('is-muted', muted);
    button.classList.toggle('is-low', low);
}

function isPanelOpen() {
    const panel = byId('volumePanel');
    return Boolean(panel) && !panel.hidden;
}

function setPanelOpen(open) {
    panelOpen = open;

    const panel = byId('volumePanel');
    const button = byId('volumeModal');
    if (panel) panel.hidden = !open;
    if (button) button.setAttribute('aria-expanded', String(open));

    // En obrir-lo, el focus va al lliscant: qui hi arriba amb el teclat
    // pot baixar el volum sense haver de buscar-lo.
    if (open) byId('volumeSlider')?.focus({ preventScroll: true });
}

/**
 * Envia el volum actual al joc de dins de l'iframe.
 *
 * El missatge el rep game-volume.js, que corre al mateix origen. Si
 * encara no hi és (s'injecta just després del primer pintat), ell mateix
 * llegirà l'emmagatzematge en arrencar, així que no es perd res.
 */
function sendValue() {
    if (targetKey === null) return;

    try {
        byId('gameIframe')?.contentWindow?.postMessage(
            { type: MESSAGE_TYPE, value: sliderVolume() },
            location.origin
        );
    } catch {
        // L'iframe ja ha canviat d'origen o s'ha tancat: no hi ha res a fer.
    }
}

/* --- El pedaç dins del joc ------------------------------------------ */

function gameDocument() {
    try {
        return byId('gameIframe')?.contentDocument ?? null;
    } catch {
        return null;
    }
}

/** Si el document ja porta el pedaç (o no s'hi pot entrar, que és el mateix). */
function alreadyPatched(doc) {
    if (!doc) return false;

    try {
        if (doc.getElementById(PATCH_TAG_ID)) return true;
        const root = doc.documentElement;
        return Boolean(root) && root.getAttribute('data-ula-volume') === PATCH_MARK;
    } catch {
        // Document inaccessible: no s'hi pot injectar res.
        return true;
    }
}

function installPatch(doc) {
    if (alreadyPatched(doc)) return;

    try {
        const host = doc.head || doc.documentElement;
        if (!host) return;

        const script = doc.createElement('script');
        script.id = PATCH_TAG_ID;
        script.src = patchSrc();
        // Sense `async`: si el joc ja ha inserit altres scripts dinàmics,
        // aquest va abans.
        script.async = false;
        host.appendChild(script);
    } catch {
        // Sense accés al document no hi ha res a fer.
    }
}

function stopWatch() {
    if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
    }
}

/**
 * Mentre l'iframe carrega, mira de ficar-hi el pedaç al primer moment en
 * què hi hagi document amb l'anàlisi encara en marxa.
 *
 * No sempre arriba abans que els scripts del joc (en els fitxers petits
 * tot es parseja d'una sola tasca), però en els grossos o lents surt
 * gratis, i quan el pedaç ja hi és la comprovació no fa res.
 */
export function watchVolumeGame() {
    stopWatch();
    watchStart = Date.now();

    watchTimer = setInterval(() => {
        if (targetKey === null || Date.now() - watchStart > WATCH_MS) {
            stopWatch();
            return;
        }

        const doc = gameDocument();
        if (doc && doc.readyState === 'loading') installPatch(doc);
    }, WATCH_EVERY_MS);
}

/**
 * Quan l'iframe ha acabat de carregar el joc: assegura que el pedaç hi
 * sigui, li mana el volum i plega el panell si es clica dins del joc.
 */
export function syncVolumeGame() {
    stopWatch();
    if (targetKey === null) return;

    installPatch(gameDocument());
    sendValue();

    // Un clic dins del joc no arriba mai al document de dalt (se'l menja
    // l'iframe), així que per tancar el panell en jugar s'escolta des de
    // dins. A cada càrrega l'iframe és una finestra nova: l'escolta vella
    // mor amb ella i no s'acumulen.
    try {
        byId('gameIframe')?.contentWindow?.addEventListener(
            'pointerdown',
            () => setPanelOpen(false),
            { capture: true }
        );
    } catch {
        // Idem: origen creuat.
    }
}

/**
 * Apunta el joc que s'obrirà i carrega el seu valor al control.
 *
 * @param {string} src ruta del fitxer, p. ex. `assets/games/clxxx.html`
 */
export function bindVolumeGame(src) {
    // La clau és el nom del fitxer (el que `game-volume.js` dedueix de
    // `location.pathname`), tant si el joc és a assets/games/ com si és
    // a la carpeta offline.
    if (src.startsWith(GAMES_DIR)) targetKey = src.slice(GAMES_DIR.length);
    else if (src.startsWith(OFFLINE_GAMES_DIR)) targetKey = src.slice(OFFLINE_GAMES_DIR.length);
    else targetKey = null;
    setPanelOpen(false);
    paint(targetKey === null ? 1 : getGameVolume(targetKey));
}

/** El joc s'ha tancat: sense objectiu i amb el panell plegat. */
export function clearVolumeGame() {
    targetKey = null;
    stopWatch();
    setPanelOpen(false);
}

/* --- Interfície ----------------------------------------------------- */

/** Enganxa el botó, el lliscant i els tancaments del panell. */
export function initVolume() {
    const button = byId('volumeModal');
    const slider = byId('volumeSlider');
    const wrap = byId('volumeWrap');
    if (!button || !slider || !wrap) return;

    button.addEventListener('click', () => setPanelOpen(!isPanelOpen()));

    slider.addEventListener('input', () => {
        const volume = sliderVolume();
        if (targetKey !== null) setGameVolume(targetKey, volume);
        paint(volume);
        sendValue();
    });

    // Escape, en fase de captura: primer es plega el panell i el giny no
    // arriba al listener de dalt, que tancaria el joc sencer. Sense el
    // panell obert, l'Escape fa la seva feina de sempre.
    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape' || !isPanelOpen()) return;
            event.preventDefault();
            event.stopPropagation();
            setPanelOpen(false);
            button.focus();
        },
        true
    );

    // Clic fora del control: el dels botons del modal arriba aquí; el de
    // dins de l'iframe, a syncVolumeGame. El del lliscant mateix es queda
    // dins de #volumeWrap i no plega res.
    document.addEventListener('pointerdown', (event) => {
        if (!isPanelOpen()) return;
        const target = event.target;
        if (target instanceof Node && wrap.contains(target)) return;
        setPanelOpen(false);
    });
}
