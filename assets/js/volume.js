/**
 * volume.js · el menú del reproductor: volum, mida, favorit i rendiment.
 *
 * Tot el que es pot ajustar amb un joc obert viu en un sol desplegable
 * enganxat al botó ⋮ del modal:
 *
 *   · el volum, que és de cada joc: es desa sota la clau del fitxer
 *     (`STORAGE_KEYS.gameVolumes`) i tornar a obrir el joc el troba tal
 *     com es va deixar;
 *   · la mida del requadre de joc (−1…2), una sola tria per a tots;
 *   · el favorit, el mateix que el de la targeta;
 *   · el mode rendiment només mentre aquell joc és obert; en tancar-lo
 *     torna a manar l'ajust global.
 *
 * El lliscant del volum és horitzontal i no mostra cap percentatge: la
 * pista, el polsador i la icona (que canvia amb el nivell), prou.
 *
 * La part difícil del volum no és la interfície sinó arribar a l'àudio
 * de dins de l'iframe: el joc sona al seu propi document i el volum no
 * s'hi pot tocar des de fora. Qui ho fa és `game-volume.js`, el pedaç
 * que corre a dins del joc. Aquí només es desa el valor, es pinta i se
 * li mana:
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
import {
    getGamePerformance,
    getGameVolume,
    getPlayerSize,
    isFavorite,
    PLAYER_SIZE_MAX,
    PLAYER_SIZE_MIN,
    setGamePerformance,
    setGameVolume,
    setPlayerSize,
    toggleFavorite
} from './state.js';
import { perfModeEnabled } from './settings.js';
import { onLangChange, t } from './i18n.js';
import { gameSrc } from './game-path.js';

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

/** L'entrada del catàleg del joc obert; el menú en treu favorit i estat. */
let openGameEntry = null;

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

/**
 * El nom del fitxer d'un joc a partir de la seva ruta, que és la clau
 * amb què es guarden el volum i el mode rendiment de cada joc.
 *
 * @param {string} src ruta del fitxer, p. ex. `assets/games/clxxx.html`
 * @returns {string|null}
 */
export function gameKeyOf(src) {
    if (typeof src !== 'string') return null;
    if (src.startsWith(GAMES_DIR)) return src.slice(GAMES_DIR.length);
    if (src.startsWith(OFFLINE_GAMES_DIR)) return src.slice(OFFLINE_GAMES_DIR.length);
    return null;
}

/* --- Pintar el menú -------------------------------------------------- */

/**
 * Pinta el valor del volum: al lliscant i a la icona.
 *
 * La icona només té tres estats (alt, baix, mut) i no diu cap número,
 * que és el que demana un control mínim. Els estats són excloents: si
 * el joc sonés mut, també li tocaria «baix» i es pintarien dues icones.
 */
function paint(volume) {
    const value = clamp(volume);

    const slider = byId('volumeSlider');
    if (slider) slider.value = String(Math.round(value * 100));

    const state = byId('volumeState');
    if (!state) return;

    const muted = value <= 0;
    const low = !muted && value < 0.5;

    state.classList.toggle('is-muted', muted);
    state.classList.toggle('is-low', low);
}

/** El commutador del mode rendiment, amb l'estat que s'està aplicant. */
function paintPerformance(on) {
    const button = byId('menuPerfBtn');
    if (!button) return;
    button.classList.toggle('on', on);
    button.setAttribute('aria-checked', String(on));
}

/** Els botons de mida es tanquen quan ja no es pot anar més enllà. */
function paintSize() {
    const size = getPlayerSize();
    const down = byId('sizeDown');
    const up = byId('sizeUp');
    if (down) down.disabled = size <= PLAYER_SIZE_MIN;
    if (up) up.disabled = size >= PLAYER_SIZE_MAX;
}

/** L'estrella i el text del favorit, segons l'estat del joc obert. */
function paintFavorite() {
    if (!openGameEntry) return;

    const fav = isFavorite(openGameEntry.url);

    const button = byId('menuFavBtn');
    if (button) button.classList.toggle('is-fav', fav);

    const label = byId('menuFavLabel');
    if (label) label.textContent = t(fav ? 'card.fav.remove' : 'card.fav.add');
}

/** Repinta les files que porten estat del joc obert. */
function paintRows() {
    paintFavorite();
    paintSize();

    const key = openGameEntry ? gameKeyOf(gameSrc(openGameEntry)) : null;
    if (key === null) return;

    const choice = getGamePerformance(key);
    paintPerformance(choice === null ? perfModeEnabled() : choice);
}

/* --- El desplegable --------------------------------------------------- */

function isMenuOpen() {
    const panel = byId('gameMenuPanel');
    return Boolean(panel) && !panel.hidden;
}

function setMenuOpen(open) {
    const panel = byId('gameMenuPanel');
    const button = byId('gameMenuBtn');
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
 * sigui, li mana el volum i plega el menú si es clica dins del joc.
 */
export function syncVolumeGame() {
    stopWatch();
    if (targetKey === null) return;

    installPatch(gameDocument());
    sendValue();

    // Un clic dins del joc no arriba mai al document de dalt (se'l menja
    // l'iframe), així que per tancar el menú en jugar s'escolta des de
    // dins. A cada càrrega l'iframe és una finestra nova: l'escolta vella
    // mor amb ella i no s'acumulen.
    try {
        byId('gameIframe')?.contentWindow?.addEventListener(
            'pointerdown',
            () => setMenuOpen(false),
            { capture: true }
        );
    } catch {
        // Idem: origen creuat.
    }
}

/* --- El joc obert ----------------------------------------------------- */

/**
 * Apunta el joc que s'obrirà i carrega el seu valor al control.
 *
 * @param {string} src ruta del fitxer, p. ex. `assets/games/clxxx.html`
 */
export function bindVolumeGame(src) {
    // La clau és el nom del fitxer (el que `game-volume.js` dedueix de
    // `location.pathname`), tant si el joc és a assets/games/ com si és
    // a la carpeta offline.
    targetKey = gameKeyOf(src);
    setMenuOpen(false);
    paint(targetKey === null ? 1 : getGameVolume(targetKey));
}

/** El joc s'ha tancat: sense objectiu, sense entrada i amb el menú plegat. */
export function clearVolumeGame() {
    targetKey = null;
    openGameEntry = null;
    stopWatch();
    setMenuOpen(false);
}

/* --- Interfície ------------------------------------------------------- */

/** La mida: es desa, s'aplica al modal i es repinten els botons. */
function stepSize(delta) {
    const size = getPlayerSize() + delta;
    if (size < PLAYER_SIZE_MIN || size > PLAYER_SIZE_MAX) return;

    setPlayerSize(size);

    const modal = byId('gameModal');
    if (modal) modal.dataset.size = String(size);

    paintSize();
}

/** Enganxa el botó, el lliscant, la mida, les accions i els tancaments. */
export function initPlayerMenu() {
    // player.js avisa quan un joc s'obre o es tanca; el menú repinta les
    // files que porten estat perquè sempre ensenyin el del joc del davant.
    // (Enganxat aquí i no a dalt del mòdul: aquest fitxer també s'importa
    // fora del navegador — tools/test-server.mjs — i allà `document` no hi és.)
    document.addEventListener('ula:player', (event) => {
        openGameEntry = event.detail?.open ? event.detail.game ?? null : null;
        if (openGameEntry) paintRows();
    });

    // Si l'idioma canvia amb un joc obert, el text del favorit s'ha de
    // tornar a posar: canvia entre «Afegir» i «Treure» i applyI18n hi
    // deixaria el text del markup.
    onLangChange(() => {
        if (openGameEntry) paintFavorite();
    });

    const button = byId('gameMenuBtn');
    const slider = byId('volumeSlider');
    const wrap = byId('gameMenuWrap');
    if (!button || !slider || !wrap) return;

    button.addEventListener('click', () => setMenuOpen(!isMenuOpen()));

    // El lliscant dispara `input` a cada píxel mogut. El pintat es fa de
    // seguida (feedback immediat), però desar el valor i enviar-lo al joc
    // s'ajunta en un sol fotograma: enviar un postMessage per píxel és
    // inútil si el joc no pot pintar més de pressa que la pantalla.
    let volumeFrame = 0;
    slider.addEventListener('input', () => {
        paint(sliderVolume());
        if (volumeFrame) return;

        volumeFrame = requestAnimationFrame(() => {
            volumeFrame = 0;
            if (targetKey !== null) setGameVolume(targetKey, sliderVolume());
            sendValue();
        });
    });

    // En deixar anar el lliscant, el valor es desa i s'envia de seguida:
    // si el navegador tenia el fotograma pendent (pestanya de segon pla)
    // o l'usuari tanca el joc tot seguit, la tria ja és a l'emmagatzematge.
    slider.addEventListener('change', () => {
        if (volumeFrame) {
            cancelAnimationFrame(volumeFrame);
            volumeFrame = 0;
        }
        if (targetKey !== null) setGameVolume(targetKey, sliderVolume());
        sendValue();
    });

    byId('sizeDown')?.addEventListener('click', () => stepSize(-1));
    byId('sizeUp')?.addEventListener('click', () => stepSize(1));

    // El favorit és el mateix que el de la targeta; la graella del
    // darrere es repinta amb l'esdeveniment perquè la seva estrella no
    // quedi vella.
    byId('menuFavBtn')?.addEventListener('click', () => {
        if (!openGameEntry) return;
        toggleFavorite(openGameEntry.url);
        paintFavorite();
        document.dispatchEvent(new CustomEvent('ula:favorites'));
    });

    // El mode rendiment d'aquest joc. Si la tria coincideix amb el
    // global es treu l'entrada en lloc de desar-hi el mateix valor: així
    // el global segueix manant si més endavant es canvia.
    byId('menuPerfBtn')?.addEventListener('click', () => {
        const key = openGameEntry ? gameKeyOf(gameSrc(openGameEntry)) : null;
        if (key === null) return;

        const choice = getGamePerformance(key);
        const next = !(choice === null ? perfModeEnabled() : choice);

        setGamePerformance(key, next === perfModeEnabled() ? null : next);
        document.body.classList.toggle('performance-mode', next);
        paintPerformance(next);
    });

    // Escape, en fase de captura: primer es plega el menú i el giny no
    // arriba al listener de dalt, que tancaria el joc sencer. Sense el
    // menú obert, l'Escape fa la seva feina de sempre.
    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape' || !isMenuOpen()) return;
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(false);
            button.focus();
        },
        true
    );

    // Clic fora del control: el dels botons del modal arriba aquí; el de
    // dins de l'iframe, a syncVolumeGame. El del panell mateix es queda
    // dins de #gameMenuWrap i no plega res.
    document.addEventListener('pointerdown', (event) => {
        if (!isMenuOpen()) return;
        const target = event.target;
        if (target instanceof Node && wrap.contains(target)) return;
        setMenuOpen(false);
    });
}
