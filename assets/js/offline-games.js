/**
 * offline-games.js · l'estat i la baixada dels jocs offline.
 *
 * Els jocs `type: "offline"` viuen a `assets/offline/` i són grossos
 * (entre 20 i 56 MB): no es poden carregar dins l'iframe sense més ni
 * més, perquè només entrar al catàleg no pot costar 50 MB de dades.
 *
 * El flux és:
 *
 *   1. En arrencar, es mira per a cada joc offline si ja és a la
 *      memòria cau (Cache Storage). L'estat viu aquí, en un mapa, i la
 *      interfície el consulta per pintar la targeta.
 *   2. Si l'usuari obre un joc que encara no s'ha baixat, no s'obre
 *      res: s'engega la baixada i la targeta n'ensenya el progrés.
 *   3. Quan acaba, el fitxer queda a `OFFLINE_CACHE_NAME` i el joc ja
 *      s'obre; a la web el service worker el serveix des de la cau.
 *
 * La baixada amb progrés la fa el service worker (missatges
 * `DOWNLOAD_OFFLINE`), que és qui pot llegir el cos a poc a poc i
 * desar-lo. Sense service worker (Electron, primera visita) es baixa
 * des de la pàgina i es desa a la mateixa Cache Storage.
 */

import { OFFLINE_CACHE_NAME } from './config.js';
import { gameSrc } from './game-path.js';

/** Estat per `game.url`: { state, percent, bytes }. */
const states = new Map();

/** Subscriptors de canvis (la interfície). */
const listeners = new Set();

/** URL absoluta del fitxer → `game.url`, per resoldre els missatges del SW. */
const absToUrl = new Map();

/** `game.url` → joc, per tornar a llegir l'estat quan cal. */
const gamesByUrl = new Map();

/** Baixades en curs, per no llançar-ne dues de la mateixa. */
const inflight = new Map();

/** Promeses que esperen el final d'una baixada feta pel service worker. */
const pendingSw = new Map();

let swBound = false;

/** Hi ha Cache Storage en aquest navegador? */
function cacheOk() {
    return typeof caches !== 'undefined' && caches !== null;
}

/** Hi ha un service worker controlant aquesta pàgina? */
function swController() {
    return !!(typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller);
}

/**
 * Si no hi ha service worker (Electron, local) no té sentit bloquejar
 * l'obertura: el fitxer és al mateix disc i s'obre a l'instant.
 */
export function canGateOffline() {
    return swController();
}

/** És una entrada de joc offline? */
export function isOfflineGame(game) {
    return !!game && game.type === 'offline';
}

function srcOf(game) {
    return gameSrc(game);
}

function absOf(game) {
    return new URL(srcOf(game), document.baseURI).href;
}

function stateEntry(url) {
    return states.get(url) || { state: 'idle', percent: 0, bytes: 0 };
}

/**
 * L'estat actual d'un joc offline.
 * @returns {{state: 'idle'|'downloading'|'ready'|'error', percent: number, bytes: number}}
 */
export function stateOf(game) {
    return stateEntry(game.url);
}

/**
 * Es pot obrir ja el joc?
 *
 * Sense Cache API o sense service worker, sí: no hi ha res a esperar.
 */
export function isOfflineReady(game) {
    if (!cacheOk() || !canGateOffline()) return true;
    return stateEntry(game.url).state === 'ready';
}

/** Es notifica a cada canvi d'estat. */
export function onOfflineChange(listener) {
    listeners.add(listener);
}

function setState(url, patch) {
    const next = { ...stateEntry(url), ...patch };
    states.set(url, next);
    for (const listener of listeners) {
        try {
            listener(url, next);
        } catch {
            /* un subscriptor trencat no pot aturar els altres */
        }
    }
}

/** Comprova si un joc ja és a la memòria cau i n'actualitza l'estat. */
async function readState(game) {
    const url = game.url;
    const abs = absOf(game);
    absToUrl.set(abs, url);

    if (!cacheOk() || !canGateOffline()) {
        setState(url, { state: 'ready', percent: 100 });
        return;
    }

    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const hit = await cache.match(abs);
        setState(url, hit ? { state: 'ready', percent: 100 } : { state: 'idle', percent: 0 });
    } catch {
        setState(url, { state: 'idle', percent: 0 });
    }
}

/**
 * Arrenca l'estat de tots els jocs offline i escolta el service worker.
 * @param {Array<object>} games catàleg complet
 */
export function initOffline(games) {
    bindServiceWorker();
    const offline = (games || []).filter(isOfflineGame);
    for (const game of offline) gamesByUrl.set(game.url, game);

    // Si el service worker ja controla la pàgina, es pot llegir l'estat
    // de veritat (hi ha cau i hi ha on servir-la).
    if (canGateOffline()) return Promise.all(offline.map(readState));

    // Primera visita: el SW encara no controla. Quan agafi el control cal
    // rellegir l'estat, perquè ara sí que hi ha gating i cau. El listener
    // de controllerchange pot arribar tard (clients.claim() i la propietat
    // del navegador no van lligats), de manera que també es vigila amb una
    // sonda durant uns segons després que el SW sigui actiu.
    retryWhenControlled(offline);
    return Promise.all(offline.map(readState));
}

/** Rellegeix l'estat de tots els jocs quan el SW agafi el control. */
function retryWhenControlled(offline) {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    navigator.serviceWorker.ready
        .then(() => {
            const poll = setInterval(() => {
                if (canGateOffline()) {
                    clearInterval(poll);
                    for (const game of offline) readState(game);
                }
            }, 150);
            setTimeout(() => clearInterval(poll), 5000);
        })
        .catch(() => {
            /* sense SW actiu: el mode no es pot activar, tampoc cal gating */
        });
}

/**
 * Baixa un joc offline i el deixa a la memòria cau.
 *
 * Torna una promesa que es resol quan el fitxer és a la cau (o quan no
 * calia baixar-lo). Els errors es reflecteixen a l'estat.
 *
 * @param {object} game
 * @returns {Promise<void>}
 */
export function downloadGame(game) {
    const url = game.url;
    const running = inflight.get(url);
    if (running) return running;

    if (!cacheOk()) {
        setState(url, { state: 'ready', percent: 100 });
        return Promise.resolve();
    }

    const abs = absOf(game);
    absToUrl.set(abs, url);
    setState(url, { state: 'downloading', percent: 0, bytes: 0 });

    const run = (async () => {
        // Si ja hi era (per exemple, l'estat encara no s'havia resolt),
        // no cal tornar a baixar-lo.
        try {
            const cache = await caches.open(OFFLINE_CACHE_NAME);
            if (await cache.match(abs)) {
                setState(url, { state: 'ready', percent: 100 });
                return;
            }
        } catch {
            /* seguim amb la baixada */
        }

        if (swController()) {
            await downloadViaServiceWorker(abs, url);
        } else {
            await downloadInPage(abs, url);
        }
        setState(url, { state: 'ready', percent: 100 });
    })().catch((err) => {
        setState(url, { state: 'error', percent: 0 });
        console.warn('[ula] no s\'ha pogut baixar el joc offline:', url, err);
        throw err;
    });

    // Que un rebuig no surti com a error no gestionat.
    run.catch(() => {});
    inflight.set(url, run);
    run.then(
        () => inflight.delete(url),
        () => inflight.delete(url)
    );
    return run;
}

/** Esborra la còpia baixada d'un joc. */
export async function removeGame(game) {
    if (!cacheOk()) return;
    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        await cache.delete(absOf(game));
    } catch {
        /* si no es pot esborrar, l'estat no canvia */
    }
    setState(game.url, { state: 'idle', percent: 0, bytes: 0 });
}

/* ================================================================
   Baixada
   ================================================================ */

/**
 * Demana la baixada al service worker i espera'n el final.
 * El SW va enviant OFFLINE_PROGRESS i acaba amb OFFLINE_DONE o
 * OFFLINE_ERROR.
 */
function downloadViaServiceWorker(abs, url) {
    return new Promise((resolve, reject) => {
        pendingSw.set(url, { resolve, reject });
        navigator.serviceWorker.controller.postMessage({ type: 'DOWNLOAD_OFFLINE', url: abs });
    });
}

/** Baixada sense service worker: es llegeix el cos des de la pàgina. */
async function downloadInPage(abs, url) {
    const response = await fetch(abs, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const type = response.headers.get('content-type') || 'text/html';
    const total = Number(response.headers.get('content-length')) || 0;
    let blob;

    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total) {
                const percent = Math.min(99, Math.floor((received / total) * 100));
                setState(url, { state: 'downloading', percent, bytes: received });
            }
        }

        blob = new Blob(chunks, { type });
    } else {
        blob = await response.blob();
    }

    const cache = await caches.open(OFFLINE_CACHE_NAME);
    await cache.put(abs, new Response(blob, { status: 200, headers: { 'Content-Type': type } }));
}

/* ================================================================
   Missatges del service worker
   ================================================================ */

function bindServiceWorker() {
    if (swBound) return;
    swBound = true;

    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    // A la primera visita el service worker encara no controla la pàgina i
    // els jocs es marquen com a llestos (no es pot ni bloquear ni servir la
    // cau). Quan el SW pren el control, s'ha de rellegir l'estat de veritat:
    // si no, un joc sense baixar continuaria obrint-se directament.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        for (const game of gamesByUrl.values()) readState(game);
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        const url = data.url ? absToUrl.get(data.url) : null;
        if (!url) return;

        if (data.type === 'OFFLINE_PROGRESS') {
            const percent = data.total
                ? Math.min(99, Math.floor((data.received / data.total) * 100))
                : 0;
            setState(url, { state: 'downloading', percent, bytes: data.received || 0 });
            return;
        }

        if (data.type === 'OFFLINE_DONE') {
            setState(url, { state: 'ready', percent: 100, bytes: data.bytes || 0 });
            finishPending(url, true);
            return;
        }

        if (data.type === 'OFFLINE_ERROR') {
            setState(url, { state: 'error', percent: 0 });
            finishPending(url, false);
        }
    });
}

function finishPending(url, ok) {
    const pending = pendingSw.get(url);
    if (!pending) return;
    pendingSw.delete(url);
    if (ok) pending.resolve();
    else pending.reject(new Error('la baixada ha fallat'));
}
