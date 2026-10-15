/**
 * social-modals.js · les fitxes que s'obren a sobre de la pàgina:
 * el perfil d'algú, l'edició del perfil propi i les confirmacions.
 *
 * Reutilitza la capa `.modal` / `.modal-content` de l'aplicació (la
 * mateixa del diàleg del compte), així que el look & feel i el
 * comportament (fons fosc, clic fora, Escape) són els de sempre.
 */

import {
    state,
    fetchProfile,
    isMe,
    isFriend,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    updateProfile,
    notify
} from './social-store.js';
import { esc, get, t, activityLabel, avatarMarkup, hydrate } from './social-ui.js';
import { getLevelForPoints } from './levels.js';
import { uploadToImgbb } from './social-imgbb.js';

/* ================================================================
   Base dels modals
   ================================================================ */

const stack = [];
let keysBound = false;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/></svg>`;

/**
 * Obre un modal amb el contingut donat.
 *
 * @param {string} content HTML del cos (ja escapat el que vingui de dades)
 * @param {{ label?: string, className?: string }} [options] `label` és
 *        l'etiqueta per als lectors de pantalla.
 */
function createModal(content, options = {}) {
    const previouslyFocused = document.activeElement;

    const el = document.createElement('div');
    el.className = `modal active soc-modal ${options.className ?? ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (options.label) el.setAttribute('aria-label', options.label);
    el.innerHTML = `
        <div class="modal-content soc-modal-card">
            <button type="button" class="close-modal" data-close aria-label="${t('ui.close')}">${CLOSE_ICON}</button>
            ${content}
        </div>
    `;

    document.body.appendChild(el);
    hydrate(el);

    const entry = { el, close };
    stack.push(entry);

    function close() {
        const index = stack.indexOf(entry);
        if (index !== -1) stack.splice(index, 1);
        el.remove();
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    }

    el.addEventListener('click', (event) => {
        if (event.target === el || event.target.closest('[data-close]')) close();
    });

    bindKeys();

    const focusTarget = el.querySelector('[data-autofocus]') ?? el.querySelector('.close-modal');
    focusTarget?.focus();

    return entry;
}

function bindKeys() {
    if (keysBound) return;
    keysBound = true;

    // En captura: el modal del Social ha de tancar-se abans que cap altre
    // atrapi l'Escape.
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !stack.length) return;
        event.stopPropagation();
        stack[stack.length - 1].close();
    }, true);
}

/** Una confirmació de sí/no. Retorna cert si s'ha confirmat. */
function openConfirm(message, confirmLabel) {
    return new Promise((resolve) => {
        const modal = createModal(`
            <p class="soc-confirm-text">${message}</p>
            <div class="soc-modal-actions">
                <button type="button" class="soc-btn" data-close>${t('ui.cancel')}</button>
                <button type="button" class="soc-btn soc-btn-danger" data-autofocus data-yes>${confirmLabel}</button>
            </div>
        `, { label: message });

        let answered = false;
        modal.el.addEventListener('click', (event) => {
            if (event.target.closest('[data-yes]')) {
                answered = true;
                modal.close();
            }
        });
        // El modal sempre acaba tancant-se; si no s'ha dit sí, és un no.
        const observer = new MutationObserver(() => {
            if (!document.body.contains(modal.el)) {
                observer.disconnect();
                resolve(answered);
            }
        });
        observer.observe(document.body, { childList: true });
    });
}

/* ================================================================
   Perfil d'una persona
   ================================================================ */

/**
 * La fitxa d'una persona: la meva (sense uid) o la d'algú altre, amic o
 * no (per exemple si arriba des de la lliga).
 */
export async function openProfile(uid) {
    const own = !uid || isMe(uid);
    const person = own ? state.me : await fetchProfile(uid);
    if (!person) return;

    const name = person.name ?? 'Jugador';
    const points = person.points ?? person.xp ?? 0;
    const level = person.lvl ?? getLevelForPoints(points).lvl;
    const streak = person.streak ?? 0;

    const avatar = `
        <span class="soc-avatar soc-avatar-xl soc-avatar-${esc(person.status ?? 'offline')}">
            ${avatarMarkup(person)}
        </span>`;

    const handle = person.username ? `<p class="soc-profile-handle">@${esc(person.username)}</p>` : '';
    const bio = person.bio
        ? `<p class="soc-profile-bio">${esc(person.bio)}</p>`
        : `<p class="soc-profile-bio is-empty">${t('ui.no_bio')}</p>`;

    const label = own ? t('ui.my_account') : name;

    const modal = createModal(`
        <div class="soc-profile-head">
            ${avatar}
            <div class="soc-profile-id">
                <h3 class="soc-profile-name">${esc(name)}</h3>
                ${handle}
                <p class="soc-profile-status">${activityLabel(person)}</p>
            </div>
        </div>
        ${bio}
        <div class="soc-stats">
            <div class="soc-stat"><strong>${points}</strong><span>${t('ui.xp')}</span></div>
            <div class="soc-stat"><strong>${level}</strong><span>${t('stats.level')}</span></div>
            <div class="soc-stat"><strong>${streak}</strong><span>🔥 ${t('stats.streak')}</span></div>
        </div>
        ${own ? `
            <div class="soc-modal-actions">
                <button type="button" class="soc-btn soc-btn-primary" data-act="edit">${t('ui.edit_profile')}</button>
            </div>
        ` : ''}
    `, { label, className: 'soc-modal-profile' });

    if (own) {
        modal.el.querySelector('[data-act="edit"]').addEventListener('click', () => {
            modal.close();
            openProfileEdit();
        });
        return;
    }

    const actions = modal.el.querySelector('.soc-modal-card');
    const button = profileAction(person);
    if (button) actions.insertAdjacentHTML('beforeend', `<div class="soc-modal-actions">${button}</div>`);

    modal.el.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-act]');
        if (!action) return;

        if (action.dataset.act === 'add') {
            const result = await sendFriendRequest(person.uid);
            notify(result.ok ? get('social.requestSent', { name }) : get('social.error_action'));
            modal.close();
        }

        if (action.dataset.act === 'accept') {
            const result = await acceptFriendRequest(person.uid);
            notify(result.ok ? get('social.friendAccepted') : get('social.error_action'));
            modal.close();
        }

        if (action.dataset.act === 'reject') {
            const result = await rejectFriendRequest(person.uid);
            if (!result.ok) notify(get('social.error_action'));
            modal.close();
        }

        if (action.dataset.act === 'remove') {
            const yes = await openConfirm(get('social.removeFriendConfirm', { name }), t('social.removeFriend'));
            if (!yes) return;
            const result = await removeFriend(person.uid);
            if (!result.ok) notify(get('social.error_action'));
            modal.close();
        }
    });
}

/** El botó que toca segons la relació amb aquesta persona. */
function profileAction(person) {
    const uid = person.uid;
    if (isFriend(uid)) {
        return `<button type="button" class="soc-btn soc-btn-danger-outline" data-act="remove">${t('social.removeFriend')}</button>`;
    }
    if (state.requests.some((p) => p.uid === uid)) {
        return `
            <button type="button" class="soc-btn soc-btn-primary" data-act="accept">${t('social.accept')}</button>
            <button type="button" class="soc-btn" data-act="reject">${t('social.reject')}</button>
        `;
    }
    if (state.sentRequests.some((p) => p.uid === uid)) {
        return `<span class="soc-chip">${t('social.requestPending')}</span>`;
    }
    return `<button type="button" class="soc-btn soc-btn-primary" data-act="add">${t('ui.add_friend')}</button>`;
}

/* ================================================================
   Edició del perfil propi
   ================================================================ */

export function openProfileEdit() {
    const me = state.me;
    if (!me) return;

    const draft = {
        name: me.name ?? '',
        username: me.username ?? '',
        bio: me.bio ?? '',
        photo: me.photo ?? ''
    };

    const modal = createModal(`
        <h3 class="soc-modal-title">${t('ui.edit_profile')}</h3>
        <div class="soc-edit">
            <div class="soc-edit-photo">
                <button type="button" class="soc-photo-drop" id="socPhotoBtn" aria-label="${t('ui.profile_photo')}">
                    <span class="soc-photo-preview" id="socPhotoPreview"></span>
                </button>
                <p class="soc-hint">${t('ui.click_or_drag_image')}</p>
                <input id="socPhotoInput" type="file" accept="image/*" hidden>
            </div>

            <label class="soc-label" for="socName">${t('ui.name')}</label>
            <input id="socName" class="auth-input" type="text" maxlength="30"
                   value="${esc(draft.name)}" data-autofocus autocomplete="off">

            <label class="soc-label" for="socUsername">${t('ui.username')}</label>
            <input id="socUsername" class="auth-input" type="text" maxlength="20"
                   value="${esc(draft.username)}" autocomplete="off" spellcheck="false">
            <p class="soc-hint" id="socUserHint"></p>

            <label class="soc-label" for="socBio">${t('ui.bio')}</label>
            <textarea id="socBio" class="auth-input soc-textarea" rows="3"
                      maxlength="200">${esc(draft.bio)}</textarea>

            <p class="soc-form-msg" id="socFormMsg" hidden></p>

            <div class="soc-modal-actions">
                <button type="button" class="soc-btn" data-close>${t('ui.cancel')}</button>
                <button type="button" class="soc-btn soc-btn-primary" id="socSave">${t('ui.save')}</button>
            </div>
        </div>
    `, { label: t('ui.edit_profile'), className: 'soc-modal-edit' });

    const preview = modal.el.querySelector('#socPhotoPreview');
    const photoInput = modal.el.querySelector('#socPhotoInput');
    const nameInput = modal.el.querySelector('#socName');
    const usernameInput = modal.el.querySelector('#socUsername');
    const hint = modal.el.querySelector('#socUserHint');
    const message = modal.el.querySelector('#socFormMsg');
    const saveButton = modal.el.querySelector('#socSave');

    const paintPreview = () => {
        preview.innerHTML = avatarMarkup({ name: draft.name, icon: me.icon, photo: draft.photo });
    };
    paintPreview();

    modal.el.querySelector('#socPhotoBtn').addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', async () => {
        const file = photoInput.files?.[0];
        if (!file) return;

        preview.classList.add('is-uploading');
        try {
            draft.photo = await uploadToImgbb(file);
            paintPreview();
            showMessage(message, '');
        } catch {
            showMessage(message, t('ui.upload_failed'));
        } finally {
            preview.classList.remove('is-uploading');
            photoInput.value = '';
        }
    });

    const checkUsername = () => {
        const ok = /^[a-z0-9_-]{3,20}$/.test(usernameInput.value.trim().toLowerCase());
        hint.textContent = ok ? t('ui.username_available') : t('ui.username_invalid');
        hint.classList.toggle('is-bad', !ok);
        return ok;
    };

    usernameInput.addEventListener('input', checkUsername);
    checkUsername();

    saveButton.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            showMessage(message, t('ui.fill_required'));
            nameInput.focus();
            return;
        }
        if (!checkUsername()) {
            showMessage(message, t('ui.username_invalid'));
            usernameInput.focus();
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = t('ui.saving');

        const result = await updateProfile({
            name,
            username: usernameInput.value.trim(),
            bio: modal.el.querySelector('#socBio').value,
            photo: draft.photo
        });

        if (result.ok) {
            modal.close();
            return;
        }

        saveButton.disabled = false;
        saveButton.textContent = t('ui.save');

        if (result.reason === 'taken') showMessage(message, t('ui.username_taken'));
        else if (result.reason === 'username') showMessage(message, t('ui.username_invalid'));
        else if (result.reason === 'name') showMessage(message, t('ui.fill_required'));
        else showMessage(message, t('ui.save_failed'));
    });
}

function showMessage(el, text) {
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('is-ok', false);
}
