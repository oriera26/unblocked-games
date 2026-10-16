/**
 * social.js · l'orquestrador de la secció Social.
 *
 * Munta l'esquelet (capçalera, columna del hub i barra lateral) segons
 * l'estat de la sessió i deixa que cada peça es refresqui tota sola:
 *
 *   - hub i xat s'escolten a si mateixos (subscripció a social-store)
 *   - el perfil de la barra lateral i els panells d'activitat i regals es
 *     refresquen des d'aquí a cada canvi d'estat
 *
 * L'esquelet NO es torna a muntar a cada canvi: sinó el xat perdria el
 * text escrit i el hub el focus del cercador.
 */

import { state, onSocialChange, startSocialStore, retrySocialStore, claimGift, notify, openChatWith, openLeagueChannel } from './social-store.js';
import { mountHub, destroyHub, refresh as refreshHub } from './social-hub.js';
import { mountChat, destroyChat, refresh as refreshChat } from './social-chat.js';
import { openProfile } from './social-modals.js';
import { esc, get, t, timeAgo, avatarMarkup, hydrate } from './social-ui.js';
import { onLangChange } from './i18n.js';

let root = null;
let mounted = false;
let unsubscribeStore = null;
let langBound = false;
let chatBound = false;

/** Per no repintar l'avatar del sidebar (i recarregar la foto) sense canvis. */
let profileSignature = '';

/* ================================================================
   Entrada
   ================================================================ */

export function initSocial(node) {
    root = node || document.getElementById('socialRoot');
    if (!root) return;

    if (!unsubscribeStore) {
        unsubscribeStore = onSocialChange(handleStatus);
        // onSocialChange crida el listener de seguida; si no, aquests dos
        // ja hi serien.
    }

    if (!langBound) {
        langBound = true;
        onLangChange(() => renderCurrent());
    }

    if (!chatBound) {
        chatBound = true;
        // Des de la fitxa d'una persona (o des d'on calgui): obre el xat
        // amb ella i porta la barra lateral a la pestanya del xat.
        window.addEventListener('ula:chat', (event) => {
            if (!root) return;
            selectTab('chat');
            openChatWith(event.detail?.uid, event.detail ?? {}).catch(() => {});
        });

        // Des de la targeta d'una lliga: obre el seu canal de xat.
        window.addEventListener('ula:league-chat', (event) => {
            if (!root) return;
            selectTab('chat');
            openLeagueChannel(event.detail?.leagueId);
        });
    }

    startSocialStore();
}

/* ================================================================
   Estats de la pàgina
   ================================================================ */

function handleStatus(status) {
    if (status === 'ready') {
        if (!mounted) {
            renderShell();
            mounted = true;
        }
        refreshDynamic();
        return;
    }

    if (mounted) {
        destroyHub();
        destroyChat();
        profileSignature = '';
        mounted = false;
    }

    if (status === 'loading') renderLoading();
    else if (status === 'error') renderError();
    else renderGate();
}

function renderCurrent() {
    handleStatus(state.status);
}

/* ================================================================
   Porta d'accés (sense sessió), càrrega i error
   ================================================================ */

function renderGate() {
    root.innerHTML = `
        <div class="social-page">
            <div class="soc-gate social-card">
                <span class="soc-gate-icon" aria-hidden="true">🔐</span>
                <h3>${t('auth.signin_required')}</h3>
                <p>${t('social.subtitle')}</p>
                <button type="button" class="btn-primary soc-btn soc-btn-primary" id="socialSigninBtn">
                    ${t('auth.signin')}
                </button>
            </div>
        </div>
    `;

    root.querySelector('#socialSigninBtn')?.addEventListener('click', () => {
        document.getElementById('authModal')?.classList.add('active');
    });
}

function renderLoading() {
    root.innerHTML = `
        <div class="social-page">
            <div class="soc-gate social-card" aria-busy="true">
                <span class="soc-spinner" aria-hidden="true"></span>
                <h3>${t('social.loading')}</h3>
            </div>
        </div>
    `;
}

function renderError() {
    root.innerHTML = `
        <div class="social-page">
            <div class="soc-gate social-card">
                <span class="soc-gate-icon" aria-hidden="true">⚠️</span>
                <h3>${t('social.error_loading')}</h3>
                <button type="button" class="soc-btn soc-btn-primary" id="socialRetryBtn">
                    ${t('ui.retry')}
                </button>
            </div>
        </div>
    `;

    root.querySelector('#socialRetryBtn')?.addEventListener('click', () => retrySocialStore());
}

/* ================================================================
   L'esquelet amb sessió
   ================================================================ */

function renderShell() {
    profileSignature = '';

    root.innerHTML = `
        <div class="social-page">
            <header class="social-header">
                <div>
                    <div class="social-title-row">
                        <h2>${t('social.title')}</h2>
                        <span class="soc-beta">${t('social.beta')}</span>
                    </div>
                    <p>${t('social.subtitle')}</p>
                </div>
            </header>

            <div class="social-layout">
                <main class="social-main" id="hubRoot"></main>

                <aside class="social-sidebar">
                    <section class="social-card soc-profile-card">
                        <button type="button" class="soc-profile-btn" id="sidebarProfileBtn" aria-label="${t('ui.my_account')}">
                            <span class="soc-avatar soc-avatar-lg" id="sidebarAvatar"></span>
                            <span class="soc-profile-info">
                                <span class="soc-profile-name" id="sidebarName">…</span>
                                <span class="soc-profile-desc" id="sidebarDesc"></span>
                            </span>
                        </button>
                    </section>

                    <section class="social-card soc-sidebar-card">
                        <div class="soc-tabs" role="tablist" id="sidebarTabs">
                            <button type="button" class="soc-tab active" data-tab="chat" role="tab" aria-selected="true">
                                ${t('social.tab.chat')}
                            </button>
                            <button type="button" class="soc-tab" data-tab="activity" role="tab" aria-selected="false">
                                ${t('social.tab.activity')}
                            </button>
                            <button type="button" class="soc-tab" data-tab="gifts" role="tab" aria-selected="false">
                                ${t('social.tab.gifts')}
                            </button>
                        </div>

                        <div class="soc-tabpanel" id="sidebarChatTab"></div>
                        <div class="soc-tabpanel" id="sidebarActivityTab" hidden></div>
                        <div class="soc-tabpanel" id="sidebarGiftsTab" hidden></div>
                    </section>
                </aside>
            </div>
        </div>
    `;

    // Els panells de la barra lateral: el xat ve seleccionat per defecte.
    root.querySelector('#sidebarTabs').addEventListener('click', (event) => {
        const tab = event.target.closest('[data-tab]');
        if (!tab) return;
        selectTab(tab.dataset.tab);
    });

    root.querySelector('#sidebarProfileBtn').addEventListener('click', () => openProfile());

    // Delegació per als panells d'activitat i regals (vàlida per sempre:
    // els contenidors no es tornen a crear).
    root.querySelector('#sidebarActivityTab').addEventListener('click', (event) => {
        const row = event.target.closest('[data-uid]');
        if (row) openProfile(row.dataset.uid);
    });

    root.querySelector('#sidebarGiftsTab').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-gift]');
        if (!button) return;

        button.disabled = true;
        const result = await claimGift(button.dataset.gift);
        button.disabled = false;

        if (result.ok) notify(get('social.giftClaimed'));
        else if (result.reason === 'funds') notify(get('social.noFunds'));
        else notify(get('social.error_action'));
    });

    mountHub(root.querySelector('#hubRoot'));
    mountChat(root.querySelector('#sidebarChatTab'));

    refreshDynamic();
}

function selectTab(name) {
    const tabs = { chat: 'sidebarChatTab', activity: 'sidebarActivityTab', gifts: 'sidebarGiftsTab' };

    for (const [id, panelId] of Object.entries(tabs)) {
        const panel = root.querySelector(`#${panelId}`);
        const tab = root.querySelector(`[data-tab="${id}"]`);
        const active = id === name;
        panel.hidden = !active;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
}

/* ================================================================
   Refresc de les peces que viuen aquí
   ================================================================ */

function refreshDynamic() {
    if (!root || !mounted || state.status !== 'ready') return;

    refreshSidebarProfile();
    refreshHub();
    refreshChat();
    refreshActivity();
    refreshGifts();

    hydrate(root);
}

function refreshSidebarProfile() {
    const me = state.me;
    if (!me) return;

    const signature = `${me.photo}|${me.icon}|${me.name}|${me.username}|${me.lvl}|${me.status}|${state.giftBalance}`;
    if (signature === profileSignature) return;
    profileSignature = signature;

    const avatar = root.querySelector('#sidebarAvatar');
    const name = root.querySelector('#sidebarName');
    const desc = root.querySelector('#sidebarDesc');

    avatar.className = `soc-avatar soc-avatar-lg soc-avatar-${esc(me.status ?? 'offline')}`;
    avatar.innerHTML = avatarMarkup(me);

    name.textContent = me.name ?? 'Jugador';

    const level = t('stats.level');
    desc.textContent = me.username ? `@${me.username} · ${level} ${me.lvl ?? 1}` : `${level} ${me.lvl ?? 1}`;
}

/* ================================================================
   Panell d'activitat
   ================================================================ */

function refreshActivity() {
    const panel = root.querySelector('#sidebarActivityTab');
    if (!panel) return;

    const feed = state.feed;

    if (!feed.length) {
        panel.innerHTML = `
            <div class="soc-empty">
                <span class="soc-empty-icon" aria-hidden="true">✨</span>
                <p>${t('social.noActivity')}</p>
            </div>
        `;
        return;
    }

    panel.innerHTML = `<div class="soc-list">${feed.map((item) => `
        <div class="soc-activity" ${item.actorUid ? `data-uid="${esc(item.actorUid)}" role="button" tabindex="0"` : ''}>
            <span class="soc-avatar soc-avatar-mini">
                ${avatarMarkup({ name: item.actorName, icon: item.actorIcon, photo: item.actorPhoto })}
            </span>
            <span class="soc-activity-main">
                <span class="soc-activity-name">${esc(item.actorName ?? 'Jugador')}</span>
                <span class="soc-activity-game">${esc(item.game ?? '')}${item.score ? ` · ${esc(item.score)}` : ''}</span>
            </span>
            <span class="soc-when">${timeAgo(item.at)}</span>
        </div>
    `).join('')}</div>`;
}

/* ================================================================
   Panell de regals
   ================================================================ */

function refreshGifts() {
    const panel = root.querySelector('#sidebarGiftsTab');
    if (!panel) return;

    const balance = `<div class="soc-balance">🎁 ${t('social.credits', { n: state.giftBalance })}</div>`;

    if (!state.gifts.length) {
        panel.innerHTML = balance + `
            <div class="soc-empty">
                <span class="soc-empty-icon" aria-hidden="true">🎁</span>
                <p>${t('social.noGifts')}</p>
            </div>
        `;
        return;
    }

    panel.innerHTML = balance + `<div class="soc-list">${state.gifts.map((gift) => {
        const price = Math.max(0, Number(gift.price) || 0);
        const cost = price > 0
            ? `<span class="soc-chip">${esc(price)} ⭐</span>`
            : '';

        return `
            <div class="soc-gift">
                <span class="soc-gift-icon" aria-hidden="true">${esc(gift.icon ?? '🎁')}</span>
                <span class="soc-gift-label">${esc(gift.label ?? '')}</span>
                ${cost}
                <button type="button" class="soc-btn soc-btn-primary" data-gift="${esc(gift.id)}">
                    ${t('social.claim')}
                </button>
            </div>
        `;
    }).join('')}</div>`;
}
