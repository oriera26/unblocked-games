/**
 * social.js · orquestrador de la secció Social.
 *
 * Aquest mòdul no dibuixa res per si mateix: enganxa les peces. El hub
 * (`social-hub.js`) pinta les targetes, el xat (`social-chat.js`) el
 * calaix, els modals (`social-modals.js`) les finestres i la simulació
 * (`social-sim.js`) mou la presència. Les dades i el seu desament viuen
 * a `social-store.js`.
 *
 * Aquí hi ha el que és comú a tots: quan la vista arriba, es munten les
 * peces; quan canvia l'idioma, es repinta el que porta text; i els botons
 * de dins dels modals (que viuen fora del hub) passen per `handleAction`.
 */

import { onLangChange } from './i18n.js';
import { initChat, renderChat } from './social-chat.js';
import { buildModals, closeModals } from './social-modals.js';
import { commit, handleAction, initHub, renderHub } from './social-hub.js';
import { maybeResetWeek, startSimulation } from './social-sim.js';
import { byId } from './social-ui.js';

let started = false;

export function initSocial() {
    const root = byId('socialRoot');
    if (started || !root) return;
    started = true;

    maybeResetWeek();
    buildModals();
    bindModalActions();
    initHub(root);
    initChat();

    onLangChange(() => {
        renderHub();
        renderChat();
    });

    startSimulation();
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
