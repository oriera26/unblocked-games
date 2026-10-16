/**
 * social-chat.js · el xat dins del panell lateral (pestanya Xat).
 *
 * Dues pantalles dins de la mateixa targeta: l'inici, amb la llista de
 * converses (el canal global, un per lliga i un xat per persona), i la
 * conversa oberta, amb la seva capçalera, el registre i el formulari. Com al
 * hub, l'estructura es munta una sola vegada i el refresc només toca el
 * que canvia: així l'input no perd ni el text ni el focus quan arriba
 * un missatge nou.
 */

import {
    state, onSocialChange, sendChatMessage, myUid,
    chatHome, showChatHome, openChatChannel, openChatWith
} from './social-store.js';
import { esc, t, timeAgo, avatarMarkup, activityLabel, hydrate } from './social-ui.js';

let root = null;
let unsubscribeStore = null;

export function mountChat(container) {
    root = container;

    root.innerHTML = `
        <div class="soc-chat">
            <div class="soc-chat-home" id="chatHomeView">
                <p class="soc-chat-home-title" id="chatHomeTitle">${t('social.chatHome')}</p>
                <div class="soc-chat-people" id="chatPeople"></div>
            </div>
            <div class="soc-chat-thread" id="chatThread" hidden>
                <div class="soc-chat-thread-head">
                    <button type="button" class="soc-chat-back" id="chatBack" aria-label="${t('social.back')}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                             stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <span class="soc-avatar soc-avatar-mini" id="chatThreadAvatar"></span>
                    <span class="soc-chat-thread-id">
                        <span class="soc-chat-thread-name" id="chatThreadName"></span>
                        <span class="soc-chat-thread-sub" id="chatThreadSub"></span>
                    </span>
                </div>
                <div class="soc-chat-log" id="chatLog" role="log" aria-live="polite"></div>
                <form class="soc-chat-form" id="chatForm">
                    <input id="chatInput" class="soc-chat-input" type="text" maxlength="500"
                           placeholder="${t('social.type_message')}"
                           aria-label="${t('social.type_message')}"
                           autocomplete="off" spellcheck="false">
                    <button id="chatSendBtn" class="soc-btn soc-btn-primary" type="submit">${t('social.send')}</button>
                </form>
            </div>
        </div>
    `;

    root.querySelector('#chatForm').addEventListener('submit', (event) => {
        event.preventDefault();
        send();
    });

    root.querySelector('#chatBack').addEventListener('click', () => showChatHome());

    // Una sola escolta per a les files de la llista, que es repinten.
    root.querySelector('#chatPeople').addEventListener('click', async (event) => {
        const row = event.target.closest('[data-chat]');
        if (!row) return;

        if (row.dataset.chat === 'league') {
            openChatChannel(row.dataset.id);
            return;
        }

        if (row.dataset.chat === 'global') {
            openChatChannel('global');
            return;
        }

        await openChatWith(row.dataset.uid, {
            name: row.dataset.name,
            icon: row.dataset.icon,
            photo: row.dataset.photo,
            status: row.dataset.status
        });
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

    const thread = state.chat.view === 'thread';
    root.querySelector('#chatHomeView').hidden = thread;
    root.querySelector('#chatThread').hidden = !thread;

    if (thread) refreshThread();
    else refreshHome();

    hydrate(root);
}

/** Els textos que depenen de l'idioma es repassen a cada refresc. */
function refreshLabels() {
    root.querySelector('#chatHomeTitle').textContent = t('social.chatHome');
    root.querySelector('#chatBack').setAttribute('aria-label', t('social.back'));
    root.querySelector('#chatInput').placeholder = t('social.type_message');
    root.querySelector('#chatSendBtn').textContent = t('social.send');
}

/* --- Pantalla d'inici: la llista de converses -------------------- */

function refreshHome() {
    refreshLabels();

    const rows = [`
        <button type="button" class="soc-chat-person" data-chat="global">
            <span class="soc-avatar soc-avatar-mini"><span class="soc-avatar-glyph">🌐</span></span>
            <span class="soc-person-name">${esc(t('social.chat'))}</span>
        </button>
    `];

    // Un canal per cada lliga de què som membres.
    for (const channel of state.chat.channels) {
        if (channel.kind !== 'league') continue;
        rows.push(`
            <button type="button" class="soc-chat-person" data-chat="league" data-id="${esc(channel.id)}">
                <span class="soc-avatar soc-avatar-mini"><span class="soc-avatar-glyph">${esc(channel.icon || '🏆')}</span></span>
                <span class="soc-person-name">${esc(channel.name || t('social.league'))}</span>
            </button>
        `);
    }

    for (const person of chatHome()) {
        rows.push(`
            <button type="button" class="soc-chat-person" data-chat="dm"
                    data-uid="${esc(person.uid)}"
                    data-name="${esc(person.name ?? '')}"
                    data-icon="${esc(person.icon ?? '')}"
                    data-photo="${esc(person.photo ?? '')}"
                    data-status="${esc(person.status ?? 'offline')}">
                <span class="soc-avatar soc-avatar-mini soc-avatar-${esc(person.status ?? 'offline')}">
                    ${avatarMarkup(person)}
                </span>
                <span class="soc-person-name">${esc(person.name ?? 'Jugador')}</span>
            </button>
        `);
    }

    root.querySelector('#chatPeople').innerHTML = rows.join('');
}

/* --- Conversa oberta --------------------------------------------- */

function refreshThread() {
    refreshLabels();

    const channel = state.chat.channels.find((c) => c.id === state.chat.active)
        ?? { id: 'global', kind: 'global' };

    const name = channel.kind === 'dm'
        ? (channel.name || 'Jugador')
        : channel.kind === 'league'
            ? (channel.name || t('social.league'))
            : t('social.chat');
    const nameEl = root.querySelector('#chatThreadName');
    if (nameEl.textContent !== name) nameEl.textContent = name;

    const sub = channel.kind === 'dm' ? activityLabel(channel) : '';
    const subEl = root.querySelector('#chatThreadSub');
    subEl.hidden = !sub;
    if (subEl.textContent !== sub) subEl.textContent = sub;

    const avatar = root.querySelector('#chatThreadAvatar');
    const signature = `${channel.id}|${channel.photo ?? ''}|${channel.icon ?? ''}|${channel.name ?? ''}`;
    if (avatar.dataset.signature !== signature) {
        avatar.dataset.signature = signature;
        avatar.innerHTML = channel.kind === 'dm'
            ? avatarMarkup(channel)
            : channel.kind === 'league'
                ? `<span class="soc-avatar-glyph">${esc(channel.icon || '🏆')}</span>`
                : '<span class="soc-avatar-glyph">🌐</span>';
    }

    refreshMessages();
}

function refreshMessages() {
    const log = root.querySelector('#chatLog');
    if (!log) return;

    const channelId = state.chat.active;
    const messages = state.chat.messages[channelId] ?? [];
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const switched = log.dataset.channel !== channelId;
    log.dataset.channel = channelId;

    if (!messages.length) {
        log.innerHTML = `
            <div class="soc-empty soc-empty-chat">
                <span class="soc-empty-icon" aria-hidden="true">💬</span>
                <p>${t('social.no_messages')}</p>
            </div>
        `;
        log.dataset.ready = '1';
        if (switched) log.scrollTop = 0;
        return;
    }

    // El nom dels altres només surt al primer missatge d'una tongada de
    // la mateixa persona; del meu compte no en surt mai res.
    let previousAuthor = null;
    log.innerHTML = messages.map((message) => {
        const mine = Boolean(message.fromUid) && message.fromUid === myUid();
        const author = message.fromUid ?? message.fromName ?? '';
        const withName = !mine && author !== previousAuthor;
        previousAuthor = author;
        return messageRow(message, { mine, withName });
    }).join('');
    log.dataset.ready = '1';

    // Canviar de conversa comença a baix de tot, com un xat de debò.
    if (nearBottom || switched) log.scrollTop = log.scrollHeight;
}

/** Una fila del registre. El nom dels altres va a sobre de la bombolla
    (mai a dins), i només quan «withName» ho demana; la meva fila no
    porta capçalera. */
function messageRow(message, { mine, withName }) {
    const name = message.fromName ?? 'Jugador';

    const head = mine ? '' : `
                <div class="soc-msg-head">
                    ${withName ? `<span class="soc-msg-name">${esc(name)}</span>` : ''}
                    <span class="soc-msg-time">${timeAgo(message.at)}</span>
                </div>`;

    return `
        <div class="soc-msg ${mine ? 'is-me' : ''}">
            <span class="soc-avatar soc-avatar-mini ${mine ? 'soc-avatar-online' : 'soc-avatar-offline'}">
                ${avatarMarkup({ name, icon: message.fromIcon, photo: '' })}
            </span>
            <div class="soc-msg-body">${head}
                <div class="soc-msg-bubble">
                    <p class="soc-msg-text">${esc(message.text ?? '')}</p>
                </div>
            </div>
        </div>
    `;
}
