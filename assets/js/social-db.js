/**
 * social-db.js · la connexió amb Firestore per al Social.
 *
 * Aquest fitxer no sap res de la secció: només engega el SDK de
 * Firestore (que `auth.js` ja ha carregat en iniciar sessió) i el deixa
 * a punt perquè `social-store.js` hi parli.
 *
 * Per què hi ha aquesta capa i no es fa servir `cloud.js` directament:
 * `cloud.js` sincronitza el progrés del joc i té la seva pròpia
 * instància; el Social necessita les mateixes peces (l'app, la base de
 * dades) però amb consultes i escoltes en temps real molt diferents.
 * Tots dos comparteixen el mateix `getFirestore(app)`, així que no es
 * duplica res.
 */

import { IS_CONFIGURED } from './firebase-config.js';
import { ensureSdk } from './auth.js';

let ready = null;   // promesa de càrrega, per no demanar el SDK dos cops
let api = null;     // el mòdul de Firestore
let db = null;      // la instància

/** Cert quan el projecte de Firebase està configurat. */
export function isConfigured() {
    return IS_CONFIGURED;
}

/**
 * Engega (una sola vegada) el SDK i la base de dades.
 *
 * @returns {Promise<{api: object, db: object}|null>} null si no hi ha
 *          configuració de Firebase.
 */
export function ensureDb() {
    if (!IS_CONFIGURED) return Promise.resolve(null);

    ready ??= (async () => {
        const { app } = await ensureSdk();
        const firestore = await import('../vendor/firebase-firestore.js');
        const database = firestore.getFirestore(app);

        // La persistència ja s'engega a cloud.js (setup()).
        // No la tornem a cridar aquí perquè donaria error:
        // "Firestore has already been started and persistence can no longer be enabled".
        // Si cloud.js encara no s'ha executat, la persistència s'activarà allí.

        api = firestore;
        db = database;
        return { api, db };
    })();

    return ready;
}

/** El mòdul de Firestore i la base de dades, si ja s'han engegat. */
export function firestore() {
    return api && db ? { api, db } : null;
}

/**
 * Un error d'escriptura que val la pena explicar a la interfície.
 *
 * Els errors de Firestore porten un `code` com `permission-denied` o
 * `unavailable`; aquí els traduïm a un text que qui llegeixi el codi
 * entengui, perquè la pantalla pugui dir alguna cosa més que «error».
 */
export function describeError(error) {
    const code = error?.code ?? '';
    // Al navegador, un error del Social només arriba fins aquí: deixar el
    // codi a la consola estalvia endevinar per què una acció no s'ha pogut
    // completar quan la pantalla només pot dir «no s'ha pogut completar».
    console.warn('[ula] error del Social:', code || '(sense codi)', error?.message ?? '');
    if (code.includes('permission-denied')) return 'permission';
    if (code.includes('unauthenticated')) return 'auth';
    if (code.includes('unavailable') || code.includes('failed-precondition')) return 'offline';
    return 'unknown';
}

/**
 * L'id determinista d'una parella d'usuaris.
 *
 * Els dos uids s'ordenen alfabèticament: així `a__b` i `b__a` són el
 * mateix document i les dues bandes llegeixen i escriuen el mateix.
 *
 * @param {string} a
 * @param {string} b
 */
export function pairId(a, b) {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
}
