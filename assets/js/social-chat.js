/**
 * social-chat.js · calaix de xat integrat dins del sidebar de la dreta.
 *
 * El calaix artícul:
 *   - Botó FAB fixe a la targeta del sidebar.
 *   - Canals: global, grup i 1 a 1.
 *   - Missatges, reaccions, typing indicator.
 *   - Shown des de la tab "Xat" del sidebar.
 */

import { iconOfName, makeMessage, myName, saveState, state, sendChatMessage, reactToChatMessage } from './social-store.js';
import { byId, esc, get, hydrate, t, timeAgo } from './social-ui.js';

/* ---------- Elements del sidebar xat ---------- */

function renderChatSidebar(root) {
    const profile = state.profile || {};
    const channels = state.chat.channels || [];

    // Determina el canal actiu
    let activeChannel = null;
    if (state.chat.active && state.chat.channels) {
        activeChannel = state.chat.channels.find(c => c.id === state.chat.active);
    }
    if (!activeChannel && channels.length) {
        activeChannel = channels[0];
    }

    // Llista de canals
    const channelList = channels.map((channel, i) => /*html*/`
        <div class="soc-chat-channel ${channel.id === state.chat.active ? 'active' : ''}" data-channel-id="${channel.id}" style="padding: 8px 12px; border-radius: 12px; margin: 4px 0; cursor: pointer; font-size: 12px; color: var(--text-main); transition: background 0.2s;">
            <span style="font-weight: 600;">${esc(channel.name)}</span>
            <span style="font-size: 10px; opacity: 0.5;">(${channel.memberCount || 0} participants)</span>
        </div>
    `).join('');

    // Missatges del canal actiu
    const messages = activeChannel && state.chat.messages[activeChannel.id]
        ? state.chat.messages[activeChannel.id].slice(-20).map(msg => /*html*/`
            <div class="soc-chat-message ${msg.from === myName() ? 'right' : 'left'}" style="display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; max-width: 80%;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(140deg, var(--accent), #7b5cff); color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${esc((msg.from === myName() ? 'T' : getInitials(msg.from)))}</div>
                <div style="background: var(--glass-bg); border: 1px solid var(--glass-border-soft); border-radius: 14px; padding: 8px 12px; max-width: 80%;">
                    <div style="font-weight: 600; font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${esc(msg.from)}</div>
                    <div style="font-size: 11px; color: var(--text-main); opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${timeAgo(msg.at)}</div>
                    <p style="font-size: 13px; margin: 4px 0; white-space: pre-wrap;">${esc(msg.text)}</p>
                </div>
            </div>
        `).join('')
        : '<p class="soc-empty-state" style="font-size: 12px; opacity: 0.5;">' + t('social.no_messages') + '</p>';

    // Escriu un missatge
    const inputHTML = /*html*/`
        <div style="padding: 12px; border-top: 1px solid var(--glass-border-soft); background: var(--glass-bg);">
            <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="chatInput" placeholder="${t('social.type_message')}" style="flex: 1; background: var(--glass-bg); border: 1px solid var(--glass-border-soft); color: var(--text-main); border-radius: 14px; padding: 8px 12px; font-size: 13px; outline: none;">
                <button class="btn-small" style="padding: 8px 12px; font-size: 12px; background: var(--accent); color: #fff; border: none; border-radius: 12px; cursor: pointer;" disabled>${t('social.send')}</button>
            </div>
        </div>
    `;

    return /*html*/`
        <div class="chat-sidebar" style="padding: 16px 0;">
            <!-- Llista de canals -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; color: var(--text-main); opacity: 0.5; margin-bottom: 8px;">${t('social.channels')}</div>
                <div style="max-height: 120px; overflow-y: auto;">
                    ${channelList}
                </div>
            </div>

            <!-- Missatges -->
            <div style="height: 280px; overflow-y: auto; margin-bottom: 16px;">
                ${messages}
            </div>

            /*---- ENVIAR MISSENGER ----*/
            ${inputHTML}
        </div>
    `;
}

/* ---------- Inicialització ---------- */

export function initChatPanel(root) {
    if (!root) return;

    // Renderitza el primer cop i després subscripció
    root.innerHTML = renderChatSidebar(root);

    // Delegació de canvis de canal
    root.addEventListener('click', (e) => {
        const channelBtn = e.target.closest('.soc-chat-channel');
        if (!channelBtn) return;

        const channelId = channelBtn.dataset.channelId;
        if (channelId) {
            state.chat.active = channelId;
            root.innerHTML = renderChatSidebar(root);
        }
    });

    // Envia missatge
    const input = root.querySelector('#chatInput');
    const sendBtn = root.querySelector('.soc-chat-sidebar .btn-small');
    if (input && sendBtn) {
        // Habilita/deshabilita el botó segons hagi text
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
        });

        sendBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return;
            sendChatMessage(text);
            input.value = '';
            sendBtn.disabled = true;
        });
    }
}