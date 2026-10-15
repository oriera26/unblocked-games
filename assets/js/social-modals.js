/**
 * social-modals.js · gestió de modals: mini-perfil, editar compte, observador.
 *
 * Novetats:
 * - openProfile(id) → mostra perfil ampliable (nom, username, stats, foto).
 * - openProfileEdit() → modal per editar nom, username, foto (imgbb) i bio.
 * - showSpectator(id) → modal d'observador d'una partida.
 */

import { byId, esc, get, hydrate, t, timeAgo } from './social-ui.js';
import { myName, saveState, state } from './social-store.js';

// Fallback SVG for profile photo (extracted to avoid template literal parsing issues)
const FALLBACK_PROFILE_SVG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22 fill=%22none%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%232a2a3e%22/%3E%3Ctext x=%2260%22 y=%2265%22 fill=%22%23888%22 font-size=%2216%22 text-anchor=%22middle%22%3E%3C%2Ftext%3E%3C/svg%3E';

/* ---------- Obre mini-perfil / perfil ampliable ---------- */

export function openProfile(root, personId) {
    const person = personId
        ? (state.friends || state.profiles || []).find(p => p.id === personId) || state.profile
        : state.profile;

    if (!person) {
        console.warn('[social] No hi ha perfil oamic per obert');
        return;
    }

    const offline = person.status === 'offline';
    const playing = person.activity?.kind === 'playing';
    const gameName = person.activity?.game ?? '';
    const xp = person.xp ?? 0;
    const bio = person.bio ?? '';

    const html = /*html*/`
        <div class="soc-modal soc-profile-modal" style="
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center;
            z-index: 200;">
            <div style="
                background: var(--glass-bg); border: 1px solid var(--glass-border-soft);
                border-radius: 24px; width: 90%; max-width: 500px; max-height: 90%; overflow: auto;
                animation: modalIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--glass-border-soft);">
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main);">
                        ${esc(person.name)}
                        ${person.id === myName() ? ` (<span style="font-size: 11px; color: var(--accent);">${t('ui.my_account')}</span>)` : ''}
                    </h3>
                    <button class="btn-icon" style="background: none; border: none; color: var(--text-main); font-size: 18px; cursor: pointer;" aria-label="${t('ui.close')}">×</button>
                </div>

                <div style="display: flex; padding: 16px 20px; gap: 16px; align-items: center;">
                    <div style="width: 80px; height: 80px; border-radius: 16px; background: linear-gradient(140deg, var(--accent), #7b5cff); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff;">
                        ${esc(person.icon || person.name.charAt(0))}
                    </div>
                    <div style="flex: 1;">
                        <p style="font-size: 14px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">${esc(person.name)}</p>
                        <p style="font-size: 11px; color: var(--text-main); opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">@${esc(person.username || '—')}</p>
                    </div>
                </div>

                ${playing ? `
                    <div style="padding: 0 20px 16px;">
                        <p style="font-size: 12px; color: var(--text-main); opacity: 0.5; margin-bottom: 4px;">${t('ui.playing')}</p>
                        <p style="font-size: 13px; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${esc(gameName)}</p>
                    </div>
                ` : ''}

                <div style="padding: 0 20px 16px;">
                    <p style="font-size: 12px; color: var(--text-main); opacity: 0.5;">${statusLabel(person.status)}</p>
                    <span class="soc-dot ${esc(person.status)}" style="width: 10px; height: 10px; margin-left: 6px;"></span>
                </div>

                ${xp ? `
                    <div style="padding: 0 20px 16px;">
                        <p style="font-size: 12px; color: var(--text-main); opacity: 0.5;">XP</p>
                        <p style="font-size: 18px; font-weight: 700; color: var(--accent);">${xp}</p>
                    </div>
                ` : ''}

                ${bio ? `
                    <div style="padding: 0 20px 16px;">
                        <p style="font-size: 12px; color: var(--text-main); opacity: 0.5;">Bio</p>
                        <p style="font-size: 13px; color: var(--text-main); line-height: 1.5; white-space: pre-wrap;">${esc(bio)}</p>
                    </div>
                ` : `<p style="font-size: 12px; color: var(--text-main); opacity: 0.5; text-align: center; padding: 16px;">${t('ui.no_bio')}</p>`}

                <div style="padding: 0 20px 16px; display: flex; justify-content: flex-end;">
                    ${person.id !== myName() ? `
                        <button class="btn-small soc-add-friend" style="padding: 6px 14px; font-size: 12px; background: var(--pill-bg); color: var(--text-main); border: 1px solid var(--glass-border-soft); border-radius: 12px; cursor: pointer;">
                            ${t('ui.add_friend')}
                        </button>
                    ` : ''}
                </div>

                <!-- Botó "Canvis del compte" només per al propi usuari -->
                ${person.id === myName() ? `
                    <div style="padding: 0 20px 20px;">
                        <button class="btn-small soc-edit-profile" style="width: 100%; padding: 10px; font-size: 13px; background: var(--accent); color: #fff; border: none; border-radius: 12px; cursor: pointer; margin-top: 8px;">
                            ${t('ui.edit_profile')}
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>

        <style>
            @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        </style>
    `;

    // Eliminem modal antíqu existent
    const existing = root.querySelector('.soc-profile-modal');
    if (existing) existing.remove();

    root.insertAdjacentHTML('beforeend', html);

    // Closes
    const modal = root.querySelector('.soc-profile-modal');
    const closeBtn = root.querySelector('.btn-icon');
    if (modal) {
        closeBtn.addEventListener('click', () => modal.remove);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // Botó editar perfil propi usuari
    if (person.id === myName()) {
        const editBtn = root.querySelector('.soc-edit-profile');
        if (editBtn) {
            editBtn.addEventListener('click', () => openProfileEdit(root));
        }
    }

    // Botó afegir amic (per a altres usuaris)
    const addFriendBtn = root.querySelector('.soc-add-friend');
    if (addFriendBtn) {
        addFriendBtn.addEventListener('click', () => {
            // Afegir a amistats
            if (state.addFriend) state.addFriend(person.id);
            // Torna a renderitzar per canviar el botó
            openProfile(root, person.id);
        });
    }
}

/* ---------- Modal "El meu compte" / editar perfil ---------- */

export function openProfileEdit(root) {
    const myProfile = state.profile || {};
    const currentName = myProfile.name || '';
    const currentUsername = myProfile.username || '';
    const currentBio = myProfile.bio || '';
    const currentPhoto = myProfile.icon || ''; // URL base64 o avatar inicial

    let photoUrl = currentPhoto; // Serà updatada si s'utilitza imgbb

    const html = /*html*/`
        <div class="soc-modal soc-edit-modal" style="
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center;
            z-index: 200;">
            <div style="
                background: var(--glass-bg); border: 1px solid var(--glass-border-soft);
                border-radius: 24px; width: 92%; max-width: 500px; max-height: 90%; overflow: auto;
                animation: modalIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--glass-border-soft);">
                    <h3 style="font-size: 18px; font-weight: 700; color: var(--text-main);">${t('ui.edit_profile')}</h3>
                    <button class="btn-icon" style="background: none; border: none; color: var(--text-main); font-size: 18px; cursor: pointer;" aria-label="${t('ui.close')}">×</button>
                </div>

                <div style="padding: 20px;">
                    <!-- Secció: Foto de perfil -->
                    <div style="margin-bottom: 20px;">
                        <label style="font-size: 12px; color: var(--text-main); margin-bottom: 6px; display: block;">${t('ui.profile_photo')}</label>

                        <div style="position: relative; width: 120px; height: 120px; margin: 0 auto 12px; border: 2px solid var(--glass-border-soft); border-radius: 50; overflow: hidden; background: var(--glass-bg);">
                            <img id="editPhotoPreview" src="${photoUrl || FALLBACK_PROFILE_SVG}" style="width: 100%; height: 100%; object-fit: cover;" alt="Foto de perfil">
                            <button id="changePhotoBtn" style="position: absolute; bottom: 0; right: 0; background: var(--accent); color: #fff; border: none; padding: 4px 8px; font-size: 11px; border-radius: 0 4px 0 0; cursor: pointer; display: ${photoUrl ? 'none' : 'block'};">Canviar</button>
                        </div>

                        <input type="file" id="photoFileInput" accept="image/*" style="display: none;">
                        <p id="photoHint" style="font-size: 11px; color: var(--text-main); opacity: 0.5; text-align: center; margin-top: 8px;">${t('ui.click_or_drag_image')}</p>
                    </div>

                    <!-- Secció: Nom -->
                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 12px; color: var(--text-main); margin-bottom: 4px; display: block;">${t('ui.name')}</label>
                        <input type="text" id="editNameInput" value="${esc(currentName)}" style="width: 100%; background: var(--glass-bg); border: 1px solid var(--glass-border-soft); color: var(--text-main); padding: 8px; border-radius: 10px; font-size: 14px;">
                    </div>

                    <!-- Secció: Username -->
                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 12px; color: var(--text-main); margin-bottom: 4px; display: block;">${t('ui.username')}</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="text" id="editUsernameInput" value="${esc(currentUsername)}" style="flex: 1; background: var(--glass-bg); border: 1px solid var(--glass-border-soft); color: var(--text-main); padding: 8px; border-radius: 10px; font-size: 14px;">
                            <span id="usernameCheck" style="font-size: 11px; color: var(--accent); opacity: 0; min-width: 120px;"></span>
                        </div>
                        <p id="usernameHint" style="font-size: 10px; color: var(--text-main); opacity: 0.4; margin-top: 4px;">${t('ui.username_available')}</p>
                    </div>

                    <!-- Secció: Bio -->
                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 12px; color: var(--text-main); margin-bottom: 4px; display: block;">${t('ui.bio')}</label>
                        <textarea id="editBioInput" rows="3" style="width: 100%; background: var(--glass-bg); border: 1px solid var(--glass-border-soft); color: var(--text-main); padding: 8px; border-radius: 10px; font-size: 13px; resize: vertical; min-height: 48px; max-height: 120px;">${esc(currentBio)}</textarea>
                    </div>

                    <!-- Botons d'acció -->
                    <div style="padding-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
                        <button class="btn-secondary" style="flex: 1; padding: 10px 16px; font-size: 13px; background: var(--glass-bg); color: var(--text-main); border: 1px solid var(--glass-border-soft); border-radius: 12px; cursor: pointer;">${t('ui.cancel')}</button>
                        <button class="btn-primary" style="flex: 1; padding: 10px 16px; font-size: 13px; background: var(--accent); color: #fff; border: none; border-radius: 12px; cursor: pointer;" disabled>${t('ui.save')}</button>
                    </div>
                </div>
            </div>
        </div>

        <style>
            @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        </style>
    `;

    // Eliminem modal antíqu existent
    const existing = root?.querySelector('.soc-edit-modal');
    if (existing) existing.remove();

    if (root) root.insertAdjacentHTML('beforeend', html);

    // Inicialitzem elements
    initProfileEditHandlers(root);
}

/* ---------- Gestors d'esdeveniments per al modal d'edició ---------- */

function initProfileEditHandlers(root) {
    if (!root) return;

    const photoFileInput = root.querySelector('#photoFileInput');
    const changePhotoBtn = root.querySelector('#changePhotoBtn');
    const photoHint = root.querySelector('#photoHint');
    const editNameInput = root.querySelector('#editNameInput');
    const editUsernameInput = root.querySelector('#editUsernameInput');
    const usernameCheck = root.querySelector('#usernameCheck');
    const usernameHint = root.querySelector('#usernameHint');
    const editBioInput = root.querySelector('#editBioInput');
    const saveBtn = root.querySelector('.soc-edit-modal .btn-primary');
    const cancelBtn = root.querySelector('.soc-edit-modal .btn-secondary');
    const photoPreview = root.querySelector('#editPhotoPreview');

    // Canviar foto previsualització
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => photoFileInput.click());
    }
    if (photoFileInput) {
        photoFileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // Previsualització ràpida
            const reader = new FileReader();
            reader.onload = (event) => {
                photoPreview.src = event.target.result;
                photoHint.style.display = 'none';
                changePhotoBtn.style.display = 'none';
            };
            reader.readAsDataURL(file);

            // Subir a imgbb (si la API està disponible)
            if (window.uploadToImgbb && file) {
                window.uploadToImgbb(file).then((url) => {
                    photoPreview.src = url;
                    photoHint.textContent = 'URL guardada correcte';
                    photoHint.style.color = 'var(--accent)';
                    // Poden emmagatzemar la URL al state per després guardar
                    // state.profile.icon = url;
                }).catch((err) => {
                    console.error('[social] Error al pujar a imgbb:', err);
                    alert('No s\'ha pogut pujar la imatge. Torna-ho a provar.');
                });
            }
        });
    }

    // Validació de username en viu
    if (editUsernameInput) {
        editUsernameInput.addEventListener('input', () => {
            const username = editUsernameInput.value.trim();
            if (username.length === 0) {
                usernameCheck.style.opacity = 0;
                usernameHint.style.opacity = 0;
                saveBtn.disabled = true;
                return;
            }

            // Comprovació senzilla: el username no ha de tenir espais i tenir entre 3-20 caracters
            const valid = /^[a-zA-Z0-9_-]{3,20}$/.test(username);
            usernameCheck.style.opacity = valid ? 0.8 : 0;
            usernameHint.style.opacity = valid ? 0 : 0.8;
            usernameHint.textContent = valid ? t('ui.username_available') : t('ui.username_invalid');

            saveBtn.disabled = !valid;
        });
    }

    // Habilita/deshabilita guardar quan canvien camps
    const enableSave = () => {
        const name = (editNameInput || {}).value?.trim();
        const username = (editUsernameInput || {}).value?.trim();
        const bio = (editBioInput || {}).value?.trim();
        if (saveBtn) {
            saveBtn.disabled = !(name && username && usernameCheck.style.opacity > 0.5);
        }
    };

    if (editNameInput) {
        editNameInput.addEventListener('input', enableSave);
    }
    if (editUsernameInput) {
        editUsernameInput.addEventListener('input', enableSave);
    }
    if (editBioInput) {
        editBioInput.addEventListener('input', enableSave);
    }

    // Guardar canvis
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const newName = editNameInput?.value?.trim();
            const newUsername = editUsernameInput?.value?.trim();
            const newBio = editBioInput?.value?.trim();

            // Validacions bàsiques
            if (!newName || !newUsername) {
                alert('Si us plau, omple tots els camps obligatoris.');
                return;
            }

            // Preparar dades per actualitzar
            const updateData = {
                name: newName,
                username: newUsername,
                bio: newBio,
                // icon ja s'ha pujat abans
            };

            try {
                // Aquí es conectaria amb Firebase: await saveProfile(updateData);
                // Per now, només mostrem confirmació i tancam el modal
                saveState(); // S'assuria que es guarda local
                alert('Perfil actualitzat correcte!');
                if (root) closeModal(root);
            } catch (err) {
                console.error('[social] Error al actualizar perfil:', err);
                alert('Error al actualitzar el perfil. Torna-ho a provar.');
            }
        });
    }

    // Cancel·lar
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal(root));
    }

    // Tancar clic fora
    root.addEventListener('click', (e) => {
        const modal = e.target.closest('.soc-edit-modal');
        if (!modal || e.target.classList.contains('soc-modal')) {
            closeModal(root);
        }
    });
}

/* ---------- Helper: tancar modal ---------- */

function closeModal(root) {
    if (!root) return;
    const modal = root.querySelector('.soc-edit-modal');
    if (modal) modal.remove();
}

/* ---------- Modal observador (spectator) ---------- */

export function showSpectator(personId) {
    const person = (state.friends || state.profiles || []).find(p => p.id === personId) || state.profile;
    if (!person) return;

    const html = /*html*/`
        <div class="soc-modal soc-spectator-modal" style="
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center;
            z-index: 200;">
            <div style="
                background: var(--glass-bg); border: 1px solid var(--glass-border-soft);
                border-radius: 24px; width: 90%; max-width: 500px; max-height: 90%; overflow: auto;
                animation: modalIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--glass-border-soft);">
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main);">${t('ui.spectator')}</h3>
                    <button class="btn-icon" style="background: none; border: none; color: var(--text-main); font-size: 18px; cursor: pointer;" aria-label="${t('ui.close')}">×</button>
                </div>
                <p style="font-size: 12px; color: var(--text-main); opacity: 0.5; text-align: center; padding: 16px;">${t('ui.spectator_desc')}</p>
            </div>
        </div>
        <style>
            @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        </style>
    `;

    const root = document.getElementById('view-social');
    if (root) {
        const existing = root.querySelector('.soc-spectator-modal');
        if (existing) existing.remove();
        root.insertAdjacentHTML('beforeend', html);
    }
}