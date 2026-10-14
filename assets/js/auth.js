/**
 * auth.js · el compte de l'usuari.
 *
 * Entrar (correu i contrasenya, o Google), sortir, i avisar la resta de
 * l'aplicació de qui hi ha. Tot el que sigui sincronitzar dades penja
 * d'aquí: la resta de mòduls s'escolten amb `onAuthChange` i esperen
 * `whenAuthReady()` abans de tocar res, perquè fins que Firebase no diu
 * qui hi ha no se sap si les dades que hi ha al disc són d'un convidat o
 * d'un compte.
 *
 * TRES DECISIONS QUE IMPORTEN:
 *
 * 1. El SDK no es carrega sempre. Són tres mòduls i mig de JavaScript
 *    (uns 300 kB) que qui no té compte no hauria de pagar mai, i a
 *    GitHub Pages cada visita compta. Només es carrega si hi ha el
 *    rastre d'una sessió anterior (`ulaSignedIn`, que hi deixa
 *    `onAuthStateChanged`) o quan algú prem un botó d'entrar.
 *
 * 2. Si `firebase-config.js` diu `IS_CONFIGURED: false`, el botó del
 *    compte s'esborra i el mòdul s'apaga sencer. La pàgina ha de
 *    funcionar igual sense compte.
 *
 * 3. La sessió viu allà on digui `SESSION_MODE` (vegeu
 *    firebase-config.js). Per defecte a `localStorage`, que vol dir que
 *    qui entri segueix dins quan torni a obrir la web.
 *
 * AQUEST MÒDUL NO TÉ CAP ESTAT PROPI. L'única font de veritat és
 * `onAuthStateChanged` de Firebase; la variable `account` n'és una còpia
 * per poder respondre de pressa a `currentUser()`.
 */

import { FIREBASE_CONFIG, IS_CONFIGURED, SESSION_MODE } from './firebase-config.js';
import { applyI18n, t } from './i18n.js';

/**
 * El rastre que deixa una sessió, per saber si val la pena carregar el
 * SDK de bon començament.
 *
 * El posa i el treu `onAuthStateChanged`. No és cap secret ni
 * identifica ningú: només diu «aquí hi havia algú».
 */
const SIGNED_IN_HINT = 'ulaSignedIn';

/**
 * Els codis d'error de Firebase que sabem explicar en l'idioma de
 * l'usuari. Els que hi són amb `null` no es diuen: tancar el popup de
 * Google a mig camí no és cap error, és el que fa qui canvia de parer.
 */
const ERROR_KEYS = {
    'auth/invalid-email': 'auth.err.email',
    'auth/missing-email': 'auth.err.email',
    'auth/weak-password': 'auth.err.password',
    'auth/missing-password': 'auth.err.password',
    'auth/email-already-in-use': 'auth.err.used',
    'auth/invalid-credential': 'auth.err.wrong',
    'auth/invalid-login-credentials': 'auth.err.wrong',
    'auth/wrong-password': 'auth.err.wrong',
    'auth/user-not-found': 'auth.err.wrong',
    'auth/network-request-failed': 'auth.err.network',
    'auth/too-many-requests': 'auth.err.network',
    'auth/popup-closed-by-user': null,
    'auth/cancelled-popup-request': null
};

/* --- Estat --------------------------------------------------------- */

let ui = null;           // les peces del DOM, o null si la pàgina no en té
let sdk = null;          // { app, auth, api }, un cop carregat
let sdkLoad = null;      // la càrrega en curs, per no fer-ne dues
let account = null;      // l'usuari de Firebase, o null si és un convidat
let signUp = false;      // el formulari és en mode «crear compte»
let settled = false;     // si ja s'ha dit a algú qui hi ha
const listeners = new Set();

/*
 * `ready` es resol un sol cop, quan ja se sap si hi ha sessió. Els
 * mòduls que han de decidir què fan amb les dades del disc l'esperen.
 */
let markReady;
const ready = new Promise((resolve) => {
    markReady = (user) => {
        settled = true;
        resolve(user);
    };
});

const byId = (id) => document.getElementById(id);

/* ================================================================
   El DOM del compte
   ================================================================ */

/** Els elements que toca aquest mòdul, tots junts i amb nom. */
function findUi() {
    const btn = byId('accountBtn');
    if (!btn) return null;

    return {
        btn,
        icon: byId('accountIcon'),
        // S'hi desa el dibuix de fàbrica per poder-lo tornar a posar quan
        // algú surti de la sessió (vegeu initAuth).
        iconMarkup: '',
        modal: byId('authModal'),
        close: byId('authClose'),
        guest: byId('authGuest'),
        account: byId('authAccount'),
        form: byId('authForm'),
        title: byId('authTitle'),
        email: byId('authEmail'),
        password: byId('authPassword'),
        error: byId('authError'),
        submit: byId('authSubmit'),
        toggle: byId('authToggle'),
        google: byId('authGoogle'),
        userEmail: byId('authUserEmail'),
        signOut: byId('authSignOut')
    };
}

/**
 * Passa el formulari a mode «entrar» o «crear compte».
 *
 * No hi ha cap text escrit al codi: es canvia la clau `data-i18n` de
 * cada element i es torna a aplicar el diccionari, i així el canvi
 * d'idioma segueix funcionant igual que a la resta de la pàgina.
 */
function setMode(create) {
    if (!ui) return;

    // Aquesta és l'única cosa que decideix si el formulari crea o entra:
    // els textos de sota només són el que es veu.
    signUp = create;

    ui.title.dataset.i18n = create ? 'auth.title.create' : 'auth.title';
    ui.submit.dataset.i18n = create ? 'auth.action.create' : 'auth.action.signin';
    ui.toggle.dataset.i18n = create ? 'auth.link.signin' : 'auth.link.create';

    // `new-password` fa que el gestor de contrasenyes ofereixi una de
    // nova en lloc de reomplir l'antiga.
    ui.password.setAttribute('autocomplete', create ? 'new-password' : 'current-password');
    ui.password.value = '';
    showError(null);
    applyI18n(ui.modal);
}

/**
 * Mostra un error al formulari, o l'esborra.
 *
 * @param {string|null} key clau d'idioma, o null per amagar-lo
 */
function showError(key) {
    if (!ui) return;

    if (!key) {
        ui.error.hidden = true;
        ui.error.textContent = '';
        return;
    }

    ui.error.textContent = t(key);
    ui.error.hidden = false;
}

/** Bloqueja els controls mentre es parla amb el servidor. */
function setBusy(busy) {
    if (!ui) return;

    ui.submit.disabled = busy;
    ui.google.disabled = busy;
    ui.toggle.disabled = busy;
    ui.signOut.disabled = busy;

    if (busy) ui.submit.textContent = t('auth.working');
    else applyI18n(ui.modal);
}

/**
 * El text que es mostra per un error de Firebase.
 *
 * @returns {string|null} null vol dir «no diguis res»
 */
function describe(error) {
    const code = error?.code;
    if (code && Object.hasOwn(ERROR_KEYS, code)) return ERROR_KEYS[code];
    return 'auth.err.generic';
}

/** Posa el botó del nav i el modal a l'estat de qui hi ha. */
function render() {
    if (!ui) return;

    const signedIn = Boolean(account);

    ui.btn.classList.toggle('is-signed-in', signedIn);

    if (signedIn) {
        const name = account.displayName?.trim() || account.email || '?';
        if (ui.icon) {
            ui.icon.textContent = name.charAt(0).toUpperCase();
            ui.icon.classList.add('ula-initial');
        }
        // El correu, al `title` i a `data-account`: qui té dos comptes
        // ha de poder veure de seguida en quin està sense obrir res.
        ui.btn.title = account.email ?? '';
        ui.btn.dataset.account = account.email ?? '';
    } else {
        if (ui.icon) {
            ui.icon.innerHTML = ui.iconMarkup;
            ui.icon.classList.remove('ula-initial');
        }
        ui.btn.removeAttribute('title');
        delete ui.btn.dataset.account;
    }

    ui.guest.hidden = signedIn;
    ui.account.hidden = !signedIn;
    if (signedIn) ui.userEmail.textContent = account.email ?? '';
}

function openModal() {
    if (!ui) return;

    ui.modal.classList.add('active');
    ui.btn.setAttribute('aria-expanded', 'true');

    // Sempre s'obre en mode «entrar», que és el que vol gairebé tothom.
    // Si algú ja ha entrat, el que veu és el seu compte i prou.
    if (account) return;
    setMode(false);
    // Sense `preventScroll` el navegador arrossega el fons per enfocar
    // un camp que, essent dins d'un modal fix, ja es veu.
    ui.email.focus({ preventScroll: true });
}

function closeModal() {
    if (!ui) return;

    ui.modal.classList.remove('active');
    ui.btn.setAttribute('aria-expanded', 'false');

    ui.password.value = '';
    showError(null);
}

/* ================================================================
   El SDK de Firebase
   ================================================================ */

/**
 * Carrega el SDK (un sol cop) i engega l'Authentication.
 *
 * La càrrega es recorda en una promesa perquè dos clics seguits no
 * acabin amb dues instàncies de l'app: `initializeApp` peta si se li
 * demana el mateix nom dues vegades.
 *
 * @returns {Promise<{app: object, auth: object, api: object}>}
 */
function loadSdk() {
    sdkLoad ??= (async () => {
        const [appApi, authApi] = await Promise.all([
            import('../vendor/firebase-app.js'),
            import('../vendor/firebase-auth.js')
        ]);

        const app = appApi.initializeApp(FIREBASE_CONFIG);
        const auth = authApi.getAuth(app);

        // `SESSION_MODE` tria on es desa la sessió; el valor desconegut
        // cau a `local`, que és el de fàbrica.
        const persistence = {
            local: authApi.browserLocalPersistence,
            session: authApi.browserSessionPersistence,
            none: authApi.inMemoryPersistence
        }[SESSION_MODE] ?? authApi.browserLocalPersistence;

        try {
            await authApi.setPersistence(auth, persistence);
        } catch {
            // Un navegador que no deixa desar res (mode privat) fa que
            // `setPersistence` falli. No és motiu per deixar-lo sense
            // compte: la sessió durarà el que duri la pestanya.
        }

        authApi.onAuthStateChanged(auth, (next) => {
            account = next;
            remember(next);
            render();
            for (const listener of listeners) listener(next);
            markReady(next);
        });

        sdk = { app, auth, api: authApi };
        return sdk;
    })();

    return sdkLoad;
}

/** Deixa o treu el rastre de sessió, si el navegador deixa. */
function remember(user) {
    try {
        if (user) localStorage.setItem(SIGNED_IN_HINT, '1');
        else localStorage.removeItem(SIGNED_IN_HINT);
    } catch {
        // Sense emmagatzematge, la sessió dura aquesta pestanya; el
        // compte funciona igual, només no es recorda en tornar-hi.
    }
}

function signedInHint() {
    try {
        return localStorage.getItem(SIGNED_IN_HINT) === '1';
    } catch {
        return false;
    }
}

/* ================================================================
   Accions
   ================================================================ */

async function emailEntry(event) {
    // El formulari existeix perquè el navegador ofereixi l'autocompletat
    // i l'Enter, no perquè navegui enlloc: `form-action 'none'` a la CSP
    // ho impediria igualment.
    event.preventDefault();
    if (!ui) return;

    const email = ui.email.value.trim();
    const password = ui.password.value;

    if (!email) {
        showError('auth.err.email');
        ui.email.focus({ preventScroll: true });
        return;
    }
    // La llargada mínima només es mira en crear el compte: en entrar, un
    // error de credencials és cosa del servidor.
    if (!password || (signUp && password.length < 6)) {
        showError('auth.err.password');
        ui.password.focus({ preventScroll: true });
        return;
    }

    showError(null);
    setBusy(true);

    try {
        const { auth, api } = await loadSdk();
        if (signUp) await api.createUserWithEmailAndPassword(auth, email, password);
        else await api.signInWithEmailAndPassword(auth, email, password);
        closeModal();
    } catch (error) {
        showError(describe(error));
    } finally {
        setBusy(false);
    }
}

async function googleEntry() {
    if (!ui) return;

    showError(null);
    setBusy(true);

    try {
        const { auth, api } = await loadSdk();
        await api.signInWithPopup(auth, new api.GoogleAuthProvider());
        closeModal();
    } catch (error) {
        showError(describe(error));
    } finally {
        setBusy(false);
    }
}

async function signOutNow() {
    if (!ui) return;

    showError(null);
    setBusy(true);

    try {
        const { auth, api } = await loadSdk();
        await api.signOut(auth);
        closeModal();
    } catch (error) {
        showError(describe(error));
    } finally {
        setBusy(false);
    }
}

/* ================================================================
   Engegada
   ================================================================ */

function bindUi() {
    ui.btn.addEventListener('click', () => {
        if (ui.modal.classList.contains('active')) closeModal();
        else openModal();
    });

    ui.close?.addEventListener('click', closeModal);
    ui.form.addEventListener('submit', emailEntry);
    ui.toggle.addEventListener('click', () => setMode(ui.toggle.dataset.i18n === 'auth.link.create'));
    ui.google.addEventListener('click', googleEntry);
    ui.signOut.addEventListener('click', signOutNow);

    // Clicar el fons tanca, com a la resta de modals. La comparació amb
    // el propi modal és el que evita que un clic dins la targeta el
    // tanqui pel camí de l'esdeveniment.
    ui.modal.addEventListener('click', (event) => {
        if (event.target === ui.modal) closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!ui.modal.classList.contains('active')) return;
        closeModal();
        ui.btn.focus();
    });
}

/**
 * Enganxa el compte a la pàgina. Es crida un cop, després d'`initI18n`.
 *
 * Si no hi ha res configurat, o la pàgina no porta la interfície del
 * compte (per exemple offline.html), no fa res i deixa la promesa de
 * `whenAuthReady` resolta amb null.
 */
export function initAuth() {
    if (!IS_CONFIGURED) {
        // Sense projecte no hi ha res a fer: el botó no ha d'existir, i
        // el modal tampoc, perquè no hi ha manera d'obrir-lo.
        byId('accountBtn')?.remove();
        byId('authModal')?.remove();
        markReady(null);
        return;
    }

    ui = findUi();
    if (!ui) {
        markReady(null);
        return;
    }

    // Es guarda la icona de fàbrica per poder-la tornar a posar quan
    // algú surti: el HTML és l'única font de veritat d'aquest dibuix.
    ui.iconMarkup = ui.icon ? ui.icon.innerHTML : '';

    bindUi();
    render();

    // El SDK només es carrega si hi ha rastre d'una sessió: qui no ha
    // entrat mai no paga els 300 kB fins que prem un botó.
    if (signedInHint()) {
        loadSdk().catch(() => {
            // Si el SDK no es pot carregar (sense xarxa, fitxer
            // corrupte), es queda com un convidat i es neteja el
            // rastre per no tornar-ho a provar a cada visita.
            remember(null);
            markReady(null);
        });
    } else {
        markReady(null);
    }
}

/* ================================================================
   Per a la resta de l'aplicació
   ================================================================ */

/** Qui hi ha, o null si és un convidat. */
export function currentUser() {
    return account;
}

/** Si hi ha algú amb la sessió oberta. */
export function isSignedIn() {
    return Boolean(account);
}

/**
 * Quan es tanqui la sessió o se n'obri una, rep el compte o null.
 *
 * @param {(user: object|null) => void} listener
 * @returns {() => void} per deixar d'escoltar
 */
export function onAuthChange(listener) {
    listeners.add(listener);
    if (settled) listener(account);
    return () => listeners.delete(listener);
}

/**
 * Espera que se sàpiga si hi ha sessió. La resta de mòduls l'esperen
 * abans de decidir què fan amb les dades del disc.
 */
export function whenAuthReady() {
    return ready;
}

/**
 * El SDK carregat, o null si encara no s'ha demanat mai.
 *
 * El necessiten els mòduls que hi pengen (Firestore); val més cridar
 * `ensureSdk()` que no pas mirar-ho, perquè la càrrega és mandrosa.
 */
export function firebaseSdk() {
    return sdk;
}

/** Assegura que el SDK estigui carregat i en torna les peces. */
export function ensureSdk() {
    return loadSdk();
}
