/**
 * social-chat.js · el xat dins del panell lateral (pestanya Xat).
 *
 * Com al hub, l'estructura (llista, registre i formulari) es munta una
 * sola vegada i el refresc només toca la llista de missatges. Així
 * l'input no perd ni el text ni el focus quan arriba un missatge nou.
 */

import { state, onSocialChange, sendChatMessage, myUid } from './social-store.js';
import { esc, t, timeAgo, avatarMarkup, hydrate } from './social-ui.js';

let root = null;
let unsubscribeStore = null;

export function mountChat(container) {
    root = container;

    root.innerHTML = `
        <div class="soc-chat">
            <div class="soc-chat-channels" id="chatChannels" hidden></div>
            <div class="soc-chat-log" id="chatLog" role="log" aria-live="polite"></div>
            <form class="soc-chat-form" id="chatForm">
                <input id="chatInput" class="soc-chat-input" type="text" maxlength="500"
                       placeholder="${t('social.type_message')}"
                       aria-label="${t('social.type_message')}"
                       autocomplete="off" spellcheck="false">
                <button id="chatSendBtn" class="soc-btn soc-btn-primary" type="submit">${t('social.send')}</button>
            </form>
        </div>
    `;

    root.querySelector('#chatForm').addEventListener('submit', (event) => {
        event.preventDefault();
        send();
    });

    root.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-channel]');
        if (!chip) return;
        state.chat.active = chip.dataset.channel;
        refresh();
    });

    unsubscribeStore = onSocialChange(() => refresh());
    refresh();
}

export function destroyChat() {
    if (unsubscribeStore) unsubscribeStore();
    unsubscribeStore = null;
    root = null;
}

/* ================================================================
   Enviar
   ================================================================ */

async function send() {
    const input = root?.querySelector('#chatInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.focus();

    const result = await sendChatMessage(state.chat.active, text);
    if (!result.ok && input.value === '') input.value = text; // no es perd el que s'ha escrit
}

/* ================================================================
   Refresc
   ================================================================ */

export function refresh() {
    if (!root || state.status !== 'ready') return;

    refreshChannels();
    refreshMessages();
    hydrate(root);
}

function refreshChannels() {
    const box = root.querySelector('#chatChannels');
    const channels = state.chat.channels ?? [];

    box.hidden = channels.length < 2;
    if (box.hidden) return;

    box.innerHTML = channels.map((channel) => `
        <button type="button" class="soc-channel ${channel.id === state.chat.active ? 'active' : ''}"
                data-channel="${esc(channel.id)}">
            ${esc(channel.name ?? channel.id)}
        </button>
    `).join('');
}

function refreshMessages() {
    const log = root.querySelector('#chatLog');
    if (!log) return;

    const messages = state.chat.messages[state.chat.active] ?? [];
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const firstRender = log.dataset.ready !== '1';

    if (!messages.length) {
        log.innerHTML = `
            <div class="soc-empty soc-empty-chat">
                <span class="soc-empty-icon" aria-hidden="true">💬</span>
                <p>${t('social.no_messages')}</p>
            </div>
        `;
        log.dataset.ready = '1';
        return;
    }

    log.innerHTML = messages.map((message) => messageRow(message)).join('');
    log.dataset.ready = '1';

    if (nearBottom || firstRender) log.scrollTop = log.scrollHeight;
}

function messageRow(message) {
    const mine = Boolean(message.fromUid) && message.fromUid === myUid();
    const name = message.fromName ?? 'Jugador';

    return `
        <div class="soc-msg ${mine ? 'is-me' : ''}">
            <span class="soc-avatar soc-avatar-mini ${mine ? 'soc-avatar-online' : 'soc-avatar-offline'}">
                ${avatarMarkup({ name, icon: message.fromIcon, photo: '' })}
            </span>
            <div class="soc-msg-bubble">
                <div class="soc-msg-head">
                    <span class="soc-msg-name">${esc(mine ? t('ui.my_account') : name)}</span>
                    <span class="soc-msg-time">${timeAgo(message.at)}</span>
                </div>
                <p class="soc-msg-text">${esc(message.text ?? '')}</p>
            </div>
        </div>
    `;
}
