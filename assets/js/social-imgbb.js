/**
 * social-imgbb.js · pujada d'imatges a imgbb per a la foto de perfil.
 *
 * imgbb demana una clau d'API (les gratuïtes surten a
 * https://api.imgbb.com/ i es creen en un minut). La clau viu aquí, no és
 * cap secret de seguretat —qualsevol web que pugi imatges a imgbb des del
 * navegador l'ha de tenir a mà— però SENSE CLAU la pujada no funciona i
 * el formulari ho diu.
 *
 * Perquè això funcioni a la web cal que la CSP (index.html i server.js)
 * permeti parlar amb `api.imgbb.com` i mostrar imatges de `i.ibb.co`;
 * ja hi és.
 */

/** Posa aquí la clau d'imgbb. Amb la cadena buida, la pujada es desactiva. */
export const IMGBB_API_KEY = '';

/** Cert si hi ha clau configurada. */
export function imgbbConfigured() {
    return IMGBB_API_KEY.trim().length > 0;
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
    if (!imgbbConfigured()) {
        const error = new Error('sense clau d\'imgbb');
        error.reason = 'no-key';
        throw error;
    }
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

    const base64 = await fileToBase64(file);

    const body = new FormData();
    body.append('image', base64);
    body.append('name', 'ula-profile');

    let response;
    try {
        response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
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
