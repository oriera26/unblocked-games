/**
 * social-store.js · estat de la secció Social, vingut de Firebase.
 *
 * Font de veritat: Firestore.
 *   - profiles/{uid}           → perfil propi (i d'altres per a suggeriments)
 *   - friendships/{pairId}    → amistats (status: pending | accepted)
 *   - league/{week}           → lliga setmanal (pas 3)
 *   - feed/{docId}            → activitat (pas 4)
 *   - gifts/{docId}           → regals (pas 4)
 *   - chat/{channelId}/messages → xat (pas 5)
 *
 * L'API pública i la forma de `state` es mantenen igual que abans perquè
 * social-hub, social-chat i social-modals no s'hagin de reescriure.
 */

import { onAuthChange } from './auth.js';
import { IS_CONFIGURED } from './firebase-config.js';
import { ensureDb, firestore, describeError, pairId } from './social-db.js';
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
        friends: [],                // [{ id, name, icon, status, activity, pinned, wins, losses, level, record, ... }]
        requests: [],               // [{ id, name, icon, uid }]
        suggestions: [],            // [{ id, name, icon, uid }]
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
   Accions d'amistat (crides a Firestore)
   ================================================================ */

/** Envia una sol·licitud d'amistat. */
export async function sendFriendRequest(targetUid) {
    const { api, db } = firestore();
    if (!api || !state.me?.uid) return;
    const pid = pairId(state.me.uid, targetUid);
    await api.setDoc(api.doc(db, 'friendships', pid), {
        uids: [state.me.uid, targetUid].sort(),
        status: 'pending',
        requestedBy: state.me.uid,
        createdAt: Date.now()
    }, { merge: true });
}

/** Accepta una sol·licitud d'amistat entrant. */
export async function acceptFriendRequest(requesterUid) {
    const { api, db } = firestore();
    if (!api || !state.me?.uid) return;
    const pid = pairId(state.me.uid, requesterUid);
    await api.updateDoc(api.doc(db, 'friendships', pid), {
        status: 'accepted',
        acceptedAt: Date.now()
    });
}

/** Rebutja una sol·licitud d'amistat entrant. */
export async function rejectFriendRequest(requesterUid) {
    const { api, db } = firestore();
    if (!api || !state.me?.uid) return;
    const pid = pairId(state.me.uid, requesterUid);
    await api.deleteDoc(api.doc(db, 'friendships', pid));
}

/** Elimina un amic existent. */
export async function removeFriend(friendUid) {
    const { api, db } = firestore();
    if (!api || !state.me?.uid) return;
    const pid = pairId(state.me.uid, friendUid);
    await api.deleteDoc(api.doc(db, 'friendships', pid));
}

/** Marca/desmarca un amic com a fixat (pin). Es guarda al perfil local. */
export function pinFriend(friendId, pinned) {
    const friend = state.friends.find((f) => f.id === friendId);
    if (friend) friend.pinned = pinned;
}

/** Envia una notificació de repte (només local de moment). */
export function challengeFriend(friendId) {
    /* la notificació la fa el hub després de l'acció */
}

/** Envia un regal a un amic (només local de moment). */
export function giftFriend(friendId) {
    /* la notificació la fa el hub després de l'acció */
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
    watchFriendships(user);
    watchSuggestions(user);
    watchLeague(user);
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

    // Si el perfil ha quedat incomplet, el completem.
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

/* --- Amistats (friendships) ------------------------------------ */

function watchFriendships(user) {
    const { api, db } = firestore() ?? {};
    if (!api) return;

    // Tots els documents on l'usuari és part de la parella.
    const q = api.query(
        api.collection(db, 'friendships'),
        api.where('uids', 'array-contains', user.uid)
    );

    const off = api.onSnapshot(q, (snap) => {
        rebuildFriendsFromSnapshot(snap, user.uid);
        emit();
    }, () => { /* sense permisos */ });

    unsubs.push(off);
}

function rebuildFriendsFromSnapshot(snap, myUid) {
    const friends = [];
    const requests = [];
    const friendUids = new Set();

    for (const doc of snap.docs) {
        const data = doc.data();
        const otherUid = data.uids.find((uid) => uid !== myUid);
        if (!otherUid) continue;

        if (data.status === 'accepted') {
            friendUids.add(otherUid);
            // Les dades completes (nom, icona, estat) vindran de profiles/{otherUid}
            // Per ara posem un placeholder; watchSuggestions/Profiles l'actualitzarà.
            friends.push({
                id: otherUid,
                name: 'Carregant…',
                icon: '🙂',
                status: 'online',
                activity: { kind: 'lobby', game: null },
                pinned: false,
                wins: 0,
                losses: 0,
                level: 1,
                record: null
            });
        } else if (data.status === 'pending' && data.requestedBy === otherUid) {
            // Sol·licitud entrant
            requests.push({
                id: otherUid,
                name: 'Carregant…',
                icon: '🙂',
                uid: otherUid
            });
        }
        // Sol·licituds sortents (requestedBy === myUid) no es mostren al hub.
    }

    state.friends = friends;
    state.requests = requests;

    // Ara carreguem els perfils dels amics i sol·licituds per obtenir nom/icona.
    loadProfilesFor([...friendUids, ...requests.map(r => r.uid)]);
}

/* --- Suggeriments (altres usuaris) ----------------------------- */

function watchSuggestions(user) {
    const { api, db } = firestore() ?? {};
    if (!api) return;

    // Per al MVP, prenem els primers 20 perfils que no siguin amic ni jo.
    // En produció es faria un índex amb "últimes connexions" o similar.
    const q = api.query(
        api.collection(db, 'profiles'),
        api.limit(30)
    );

    const off = api.onSnapshot(q, (snap) => {
        rebuildSuggestionsFromSnapshot(snap, user.uid);
        emit();
    }, () => { /* sense permisos */ });

    unsubs.push(off);
}

function rebuildSuggestionsFromSnapshot(snap, myUid) {
    const friendUids = new Set(state.friends.map(f => f.id));
    const requestUids = new Set(state.requests.map(r => r.uid));
    const exclude = new Set([myUid, ...friendUids, ...requestUids]);

    const suggestions = [];
    for (const doc of snap.docs) {
        if (suggestions.length >= 10) break;
        const uid = doc.id;
        if (exclude.has(uid)) continue;
        const data = doc.data() ?? {};
        suggestions.push({
            id: uid,
            name: data.name || 'Jugador',
            icon: data.icon || '🙂',
            uid
        });
    }
    state.suggestions = suggestions;
}

/* --- Carregar perfils per omplir amics/sol·licituds ------------ */

async function loadProfilesFor(uids) {
    if (!uids.length) return;
    const { api, db } = firestore() ?? {};
    if (!api) return;

    // Firestore 'in' query suporta fins a 30 valors.
    const chunks = [];
    for (let i = 0; i < uids.length; i += 30) {
        chunks.push(uids.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        const q = api.query(
            api.collection(db, 'profiles'),
            api.where(api.documentId(), 'in', chunk)
        );
        const snap = await api.getDocs(q);
        for (const doc of snap.docs) {
            const data = doc.data() ?? {};
            const uid = doc.id;
            const profile = {
                name: data.name || 'Jugador',
                icon: data.icon || '🙂',
                status: data.status || 'online',
                game: data.game ?? null
            };
            // Actualitzar amic
            const friend = state.friends.find(f => f.id === uid);
            if (friend) {
                Object.assign(friend, profile);
            }
            // Actualitzar sol·licitud
            const request = state.requests.find(r => r.uid === uid);
            if (request) {
                Object.assign(request, { name: profile.name, icon: profile.icon });
            }
        }
    }
}

/* --- Lliga (league) -------------------------------------------- */

export async function addLeagueXP(amount) {
    const { api, db } = firestore() ?? {};
    if (!api || !state.me?.uid) return;

    const week = currentWeek();
    const ref = api.doc(db, 'league', week);

    // Incrementem l'XP setmanal de l'usuari.
    await api.updateDoc(ref, {
        [`entries.${state.me.uid}`]: api.increment(amount),
        updatedAt: Date.now()
    }).catch(async () => {
        // Si el document no existeix, el creem amb l'entrada de l'usuari.
        const entry = {
            uid: state.me.uid,
            name: state.me.name,
            icon: state.me.icon,
            xp: amount
        };
        await api.setDoc(ref, {
            week,
            division: 'Bronze',
            xpTarget: 2000,
            entries: { [state.me.uid]: entry },
            createdAt: Date.now(),
            updatedAt: Date.now()
        }, { merge: true });
    });
}

/**
 * Escolta el document de la lliga de la setmana actual.
 * El document `league/{week}` té:
 *   - week: string
 *   - division: string
 *   - xpTarget: number
 *   - entries: object { [uid]: { uid, name, icon, xp } }
 */
function watchLeague(user) {
    const { api, db } = firestore() ?? {};
    if (!api) return;

    const week = currentWeek();
    const off = api.onSnapshot(api.doc(db, 'league', week), (snap) => {
        if (!snap.exists()) {
            // Encara no hi ha lliga aquesta setmana: deixem l'estat buit.
            state.league = { division: '', week, xp: 0, xpTarget: 2000, entries: [] };
            emit();
            return;
        }

        const data = snap.data() ?? {};
        const entriesObj = data.entries ?? {};
        const entries = Object.values(entriesObj).sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));

        // El nostre XP és l'entrada amb el nostre uid.
        const myEntry = entries.find(e => e.uid === user.uid);
        const myXp = myEntry?.xp ?? 0;

        state.league = {
            division: data.division || 'Bronze',
            week: data.week || week,
            xp: myXp,
            xpTarget: data.xpTarget ?? 2000,
            entries: entries.map(e => ({
                id: e.uid === user.uid ? 'me' : e.uid,
                name: e.name || 'Jugador',
                icon: e.icon || '🙂',
                xp: e.xp ?? 0
            }))
        };
        emit();
    }, () => { /* sense permisos */ });

    unsubs.push(off);
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