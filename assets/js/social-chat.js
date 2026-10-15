/**
 * social-chat.js · calaix de xat integrat dins del sidebar de la dreta.
 *
 * El calaix article:
 *   - Llista de canals (global, grup, 1a1)
 *   - Missatges, reaccions, typing indicator
 *   - Input per enviar missatges
 *   - Renderitzat dins de #sidebarChatTab
 */

import { iconOfName, makeMessage, myName, saveState, state, sendChatMessage, reactToChatMessage } from './social-store.js';
import { byId, esc, get, hydrate, t, timeAgo } from './social-ui.js';

/* ---------- Helpers ---------- */

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ---------- Renderitzador ---------- */

function renderChatSidebar() {
    const channels = state.chat.channels || [];

    // Canal actiu
    let activeChannel = null;
    if (state.chat.active && state.chat.channels) {
        activeChannel = state.chat.channels.find(c => c.id === state.chat.active);
    }
    if (!activeChannel && channels.length) {
        activeChannel = channels[0];
    }

    // Llista de canals
    const channelList = channels.map((channel) => /*html*/`
        <div class="soc-chat-channel ${channel.id === state.chat.active ? 'active' : ''}" data-channel-id="${channel.id}" style="padding: 8px 12px; border-radius: 12px; margin: 4px 0; cursor: pointer; font-size: 12px; color: var(--text-main); transition: background 0.2s;">
            <span style="font-weight: 600;">${esc(channel.name)}</span>
            <span style="font-size: 10px; opacity: 0.5;">(${channel.memberCount || 0})</span>
        </div>
    `).join('');

    // Missatges del canal actiu
    const messages = activeChannel && state.chat.messages[activeChannel.id]
        ? state.chat.messages[activeChannel.id].slice(-30).map(msg => /*html*/`
            <div class="soc-chat-message ${msg.from === myName() ? 'right' : 'left'}" style="display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; max-width: 85%; ${msg.from === myName() ? 'margin-left: auto; flex-direction: row-reverse;' : ''}">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(140deg, var(--accent), #7b5cff); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${esc(msg.from === myName() ? 'T' : getInitials(msg.from))}</div>
                <div style="background: var(--glass-bg); border: 1px solid var(--glass-border-soft); border-radius: 14px; padding: 8px 12px; max-width: 100%;">
                    <div style="font-weight: 600; font-size: 11px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(msg.from)}</div>
                    <div style="font-size: 10px; color: var(--text-main); opacity: 0.5;">${timeAgo(msg.at)}</div>
                    <p style="font-size: 12px; margin: 4px 0 0; white-space: pre-wrap; word-break: break-word;">${esc(msg.text)}</p>
                </div>
            </div>
        `).join('')
        : `<div class="soc-empty-state" style="padding: 20px; text-align: center; font-size: 12px; opacity: 0.5;">${t('social.no_messages')}</div>`;

    // Input missatge
    const inputHTML = /*html*/`
        <div style="padding: 12px; border-top: 1px solid var(--glass-border-soft); background: var(--glass-bg); border-radius: 0 0 16px 16px;">
            <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="chatInput" placeholder="${t('social.type_message')}" style="flex: 1; background: var(--glass-bg-strong); border: 1px solid var(--glass-border-soft); color: var(--text-main); border-radius: 20px; padding: 10px 14px; font-size: 13px; outline: none;">
                <button class="btn-small" id="chatSendBtn" style="padding: 10px 16px; font-size: 12px; background: var(--accent); color: #fff; border: none; border-radius: 20px; cursor: pointer;" disabled>${t('social.send')}</button>
            </div>
        </div>
    `;

    return /*html*/`
        <div class="chat-sidebar" style="display: flex; flex-direction: column; height: 100%; min-height: 320px; max-height: 420px; border-radius: 16px; overflow: hidden; background: var(--glass-bg); border: 1px solid var(--glass-border-soft);">
            <!-- Llista de canals -->
            <div style="padding: 12px; border-bottom: 1px solid var(--glass-border-soft);">
                <div style="font-size: 11px; color: var(--text-main); opacity: 0.5; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${t('social.channels')}</div>
                <div style="max-height: 100px; overflow-y: auto;">
                    ${channelList}
                </div>
            </div>

            <!-- Missatges -->
            <div style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 4px;">
                ${messages}
            </div>

            <!-- Input -->
            ${inputHTML}
        </div>
    `;
}

/* ---------- Inicialització ---------- */

export function initChatPanel(root) {
    if (!root) return;

    // El chat es renderitza dins del tab "Xat"
    const chatTab = root.querySelector('#sidebarChatTab');
    if (!chatTab) return;

    // Render inicial
    chatTab.innerHTML = renderChatSidebar();

    // Delegació: canvis de canal
    chatTab.addEventListener('click', (e) => {
        const channelBtn = e.target.closest('.soc-chat-channel');
        if (!channelBtn) return;

        const channelId = channelBtn.dataset.channelId;
        if (channelId) {
            state.chat.active = channelId;
            chatTab.innerHTML = renderChatSidebar();
            attachInputListeners(chatTab);
        }
    });

    // Input listeners
    attachInputListeners(chatTab);
}

/* ---------- Listeners d'input ---------- */

function attachInputListeners(chatTab) {
    const input = chatTab.querySelector('#chatInput');
    const sendBtn = chatTab.querySelector('#chatSendBtn');
    if (!input || !sendBtn) return;

    input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    sendBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        sendChatMessage(text);
        input.value = '';
        sendBtn.disabled = true;
    });
}