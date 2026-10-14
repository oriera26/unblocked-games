/**
 * cloud-ui.js · el que es veu de la sincronització.
 *
 * No pren cap decisió: només pinta l'estat (`Sincronitzant…`,
 * `Sincronitzat`, `No s'ha pogut sincronitzar`) a la pantalla de compte i
 * obre el diàleg quan `cloud.js` diu que hi ha conflictes. La tria la fa
 * qui llegeix, i el mòdul de xarxa és qui l'aplica.
 */

import { onSyncConflict, onSyncStatus, resolveConflict } from './cloud.js';
import { onLangChange, t } from './i18n.js';

/** Les claus d'i18n de cada estat. `off` no diu res. */
const STATUS_KEY = {
    syncing: 'sync.status.syncing',
    synced: 'sync.status.synced',
    error: 'sync.status.error'
};

let status = 'off';
let label = null;
let modal = null;

/* ================================================================
   Pintar
   ================================================================ */

function paint() {
    if (!label) return;

    const key = STATUS_KEY[status];
    label.textContent = key ? t(key) : '';
    label.dataset.state = key ? status : '';
}

function openDialog() {
    if (!modal) return;

    modal.classList.add('active');

    // Qui tria és qui mira la pantalla: el focus hi ha d'anar, o bé
    // quedaria en el lloc d'abans i el teclat no hi faria res.
    modal.querySelector('button')?.focus();
}

function closeDialog() {
    modal?.classList.remove('active');
}

/* ================================================================
   Enganxar
   ================================================================ */

/**
 * Muntja l'estat visible i el diàleg de conflictes.
 *
 * Es crida un cop, des de `main.js`, després d'haver engegat `cloud.js`.
 */
export function initCloudUi() {
    label = document.getElementById('authSyncStatus');
    modal = document.getElementById('syncModal');

    for (const [id, choice] of [
        ['syncKeepLocal', 'local'],
        ['syncKeepRemote', 'remote'],
        ['syncMerge', 'merge']
    ]) {
        document.getElementById(id)?.addEventListener('click', () => {
            closeDialog();
            resolveConflict(choice);
        });
    }

    modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeDialog();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('active')) closeDialog();
    });

    onSyncStatus((next) => {
        status = next;
        paint();
    });

    onSyncConflict(() => openDialog());
    onLangChange(paint);

    paint();
}
