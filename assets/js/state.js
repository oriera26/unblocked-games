/**
 * state.js · l'estat mutable de l'aplicació i com es desa.
 *
 * Totes les lectures i escriptures a localStorage passen per aquí, de
 * manera que hi ha un únic punt on es decideix què fer quan el
 * navegador no deixa desar (mode privat, quota plena) o quan el que hi
 * havia desat està corrupte.
 */

import { DEFAULT_GAME_VOLUME, DEFAULT_STATS, POINTS_PER_PLAY, STORAGE_KEYS } from './config.js';

/**
 * Llegeix un valor JSON de localStorage.
 *
 * Abans es feia `JSON.parse(localStorage.getItem(k)) || def`, que peta
 * si el valor no és JSON vàlid: un sol valor corrupte deixava la pàgina
 * en blanc i el canvi era irreversible perquè el parseig tornava a fallar
 * en cada càrrega. Aquí un error de lectura es tracta com si no hi
 * hagués res, i a més s'esborra el valor dolent.
 */
function readJson(key, fallback) {
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch (err) {
        // localStorage pot estar totalment deshabilitat.
        console.warn(`[ula] localStorage il·legible (${key})`, err);
        return structuredClone(fallback);
    }

    if (raw === null) return structuredClone(fallback);

    try {
        const value = JSON.parse(raw);
        if (value === null || value === undefined) return structuredClone(fallback);
        return value;
    } catch {
        console.warn(`[ula] valor corrupte a ${key}, elDiscardo i torno al per defecte`);
        try {
            localStorage.removeItem(key);
        } catch { /* no hi ha res a fer */ }
        return structuredClone(fallback);
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        // Quota plena o mode privat: l'aplicació continua en memòria.
        console.warn(`[ula] no s'ha pogut desar ${key}`, err);
        return false;
    }
}

/* --- Favorits ------------------------------------------------------ */

const storedFavorites = readJson(STORAGE_KEYS.favorites, []);
export const favorites = Array.isArray(storedFavorites) ? storedFavorites.filter((u) => typeof u === 'string') : [];

export function isFavorite(url) {
    return favorites.includes(url);
}

/** Alterna el favorit i el desa. Retorna el nou estat. */
export function toggleFavorite(url) {
    const index = favorites.indexOf(url);
    if (index > -1) favorites.splice(index, 1);
    else favorites.push(url);
    writeJson(STORAGE_KEYS.favorites, favorites);
    return index === -1;
}

/* --- Estadístiques ------------------------------------------------ */

/** Fusiona els camps que hi puguin faltar: les claus antigues es respecten. */
function withDefaults(stored) {
    const stats = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return {
        plays: numberOr(stats.plays, 0),
        points: numberOr(stats.points, 0),
        timeSeconds: numberOr(stats.timeSeconds, 0),
        streak: numberOr(stats.streak, 0),
        lastDate: typeof stats.lastDate === 'string' ? stats.lastDate : null,
        gameHistory:
            stats.gameHistory && typeof stats.gameHistory === 'object' && !Array.isArray(stats.gameHistory)
                ? stats.gameHistory
                : structuredClone(DEFAULT_STATS.gameHistory)
    };
}

function numberOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

export const stats = withDefaults(readJson(STORAGE_KEYS.stats, DEFAULT_STATS));

export function saveStats() {
    writeJson(STORAGE_KEYS.stats, stats);
}

/**
 * Actualitza la ratxa diària. S'ha de cridar un sol cop per sessió, en
 *-arribar, no a cada partida: si es cridés dues el mateix dia, la ratxa
 * pujaria de dos en dos.
 */
export function checkStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (!stats.lastDate) {
        stats.streak = 1;
    } else if (stats.lastDate === today) {
        // Ja s'ha comptat avui: no toquem res.
        return;
    } else {
        const last = new Date(stats.lastDate);
        stats.streak = last.toDateString() === yesterday.toDateString() ? stats.streak + 1 : 1;
    }

    stats.lastDate = today;
    saveStats();
}

/** Suma el que compta l'inici d'una partida. */
export function recordPlay() {
    stats.plays += 1;
    stats.points += POINTS_PER_PLAY;
    saveStats();
}

/**
 * Tanca la sessió d'un joc i n'apunta la durada i l'historial.
 * @param {string} name  nom del joc, tal com apareix a gameList
 * @param {number} seconds
 */
export function recordSession(name, seconds) {
    const duration = Math.max(0, Math.floor(seconds));
    stats.timeSeconds += duration;

    const entry = stats.gameHistory[name] ?? { count: 0, timePlayed: 0, lastPlayed: '' };
    entry.count += 1;
    entry.timePlayed += duration;
    entry.lastPlayed = new Date().toISOString();
    stats.gameHistory[name] = entry;

    saveStats();
}

/* --- Volum per joc -------------------------------------------------- */

/**
 * Un únic mapa amb el volum de tots els jocs, no una clau per joc:
 * es llegeix un sol cop en obrir la pàgina i les escriptures d'un
 * arrosseguen de lliscant són totes sobre aquesta còpia.
 */
const storedVolumes = readJson(STORAGE_KEYS.gameVolumes, {});
export const gameVolumes =
    storedVolumes && typeof storedVolumes === 'object' && !Array.isArray(storedVolumes) ? storedVolumes : {};

/** El volum desat d'un joc (0–1), o el de defecte si no n'hi ha. */
export function getGameVolume(id) {
    const value = Number(gameVolumes[id]);
    if (!Number.isFinite(value)) return DEFAULT_GAME_VOLUME;
    return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Desa el volum d'un joc.
 *
 * Tres decimals n'hi ha prou: cap joc es nota amb menys, i el fitxer
 * es queda petit tot i tenir centenars de jocs.
 *
 * @param {string} id  nom del fitxer del joc (`cl2048.html`)
 * @param {number} value 0–1
 */
export function setGameVolume(id, value) {
    const number = Number(value);
    const clamped = Number.isFinite(number)
        ? Math.min(1, Math.max(0, number))
        : DEFAULT_GAME_VOLUME;

    gameVolumes[id] = Math.round(clamped * 1000) / 1000;
    writeJson(STORAGE_KEYS.gameVolumes, gameVolumes);
}

/* --- Filtres ------------------------------------------------------- */

export const filters = {
    category: 'tots',
    search: ''
};