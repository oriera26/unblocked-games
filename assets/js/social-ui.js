/**
 * social-ui.js · utilitats de dibuix de la secció Social.
 *
 * Aquí no hi ha estat ni accions: només les peces petites que fan servir
 * els altres mòduls del Social (consultar el DOM, escapar text, traduir,
 * formatar temps i pintar la presència).
 *
 * `t()` d'aquest fitxer és el de `i18n.js` però amb l'escapat incorporat:
 * el que en surt es pot enganxar directament dins d'una plantilla HTML.
 * El text que ha de quedar cru (missatges de xat, notificacions, valors
 * d'atributs) s'ha de demanar a `i18n.js` amb el nom `translate`, per no
 * escapar-lo dues vegades. Així totes les claus de text que s'usen als
 * mòduls del Social apareixen com a `t('…')` i `check-lang` les veu.
 */

import { hydrateDataLucide } from './icons.js';
import { t as rawT } from './i18n.js';

export function byId(id) {
    return document.getElementById(id);
}

/** Escapa el text que ve de dades abans de posar-lo dins d'un `innerHTML`. */
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * El text traduït sense escapar, per a dades i valors d'atribut.
 *
 * Es diu `get` perquè `check-lang.mjs` reconeix les crides `get('clau')`
 * (les d'offline.html) i així veu les claus que d'altra manera només
 * apareixerien dins de variables.
 */
export function get(key, params) {
    return rawT(key, params);
}

/**
 * Un text traduït, ja escapat, per interpolar a les plantilles.
 *
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params) {
    return esc(get(key, params));
}

/** El nom traduït d'un estat de presència. */
export function statusLabel(status) {
    switch (status) {
        case 'online': return t('social.statusOnline');
        case 'idle': return t('social.statusIdle');
        case 'dnd': return t('social.statusDnd');
        default: return t('social.statusOffline');
    }
}

/** Què està fent algú: el joc si juga, o el seu estat. */
export function activityLabel(person) {
    if (person?.activity?.kind === 'playing' && person.activity.game) {
        return t('social.nowPlaying', { game: person.activity.game });
    }
    return statusLabel(person?.status);
}

/** Un temps relatiu curt («12m», «3h», «2d») per al feed i el xat. */
export function timeAgo(at) {
    const seconds = Math.max(1, Math.round((Date.now() - at) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

/** Un rellotge de compte enrere («05:30»). */
export function countdown(until) {
    const left = Math.max(0, until - Date.now());
    const hours = String(Math.floor(left / 3600e3)).padStart(2, '0');
    const minutes = String(Math.floor((left % 3600e3) / 60e3)).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/** Converteix els `[data-lucide]` d'un subarbre que acaba de canviar. */
export function hydrate(node) {
    if (node) hydrateDataLucide(node);
}
