/**
 * sync-core.js · la lògica de la sincronització, sense xarxa ni navegador.
 *
 * Aquí no hi ha Firestore ni `localStorage`: només funcions pures que
 * decideixen què s'ha de pujar, què s'ha de baixar i com es representen
 * els valors que no capen en un document. Així es pot provar amb Node
 * (`tools/check-sync-core.mjs`) sense haver de tenir cap projecte engegat.
 *
 * El vocabulari:
 *
 *   clau d'estat   una clau pròpia de l'aplicació que viatja amb el
 *                  compte (`ulaStats`, `ulaFavorites`, `ulaGameVolumes`)
 *   clau local     una clau de localStorage que no és de l'aplicació:
 *                  la desa un joc
 *   save           un valor sincronitzable: una clau local o un registre
 *                  d'IndexedDB
 *   fragment       un tros d'un valor massa gran per a un sol document
 */

import { STORAGE_KEYS } from './config.js';

/** Sostre de bytes per fragment. Firestore en deixa 1 MiB per document. */
export const CHUNK_BYTES = 500 * 1024;

/**
 * Claus pròpies que viatgen amb el compte.
 *
 * L'idioma, el mode rendiment i l'avís de l'app es queden fora a posta:
 * són de cada dispositiu (canviar-los en un no ha de canviar l'altre).
 */
export const SYNCED_STATE_KEYS = [STORAGE_KEYS.favorites, STORAGE_KEYS.stats, STORAGE_KEYS.gameVolumes];

/** Claus pròpies que no viatgen mai. */
export const UNSYNCED_KEYS = [
    STORAGE_KEYS.lang,
    STORAGE_KEYS.performanceMode,
    STORAGE_KEYS.appBannerDismissed,
    STORAGE_KEYS.syncMeta,
    STORAGE_KEYS.leagueSync
];

/**
 * Bases d'IndexedDB que no són de cap joc.
 *
 * Firebase hi desa la sessió del compte i la memòria cau de Firestore:
 * pujar-les seria filtrar tokens i, a més, xocar amb el propi SDK.
 *
 * `UnityCache` tampoc: els jocs de Unity hi guarden la memòria cau
 * dels fitxers de build (desenes de megabytes), no les partides. Els
 * desats de debò van per una altra base (IDBFS) o per `localStorage`.
 */
const IDB_EXCLUDED = /^(firebase|firestore|unitycache$)/i;

/** Cert per a les claus d'estat que sincronitzem. */
export function isSyncedStateKey(key) {
    return SYNCED_STATE_KEYS.includes(key);
}

/** Cert per a les claus d'estat que són nostres i no viatgen. */
export function isUnsyncedKey(key) {
    return UNSYNCED_KEYS.includes(key);
}

/**
 * Cert si una clau de localStorage és un save de joc.
 *
 * Ho és tota la que no sigui de l'aplicació (les nostres comencen per
 * `ula`) i no sigui una de les que es queden al dispositiu.
 */
export function isGameSaveKey(key) {
    if (typeof key !== 'string' || key === '') return false;
    if (isSyncedStateKey(key) || isUnsyncedKey(key)) return false;
    return !key.startsWith('ula');
}

/** Cert si una base d'IndexedDB és d'un joc (i per tant s'ha de pujar). */
export function isGameDatabase(name) {
    return typeof name === 'string' && name !== '' && !IDB_EXCLUDED.test(name);
}

/* --- Codificació de claus i de valors ------------------------------ */

/**
 * Converteix una clau d'IndexedDB en alguna cosa que cap en un id de
 * document i que es pot tornar a muntar tal qual.
 *
 * Una clau pot ser un nombre, un text, una data o un vector (claus
 * compostes). Firestore desaria una data com un `Timestamp` i no
 * podríem saber que ho era; per això tot va etiquetat.
 */
export function encodeIdbKey(key) {
    if (key instanceof Date) return { t: 'date', v: key.getTime() };
    if (Array.isArray(key)) return { t: 'array', v: key.map(encodeIdbKey) };
    if (typeof key === 'number') return { t: 'number', v: key };
    if (typeof key === 'string') return { t: 'string', v: key };
    if (typeof key === 'bigint') return { t: 'bigint', v: key.toString() };
    return { t: 'json', v: JSON.parse(JSON.stringify(key)) };
}

/** El camí invers d'`encodeIdbKey`. */
export function decodeIdbKey(enc) {
    if (!enc || typeof enc !== 'object') return enc;
    switch (enc.t) {
        case 'number': return enc.v;
        case 'string': return enc.v;
        case 'bigint': return BigInt(enc.v);
        case 'date': return new Date(enc.v);
        case 'array': return enc.v.map(decodeIdbKey);
        default: return enc.v;
    }
}

const b64 = {
    encode(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    },
    decode(text) {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
};

/**
 * Passa un valor de JavaScript a una forma que es pot desar com a JSON.
 *
 * Tot el que no sigui JSON pur s'etiqueta amb `__t` per poder-lo
 * reconstruir. El que no sap representar (una funció, un símbol) es
 * descarta i ho diu.
 */
export function encodeValue(value) {
    if (value === null) return { __t: 'null' };
    if (value === undefined) return { __t: 'undefined' };

    const type = typeof value;
    if (type === 'string' || type === 'boolean') return value;
    if (type === 'number') return Number.isFinite(value) ? value : { __t: 'number', v: String(value) };
    if (type === 'bigint') return { __t: 'bigint', v: value.toString() };
    if (type === 'function' || type === 'symbol') return { __t: 'dropped' };

    if (value instanceof Date) return { __t: 'date', v: value.getTime() };
    if (value instanceof RegExp) return { __t: 'regexp', source: value.source, flags: value.flags };
    if (value instanceof ArrayBuffer) return { __t: 'bytes', v: b64.encode(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) {
        return { __t: 'bytes', v: b64.encode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    }
    if (Array.isArray(value)) return value.map(encodeValue);
    if (value instanceof Map) return { __t: 'map', v: [...value].map(([k, v]) => [encodeValue(k), encodeValue(v)]) };
    if (value instanceof Set) return { __t: 'set', v: [...value].map(encodeValue) };

    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v);
    return out;
}

/** El camí invers d'`encodeValue`. */
export function decodeValue(enc) {
    if (enc === null || typeof enc !== 'object') return enc;

    if (Array.isArray(enc)) return enc.map(decodeValue);

    switch (enc.__t) {
        case 'null': return null;
        case 'undefined': return undefined;
        case 'dropped': return undefined;
        case 'number': return Number(enc.v);
        case 'bigint': return BigInt(enc.v);
        case 'date': return new Date(enc.v);
        case 'regexp': return new RegExp(enc.source, enc.flags);
        case 'bytes': return b64.decode(enc.v);
        case 'map': return new Map(enc.v.map(([k, v]) => [decodeValue(k), decodeValue(v)]));
        case 'set': return new Set(enc.v.map(decodeValue));
        default: {
            const out = {};
            for (const [k, v] of Object.entries(enc)) out[k] = decodeValue(v);
            return out;
        }
    }
}

/**
 * Els bytes UTF-8 d'un text (per tallar pels bytes, no pels caràcters).
 *
 * Es compta a mà i no amb `TextEncoder` perquè `chunkText` ho crida per
 * cada caràcter: muntar un codificador nou a cada crida costava segons
 * per cada valor que es puja.
 */
export function utf8Length(str) {
    let bytes = 0;

    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);

        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
            // Un parell substitut (un emoji, per exemple) fa 4 bytes junts.
            const next = str.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4;
                i++;
            } else {
                // Mig parell: `TextEncoder` el substitueix i fa 3 bytes.
                bytes += 3;
            }
        } else bytes += 3;
    }

    return bytes;
}

/**
 * Una mida aproximada d'un valor d'IndexedDB, sense transformar-lo.
 *
 * Serveix per descartar valors grossos (memòries cau dels jocs) abans
 * de codificar-los i fer-los viatjar: encodar un valor de megabytes és
 * el que costa, i una mida de referència n'hi ha prou per decidir.
 *
 * La profunditat va limitada perquè un valor pot tenir estructures
 * cícliques (IndexedDB ho permet) i això no s'ha de quedar mai penjat.
 */
export function roughBytes(value, depth = 0) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length;
    if (typeof value !== 'object') return 8;

    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
    if (value instanceof Date || value instanceof RegExp) return 24;

    if (depth >= 8) return 64;

    if (Array.isArray(value)) {
        let total = 0;
        for (const item of value) total += roughBytes(item, depth + 1);
        return total;
    }

    if (value instanceof Map) {
        let total = 0;
        for (const [key, item] of value) total += roughBytes(key, depth + 1) + roughBytes(item, depth + 1);
        return total;
    }

    if (value instanceof Set) {
        let total = 0;
        for (const item of value) total += roughBytes(item, depth + 1);
        return total;
    }

    let total = 0;
    for (const [key, item] of Object.entries(value)) total += key.length + roughBytes(item, depth + 1);
    return total;
}

/**
 * Talla un text en fragments que no passin de `maxBytes` cada un.
 *
 * Es talla per punts de codi sencers, així que un caràcter compost de
 * dos (un emoji, per exemple) no es parteix mai pel mig.
 */
export function chunkText(str, maxBytes = CHUNK_BYTES) {
    if (str === '') return [''];

    const chunks = [];
    let current = '';
    let bytes = 0;

    for (const char of str) {
        const size = utf8Length(char);
        if (bytes + size > maxBytes && current !== '') {
            chunks.push(current);
            current = '';
            bytes = 0;
        }
        current += char;
        bytes += size;
    }

    if (current !== '') chunks.push(current);
    return chunks;
}

/** Un hash FNV-1a de 32 bits, prou bo per detectar canvis i prou barat. */
export function hashOf(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Decideix què fer amb un save a partir de tres dades.
 *
 *   - `prev`  el hash local la darrera vegada que es va sincronitzar
 *   - `now`   el hash local d'ara
 *   - `remoteWas` / `remoteIs`  el `updatedAt` remot d'abans i d'ara
 *
 * Retorna un de: `'none'`, `'push'`, `'pull'` o `'conflict'`.
 */
export function threeWay(prev, now, remoteWas, remoteIs) {
    const localChanged = prev !== now;
    const remoteChanged = remoteWas !== remoteIs;

    if (localChanged && remoteChanged) return 'conflict';
    if (localChanged) return 'push';
    if (remoteChanged) return 'pull';
    return 'none';
}

/** Cert si la base d'IndexedDB és de Firebase i no s'ha de tocar. */
export function isExcludedIdb(name) {
    return IDB_EXCLUDED.test(name);
}

/**
 * Ajunta dos valors de progrés que han divergit.
 *
 * Ha de ser generós: l'objectiu és no perdre res del que l'usuari ha
 * fet. Per als comptes (punts, minuts, ratxes) es pren el més alt; per
 * als favorits, la unió; per als volums, el mapa ajuntat.
 *
 * @param {string} key  clau d'estat (`ulaStats`, `ulaFavorites`, …)
 * @param {*} local
 * @param {*} remote
 */
export function mergeProgress(key, local, remote) {
    if (local === undefined || local === null) return remote;
    if (remote === undefined || remote === null) return local;

    if (key === STORAGE_KEYS.favorites) {
        const a = Array.isArray(local) ? local : [];
        const b = Array.isArray(remote) ? remote : [];
        return [...new Set([...b, ...a])];
    }

    if (key === STORAGE_KEYS.stats) {
        return mergeStats(local, remote);
    }

    if (key === STORAGE_KEYS.gameVolumes) {
        return { ...(remote ?? {}), ...(local ?? {}) };
    }

    return local;
}

function mergeStats(local, remote) {
    const out = { ...remote, ...local };
    for (const field of ['plays', 'points', 'timeSeconds', 'streak']) {
        out[field] = Math.max(Number(local?.[field]) || 0, Number(remote?.[field]) || 0);
    }

    out.gameHistory = mergeHistory(local?.gameHistory, remote?.gameHistory);
    out.lastDate = latestDate(local?.lastDate, remote?.lastDate);
    return out;
}

function mergeHistory(a, b) {
    const out = {};
    for (const name of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
        const x = a?.[name] ?? {};
        const y = b?.[name] ?? {};
        out[name] = {
            count: Math.max(Number(x.count) || 0, Number(y.count) || 0),
            timePlayed: Math.max(Number(x.timePlayed) || 0, Number(y.timePlayed) || 0),
            lastPlayed: latestDate(x.lastPlayed, y.lastPlayed)
        };
    }
    return out;
}

function latestDate(a, b) {
    if (!a) return b ?? '';
    if (!b) return a;
    const ta = new Date(a).getTime() || 0;
    const tb = new Date(b).getTime() || 0;
    return ta >= tb ? a : b;
}
