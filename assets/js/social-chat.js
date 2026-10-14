/**
 * social-chat.js · el calaix de xat del Social.
 *
 * Un botó flotant dins la vista obre un calaix lateral amb canals (global,
 * grup i 1 a 1), «escrivint…», reaccions i mini-jocs. Els missatges es
 * desen a l'estat social, així que l'historial sobreviu entre sessions.
 *
 * El «···» d'algú que escriu no és text d'interfície sinó un símbol, i
 * per això no passa per `t()`: la línia és `${nom} ···`.
 */

import { REPLY_TEXT, iconOfName, makeMessage, myName, saveState, state } from './social-store.js';
import { byId, esc, get, hydrate, t, timeAgo } from './social-ui.js';

const MAX_MESSAGES = 60;

let drawer = null;
let typingName = null;
let replyTimer = 0;

/* ================================================================
   Consultes
   ================================================================ */

function activeChannel() {
    return state.chat.channels.find((channel) => channel.id === state.chat.active) ?? state.chat.channels[0];
}

function channelMessages(channel) {
    state.chat.messages[channel.id] ??= [];
    return state.chat.messages[channel.id];
}

function totalUnread() {
    return Object.values(state.chat.unread ?? {}).reduce((sum, count) => sum + count, 0);
}

function findMessage(id) {
    return channelMessages(activeChannel()).find((message) => message.id === id);
}

/** Desa un missatge al canal, amb un sostre perquè no creixi sense fi. */
function pushMessage(channelId, message) {
    const list = (state.chat.messages[channelId] ??= []);
    list.push(message);
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES);
    saveState();
}

/* ================================================================
   Muntatge
   ================================================================ */

export function initChat() {
    const view = byId('view-social');
    if (!view || byId('socChatFab')) return;

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'soc-chat-fab';
    fab.id = 'socChatFab';
    fab.setAttribute('aria-label', get('social.chat'));
    fab.setAttribute('aria-controls', 'socChatDrawer');
    fab.innerHTML = `<i data-lucide="message-circle"></i>
        <span class="soc-chat-fab-label">${t('social.chat')}</span>
        <span class="soc-bell-badge" id="socChatFabBadge" hidden></span>`;
    view.appendChild(fab);

    drawer = document.createElement('aside');
    drawer.className = 'soc-chat-drawer';
    drawer.id = 'socChatDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', get('social.chat'));
    view.appendChild(drawer);

    fab.addEventListener('click', () => {
        if (drawer.classList.contains('open')) closeChat();
        else openChat();
    });
    drawer.addEventListener('click', onChatClick);
    drawer.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && event.target.id === 'socChatInput') {
            event.preventDefault();
            sendMessage();
        }
    });

    hydrate(fab);
    updateBadge();
}

export function openChat() {
    if (!drawer) return;
    renderChat();
    drawer.classList.add('open');
    byId('socChatFab')?.setAttribute('aria-expanded', 'true');
    byId('socChatInput')?.focus();
}

export function closeChat() {
    drawer?.classList.remove('open');
    byId('socChatFab')?.setAttribute('aria-expanded', 'false');
}

/* ================================================================
   Pintura
   ================================================================ */

export function renderChat() {
    if (!drawer) return;
    const channel = activeChannel();

    drawer.innerHTML = `
        <div class="soc-chat-head">
            <span class="soc-ico"><i data-lucide="message-circle"></i></span>
            <span class="soc-chat-title">${t('social.chat')}</span>
            <button type="button" class="soc-chat-close" data-soc-chat-close aria-label="×">×</button>
        </div>
        <div class="soc-channels">
            ${state.chat.channels.map((item) => `
                <button class="soc-channel ${item.id === channel.id ? 'active' : ''}" type="button" data-soc-channel="${esc(item.id)}">
                    ${item.kind === 'global' ? '<span class="dot"></span>' : ''}
                    ${esc(item.name)}${state.chat.unread?.[item.id] ? ` · ${state.chat.unread[item.id]}` : ''}
                </button>`).join('')}
        </div>
        <div class="soc-chat-log" data-soc-chat-log>${channelMessages(channel).map(messageRow).join('')}</div>
        <div class="soc-typing">${typingName ? `${esc(typingName)} ···` : ''}</div>
        <div class="soc-chat-tools">
            <button class="soc-btn ghost" type="button" data-soc-chat="minigame">🎲 ${t('social.minigames')}</button>
            <button class="soc-btn ghost" type="button" data-soc-chat="record">🏆 ${t('social.challenge')}</button>
        </div>
        <div class="soc-chat-input-row">
            <input class="soc-chat-input" id="socChatInput" type="text" placeholder="${t('social.chatPh')}" aria-label="${t('social.chat')}">
            <button class="soc-send" type="button" data-soc-chat="send" aria-label="${t('social.chat')}">➤</button>
        </div>`;

    hydrate(drawer);
    scrollLog();
    updateBadge();
}

function renderMessages() {
    const log = drawer?.querySelector('.soc-chat-log');
    if (!log) return;

    log.innerHTML = channelMessages(activeChannel()).map(messageRow).join('');
    scrollLog();
}

function messageRow(message) {
    const mine = message.from === myName();
    const reactions = Object.entries(message.reactions ?? {}).map(([emoji, count]) => `
        <button class="soc-reaction-chip" type="button" data-soc-msg-react data-mid="${esc(message.id)}" data-emoji="${esc(emoji)}">${esc(emoji)} ${count}</button>`).join('');

    return `
    <div class="soc-chat-msg ${mine ? 'is-me' : ''}">
        ${mine ? '' : `
            <div class="soc-chat-msg-header">
                <span class="soc-avatar soc-msg-avatar">${esc(message.icon)}</span>
                <span class="soc-chat-msg-name">${esc(message.from)}</span>
                <span class="soc-chat-msg-time">${timeAgo(message.at)}</span>
            </div>`}
        <div class="soc-chat-bubble">${esc(message.text)}</div>
        <div class="soc-reactions-row">
            ${reactions}
            <button class="soc-reaction-chip" type="button" data-soc-msg-react data-mid="${esc(message.id)}" data-emoji="👍">＋</button>
        </div>
    </div>`;
}

function updateBadge() {
    const badge = byId('socChatFabBadge');
    if (!badge) return;

    const unread = totalUnread();
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = unread === 0;
}

function scrollLog() {
    const log = drawer?.querySelector('.soc-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
}

function updateTyping() {
    const line = drawer?.querySelector('.soc-typing');
    if (line) line.textContent = typingName ? `${typingName} ···` : '';
}

/* ================================================================
   Accions
   ================================================================ */

function sendMessage() {
    const input = byId('socChatInput');
    const text = input?.value.trim();
    if (!input || !text) return;

    const channel = activeChannel();
    pushMessage(channel.id, makeMessage(myName(), state.me.icon, text, Date.now()));
    input.value = '';
    renderMessages();
    scheduleReply(channel);
}

/** Fingeix que algú respon, amb el «···» d'escrivint entremig. */
function scheduleReply(channel) {
    const repliers = channel.kind === 'dm'
        ? [channel.name]
        : state.friends.filter((friend) => friend.status !== 'offline').map((friend) => friend.name);
    if (!repliers.length) return;

    const who = repliers[Math.floor(Math.random() * repliers.length)];
    typingName = who;
    updateTyping();

    clearTimeout(replyTimer);
    replyTimer = window.setTimeout(() => {
        typingName = null;
        updateTyping();

        const text = REPLY_TEXT[Math.floor(Math.random() * REPLY_TEXT.length)];
        pushMessage(channel.id, makeMessage(who, iconOfName(who), text, Date.now()));
        if (channel.id !== state.chat.active) {
            state.chat.unread[channel.id] = (state.chat.unread[channel.id] ?? 0) + 1;
        }
        if (channel.id === state.chat.active) renderMessages();
        updateBadge();
    }, 900 + Math.random() * 1400);
}

function shareTool(kind) {
    const channel = activeChannel();
    const text = kind === 'minigame'
        ? `🎲 2048 · ${get('social.minigames')}`
        : `🏆 ${state.me.points} · 🔥 ${state.me.streak}`;

    pushMessage(channel.id, makeMessage(myName(), state.me.icon, text, Date.now()));
    renderMessages();
    scheduleReply(channel);
}

function reactToMessage(button) {
    const message = findMessage(button.dataset.mid);
    if (!message) return;

    message.reactions ??= {};
    const emoji = button.dataset.emoji;
    message.reactions[emoji] = (message.reactions[emoji] ?? 0) + 1;
    saveState();
    renderMessages();
}

function onChatClick(event) {
    const reactButton = event.target.closest('[data-soc-msg-react]');
    if (reactButton) return reactToMessage(reactButton);

    const channelButton = event.target.closest('[data-soc-channel]');
    if (channelButton) {
        state.chat.active = channelButton.dataset.socChannel;
        state.chat.unread[state.chat.active] = 0;
        saveState();
        renderChat();
        return;
    }

    if (event.target.closest('[data-soc-chat-close]')) return closeChat();

    const actionButton = event.target.closest('[data-soc-chat]');
    if (!actionButton) return;

    const action = actionButton.dataset.socChat;
    if (action === 'send') return sendMessage();
    if (action === 'minigame' || action === 'record') return shareTool(action);
}
