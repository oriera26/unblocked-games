/**
 * social.js · porta i dibuix principal del Social (monta el hub + sidebar).
 *
 * El sidebar de la dreta és una card fixa amb tabs:
 *   - Xat (activat per defecte)
 *   - Activitat
 *   - Regals
 *
 * Estat: guest / loading / ready / error
 */

import { initHub } from './social-hub.js';
import { initChatPanel } from './social-chat.js';
import { openProfileEdit } from './social-modals.js';
import { t, statusLabel } from './social-ui.js';
import { state, onSocialChange, startSocialStore } from './social-store.js';

let view = 'guest';
let root = null;

/* ---------- Renderitzador principal ---------- */

function render() {
    const header = /*html*/ `
        <div class="social-header">
            <h2>${t('social.title')}</h2>
            <p>${t('social.subtitle')}</p>
        </div>
    `;

    const socialLayout = /*html*/ `
        <div class="social-layout">
            <div class="main-area">
                ${renderHub()}
            </div>
            <div class="sidebar">
                <div class="sidebar-card">
                    <div class="sidebar-header">
                        <div class="sidebar-avatar" id="sidebarAvatar"></div>
                        <div class="sidebar-info">
                            <div class="sidebar-name" id="sidebarName"></div>
                            <div class="sidebar-desc" id="sidebarDesc"></div>
                        </div>
                    </div>

                    <div class="sidebar-tabs" role="tablist" aria-label="Tabs del sidebar">
                        <button class="sidebar-tab active" data-tab="chat" role="tab" aria-selected="true">${t('social.tab.chat')}</button>
                        <button class="sidebar-tab" data-tab="activity" role="tab" aria-selected="false">${t('social.tab.activity')}</button>
                        <button class="sidebar-tab" data-tab="gifts" role="tab" aria-selected="false">${t('social.tab.gifts')}</button>
                    </div>

                    <div id="sidebarChatTab" class="tab-content active"></div>
                    <div id="sidebarActivityTab" class="tab-content"></div>
                    <div id="sidebarGiftsTab" class="tab-content"></div>
                </div>
            </div>
        </div>
    `;

    root.innerHTML = /*html*/ `
        <div id="view-social">
            ${header}
            ${socialLayout}
        </div>
    `;

    initChatPanel(root);
    openProfileEdit(root);

    // Delegació de canvis de tab al sidebar
    root.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.sidebar-tab');
        if (!tabBtn) return;

        // Actualitza visuals
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');

        // Mostra/amaga tabs
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const target = `sidebar${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}Tab`;
        document.getElementById(target).classList.add('active');
    });

    // Desplegable de perfil a la barreja
    const avatar = root.querySelector('#sidebarAvatar');
    if (avatar) {
        avatar.addEventListener('click', () => {
            openProfile(root);
        });
    }
}

/* ---------- Contingut del hub (esquerra) ---------- */

function renderHub() {
    const section = /*html*/ `
        <div class="social-card">
            <div class="social-card-title">
                <span class="soc-ico">${t('ui.friends')}</span>
                Amics
                <span class="social-card-count" id="friendsCount"></span>
            </div>
            <div class="soc-list soc-friends-list"></div>
        </div>

        <div class="social-card">
            <div class="social-card-title">
                <span class="soc-ico">${t('ui.league')}</span>
                Lliga
                <span class="social-card-count" id="leagueCount"></span>
            </div>
            <div class="soc-list soc-league-list"></div>
        </div>
    `;

    return section;
}

/* ---------- Inici ---------- */

export function initSocial(node) {
    root = node || document.getElementById('socialRoot');

    // Canvi de vista segons estat
    const handleChange = (status) => {
        view = status;
        switch (status) {
            case 'ready':
                render();
                break;
            case 'guest':
                root.innerHTML = /*html*/ `
                    <div style="position: fixed; inset: 0; background: var(--glass-bg); border-radius: 20px; padding: 40px; text-align: center; backdrop-filter: var(--glass-filter);">
                        <h3>${t('auth.signin_required')}</h3>
                        <button class="btn-primary" id="socialSigninBtn" style="margin-top: 16px; padding: 10px 20px;">${t('auth.signin')}</button>
                    </div>
                `;
                // Attach click handler to signin button
                const signinBtn = root.querySelector('#socialSigninBtn');
                if (signinBtn) {
                    signinBtn.addEventListener('click', () => {
                        const authModal = document.getElementById('authModal');
                        if (authModal) authModal.classList.add('active');
                    });
                }
                break;
            case 'error':
                root.innerHTML = `<p style="color: var(--error);">${t('social.error_loading')}</p>`;
                break;
        }
    };

    // Inicia el hub (llista d'amics, lliga, etc.)
    initHub(root);

    // Engega l'escolta d'autenticació
    startSocialStore();

    // Subscripció a canvis d'estat
    const unsub = onSocialChange(handleChange);
    if (unsub) return () => unsub();
}