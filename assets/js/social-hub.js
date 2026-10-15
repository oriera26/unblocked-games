/**
 * social-hub.js · pintat i gestió de les columnes esquerres (Amics / Lliga)
 * i actualització de la targeta de perfil del sidebar.
 *
 * Aquesta versió:
 * - Column esquerra amb taules d'amics i lliga.
 * - Delegació a initHub.leftColumn i initHub.leagueSection.
 * - Subscriptors per al perfil del sidebar.
 */

import { findPerson, myName, notify, saveState, state, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend, pinFriend, challengeFriend, giftFriend, claimGift } from './social-store.js';
import { activityLabel, byId, countdown, esc, get, hydrate, statusLabel, t, timeAgo } from './social-ui.js';
import { openProfile } from './social-modals.js';

let root = null;

/* ---------- Inicialització ---------- */

export function initHub(node, onSocialChange) {
    root = node;

    // No subscription here - social.js handles state changes
    // Just initial render if we're already ready
    if (state.status === 'ready') {
        render();
    }
}

/* ---------- Renderitzador ---------- */

function render() {
    if (!root || view !== 'ready') return;

    // Obtenim dades de l'estat
    const friends = state.friends || [];
    const profile = state.profile || {};
    const league = state.league || [];

    // Contadors
    const activeFriends = (state.friends || []).filter(f => f.status !== 'offline').length;
    const friendsCountEl = root.querySelector('#friendsCount');
    if (friendsCountEl) friendsCountEl.textContent = `(${activeFriends})`;

    const leagueCountEl = root.querySelector('#leagueCount');
    if (leagueCountEl) leagueCountEl.textContent = league.length ? `(${league.length} setmanes)` : '';

    // Renderitzem columnes esquerres
    root.innerHTML = /*html*/ `
        <div class="social-col">
            ${renderFriendsSection(friends)}
            ${renderLeagueSection(league)}
        </div>
    `;

    // Subscriptors després de pintar
    addFriendClicks();
}

/* ---------- Secció d'amics ---------- */

function renderFriendsSection(friends) {
    // Si no hi ha dades encara
    if (!friends || friends.length === 0) {
        return `
            <div class="friends-empty">
                <div class="friends-empty-icon">${t('ui.empty_friends')}</div>
                <h3>${t('ui.friends')}</h3>
                <p>${t('ui.no_friends_yet')}</p>
            </div>
        `;
    }

    const rows = friends.map((person, i) => personRow(person, i)).join('');

    return `
        <div class="soc-section-label">${t('ui.friends')}</div>
        <div class="soc-list soc-friends-list" style="max-height: 420px; overflow-y: auto;">
            ${rows}
        </div>
    `;
}

/* ---------- Secció de lliga ---------- */

function renderLeagueSection(league) {
    if (!league || league.length === 0) {
        return `
            <div class="league-empty">
                <div class="league-empty-icon">${t('ui.empty_league')}</div>
                <h3>${t('ui.league')}</h3>
                <p>${t('ui.no_league_yet')}</p>
            </div>
        `;
    }

    const rows = league.map((entry, i) => leagueRow(entry, i)).join('');

    return `
        <div class="soc-section-label">${t('ui.league')}</div>
        <div class="soc-list soc-league-list">${rows}</div>
    `;
}

/* ---------- Files d'amic ---------- */

function personRow(person, index) {
    const offline = person.status === 'offline';
    const playing = person.activity?.kind === 'playing';
    const gameName = person.activity?.game ?? '';
    const xp = person.xp ?? 0;

    return `
        <div class="soc-person ${offline ? 'is-offline' : ''}" data-person-id="${esc(person.id)}" style="cursor: pointer;">
            <div class="soc-avatar">
                ${esc(person.icon)}
                <span class="soc-dot ${esc(person.status)}" title="${statusLabel(person.status)}"></span>
            </div>
            <button class="soc-person-main soc-person-btn" type="button" data-soc="profile" data-id="${esc(person.id)}">
                <span class="soc-person-name">${esc(person.name)}</span>
                ${xp ? `<span class="soc-xp">${xp} XP</span>` : ''}
            </button>
        </div>
    `;
}

/* ---------- Files de lliga ---------- */

function leagueRow(entry, index) {
    const week = entry.week ?? 0;
    const rank = entry.rank ?? '—';
    const xp = entry.xp ?? 0;

    return `
        <div class="soc-league-entry" style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--glass-border-soft);">
            <div style="width: 32px; height: 32px; background: linear-gradient(140deg, var(--accent), #7b5cff); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 11px;">#${rank}</div>
            <div style="flex: 1;">
                <span style="font-weight: 600; font-size: 12px; color: var(--text-main);">Setmana ${week}</span>
                <span style="font-size: 10px; color: var(--text-main); opacity: 0.5;">${t('ui.xp')} ${xp}</span>
            </div>
        </div>
    `;
}

/* ---------- Delegació de clics ---------- */

function addFriendClicks() {
    // Clic en un amic → obre perfil lateral
    document.querySelectorAll('.soc-person').forEach(btn => {
        btn.replaceWith(btn.innerHTML); // netejem listeners antics
    });

    document.querySelectorAll('.soc-person').forEach(btn => {
        btn.addEventListener('click', () => {
            const personId = btn.dataset.personId;
            if (personId) {
                openProfile(root, personId);
            }
        });
    });
}