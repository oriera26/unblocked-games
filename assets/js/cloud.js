/**
 * cloud.js · sincronitza el progrés i els desats amb el compte.
 *
 * La idea és tres peces que es poden llegir per separat:
 *
 *   1. Què hi ha al dispositiu (`buildLocal`): les tres claus de progrés
 *      de `state.js`, totes les claus de `localStorage` que no són
 *      nostres (és a dir, les que desen els jocs) i, de tant en tant,
 *      sencers els desats d'IndexedDB.
 *
 *   2. Què hi ha al compte (`remote`): dues col·leccions amb les quals
 *      es parla per `onSnapshot`, així que el que faci un altre
 *      dispositiu arriba sense haver-lo de demanar.
 *
 *   3. Què cal fer (`decide`): per a cada entrada, una comparació de tres
 *      temps —què hi havia quan es va sincronitzar l'últim cop, què hi
 *      ha ara i què diu el compte— que dona `'push'`, `'pull'` o
 *      `'conflict'`. Els conflictes no es resolen sols: es mostren.
 *
 * Els valors no viatgen a dins del document de metadades sinó en
 * documents fills (`chunks/00000000`, `chunks/00000001`, …). Així el que
 * es llegeix a cada ronda són textets de poques desenes de bytes i no
 * tots els desats dels jocs, i un valor de 30 MB es parteix sense que
 * cap document passi mai d'un megabyte.
 */

import { STORAGE_KEYS, SYNC_IDB_INTERVAL_MS, SYNC_INTERVAL_MS } from './config.js';
import { IS_CONFIGURED } from './firebase-config.js';
import { ensureSdk, onAuthChange } from './auth.js';
import { applyCloudState, readCloudState } from './state.js';
import {
    chunkText, decodeIdbKey, decodeValue, encodeIdbKey, encodeValue,
    hashOf, isExcludedIdb, isGameSaveKey, mergeProgress, utf8Length
} from './sync-core.js';

/* --- Estat del mòdul ---------------------------------------------- */

/** `off` · `syncing` · `synced` · `error` */
let status = 'off';

const statusListeners = new Set();
const conflictListeners = new Set();

let db = null;              // la instància de Firestore
let fapi = null;            // el mòdul del SDK de Firestore
let uid = null;

/** Metadades d'aquest dispositiu: què hi havia i quan, per cada entrada. */
let entries = new Map();
let deviceId = '';

/** El que diu el compte. S'omple amb `onSnapshot`. */
const remote = new Map();
let remoteReady = false;

/** Si s'ha pogut llegir la llista de claus de `localStorage`. */
let keysReadable = true;

/** Quan tornar a llegir IndexedDB sencera. */
let nextIdbAt = 0;

let timer = null;
let syncing = false;

/** Per deixar d'escoltar les col·leccions quan es canvia de compte. */
const unsubscribes = [];

/** Conflictes esperant que triï algú. */
let pending = [];

/* ================================================================
   Estat públic
   ================================================================ */

/** Canvia l'estat visible (`Sincronitzant…`, `Sincronitzat`, …). */
function setStatus(next) {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener(status);
}

/**
 * Quan canvia l'estat de la sincronització.
 *
 * @param {(status: string) => void} listener
 * @returns {() => void} per deixar d'escoltar
 */
export function onSyncStatus(listener) {
    statusListeners.add(listener);
    listener(status);
    return () => statusListeners.delete(listener);
}

/** L'estat de la sincronització, per a qui no vulgui escoltar. */
export function syncStatus() {
    return status;
}

/**
 * Quan hi ha conflictes esperant tria.
 *
 * @param {(conflicts: Array<{id: string, kind: string}>) => void} listener
 * @returns {() => void}
 */
export function onSyncConflict(listener) {
    conflictListeners.add(listener);
    return () => conflictListeners.delete(listener);
}

/** Els conflictes que s'estan esperant, si n'hi ha. */
export function pendingConflicts() {
    return pending;
}

/**
 * Resol els conflictes pendents.
 *
 * @param {'local'|'remote'|'merge'} choice
 */
export async function resolveConflict(choice) {
    const conflicts = pending;
    pending = [];
    if (!conflicts.length) return;

    setStatus('syncing');

    try {
        for (const item of conflicts) {
            if (choice === 'remote') await pullOne(item);
            else if (choice === 'merge') await mergeOne(item);
            else await pushOne(item);
        }
    } catch (err) {
        console.warn('[ula] no s\'han pogut resoldre els conflictes', err);
        setStatus('error');
        return;
    }

    setStatus('synced');

    // Resoldre pot haver canviat alguna cosa al compte: es repassa.
    await syncNow(false).catch(() => {});
}

/** Sincronitza ara mateix (un sol cop, sense esperar al temporitzador). */
export async function syncNow(withIdb) {
    if (!IS_CONFIGURED || !uid || !db || syncing) return false;
    syncing = true;
    setStatus('syncing');

    try {
        const readIdb = withIdb === true || Date.now() >= nextIdbAt;
        const local = await buildLocal(readIdb);

        // Sense el que diu el compte de debò, no es decideix res: una
        // llista buida feta servir com si fos el compte real esborraria
        // tot el progrés del dispositiu.
        if (!remoteReady) return false;

        for (const item of plan(local).values()) {
            if (item.action === 'push') await pushOne(item);
            else if (item.action === 'pull') await pullOne(item);
            else if (item.action === 'delete') await deleteOne(item);
        }

        if (pending.length) {
            for (const listener of conflictListeners) listener(pending);
        } else {
            setStatus('synced');
        }

        return true;
    } catch (err) {
        console.warn('[ula] la sincronització ha fallat', err);
        setStatus('error');
        return false;
    } finally {
        syncing = false;
    }
}

/**
 * Enganxa el mòdul a la vida de l'aplicació.
 *
 * Es crida un cop, des de `main.js`.
 */
export function initCloud() {
    if (!IS_CONFIGURED) return () => {};

    nextIdbAt = Date.now();
    return onAuthChange(onUser);
}

/* ================================================================
   Entrada i sortida de sessió
   ================================================================ */

async function onUser(user) {
    stop();
    pending = [];
    remote.clear();
    remoteReady = false;
    db = null;

    if (!user) {
        uid = null;
        setStatus('off');
        return;
    }

    uid = user.uid;
    loadMeta();

    try {
        await setup();
    } catch (err) {
        console.warn('[ula] no s\'ha pogut engegar la sincronització', err);
        setStatus('error');
        return;
    }

    setStatus('syncing');

    // En sortir, la darrera cosa que es fa és desar el que ha canviat.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);

    await syncNow(true);

    // Amb la pestanya amagada (sessió restaurada, oberta en segon pla)
    // el rellotge no arrenca: ho farà quan es torni a veure.
    if (document.visibilityState === 'visible') startTimer();
}

function startTimer() {
    stopTimer();
    timer = window.setInterval(() => syncNow(false), SYNC_INTERVAL_MS);
}

function stopTimer() {
    if (timer) window.clearInterval(timer);
    timer = null;
}

function stop() {
    stopTimer();
    // Si s'ha sortit de sessió a mig cop, el senyal queda alliberat: de
    // l'altra forma la propera entrada no podria sincronitzar mai.
    syncing = false;
    for (const off of unsubscribes) off();
    unsubscribes.length = 0;
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibility);
}

/**
 * Amb la pestanya amagada no es sincronitza: el rellotge de cada
 * `SYNC_INTERVAL_MS` s'atura i, de passada, es desa el que falti. En
 * tornar-se a veure, es fa una ronda per posar-se al dia i el rellotge
 * reprèn (a segon pla els navegadors van coixos de tota manera: és
 * feina que no s'hi pot aprofitar).
 */
function onVisibility() {
    if (document.visibilityState === 'hidden') {
        stopTimer();
        flush();
    } else if (!timer) {
        syncNow(false).catch(() => {});
        startTimer();
    }
}

function flush() {
    if (!uid || !db) return;
    // No s'espera: la pàgina es pot tancar just després d'aquesta línia.
    syncNow(true).catch(() => {});
}

/* ================================================================
   Els documents
   ================================================================ */

async function setup() {
    const { app } = await ensureSdk();
    fapi = await import('../vendor/firebase-firestore.js');
    db = fapi.getFirestore(app);
    await fapi.enableIndexedDbPersistence(db).catch(() => {
        // Un navegador amb dues pestanyes obertes no ho deixa. Sense
        // persistència la sincronització funciona igual, només que no
        // recorda els canvis quan no hi ha xarxa.
    });
    watch('state');
    watch('saves');
}

/**
 * Escolta una col·lecció i actualitza `remote`.
 *
 * Es fan dues coses a més de rebre les dades:
 *
 *   - es descarta tot allò que vingui de la memòria cau del SDK abans
 *     d'haver vist el servidor: una col·lecció buida d'aquella font no
 *     vol dir que el compte estigui buit, vol dir que no se sap res;
 *   - es descarta el que vingui amb escriptures pendents, que són les
 *     nostres mateixes: fer-les passar per canvis externs faria un
 *     bucle de pujar i baixar el mateix.
 *
 * @param {'state'|'saves'} which
 */
function watch(which) {
    const collection = fapi.collection(db, 'users', uid, which);

    unsubscribes.push(fapi.onSnapshot(collection, { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        if (snapshot.metadata.fromCache && !remoteReady) return;

        const seen = new Set();

        snapshot.forEach((item) => {
            seen.add(item.id);
            remote.set(item.id, { ...item.data(), _id: item.id, _col: which });
        });

        for (const [id, entry] of remote) {
            if (entry._col === which && !seen.has(id)) remote.delete(id);
        }

        if (!remoteReady) {
            remoteReady = true;
            syncNow(true).catch(() => {});
        }
    }, (err) => {
        console.warn('[ula] el compte no deixa llegir el progrés', err);
        setStatus('error');
    }));
}

/** On és cada entrada. Els desats sempre duen prefix. */
function docRef(id, kind) {
    return kind === 'state'
        ? fapi.doc(db, 'users', uid, 'state', id)
        : fapi.doc(db, 'users', uid, 'saves', id);
}

function chunksRef(id, kind) {
    return fapi.collection(db, 'users', uid, kind === 'state' ? 'state' : 'saves', id, 'chunks');
}

/** Un id de document que no supera mai els 1500 bytes. */
function saveId(kind, parts) {
    const base = parts.join('/');
    if (base.length <= 600) return `${kind}:${base}`;
    return `${kind}#${hashOf(base)}-${base.slice(0, 300)}`;
}

/** Els ids dels fragments, amb zeros a l'esquerra perquè s'ordenin bé. */
function chunkId(index) {
    return String(index).padStart(8, '0');
}

/* ================================================================
   Què hi ha al dispositiu
   ================================================================ */

/**
 * Una instantània de tot el que s'ha de sincronitzar.
 *
 * @param {boolean} withIdb  si s'ha de tornar a llegir IndexedDB sencera
 * @returns {Promise<Map<string, object>>}
 */
async function buildLocal(withIdb) {
    const out = new Map();

    for (const [key, value] of Object.entries(readCloudState())) {
        const text = JSON.stringify(value);
        out.set(key, { kind: 'state', key, value: text, hash: hashOf(text) });
    }

    let keys = null;
    try {
        keys = Object.keys(localStorage);
    } catch {
        // Un navegador en mode privat no deixa ni llegir la llista: sense
        // saber què hi ha, no es pot decidir que res s'ha esborrat.
    }
    keysReadable = keys !== null;

    for (const key of keys ?? []) {
        if (!isGameSaveKey(key)) continue;
        const value = localStorage.getItem(key);
        if (value === null) continue;
        const id = saveId('local', [encodeURIComponent(key)]);
        out.set(id, { kind: 'local', key, value, hash: hashOf(value) });
    }

    if (withIdb) {
        nextIdbAt = Date.now() + SYNC_IDB_INTERVAL_MS;
        const rows = await readAllIdb();
        for (const [id, row] of rows) {
            row.hash = hashOf(row.value);
            out.set(id, row);
        }
    }

    return out;
}

/**
 * Llegeix tots els desats d'IndexedDB que no siguin de Firebase.
 *
 * Les bases de Firebase hi desen la sessió i la memòria cau: pujar-les
 * seria donar el token del compte al propi compte, i a més xocaria amb
 * el SDK.
 *
 * @returns {Promise<Map<string, object>>}
 */
async function readAllIdb() {
    const out = new Map();

    let listed = [];
    try {
        listed = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    } catch {
        listed = [];
    }

    for (const info of listed) {
        const name = info?.name;
        if (!name || isExcludedIdb(name)) continue;

        let handle;
        try {
            handle = await openIdb(name);
        } catch {
            continue;
        }

        try {
            for (const storeName of [...handle.objectStoreNames]) {
                for (const row of await readStore(handle, storeName)) {
                    out.set(
                        idbRecordId(name, storeName, row.key),
                        {
                            kind: 'idb', db: name, store: storeName,
                            keyEnc: encodeIdbKey(row.key),
                            value: JSON.stringify(encodeValue(row.value))
                        }
                    );
                }
            }
        } catch (err) {
            console.warn(`[ula] no s'ha pogut llegir la base ${name}`, err);
        } finally {
            handle.close();
        }
    }

    return out;
}

function idbRecordId(dbName, storeName, key) {
    const enc = JSON.stringify(encodeIdbKey(key));
    return saveId('idb', [encodeURIComponent(dbName), encodeURIComponent(storeName), encodeURIComponent(enc)]);
}

/** Obre una base que ja existeix; si no existeix, no la crea. */
function openIdb(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);

        request.onupgradeneeded = () => {
            // `indexedDB.open` crea la base si no hi és. Com que la llista
            // de bases ve de `databases()`, això només passa si hi ha
            // cursa: es talla i es rebutja.
            try {
                request.transaction?.abort();
            } catch { /* no hi ha res a fer */ }
            reject(new Error(`base inexistent: ${name}`));
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`base bloquejada: ${name}`));
    });
}

/** Totes les dades d'un dipòsit, amb la clau de cadascuna. */
function readStore(handle, storeName) {
    return new Promise((resolve, reject) => {
        const out = [];
        let request;

        try {
            request = handle.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
        } catch (err) {
            reject(err);
            return;
        }

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(out);
                return;
            }
            out.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

/* ================================================================
   Decidir
   ================================================================ */

/**
 * Què cal fer amb cada entrada.
 *
 * La comparació és de tres temps: `hash` i `updatedAt` guardats en
 * sortir de la última ronda, els valors d'ara i el que acaba de dir el
 * compte. Si només ha canviat un dels dos costats, guanya: no hi ha
 * dubte. Si han canviat els dos, és un conflicte i no s'hi toca.
 *
 * @param {Map<string, object>} local
 * @returns {Map<string, object>}
 */
function plan(local) {
    const actions = new Map();
    const wanted = new Set([...local.keys(), ...remote.keys(), ...entries.keys()]);

    // Es recomputa tot a cada ronda: una llista de conflictes guardada
    // d'abans aniria acumulant els mateixos.
    pending = [];

    for (const id of wanted) {
        const L = local.get(id);
        const R = remote.get(id);
        const M = entries.get(id);

        // Cap dels dos costats en sap res: no hi ha res a fer.
        if (!L && !R) {
            if (M) entries.delete(id);
            continue;
        }

        // El que hi havia al compte ha desaparegut del tot. Més que una
        // intenció (l'única forma normal d'esborrar és deixar-hi una
        // tomba, que encara és un document) sembla que algú ha netejat la
        // col·lecció des de fora, i per tant es torna a pujar.
        if (!R && M) {
            actions.set(id, { id, action: 'push', local: L, remote: R });
            continue;
        }

        const localChanged = (M?.hash ?? null) !== (L?.hash ?? null);
        const remoteChanged = (M?.updatedAt ?? null) !== (R?.updatedAt ?? null);

        if (localChanged && remoteChanged) {
            const item = { id, action: 'conflict', local: L, remote: R };
            actions.set(id, item);
            pending.push(item);
        } else if (localChanged) {
            if (L) {
                actions.set(id, { id, action: 'push', local: L, remote: R });
            } else if (R?.deleted) {
                // Ja hi ha una tomba al compte: només cal quadrar les
                // metadades perquè la propera ronda no hi torni.
                actions.set(id, { id, action: 'pull', local: L, remote: R });
            } else if (keysReadable) {
                // Una entrada coneguda que ja no és al dispositiu ha estat
                // esborrada: s'hi deixa una tomba perquè no torni mai més.
                actions.set(id, { id, action: 'delete', local: L, remote: R });
            }
        } else if (remoteChanged) {
            actions.set(id, { id, action: 'pull', local: L, remote: R });
        }
    }

    return actions;
}

/* ================================================================
   Pujar i baixar
   ================================================================ */

/** Escriu al compte el que hi ha al dispositiu. */
async function pushOne(item) {
    const entry = item.local;
    if (!entry) {
        // Sense res al dispositiu, «conserva aquest» vol dir esborrar-ho:
        // es deixa la tomba.
        await deleteOne(item);
        return;
    }
    await writeDoc(item.id, entry, entry.value, entry.hash, item.remote?.parts ?? 0);
}

/**
 * Deixa una tomba al compte d'una entrada que ja no és al dispositiu.
 *
 * No s'esborra el document: es marca com a esborrat i s'hi guarda la
 * identitat (la clau, o la base, el dipòsit i la clau d'IndexedDB) perquè
 * els altres dispositius el puguin esborrar igualment. Si el document
 * desaparegués del tot, el proper repàs el tornaria a pujar: el motor no
 * podria distingir «esborrat» de «algú ha netejat la col·lecció».
 */
async function deleteOne(item) {
    const identity = identityOf(item.id);
    if (!identity) return;
    await writeDoc(item.id, identity, null, null, item.remote?.parts ?? 0);
}

/**
 * Reconeix de què és una entrada només pel seu id.
 *
 * Els ids porten el tipus al davant i prou informació per tornar a muntar
 * el document: `local:casa`, `idb:joc/partides/{…}` o `ulaStats`. Els ids
 * llargs van truncats darrere d'un coixinet i no es poden desfer; en
 * aquest cas no s'hi pot deixar tomba.
 */
function identityOf(id) {
    if (id.startsWith('local#')) return null;
    if (id.startsWith('local:')) {
        return { kind: 'local', key: decodeURIComponent(id.slice('local:'.length)) };
    }

    if (id.startsWith('idb#')) return null;
    if (id.startsWith('idb:')) {
        const [db, store, enc] = id.slice('idb:'.length).split('/').map(decodeURIComponent);
        if (!db || !store || !enc) return null;
        try {
            return { kind: 'idb', db, store, keyEnc: JSON.parse(enc) };
        } catch {
            return null;
        }
    }

    return { kind: 'state', key: id };
}

/** Aplana al dispositiu el que diu el compte. */
async function pullOne(item) {
    const source = item.remote;
    if (!source) return;

    const value = source.deleted ? null : await readChunks(item.id, source);
    await applyLocal(source, value);

    entries.set(item.id, {
        // Sense valor (una tomba), el hash de referència és `null`: així
        // una clau absent i una tomba compten com el mateix estat i no es
        // torna a decidir res a cada ronda.
        hash: source.deleted ? null : hashOf(value ?? ''),
        updatedAt: source.updatedAt ?? 0,
        localAt: Date.now()
    });
    saveMeta();
}

/**
 * Ajunta els dos costats d'un conflicte i, un cop ajuntat, el puja.
 *
 * Per al progrés es fa servir `mergeProgress` de `sync-core.js`:
 * es pren el més alt de cada compte i la unió dels conjunts, així que no
 * es pot perdre res del que ningú dels dos hagi fet. Per als desats dels
 * jocs, que són textos opacs, no hi ha com ajuntar-los i guanya el que
 * s'hagi tocat més recentment.
 */
async function mergeOne(item) {
    const L = item.local;
    const R = item.remote;
    if (!R) return;

    if (L && L.kind === 'state') {
        const remoteValue = R.deleted ? null : JSON.parse(await readChunks(item.id, R));
        const merged = mergeProgress(L.key, JSON.parse(L.value), remoteValue);
        const text = JSON.stringify(merged);

        localStorage.setItem(L.key, text);
        applyState(L.key, JSON.parse(text));
        await writeDoc(item.id, { ...L, value: text, hash: hashOf(text) }, text, hashOf(text), R.parts ?? 0);
        return;
    }

    // Un save no es pot ajuntar: es queda el més recent.
    const localAt = entries.get(item.id)?.localAt ?? 0;
    if ((R.updatedAt ?? 0) > localAt) await pullOne(item);
    else if (L) await pushOne(item);
    else await pullOne(item);
}

/**
 * Unes línies de valor a un document del compte.
 *
 * `updatedAt` es posa abans de demanar a Firestore que escrigui, no
 * després: si es posés després, la instantània que arriba amb l'acuse de
 * rebut podria veure un compte diferent del que hi ha al mòdul i tornar a
 * baixar el mateix que acabem de pujar.
 */
async function writeDoc(id, entry, value, hash, oldParts) {
    const head = {
        kind: entry.kind,
        updatedAt: Date.now(),
        deviceId,
        deleted: value === null || value === undefined,
        parts: 0,
        bytes: 0
    };

    if (entry.kind === 'state' || entry.kind === 'local') head.key = entry.key;
    if (entry.kind === 'idb') {
        head.db = entry.db;
        head.store = entry.store;
        head.keyEnc = entry.keyEnc;
    }

    const previous = entries.get(id);
    entries.set(id, { hash, updatedAt: head.updatedAt, localAt: head.updatedAt });

    try {
        if (head.deleted) {
            await fapi.setDoc(docRef(id, entry.kind), head);
        } else {
            const chunks = chunkText(value);
            head.parts = chunks.length;
            head.bytes = utf8Length(value);

            await fapi.setDoc(docRef(id, entry.kind), head);
            await Promise.all(chunks.map((data, index) =>
                fapi.setDoc(fapi.doc(chunksRef(id, entry.kind), chunkId(index)), { data })));

            // Els fragments de sobre no es poden deixar: el document ja
            // diu quants n'hi ha, però es llegeixen igual si es va
            // encurtant un valor.
            for (let index = chunks.length; index < oldParts; index++) {
                await fapi.deleteDoc(fapi.doc(chunksRef(id, entry.kind), chunkId(index))).catch(() => {});
            }
        }
    } catch (err) {
        if (previous) entries.set(id, previous);
        else entries.delete(id);
        throw err;
    }

    saveMeta();
}

/** El valor sencer d'una entrada, ajuntant tots els seus fragments. */
async function readChunks(id, source) {
    const snapshot = await fapi.getDocs(chunksRef(id, source.kind ?? 'saves'));

    // Els ids duen zeros a l'esquerra, així que un ordenació de text és
    // també un ordenació numèrica.
    const parts = snapshot.docs
        .map((item) => [item.id, item.data()?.data ?? ''])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([, data]) => data);

    return parts.join('');
}

/** Posa un valor que ve del compte a lloc on tocava. */
async function applyLocal(source, value) {
    if (value === null) {
        if (source.kind === 'state') {
            localStorage.removeItem(source.key);
            applyState(source.key, null);
        } else if (source.kind === 'local') {
            localStorage.removeItem(source.key);
        } else if (source.kind === 'idb') {
            await idbWrite(source, null, true);
        }
        return;
    }

    if (source.kind === 'state') {
        applyState(source.key, JSON.parse(value));
        return;
    }

    if (source.kind === 'local') {
        localStorage.setItem(source.key, value);
        return;
    }

    if (source.kind === 'idb') {
        await idbWrite(source, decodeValue(JSON.parse(value)), false);
    }
}

/**
 * Aplica una clau de progrés que ve del compte i avisa la interfície.
 *
 * Els cors dels favorits, les estadístiques i els volums viuen dibuixats
 * a la graella: si no se'ls hi deia, el compte podria haver canviat i la
 * pàgina es quedaria mostrant l'antiga.
 */
function applyState(key, value) {
    if (!applyCloudState(key, value)) return;
    window.dispatchEvent(new CustomEvent('ula:cloud', { detail: { key } }));
}

/** Escriu o esborra un registre d'IndexedDB. */
async function idbWrite(source, value, deleteIt) {
    let handle;
    try {
        handle = await openIdb(source.db);
    } catch (err) {
        console.warn(`[ula] no s'ha pogut obrir la base ${source.db}`, err);
        return;
    }

    try {
        const key = decodeIdbKey(source.keyEnc);

        await new Promise((resolve, reject) => {
            const store = handle.transaction(source.store, 'readwrite').objectStore(source.store);
            try {
                if (deleteIt) store.delete(key);
                // Amb clau en línia la clau ja ve dins del valor: si es
                // passés a més, el navegador la rebutjaria.
                else if (store.keyPath) store.put(value);
                else store.put(value, key);
            } catch (err) {
                reject(err);
                return;
            }

            const tx = store.transaction;
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('transacció tallada'));
        });
    } catch (err) {
        console.warn(`[ula] no s'ha pogut desar ${source.store}`, err);
    } finally {
        handle.close();
    }
}

/* ================================================================
   Les metadades d'aquest dispositiu
   ================================================================ */

function loadMeta() {
    entries = new Map();
    deviceId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.syncMeta) ?? 'null');
    } catch {
        stored = null;
    }

    if (!stored || typeof stored !== 'object') return;

    for (const [id, item] of Object.entries(stored.entries ?? {})) {
        if (item && typeof item === 'object') entries.set(id, item);
    }

    // Sense identificador de dispositiu no es podria dir qui ha fet cada
    // canvi, i els camps d'ajuda l'hi demanen.
    if (typeof stored.device === 'string' && stored.device) deviceId = stored.device;
}

function saveMeta() {
    try {
        const out = {};
        for (const [id, item] of entries) out[id] = item;
        localStorage.setItem(STORAGE_KEYS.syncMeta, JSON.stringify({ device: deviceId, entries: out }));
    } catch {
        // Sense metadades, la propera ronda torna a pujar el que ja hi
        // és: molesta, però no es perd res.
    }
}
