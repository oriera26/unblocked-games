/**
 * social-modals.js · les finestres del Social.
 *
 * Dues: el mini-perfil d'un jugador i el mode espectador. Totes dues
 * reutilitzen el `modal` i l'`auth-card` de la resta de l'aplicació, i es
 * munten un sol cop en arrencar (`buildModals`) perquè no es dupliquin.
 *
 * Els botons de dins (`[data-soc]`) els escolta l'orquestrador, no aquí:
 * així aquest fitxer no ha de dependre del hub i no hi ha cicles.
 */

import { findPerson } from './social-store.js';
import { activityLabel, byId, esc, get, hydrate, t } from './social-ui.js';

/** Tanca les dues finestres del Social si són obertes. */
export function closeModals() {
    byId('socProfileModal')?.classList.remove('active');
    byId('socSpectatorModal')?.classList.remove('active');
}

/** Munta les finestres al `body` i enganxa els gestos de tancament. */
export function buildModals() {
    if (byId('socProfileModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="modal" id="socProfileModal" role="dialog" aria-modal="true" aria-label="${t('social.friends')}">
        <div class="modal-content auth-card">
            <button type="button" class="close-modal" data-soc-close aria-label="×">×</button>
            <div id="socProfileBody"></div>
        </div>
    </div>
    <div class="modal" id="socSpectatorModal" role="dialog" aria-modal="true" aria-label="${t('social.spectator')}">
        <div class="modal-content auth-card">
            <button type="button" class="close-modal" data-soc-close aria-label="×">×</button>
            <div class="soc-spectate">
                <div class="soc-spectate-feed"></div>
                <span class="soc-spectate-badge">${t('social.spectator')}</span>
                <div class="soc-spectate-overlay">
                    <div class="soc-spectate-title" id="socSpectatorTitle">${t('social.spectator')}</div>
                    <div class="soc-spectate-sub" id="socSpectatorSub"></div>
                </div>
            </div>
        </div>
    </div>`;

    while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

    document.body.addEventListener('click', (event) => {
        if (event.target.closest('[data-soc-close]')) {
            closeModals();
            return;
        }
        // Clicar el fons fosc tanca, com a la resta de modals.
        if (event.target.classList?.contains('modal') && event.target.id.startsWith('soc')) {
            event.target.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModals();
    });
}

/** Omple i obre el mini-perfil d'una persona. */
export function openProfile(id) {
    const person = findPerson(id);
    const body = byId('socProfileBody');
    if (!person || !body) return;

    const recordValue = person.record ? person.record.score : person.level;
    const recordLabel = person.record ? person.record.game : 'LV';

    body.innerHTML = `
        <div class="soc-profile-head">
            <div class="soc-profile-av">${esc(person.icon)}</div>
            <div>
                <div class="soc-profile-name">${esc(person.name)}</div>
                <div class="soc-profile-status">${activityLabel(person)}</div>
            </div>
        </div>
        <div class="soc-profile-stats">
            <div class="soc-profile-stat"><b>${person.wins}</b><span>W</span></div>
            <div class="soc-profile-stat"><b>${person.losses}</b><span>L</span></div>
            <div class="soc-profile-stat"><b>${recordValue}</b><span>${esc(recordLabel)}</span></div>
        </div>
        <div class="soc-btn-row">
            <button class="soc-btn primary" type="button" data-soc="challenge" data-id="${esc(person.id)}">${t('social.challenge')}</button>
            ${person.activity?.kind === 'playing'
                ? `<button class="soc-btn" type="button" data-soc="watch" data-id="${esc(person.id)}">${t('social.watch')}</button>`
                : ''}
            <button class="soc-btn ghost" type="button" data-soc="spectate" data-id="${esc(person.id)}">${t('social.spectator')}</button>
            <button class="soc-btn ghost" type="button" data-soc="gift-friend" data-id="${esc(person.id)}">🎁 ${t('social.gifts')}</button>
        </div>`;

    hydrate(byId('socProfileModal'));
    byId('socProfileModal')?.classList.add('active');
}

/** Obre el mode espectador per a una persona (o un torneig). */
export function openSpectator(person) {
    if (!person) return;

    const title = byId('socSpectatorTitle');
    const sub = byId('socSpectatorSub');
    if (title) title.textContent = person.name;
    if (sub) {
        sub.textContent = person.activity?.game
            ? get('social.nowPlaying', { game: person.activity.game })
            : get('social.spectator');
    }

    closeModals();
    byId('socSpectatorModal')?.classList.add('active');
}
