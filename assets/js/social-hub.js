/**
 * social-hub.js · la columna de contingut del Social: amics amb cercador,
 * lliga setmanal i avisos.
 *
 * El DOM es munta una sola vegada (`mount`) i després només se'n
 * refresquen els trossos que canvien (`refresh`). Això és important perquè
 * l'input del cercador no perdi el focus ni el text mentre s'escriu i
 * arriben actualitzacions de Firestore al mateix temps.
 */

import {
    state,
    onSocialChange,
    acceptFriendRequest,
    rejectFriendRequest,
    sendFriendRequest,
    setFriendPin,
    searchProfiles,
    notify,
    markNotificationsRead,
    clearNotifications,
    isFriend
} from './social-store.js';
import { esc, get, t, timeAgo, statusLabel, avatarMarkup, hydrate } from './social-ui.js';
import { openProfile } from './social-modals.js';

let root = null;
let unsubscribeStore = null;

let activeTab = 'friends';     // friends | requests | sent
let searchTerm = '';           // el que hi ha escrit al cercador
let searchResults = [];        // resultats remots de l'última cerca
let searchLoading = false;
let searchToken = 0;           // per descartar respostes velles
let searchTimer = null;

/* ================================================================
   Muntatge (una sola vegada)
   ================================================================ */

export function mountHub(container) {
    root = container;

    root.innerHTML = `
        <div class="soc-col">
            <section class="social-card">
                <div class="social-card-title">
                    <span class="soc-ico" data-lucide="users" data-size="18"></span>
                    <span>${t('social.friends')}</span>
                    <span class="soc-badge" id="hubOnlineBadge" hidden></span>
                </div>

                <div class="soc-search-wrap">
                    <span class="soc-search-ico" data-lucide="search" data-size="15"></span>
                    <input id="hubSearch" class="soc-search" type="search"
                           placeholder="${t('social.searchPlayers')}"
                           aria-label="${t('social.searchPlayers')}"
                           autocomplete="off" spellcheck="false">
                </div>

                <div class="soc-subtabs" id="hubSubtabs" role="tablist"></div>
                <div class="soc-friends-body" id="hubFriendsBody"></div>
                <div id="hubSuggestions"></div>
            </section>

            <section class="social-card">
                <div class="social-card-title">
                    <span class="soc-ico" data-lucide="trophy" data-size="18"></span>
                    <span>${t('social.league')}</span>
                    <span class="social-card-count" id="hubLeagueWeek"></span>
                </div>
                <div id="hubLeagueBody"></div>
            </section>

            <section class="social-card">
                <div class="social-card-title">
                    <span class="soc-ico" data-lucide="bell" data-size="18"></span>
                    <span>${t('social.notifications')}</span>
                    <button type="button" class="soc-icon-btn" data-act="clear-notifs"
                            aria-label="${t('ui.close')}" title="${t('ui.close')}" hidden>
                        <span data-lucide="x" data-size="14"></span>
                    </button>
                </div>
                <div id="hubNotifsBody"></div>
            </section>
        </div>
    `;

    const search = root.querySelector('#hubSearch');
    search.addEventListener('input', () => {
        searchTerm = search.value.trim();
        scheduleSearch();
    });
    search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
    });

    root.addEventListener('click', onClick);

    unsubscribeStore = onSocialChange(() => refresh());
    refresh();
}

export function destroyHub() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = null;
    if (unsubscribeStore) unsubscribeStore();
    unsubscribeStore = null;
    root = null;
}

/* ================================================================
   Cerca
   ================================================================ */

function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);

    if (searchTerm.length < 2) {
        searchResults = [];
        searchLoading = false;
        searchToken++;
        refresh();
        return;
    }

    searchLoading = true;
    refresh();

    searchTimer = setTimeout(async () => {
        const token = ++searchToken;
        const results = await searchProfiles(searchTerm);
        if (token !== searchToken) return; // ja s'ha escrit una altra cosa
        searchResults = results;
        searchLoading = false;
        refresh();
    }, 250);
}

/** Els que ja conec (amics, sol·licituds i suggeriments) que casen amb el text. */
function localMatches(term) {
    const query = term.toLowerCase();
    const seen = new Set();
    const out = [];

    for (const person of [...state.friends, ...state.requests, ...state.sentRequests, ...state.suggestions]) {
        if (seen.has(person.uid)) continue;
        seen.add(person.uid);
        const haystack = `${person.name ?? ''} ${person.username ?? ''}`.toLowerCase();
        if (haystack.includes(query)) out.push(person);
    }

    return out;
}

/* ================================================================
   Refresc
   ================================================================ */

export function refresh() {
    if (!root || state.status !== 'ready') return;

    refreshHeader();
    refreshSubtabs();
    refreshFriendsBody();
    refreshSuggestions();
    refreshLeague();
    refreshNotifications();

    hydrate(root);
}

function refreshHeader() {
    const online = state.friends.filter((friend) => friend.status === 'online').length;
    const badge = root.querySelector('#hubOnlineBadge');
    badge.textContent = String(online);
    badge.title = t('social.statusOnline');
    badge.hidden = online === 0;

    const search = root.querySelector('#hubSearch');
    search.placeholder = t('social.searchPlayers');
    search.setAttribute('aria-label', t('social.searchPlayers'));

    const week = root.querySelector('#hubLeagueWeek');
    week.textContent = state.league.week ?? '';
}

function refreshSubtabs() {
    const bar = root.querySelector('#hubSubtabs');

    const tabs = [
        { id: 'friends', label: t('social.friends'), count: state.friends.length },
        { id: 'requests', label: t('social.requests'), count: state.requests.length },
        { id: 'sent', label: t('social.sentRequests'), count: state.sentRequests.length }
    ].filter((tab) => tab.id === 'friends' || tab.count > 0);

    if (!tabs.some((tab) => tab.id === activeTab)) activeTab = 'friends';

    bar.innerHTML = tabs.map((tab) => `
        <button type="button" class="soc-subtab ${tab.id === activeTab ? 'active' : ''}"
                data-act="tab" data-tab="${tab.id}" role="tab"
                aria-selected="${tab.id === activeTab}">
            ${tab.label}${tab.id === 'friends' ? '' : ` (${tab.count})`}
        </button>
    `).join('');
}

function refreshFriendsBody() {
    const body = root.querySelector('#hubFriendsBody');

    if (searchTerm.length > 0) {
        body.innerHTML = renderSearchResults();
        return;
    }

    if (activeTab === 'requests') {
        body.innerHTML = renderRequests();
        return;
    }
    if (activeTab === 'sent') {
        body.innerHTML = renderSent();
        return;
    }

    body.innerHTML = renderFriends();
}

/* ================================================================
   Amics
   ================================================================ */

function sortFriends(list) {
    const weight = (friend) => {
        if (friend.pinned) return 0;
        if (friend.status === 'online') return 1;
        return 2;
    };
    return [...list].sort((a, b) => {
        const diff = weight(a) - weight(b);
        if (diff !== 0) return diff;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
}

function personRow(person, extra = '') {
    const status = person.status ?? 'offline';
    const uid = esc(person.uid);

    return `
        <div class="soc-person" data-act="profile" data-uid="${uid}" role="button" tabindex="0">
            <span class="soc-avatar soc-avatar-${esc(status)}">
                ${avatarMarkup(person)}
            </span>
            <span class="soc-person-main">
                <span class="soc-person-name">${esc(person.name ?? 'Jugador')}</span>
                <span class="soc-person-sub">${esc(person.username ? `@${person.username}` : statusLabel(status))}</span>
            </span>
            <span class="soc-person-side">${extra}</span>
        </div>
    `;
}

function renderFriends() {
    if (!state.friends.length) {
        return emptyState(t('ui.empty_friends'), t('social.noFriends'));
    }

    return `<div class="soc-list">${sortFriends(state.friends).map((friend) => personRow(friend, `
        <button type="button" class="soc-icon-btn soc-pin ${friend.pinned ? 'is-pinned' : ''}"
                data-act="pin" data-uid="${esc(friend.uid)}"
                aria-pressed="${friend.pinned === true}"
                aria-label="${t('social.pin')}" title="${t('social.pin')}">
            <span data-lucide="pin" data-size="14"></span>
        </button>
        ${friend.status === 'online' ? `<span class="soc-dot-label">${statusLabel('online')}</span>` : ''}
    `)).join('')}</div>`;
}

function renderRequests() {
    if (!state.requests.length) return emptyState('📨', t('social.noRequests'));

    return `<div class="soc-list">${state.requests.map((person) => personRow(person, `
        <span class="soc-actions">
            <button type="button" class="soc-btn soc-btn-primary" data-act="accept" data-uid="${esc(person.uid)}">${t('social.accept')}</button>
            <button type="button" class="soc-btn" data-act="reject" data-uid="${esc(person.uid)}">${t('social.reject')}</button>
        </span>
        <span class="soc-when">${timeAgo(person.at)}</span>
    `)).join('')}</div>`;
}

function renderSent() {
    if (!state.sentRequests.length) return emptyState('⏳', t('social.noSentRequests'));

    return `<div class="soc-list">${state.sentRequests.map((person) => personRow(person, `
        <span class="soc-chip">${t('social.requestPending')}</span>
        <button type="button" class="soc-btn" data-act="cancel" data-uid="${esc(person.uid)}">${t('ui.cancel')}</button>
    `)).join('')}</div>`;
}

/* ================================================================
   Resultats de la cerca
   ================================================================ */

function relationOf(uid) {
    if (isFriend(uid)) return 'friend';
    if (state.requests.some((p) => p.uid === uid)) return 'incoming';
    if (state.sentRequests.some((p) => p.uid === uid)) return 'sent';
    return 'stranger';
}

function renderSearchResults() {
    if (searchLoading && !searchResults.length) {
        return `<div class="soc-list soc-skeleton-list" aria-busy="true">
            ${'<div class="soc-skeleton"></div>'.repeat(3)}
        </div>`;
    }

    const seen = new Set();
    const rows = [];

    for (const person of localMatches(searchTerm)) {
        seen.add(person.uid);
        rows.push(person);
    }
    for (const person of searchResults) {
        if (seen.has(person.uid)) continue;
        seen.add(person.uid);
        rows.push(person);
    }

    if (!rows.length) {
        return searchLoading
            ? `<div class="soc-list soc-skeleton-list" aria-busy="true">${'<div class="soc-skeleton"></div>'.repeat(2)}</div>`
            : emptyState('🔍', t('social.noResults'));
    }

    const html = rows.map((person) => {
        const relation = relationOf(person.uid);
        const action = relation === 'friend'
            ? `<span class="soc-chip soc-chip-ok">${t('social.friends')}</span>`
            : relation === 'sent'
                ? `<span class="soc-chip">${t('social.requestPending')}</span>`
                : relation === 'incoming'
                    ? `<span class="soc-actions">
                           <button type="button" class="soc-btn soc-btn-primary" data-act="accept" data-uid="${esc(person.uid)}">${t('social.accept')}</button>
                           <button type="button" class="soc-btn" data-act="reject" data-uid="${esc(person.uid)}">${t('social.reject')}</button>
                       </span>`
                    : `<button type="button" class="soc-btn soc-btn-primary" data-act="add" data-uid="${esc(person.uid)}" data-name="${esc(person.name ?? '')}">${t('social.add')}</button>`;

        return personRow(person, action);
    }).join('');

    return `<div class="soc-list">${html}</div>`;
}

/* ================================================================
   Suggeriments
   ================================================================ */

function refreshSuggestions() {
    const box = root.querySelector('#hubSuggestions');

    if (searchTerm.length > 0 || !state.suggestions.length) {
        box.innerHTML = '';
        return;
    }

    const rows = state.suggestions.slice(0, 4).map((person) => personRow(person, `
        <button type="button" class="soc-btn soc-btn-primary" data-act="add" data-uid="${esc(person.uid)}" data-name="${esc(person.name ?? '')}">${t('social.add')}</button>
    `)).join('');

    box.innerHTML = `
        <div class="soc-section-label">${t('social.suggested')}</div>
        <div class="soc-list">${rows}</div>
    `;
}

/* ================================================================
   Lliga
   ================================================================ */

function refreshLeague() {
    const body = root.querySelector('#hubLeagueBody');
    const { entries, xp, xpTarget } = state.league;

    if (!entries.length) {
        body.innerHTML = emptyState(t('ui.empty_league'), t('ui.no_league_yet'));
        return;
    }

    const goal = Math.max(1, xpTarget || 2000);
    const percent = Math.min(100, Math.round((xp / goal) * 100));
    const myRank = entries.findIndex((entry) => entry.uid === state.me?.uid) + 1;

    body.innerHTML = `
        <div class="soc-league-me">
            <span class="soc-league-rank">${myRank > 0 ? `#${myRank}` : '—'}</span>
            <div class="soc-league-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${xp}">
                <div class="soc-league-bar"><span style="width:${percent}%"></span></div>
                <span class="soc-league-goal">${xp} / ${goal} ${t('ui.xp')}</span>
            </div>
        </div>
        <div class="soc-list soc-league-list">
            ${entries.slice(0, 10).map((entry, index) => `
                <div class="soc-league-row ${entry.uid === state.me?.uid ? 'is-me' : ''} ${index < 3 ? 'is-top' : ''}"
                     data-act="profile" data-uid="${esc(entry.uid)}" role="button" tabindex="0">
                    <span class="soc-league-pos">${index + 1}</span>
                    <span class="soc-avatar soc-avatar-${entry.uid === state.me?.uid ? 'online' : 'offline'}">${avatarMarkup(entry)}</span>
                    <span class="soc-person-name">${esc(entry.name ?? 'Jugador')}</span>
                    <span class="soc-league-xp">${entry.xp} ${t('ui.xp')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/* ================================================================
   Avisos
   ================================================================ */

function refreshNotifications() {
    const body = root.querySelector('#hubNotifsBody');
    const clearButton = root.querySelector('[data-act="clear-notifs"]');
    const list = state.notifications;

    clearButton.hidden = list.length === 0;

    if (!list.length) {
        body.innerHTML = emptyState('🔔', t('social.noNotifications'));
        return;
    }

    body.innerHTML = `<div class="soc-list">${list.map((notification) => `
        <div class="soc-notification ${notification.read ? 'is-read' : ''}" data-act="read-notifs">
            <span class="soc-notification-dot" aria-hidden="true"></span>
            <span class="soc-notification-text">${esc(notification.text)}</span>
            <span class="soc-when">${timeAgo(notification.at)}</span>
        </div>
    `).join('')}</div>`;
}

/* ================================================================
   Peces compartides
   ================================================================ */

function emptyState(icon, text) {
    return `
        <div class="soc-empty">
            <span class="soc-empty-icon" aria-hidden="true">${icon}</span>
            <p>${text}</p>
        </div>
    `;
}

/* ================================================================
   Accions
   ================================================================ */

async function onClick(event) {
    const target = event.target.closest('[data-act]');
    if (!target || !root.contains(target)) return;

    const act = target.dataset.act;
    const uid = target.dataset.uid;

    if (act === 'tab') {
        activeTab = target.dataset.tab;
        refresh();
        return;
    }

    if (act === 'profile') {
        openProfile(uid);
        return;
    }

    if (act === 'pin') {
        event.stopPropagation();
        const person = state.friends.find((friend) => friend.uid === uid);
        if (!person) return;
        const result = await setFriendPin(uid, !person.pinned);
        if (!result.ok) notify(get('social.error_action'));
        return;
    }

    if (act === 'accept') {
        event.stopPropagation();
        const result = await acceptFriendRequest(uid);
        notify(result.ok ? get('social.friendAccepted') : get('social.error_action'));
        return;
    }

    if (act === 'reject' || act === 'cancel') {
        event.stopPropagation();
        const result = await rejectFriendRequest(uid);
        if (!result.ok) notify(get('social.error_action'));
        return;
    }

    if (act === 'add') {
        event.stopPropagation();
        const name = target.dataset.name || uid;
        const result = await sendFriendRequest(uid);
        notify(result.ok
            ? get('social.requestSent', { name })
            : get('social.error_action'));
        return;
    }

    if (act === 'read-notifs') {
        markNotificationsRead();
        return;
    }

    if (act === 'clear-notifs') {
        clearNotifications();
    }
}
