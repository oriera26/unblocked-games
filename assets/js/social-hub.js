/**
 * social-hub.js · les targetes del Social: amics, lliga, feed i regals.
 *
 * Dibuixa el contingut de `#socialRoot` i atén els clics i la cerca. Les
 * accions que obren una finestra (mini-perfil, espectador) viuen al
 * mòdul de modals; les que només toquen estat es queden aquí.
 *
 * `handleAction` retorna cert quan el hub s'ha de tornar a pintar: les
 * accions que obren una finestra tornen fals, perquè qui canvia és la
 * finestra, no el hub.
 */

import { openProfile, openSpectator } from './social-modals.js';
import { findPerson, myName, notify, saveState, state } from './social-store.js';
import { activityLabel, byId, countdown, esc, get, hydrate, statusLabel, t, timeAgo } from './social-ui.js';

let root = null;

/* ================================================================
   Pintura del hub
   ================================================================ */

export function initHub(node) {
    if (!node || root) return;
    root = node;

    root.addEventListener('click', onRootClick);
    root.addEventListener('input', onRootInput);

    renderHub();
}

export function renderHub(node = root) {
    if (!node) return;

    node.innerHTML = `
        <div class="social-layout">
            <div class="social-col">
                ${renderPeopleCard()}
                ${renderLeagueCard()}
            </div>
            <div class="social-col">
                ${renderFeedCard()}
                ${renderGiftsCard()}
            </div>
        </div>`;

    hydrate(node);
}

function renderPeopleCard() {
    const unread = state.notifications.filter((notification) => !notification.read).length;

    return `
    <article class="social-card">
        <div class="social-card-title">
            <span class="soc-ico"><i data-lucide="users"></i></span>
            ${t('social.friends')}
            <span class="social-card-count">${state.friends.length}</span>
            <button class="soc-btn ghost soc-bell" type="button" data-soc="toggle-notifs"
                    aria-label="${t('social.notifications')}" aria-expanded="${state.ui.showNotifs}">
                <i data-lucide="bell"></i>
                ${unread ? `<span class="soc-bell-badge">${unread}</span>` : ''}
            </button>
        </div>

        <div class="soc-search-row">
            <input class="soc-search" type="search" data-soc-input="search" value="${esc(state.ui.search ?? '')}"
                   placeholder="${t('social.searchPlayers')}" aria-label="${t('social.searchPlayers')}">
        </div>

        ${state.ui.showNotifs ? renderNotifications() : ''}

        <div class="soc-list" data-soc-friends>${renderFriendRows()}</div>

        ${state.requests.length ? `
            <div class="soc-section-label">${t('social.requests')}</div>
            <div class="soc-list">${state.requests.map(requestRow).join('')}</div>` : ''}

        ${state.suggestions.length ? `
            <div class="soc-section-label">${t('social.suggested')}</div>
            <div class="soc-list">${state.suggestions.map(suggestionRow).join('')}</div>` : ''}
    </article>`;
}

function renderFriendRows() {
    const query = (state.ui.search ?? '').trim().toLowerCase();
    const friends = [...state.friends].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    const shown = query ? friends.filter((friend) => friend.name.toLowerCase().includes(query)) : friends;

    if (!shown.length) return `<p class="soc-empty">${t('social.noFriends')}</p>`;
    return shown.map(personRow).join('');
}

function renderNotifications() {
    const rows = state.notifications.length
        ? state.notifications.map((notification) => `
            <div class="soc-person">
                <div class="soc-avatar">🔔</div>
                <div class="soc-person-main">
                    <span class="soc-person-activity soc-wrap">${esc(notification.text)}</span>
                    <span class="soc-person-activity">${timeAgo(notification.at)}</span>
                </div>
            </div>`).join('')
        : '<p class="soc-empty">—</p>';

    return `
        <div class="soc-section-label">${t('social.notifications')}</div>
        <div class="soc-list">${rows}</div>`;
}

function personRow(person) {
    const offline = person.status === 'offline';
    const playing = person.activity?.kind === 'playing';

    return `
    <div class="soc-person ${offline ? 'is-offline' : ''}">
        <div class="soc-avatar">
            ${esc(person.icon)}
            <span class="soc-dot ${esc(person.status)}" title="${statusLabel(person.status)}"></span>
        </div>
        <button class="soc-person-main soc-person-btn" type="button" data-soc="profile" data-id="${esc(person.id)}">
            <span class="soc-person-name">${esc(person.name)}</span>
            <span class="soc-person-activity">${activityLabel(person)}</span>
        </button>
        <div class="soc-person-actions">
            ${playing
                ? `<button class="soc-btn ghost" type="button" data-soc="watch" data-id="${esc(person.id)}">${t('social.watch')}</button>`
                : ''}
            <button class="soc-btn" type="button" data-soc="challenge" data-id="${esc(person.id)}">${t('social.challenge')}</button>
            <button class="soc-btn ghost" type="button" data-soc="pin" data-id="${esc(person.id)}"
                    aria-pressed="${Boolean(person.pinned)}" title="${t('social.pin')}">📌</button>
        </div>
    </div>`;
}

function requestRow(person) {
    return `
    <div class="soc-person is-offline">
        <div class="soc-avatar">${esc(person.icon)}</div>
        <div class="soc-person-main">
            <span class="soc-person-name">${esc(person.name)}</span>
        </div>
        <div class="soc-person-actions">
            <button class="soc-btn primary" type="button" data-soc="accept" data-id="${esc(person.id)}">${t('social.accept')}</button>
            <button class="soc-btn ghost" type="button" data-soc="reject" data-id="${esc(person.id)}">${t('social.reject')}</button>
        </div>
    </div>`;
}

function suggestionRow(person) {
    return `
    <div class="soc-person">
        <div class="soc-avatar">${esc(person.icon)}</div>
        <div class="soc-person-main">
            <span class="soc-person-name">${esc(person.name)}</span>
        </div>
        <div class="soc-person-actions">
            <button class="soc-btn" type="button" data-soc="add" data-id="${esc(person.id)}">${t('social.add')}</button>
        </div>
    </div>`;
}

function renderLeagueCard() {
    const entries = [...state.league.entries].sort((a, b) => b.xp - a.xp);
    const total = entries.length;

    const rows = entries.map((entry, index) => {
        const isMe = entry.id === 'me';
        const zone = index < 3 ? 'promotion' : index >= total - 2 ? 'relegation' : '';
        return `
        <div class="soc-person soc-rank ${zone} ${isMe ? 'is-me' : ''}">
            <span class="soc-rank-pos">${index + 1}</span>
            <div class="soc-avatar">${esc(entry.icon)}</div>
            <div class="soc-person-main">
                <span class="soc-person-name">${esc(isMe ? myName() : entry.name)}</span>
            </div>
            <span class="soc-rank-xp">${entry.xp}</span>
        </div>`;
    }).join('');

    const percent = Math.min(100, Math.round((state.league.xp / state.league.xpTarget) * 100));

    return `
    <article class="social-card">
        <div class="social-card-title">
            <span class="soc-ico"><i data-lucide="trophy"></i></span>
            ${t('social.league')}
            <span class="social-card-count">${esc(state.league.division)}</span>
        </div>

        <div class="soc-league-head">
            <span class="soc-streak"><span class="flame">🔥</span> ${state.me.streak}</span>
            <span class="soc-league-xp">${state.league.xp} / ${state.league.xpTarget} XP</span>
        </div>
        <div class="soc-level-track" role="progressbar" aria-valuemin="0" aria-valuemax="${state.league.xpTarget}" aria-valuenow="${state.league.xp}">
            <div class="soc-level-fill" style="width:${percent}%"></div>
        </div>

        <div class="soc-list">${rows}</div>

        <div class="soc-section-label">${t('social.rivalry')}</div>
        <div class="soc-list">${state.duels.map(duelRow).join('')}</div>

        <div class="soc-section-label">${t('social.tournaments')}</div>
        ${renderTournament()}

        <div class="soc-section-label">${t('social.community')}</div>
        <div class="soc-progress"><div class="soc-progress-fill" style="width:${Math.round((state.community.done / state.community.goal) * 100)}%"></div></div>
        <div class="soc-progress-meta"><span>${state.community.done.toLocaleString()}</span><span>${state.community.goal.toLocaleString()}</span></div>

        <div class="soc-section-label">${t('social.titles')}</div>
        <div class="soc-titles">
            ${state.titles.map((title) => `<span class="soc-title-pill ${title.rare ? 'rare' : ''}">${esc(title.label)}</span>`).join('')}
        </div>
    </article>`;
}

function duelRow(duel) {
    const win = duel.wins >= duel.losses;
    return `
    <div class="soc-duel">
        <div class="soc-duel-side">
            <div class="soc-avatar">${esc(duel.icon)}</div>
            <span class="soc-duel-name">${esc(duel.name)}</span>
        </div>
        <span class="soc-vs">VS</span>
        <div class="soc-duel-side right">
            <span class="soc-duel-score ${win ? 'win' : 'lose'}">${duel.wins}-${duel.losses}</span>
        </div>
    </div>`;
}

function renderTournament() {
    const tournament = state.tournaments[0];
    if (!tournament) return '<p class="soc-empty">—</p>';

    const rounds = tournament.bracket.map((round) => `
        <div class="soc-bracket-col">
            ${round.map((match) => `<span class="soc-bracket-match">${esc(match)}</span>`).join('')}
        </div>`).join('');

    return `
    <div class="soc-tour">
        <div class="soc-tour-top">
            <span class="soc-tour-name">${esc(tournament.name)}</span>
            <span class="soc-tour-timer" data-soc-timer="${esc(tournament.id)}">${countdown(tournament.endsAt)}</span>
        </div>
        <div class="soc-bracket">${rounds}</div>
        <div class="soc-btn-row">
            <button class="soc-btn ${tournament.joined ? 'ghost' : 'primary'}" type="button" data-soc="join-tour" data-id="${esc(tournament.id)}">
                ${tournament.joined ? t('social.watch') : t('social.join')}
            </button>
        </div>
    </div>`;
}

function renderFeedCard() {
    return `
    <article class="social-card">
        <div class="social-card-title">
            <span class="soc-ico"><i data-lucide="activity"></i></span>
            ${t('social.feed')}
        </div>
        <div class="soc-list">${state.feed.map(feedRow).join('')}</div>
    </article>`;
}

function feedRow(item) {
    const reactions = Object.entries(item.reactions ?? {}).map(([emoji, count]) => `
        <button class="soc-reaction-chip" type="button" data-soc="react" data-id="${esc(item.id)}" data-emoji="${esc(emoji)}">${esc(emoji)} ${count}</button>`).join('');

    const detail = `${item.actor} · ${item.game}${item.score ? ` · ${item.score}` : ''}`;

    return `
    <div class="soc-person soc-feed-item">
        <div class="soc-avatar">${esc(item.icon)}</div>
        <div class="soc-person-main">
            <span class="soc-person-activity soc-wrap">${esc(detail)}</span>
            <span class="soc-person-activity">${timeAgo(item.at)}</span>
            <div class="soc-reactions-row">
                ${reactions}
                <button class="soc-reaction-chip" type="button" data-soc="react" data-id="${esc(item.id)}" data-emoji="👍">＋</button>
            </div>
        </div>
    </div>`;
}

function renderGiftsCard() {
    return `
    <article class="social-card">
        <div class="social-card-title">
            <span class="soc-ico"><i data-lucide="gift"></i></span>
            ${t('social.gifts')}
            <span class="social-card-count">🪙 ${state.giftsBalance}</span>
        </div>
        <div class="soc-list">${state.gifts.map(giftRow).join('')}</div>
    </article>`;
}

function giftRow(gift) {
    const label = gift.claimed ? '✓' : (gift.price ? `🪙 ${gift.price}` : t('social.accept'));
    return `
    <div class="soc-person">
        <div class="soc-avatar">${esc(gift.icon)}</div>
        <div class="soc-person-main">
            <span class="soc-person-name">${esc(gift.label)}</span>
            <span class="soc-person-activity">${gift.price ? `🪙 ${gift.price}` : t('social.gifts')}</span>
        </div>
        <div class="soc-person-actions">
            <button class="soc-btn ${gift.claimed ? 'ghost' : 'primary'}" type="button" data-soc="gift" data-id="${esc(gift.id)}" ${gift.claimed ? 'disabled' : ''}>${label}</button>
        </div>
    </div>`;
}

/* ================================================================
   Accions
   ================================================================ */

export function handleAction(button) {
    const { soc, id, emoji } = button.dataset;

    switch (soc) {
        case 'toggle-notifs':
            state.ui.showNotifs = !state.ui.showNotifs;
            if (state.ui.showNotifs) state.notifications.forEach((notification) => { notification.read = true; });
            break;
        case 'add': addSuggestion(id); break;
        case 'accept': acceptRequest(id); break;
        case 'reject':
            state.requests = state.requests.filter((request) => request.id !== id);
            break;
        case 'challenge': challenge(id); break;
        case 'pin': {
            const friend = state.friends.find((person) => person.id === id);
            if (friend) friend.pinned = !friend.pinned;
            break;
        }
        case 'gift': claimGift(id); break;
        case 'gift-friend': giftFriend(id); break;
        case 'react': reactToFeed(id, emoji); break;
        case 'profile':
            openProfile(id);
            return false;
        case 'watch':
        case 'spectate':
            openSpectator(findPerson(id));
            return false;
        case 'join-tour': {
            const tournament = state.tournaments.find((item) => item.id === id);
            openSpectator({
                name: tournament?.name ?? myName(),
                icon: '🏆',
                activity: { kind: 'playing', game: tournament?.name ?? '' }
            });
            return false;
        }
        default:
            return false;
    }

    return true;
}

function addSuggestion(id) {
    const index = state.suggestions.findIndex((person) => person.id === id);
    if (index === -1) return;

    const [person] = state.suggestions.splice(index, 1);
    state.friends.push(newFriend(person));
    notify(`${person.name} · ${get('social.add')}`);
}

function acceptRequest(id) {
    const index = state.requests.findIndex((person) => person.id === id);
    if (index === -1) return;

    const [person] = state.requests.splice(index, 1);
    state.friends.push(newFriend(person));
    notify(`${person.name} · ${get('social.accept')}`);
}

function newFriend(person) {
    return {
        id: person.id,
        name: person.name,
        icon: person.icon,
        status: 'online',
        activity: { kind: 'lobby', game: null },
        pinned: false,
        wins: 0,
        losses: 0,
        level: 1,
        record: null
    };
}

function challenge(id) {
    const person = findPerson(id);
    if (!person) return;
    notify(get('social.challengeSent', { name: person.name }));
}

/** Envia un regal a algú; la notificació ho deixa constància. */
function giftFriend(id) {
    const person = findPerson(id);
    if (!person) return;
    if (state.giftsBalance > 0) state.giftsBalance -= 1;
    notify(get('social.giftSent', { name: person.name }));
}

function claimGift(id) {
    const gift = state.gifts.find((item) => item.id === id);
    if (!gift || gift.claimed) return;

    if (gift.price) {
        if (state.giftsBalance < gift.price) return;
        state.giftsBalance -= gift.price;
    } else {
        state.giftsBalance += 10;
    }

    gift.claimed = true;
}

function reactToFeed(id, emoji) {
    const item = state.feed.find((entry) => entry.id === id);
    if (!item) return;

    item.reactions ??= {};
    item.reactions[emoji] = (item.reactions[emoji] ?? 0) + 1;
}

/* ================================================================
   Esdeveniments del hub
   ================================================================ */

function onRootClick(event) {
    const button = event.target.closest('[data-soc]');
    if (!button || !root?.contains(button)) return;
    if (handleAction(button)) commit();
}

function onRootInput(event) {
    const input = event.target.closest('[data-soc-input="search"]');
    if (!input || !root?.contains(input)) return;

    state.ui.search = input.value;
    saveState();

    // Es repinta només la llista d'amics: repintar-ho tot faria perdre
    // el focus del camp de cerca a cada tecla.
    const list = root.querySelector('[data-soc-friends]');
    if (list) {
        list.innerHTML = renderFriendRows();
        hydrate(list);
    }
}

/** Desa l'estat i repinta el hub després d'una acció pròpia. */
export function commit() {
    saveState();
    renderHub();
}

/* ================================================================
   Refresc des de la simulació
   ================================================================ */

/** Repinta la llista d'amics i els rellotges sense tocar la resta. */
export function refreshFriends() {
    if (!root || !byId('view-social')?.classList.contains('active')) return;

    const list = root.querySelector('[data-soc-friends]');
    if (list) {
        list.innerHTML = renderFriendRows();
        hydrate(list);
    }

    for (const timer of root.querySelectorAll('[data-soc-timer]')) {
        const tournament = state.tournaments.find((item) => item.id === timer.dataset.socTimer);
        if (tournament) timer.textContent = countdown(tournament.endsAt);
    }
}
