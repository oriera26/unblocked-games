/**
 * social-ui.js · utilitats de dibuix de la secció Social.
 *
 * Aquí no hi ha estat ni accions: només les peces petites que fan servir
 * els altres mòduls del Social (escapar text, traduir, formatar temps,
 * pintar avatars i hidratar les icones).
 *
 * `t()` d'aquest fitxer és el de `i18n.js` però amb l'escapat incorporat:
 * el que en surt es pot enganxar directament dins d'una plantilla HTML.
 * El text que ha de quedar cru (per exemple per un `alert`) s'ha de
 * demanar a `i18n.js` amb el nom `translate` o amb `get()`, que no
 * escapa. Així totes les claus de text que s'usen als mòduls del Social
 * apareixen com a `t('…')` i `check-lang` les veu.
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
    if (person?.game) return t('social.nowPlaying', { game: person.game });
    return statusLabel(person?.status);
}

/** Les inicials d'un nom, per quan no hi ha ni foto ni icona. */
export function initials(name) {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last).toUpperCase();
}

/**
 * El contingut d'un avatar: la foto si n'hi ha, si no la icona, i si no
 * les inicials. Sempre text/HTML segur (foto escapada, icona escapada).
 *
 * @param {object} person
 * @param {{ bare?: boolean }} [options] `bare` no afegeix cap element
 *        embolcall, només el contingut.
 */
export function avatarMarkup(person, options = {}) {
    const photo = String(person?.photo ?? '').trim();
    const icon = String(person?.icon ?? '').trim();

    if (photo) {
        return `<img class="soc-avatar-img" src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    }
    if (icon) return `<span class="soc-avatar-glyph">${esc(icon)}</span>`;
    return `<span class="soc-avatar-glyph">${esc(initials(person?.name))}</span>`;
}

/** Un temps relatiu curt («12m», «3h», «2d») per al feed i el xat. */
export function timeAgo(at) {
    const seconds = Math.max(1, Math.round((Date.now() - Number(at || 0)) / 1000));
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

/** Converteix els `[data-lucide]` d'un subarbre que acaba de canviar. */
export function hydrate(node) {
    if (node) hydrateDataLucide(node);
}
