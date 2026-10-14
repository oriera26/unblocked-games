/**
 * social.js · orquestrador de la secció Social.
 *
 * Aquest mòdul no dibuixa res per si mateix: enganxa les peces. El hub
 * (`social-hub.js`) pinta les targetes, el xat (`social-chat.js`) el
 * calaix i els modals (`social-modals.js`) les finestres. Les dades viuen
 * a `social-store.js`, que ara les porta de Firebase.
 *
 * Com que el Social és només per a comptes, aquí hi ha la porta d'accés:
 * mentre el store no diu `ready` (sense sessió, carregant o amb error) el
 * que es veu és una targeta; quan hi ha dades, es munten el hub i el xat.
 *
 * Els botons `[data-soc]` de dins dels modals viuen fora del hub i el seu
 * esdeveniment no arriba al node del hub: els escoltem aquí i passem per
 * `handleAction`.
 */

import { onLangChange } from './i18n.js';
import { initChat, renderChat } from './social-chat.js';
import { buildModals, closeModals } from './social-modals.js';
import { commit, handleAction, initHub, renderHub } from './social-hub.js';
import { onSocialChange, startSocialStore, state } from './social-store.js';
import { byId, hydrate, t } from './social-ui.js';

let started = false;
let hubReady = false;

export function initSocial() {
    const root = byId('socialRoot');
    if (started || !root) return;
    started = true;

    buildModals();
    bindModalActions();

    // L'idioma i les dades fan el mateix: tornar a pintar el que toca.
    onLangChange(renderView);
    onSocialChange(renderView);

    startSocialStore();
    renderView();
}

/* ================================================================
   Pintar segons l'estat del store
   ================================================================ */

function renderView() {
    const root = byId('socialRoot');
    if (!root) return;

    if (state.status === 'ready') {
        if (!hubReady) {
            hubReady = true;
            initHub(root);
            initChat();
        } else {
            renderHub();
            renderChat();
        }
        return;
    }

    if (state.status === 'loading') {
        showGate(root, t('sync.status.syncing'));
        return;
    }

    if (state.status === 'error') {
        showGate(root, t('sync.status.error'));
        return;
    }

    // Sense sessió: cal entrar per veure-hi res.
    root.innerHTML = `
    <div class="social-gate">
        <div class="social-gate-card">
            <span class="social-gate-icon"><i data-lucide="users"></i></span>
            <h2 class="social-gate-title">${t('nav.social')}</h2>
            <p class="social-gate-text">${t('social.subtitle')}</p>
            <button class="social-gate-btn" type="button" data-social-signin>${t('auth.action.signin')}</button>
        </div>
    </div>`;
    hydrate(root);
    root.querySelector('[data-social-signin]')?.addEventListener('click', () => {
        byId('accountBtn')?.click();
    });
}

/** Targeta simple per a «carregant…» i els errors de connexió. */
function showGate(root, message) {
    root.innerHTML = `
    <div class="social-gate">
        <div class="social-gate-card">
            <p class="social-gate-text">${message}</p>
        </div>
    </div>`;
    hydrate(root);
}

/**
 * Els botons `[data-soc]` de dins dels modals són fora del hub, i els
 * seus esdeveniments no arriben al node del hub. Els escoltem aquí:
 * `handleAction` retorna cert si l'estat ha canviat, i en aquest cas
 * `commit()` desa i repinta el hub abans de tancar la finestra.
 */
function bindModalActions() {
    document.body.addEventListener('click', (event) => {
        const button = event.target.closest('.modal [data-soc]');
        if (!button) return;

        const changed = handleAction(button);
        if (!changed) return;

        // Les accions que obren una finestra (perfil, espectador) tornen
        // fals i no han de tancar res: la finestra que obren és la que
        // acaba de canviar.
        closeModals();
        commit();
    });
}
