/**
 * social-store.js · estat de la secció Social, vingut de Firebase.
 *
 * A diferència de la versió anterior (dades de demostració desades a
 * `localStorage`), aquí la font de veritat és Firestore: cada usuari té
 * un document a `profiles/{uid}` i la resta de col·leccions socials. Si
 * no hi ha cap sessió iniciada, l'estat queda a `guest` i la vista mostra
 * la porta d'accés.
 *
 * L'API pública i la forma de `state` es mantenen igual que abans, perquè
 * `social-hub.js`, `social-chat.js` i `social-modals.js` no s'hagin de
 * reescriure: ells només llegeixen i muten `state`, i aquí s'emeten els
 * canvis amb `onSocialChange`.
 */

import { onAuthChange } from './auth.js';
import { IS_CONFIGURED } from './firebase-config.js';
import { ensureDb, firestore } from './social-db.js';
import { getLevelForPoints } from './levels.js';
import { stats } from './state.js';

/* ================================================================
   Avisos de canvi
   ================================================================ */

const listeners = new Set();

/** Es crida sempre que `state` canvia (idioma a part). */
export function onSocialChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            /* un escoltador trencat no ha de tombar la resta */
        }
    }
}

/* ================================================================
   L'estat (mateixa forma que la versió de demostració)
   ================================================================ */

function blankState() {
    return {
        status: 'guest',            // guest | loading | ready | error
        error: null,                // 'config' | 'permission' | 'offline' | 'unknown'
        me: null,                   // { id:'me', uid, name, icon, points, lvl, streak, status, game }
        friends: [],                // [{ id, name, icon, status, activity, pinned, ... }]
        requests: [],               // [{ id, name, icon }]
        suggestions: [],            // [{ id, name, icon }]
        notifications: [],          // [{ id, text, at, read }]
        league: { division: '', week: '', xp: 0, xpTarget: 2000, entries: [] },
        duels: [],
        tournaments: [],
        community: { goal: 0, done: 0 },
        titles: [],
        feed: [],
        gifts: [],
        giftsBalance: 0,
        chat: {
            active: 'global',
            channels: [{ id: 'global', name: 'Global', kind: 'global' }],
            messages: { global: [] },
            unread: {}
        },
        ui: { showNotifs: false, search: '' }
    };
}

export const state = blankState();

/** Reinicia l'estat sense canviar la identitat de l'objecte. */
function reset(next = {}) {
    Object.assign(state, blankState(), next);
}

/* ================================================================
   Utilitats que fan servir els altres mòduls del Social
   ================================================================ */

/** Les respostes del xat de demostració (encara en ús al xat). */
export const REPLY_TEXT = [
    'GG! 🔥',
    'Qui s\'apunta a una altra? 😎',
    'Bona partida!',
    'Aquesta la guanyo jo 🙌',
    'Espera\'t que m\'entreno...',
    '3048 punts, supera-ho 😏'
];

/** La setmana ISO, per saber quan toca reiniciar la lliga. */
export function currentWeek() {
    const date = new Date();
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / 86400000);
    const week = Math.ceil((days + start.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

let messageSeq = 0;

/** Crea un missatge de xat amb un identificador únic i estable. */
export function makeMessage(from, icon, text, at, reactions = {}) {
    messageSeq += 1;
    return { id: `m${at.toString(36)}-${messageSeq}`, from, icon, text, at, reactions };
}

/** El nom amb què el xat i la lliga anomenen el jugador de casa. */
export function myName() {
    return state.me?.name ?? '';
}

/** Troba una persona entre amics, sol·licituds i suggeriments. */
export function findPerson(id) {
    return (
        state.friends.find((person) => person.id === id)
        ?? state.requests.find((person) => person.id === id)
        ?? state.suggestions.find((person) => person.id === id)
    );
}

/** La cara d'algú pel seu nom; feia servei per als missatges del xat. */
export function iconOfName(name) {
    return state.friends.find((person) => person.name === name)?.icon ?? '🙂';
}

/** Afegeix una notificació al capdamunt de la campana. */
export function notify(text) {
    state.notifications.unshift({ id: `n${Date.now()}`, text, at: Date.now(), read: false });
    emit();
}

/**
 * Abans desava a `localStorage`. Ara la font de veritat és Firestore i
 * les escriptures les fan les accions, així que no hi ha res a fer aquí.
 */
export function saveState() {
    /* la persistència viu a Firestore */
}

/* ================================================================
   Connexió amb Firebase
   ================================================================ */

let started = false;
let unsubs = [];

/** Engega l'escolta de la sessió. Es crida des de `social.js`. */
export function startSocialStore() {
    if (started) return;
    started = true;

    if (!IS_CONFIGURED) {
        state.status = 'error';
        state.error = 'config';
        emit();
        return;
    }

    onAuthChange(handleUser);
}

function handleUser(user) {
    teardown();
    if (!user) {
        reset();
        emit();
        return;
    }
    connect(user).catch(() => {
        state.status = 'error';
        state.error = 'unknown';
        emit();
    });
}

function teardown() {
    for (const off of unsubs) {
        try { off(); } catch { /* res a fer */ }
    }
    unsubs = [];
}

async function connect(user) {
    state.status = 'loading';
    state.error = null;
    emit();

    let conn = null;
    try {
        conn = await ensureDb();
    } catch {
        conn = null;
    }

    if (!conn) {
        state.status = 'error';
        state.error = 'offline';
        emit();
        return;
    }

    await ensureProfile(user);

    state.status = 'ready';
    emit();

    watchSelf(user);
}

/* --- El document del propi usuari ------------------------------- */

async function ensureProfile(user) {
    const { api, db } = firestore() ?? {};
    if (!api) throw new Error('sense Firestore');

    const ref = api.doc(db, 'profiles', user.uid);
    const snap = await api.getDoc(ref);

    const base = {
        uid: user.uid,
        name: suggestedName(user),
        icon: iconFor(user.uid),
        points: stats.points ?? 0,
        lvl: getLevelForPoints(stats.points ?? 0).lvl,
        streak: stats.streak ?? 0,
        status: 'online',
        game: null,
        at: Date.now()
    };

    if (!snap.exists()) {
        await api.setDoc(ref, base, { merge: true });
        applyMe(base);
        return;
    }

    const data = snap.data() ?? {};
    const me = { ...base, ...pruneProfile(data) };
    applyMe(me);

    // Si el perfil ha quedat incomplet (per exemple, sense nom), el
    // completem; si no, no toquem res.
    if (!data.name || !data.icon || data.points === undefined) {
        try { await api.setDoc(ref, base, { merge: true }); } catch { /* res */ }
    }
}

function watchSelf(user) {
    const { api, db } = firestore() ?? {};
    if (!api) return;

    const off = api.onSnapshot(api.doc(db, 'profiles', user.uid), (snap) => {
        const data = snap.data();
        if (!data) return;
        applyMe(data);
        emit();
    }, () => { /* sense permisos: deixam el que ja teníem */ });

    unsubs.push(off);
}

function applyMe(data) {
    if (!data) return;
    state.me = {
        id: 'me',
        uid: data.uid,
        name: data.name || 'Jugador',
        icon: data.icon || '🙂',
        points: data.points ?? 0,
        lvl: data.lvl ?? 1,
        streak: data.streak ?? 0,
        status: data.status || 'online',
        game: data.game ?? null
    };
}

/* --- Auxiliars ------------------------------------------------ */

/** Es queda només amb els camps de perfil coneguts i ben tipats. */
function pruneProfile(data) {
    const out = {};
    if (typeof data.name === 'string') out.name = data.name.slice(0, 40);
    if (typeof data.icon === 'string') out.icon = data.icon.slice(0, 8);
    if (typeof data.points === 'number') out.points = data.points;
    if (typeof data.lvl === 'number') out.lvl = data.lvl;
    if (typeof data.streak === 'number') out.streak = data.streak;
    if (typeof data.status === 'string') out.status = data.status;
    if (typeof data.game === 'string' || data.game === null) out.game = data.game;
    return out;
}

function suggestedName(user) {
    return user.displayName?.trim() || user.email?.split('@')[0] || 'Jugador';
}

const ICONS = ['🦊', '🦄', '🐺', '🐯', '🐧', '🐙', '🦅', '🐉', '🐨', '🐸', '🦉', '🐱'];

/** Una cara estable a partir de l'uid (la mateixa sempre). */
function iconFor(uid) {
    let hash = 0;
    for (const char of String(uid)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return ICONS[hash % ICONS.length];
}
