/**
 * social-imgbb.js · pujada d'imatges a imgbb per a la foto de perfil.
 *
 * imgbb demana una clau d'API (les gratuïtes es creen en un minut a
 * https://api.imgbb.com/). La clau no viu al repositori: aquí només hi ha
 * la de proves en local; a producció es llegeix del document
 * `config/imgbb` de Firestore (camp `key`), que el propietari escriu des
 * de la consola de Firebase i que els clients no poden modificar.
 *
 * Val la pena ser honest: això treu la clau de GitHub —on els bots que
 * escombrén repositoris la trobarien— però és el navegador qui l'ha de
 * fer servir, així que qualsevol persona que inspeccioni l'aplicació la
 * podria arribar a veure. Per ocultar-la de debò caldria un intermediari
 * (una funció al núvol), cosa que el pla gratuït de Firebase no permet.
 *
 * Perquè això funcioni a la web cal que la CSP (index.html i server.js)
 * permeti parlar amb `api.imgbb.com` i mostrar imatges de `i.ibb.co`;
 * ja hi és.
 */

import { firestore } from './social-db.js';

/** Clau de proves en local. A producció mana `config/imgbb` de Firestore. */
export const IMGBB_API_KEY = '';

/** La clau llegida de Firestore, per no anar-hi a cada pujada. */
let configKey = '';

/** D'on surt la clau: primer la local (proves); si no, la de Firestore. */
async function resolveKey() {
    const local = IMGBB_API_KEY.trim();
    if (local) return local;
    if (configKey) return configKey;

    const connection = firestore();
    if (!connection) return '';
    const { api, db } = connection;
    try {
        const snap = await api.getDoc(api.doc(db, 'config', 'imgbb'));
        configKey = String(snap.data()?.key ?? '').trim();
        return configKey;
    } catch {
        return '';   // sense regla, sense xarxa o sense document: no hi ha clau
    }
}

const MAX_BYTES = 8 * 1024 * 1024; // imgbb no accepta més de 32 MB; amb 8 n'hi ha de sobres

/**
 * Puja una imatge i en retorna l'URL públic.
 *
 * @param {File} file
 * @returns {Promise<string>} l'URL de la imatge (display_url)
 * @throws {Error} amb `reason`: no-key | bad-type | too-big | network | server
 */
export async function uploadToImgbb(file) {
    if (!file || !file.type.startsWith('image/')) {
        const error = new Error('el fitxer no és una imatge');
        error.reason = 'bad-type';
        throw error;
    }
    if (file.size > MAX_BYTES) {
        const error = new Error('la imatge és massa gran');
        error.reason = 'too-big';
        throw error;
    }

    const key = await resolveKey();
    if (!key) {
        const error = new Error('sense clau d\'imgbb');
        error.reason = 'no-key';
        throw error;
    }

    const base64 = await fileToBase64(file);

    const body = new FormData();
    body.append('image', base64);
    body.append('name', 'ula-profile');

    let response;
    try {
        response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            body
        });
    } catch {
        const error = new Error('no s\'ha pogut contactar amb imgbb');
        error.reason = 'network';
        throw error;
    }

    if (!response.ok) {
        const error = new Error(`imgbb ha respost ${response.status}`);
        error.reason = 'server';
        throw error;
    }

    const payload = await response.json().catch(() => null);
    const url = payload?.data?.display_url ?? payload?.data?.url;
    if (!payload?.success || !url) {
        const error = new Error('resposta d\'imgbb sense imatge');
        error.reason = 'server';
        throw error;
    }

    return url;
}

/** El fitxer com a base64 sense el prefix `data:...;base64,`. */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? '');
            resolve(result.slice(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader'));
        reader.readAsDataURL(file);
    });
}
