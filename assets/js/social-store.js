/**
 * social-store.js · l'estat de la secció Social i tot el que parla amb
 * Firestore (amics, lliga, activitat, regals i xat).
 *
 * Els altres mòduls del Social (hub, xat, modals, orquestrador) no toquen
 * Firestore mai: llegeixen `state` i criden les accions d'aquí. Així hi ha
 * un sol lloc on viuen les regles de dades i els noms dels camps.
 *
 * Forma dels documents (ha de quadrar amb firestore.rules):
 *
 *   profiles/{uid}      name, nameLower, username, bio, photo, icon,
 *                       points, lvl, streak, status, game, giftsBalance, at
 *   friendships/{pass}  uids: [a, b], status, requestedBy, at,
 *                       acceptedAt?, pinned?
 *   league/{setmana}    week, xpTarget, entries: { uid: { uid, name, icon, xp } }
 *   feed/{id}           actorUid, actorName, actorIcon, game, score, at, reactions
 *   gifts/{id}          label, icon, price, createdAt, claimedBy: []
 *   chat/{canal}/messages/{id}
 *                       fromUid, fromName, fromIcon, text, at, reactions
 */

import { onAuthChange, currentUser } from './auth.js';
import { IS_CONFIGURED } from './firebase-config.js';
import { ensureDb, firestore, describeError, pairId } from './social-db.js';
import { getLevelForPoints } from './levels.js';
import { stats } from './state.js';

/* ================================================================
   Subscripcions d'estat
   ================================================================ */

const listeners = new Set();

/**
 * Subscriu qui vulgui saber quan canvia l'estat Social.
 *
 * El subscriber rep l'estat d'entrada (guest, loading, ready o error) i
 * després cada vegada que alguna cosa canvia. Retorna la funció per
 * deixar d'escoltar.
 *
 * @param {(status: string) => void} listener
 * @returns {() => void}
 */
export function onSocialChange(listener) {
    listeners.add(listener);
    try { listener(state.status); } catch { /* un subscriber trencat no atura la resta */ }
    return () => listeners.delete(listener);
}

function emit() {
    for (const listener of [...listeners]) {
        try { listener(state.status); } catch { /* idem */ }
    }
}

/* ================================================================
   Estat
   ================================================================ */

function blankState() {
    return {
        status: 'guest',        // guest | loading | ready | error
        error: null,            // config | permission | auth | offline | unknown

        me: null,               // el meu perfil (profiles/{uid})
        friends: [],            // amistats acceptades
        requests: [],           // sol·licituds rebudes (pendents)
        sentRequests: [],       // sol·licituds enviades (pendents)
        suggestions: [],        // gent que potser coneixes
        notifications: [],      // avisos locals de les meves accions

        league: { week: '', xp: 0, xpTarget: 2000, entries: [] },
        feed: [],
        gifts: [],
        giftBalance: 0,

        chat: {
            active: 'global',
            channels: [{ id: 'global' }],
            messages: { global: [] }
        }
    };
}

export const state = blankState();

function reset() {
    Object.assign(state, blankState());
}

/* ================================================================
   Enganxar-se a l'autenticació
   ================================================================ */

let started = false;
let unsubs = [];

/** Engega l'escolta de la sessió. Es pot cridar tantes vegades com calgui. */
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

/** Torna-ho a provar després d'un error: refà la connexió amb la sessió actual. */
export function retrySocialStore() {
    handleUser(currentUser());
}

async function handleUser(user) {
    stopWatching();

    if (!user) {
        reset();
        emit();
        return;
    }

    try {
        state.status = 'loading';
        emit();
        await connect(user);
        state.status = 'ready';
        emit();
    } catch (error) {
        state.status = 'error';
        state.error = describeError(error);
        emit();
    }
}

function stopWatching() {
    for (const off of unsubs) {
        try { off(); } catch { /* ja no hi era */ }
    }
    unsubs = [];
}

async function connect(user) {
    const connection = await ensureDb();
    if (!connection) throw new Error('Firestore no disponible');

    await ensureProfile(user);

    watchSelf(user);
    watchFriendships(user);
    watchSuggestions(user);
    watchLeague(user);
    watchFeed(user);
    watchGifts(user);
    watchChat(user);
    startPresence(user);
}

/* ================================================================
   Una mica de mà als accessos a Firestore
   ================================================================ */

/** La connexió, o null si encara no està engegada. */
function fs() {
    return firestore();
}

/** El meu uid, si hi ha sessió. */
export function myUid() {
    return state.me?.uid ?? currentUser()?.uid ?? null;
}

/** Cert si `uid` és el meu. */
export function isMe(uid) {
    return Boolean(uid) && uid === myUid();
}

/** Cert si `uid` és a la llista d'amics. */
export function isFriend(uid) {
    return state.friends.some((friend) => friend.uid === uid);
}

/* ================================================================
   El meu perfil
   ================================================================ */

function slugify(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 14);
}

function suggestedName(user) {
    const raw = user.displayName ?? user.email?.split('@')[0] ?? 'Jugador';
    const clean = String(raw).trim().slice(0, 30);
    return clean || 'Jugador';
}

function suggestedUsername(user) {
    const base = slugify(user.displayName ?? user.email?.split('@')[0] ?? 'jugador') || 'jugador';
    return `${base}-${String(user.uid).slice(0, 4)}`.slice(0, 20);
}

async function ensureProfile(user) {
    const connection = fs();
    if (!connection) throw new Error('Firestore no disponible');
    const { api, db } = connection;

    const ref = api.doc(db, 'profiles', user.uid);
    const snap = await api.getDoc(ref);

    if (!snap.exists()) {
        const points = stats.points ?? 0;
        const base = {
            name: suggestedName(user),
            nameLower: suggestedName(user).toLowerCase(),
            username: suggestedUsername(user),
            bio: '',
            photo: '',
            icon: '',
            points,
            lvl: getLevelForPoints(points).lvl,
            streak: stats.streak ?? 0,
            status: 'online',
            game: null,
            giftsBalance: 0,
            at: Date.now()
        };
        await api.setDoc(ref, base);
        applyMe(user.uid, base);
        return;
    }

    const data = snap.data();
    applyMe(user.uid, data);

    // Si el progrés local va per davant del que hi ha al perfil, es posa
    // al dia: els punts i el nivell surten d'aquí i ningú més no els
    // actualitza. Si va per darrere, mana el perfil (un altre dispositiu).
    const localPoints = stats.points ?? 0;
    if (localPoints > (data.points ?? 0)) {
        try {
            await api.setDoc(ref, {
                points: localPoints,
                lvl: getLevelForPoints(localPoints).lvl,
                streak: stats.streak ?? 0,
                at: Date.now()
            }, { merge: true });
        } catch { /* si falla, es queda el que ja hi havia */ }
    }
}

function applyMe(uid, doc) {
    state.me = {
        uid,
        name: doc.name ?? 'Jugador',
        nameLower: doc.nameLower ?? String(doc.name ?? '').toLowerCase(),
        username: doc.username ?? '',
        bio: doc.bio ?? '',
        photo: doc.photo ?? '',
        icon: doc.icon ?? '',
        points: doc.points ?? 0,
        lvl: doc.lvl ?? 1,
        streak: doc.streak ?? 0,
        status: doc.status ?? 'online',
        game: doc.game ?? null
    };
    state.giftBalance = doc.giftsBalance ?? 0;
    emit();
}

function watchSelf(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    unsubs.push(api.onSnapshot(api.doc(db, 'profiles', user.uid), (snap) => {
        if (snap.exists()) applyMe(user.uid, snap.data());
    }));
}

/**
 * Presència senzilla: amb la pestanya visible estic «en línia»; amb la
 * pestanya amagada, «inactiu». No hi ha servidor de presència a Spark,
 * així que aquest és el senyal que hi ha; val més dir la veritat que
 * inventar-se un «en línia» permanent.
 */
function startPresence(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;
    const ref = api.doc(db, 'profiles', user.uid);

    let last = null;
    const sync = () => {
        const status = document.visibilityState === 'visible' ? 'online' : 'idle';
        if (status === last) return;
        last = status;
        api.setDoc(ref, { status, at: Date.now() }, { merge: true }).catch(() => {});
    };

    document.addEventListener('visibilitychange', sync);
    unsubs.push(() => document.removeEventListener('visibilitychange', sync));
    sync();
}

/**
 * Actualitza el perfil propi (nom, nom d'usuari, bio i foto).
 *
 * El nom d'usuari ha de ser únic: es consulta `profiles` per la versió en
 * minúscules i, si el té algú altre, no es desa res.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function updateProfile(patch) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const name = String(patch.name ?? '').trim().slice(0, 30);
    const username = String(patch.username ?? '').trim().toLowerCase();
    const bio = String(patch.bio ?? '').trim().slice(0, 200);
    const photo = String(patch.photo ?? '').trim();

    if (!name) return { ok: false, reason: 'name' };
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) return { ok: false, reason: 'username' };
    if (photo && !/^https:\/\//.test(photo) && !/^data:image\//.test(photo)) {
        return { ok: false, reason: 'photo' };
    }

    try {
        const taken = await isUsernameTaken(api, db, username, user.uid);
        if (taken) return { ok: false, reason: 'taken' };

        await api.setDoc(api.doc(db, 'profiles', user.uid), {
            name,
            nameLower: name.toLowerCase(),
            username,
            bio,
            photo,
            at: Date.now()
        }, { merge: true });

        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

async function isUsernameTaken(api, db, username, ownUid) {
    const q = api.query(
        api.collection(db, 'profiles'),
        api.where('username', '==', username),
        api.limit(5)
    );
    const snap = await api.getDocs(q);
    return snap.docs.some((doc) => doc.id !== ownUid);
}

/**
 * El perfil complet d'un uid per obrir-ne la fitxa (encara que no sigui
 * amic meu, per exemple si surt a la lliga).
 */
export async function fetchProfile(uid) {
    const known = findPerson(uid);
    if (known && known.uid !== myUid()) return known;

    const connection = fs();
    if (!connection) return known;
    const { api, db } = connection;

    try {
        const snap = await api.getDoc(api.doc(db, 'profiles', uid));
        if (!snap.exists()) return known;
        return { uid, id: uid, ...snap.data() };
    } catch {
        return known;
    }
}

/* ================================================================
   Amics i sol·licituds
   ================================================================ */

function watchFriendships(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const q = api.query(
        api.collection(db, 'friendships'),
        api.where('uids', 'array-contains', user.uid)
    );

    unsubs.push(api.onSnapshot(q, (snap) => {
        const friends = [];
        const requests = [];
        const sentRequests = [];
        const uids = new Set();

        snap.forEach((doc) => {
            const data = doc.data();
            const otherUid = (data.uids ?? []).find((uid) => uid !== user.uid);
            if (!otherUid) return;
            uids.add(otherUid);

            const base = { uid: otherUid, id: otherUid };

            if (data.status === 'pending') {
                if (data.requestedBy === user.uid) sentRequests.push({ ...base, at: data.at ?? 0 });
                else requests.push({ ...base, at: data.at ?? 0 });
            } else if (data.status === 'accepted') {
                friends.push({ ...base, pinned: data.pinned === true, at: data.acceptedAt ?? data.at ?? 0 });
            }
        });

        state.friends = friends;
        state.requests = requests;
        state.sentRequests = sentRequests;
        refreshPeopleProfiles([...uids]);
        emit();
    }));
}

/** Omple nom, foto i estat dels perfils que encara són buits. */
async function refreshPeopleProfiles(uids) {
    const connection = fs();
    if (!connection || !uids.length) return;
    const { api, db } = connection;

    const missing = uids.filter((uid) => {
        const person = [...state.friends, ...state.requests, ...state.sentRequests].find((p) => p.uid === uid);
        return person && !person.name;
    });
    if (!missing.length) return;

    const loaded = await Promise.all(missing.map(async (uid) => {
        try {
            const snap = await api.getDoc(api.doc(db, 'profiles', uid));
            return snap.exists() ? { uid, ...snap.data() } : null;
        } catch {
            return null;
        }
    }));

    for (const profile of loaded) {
        if (profile) mergePersonProfile(profile);
    }
    emit();
}

function mergePersonProfile(profile) {
    const merge = (list) => {
        const person = list.find((p) => p.uid === profile.uid);
        if (!person) return;
        person.name = profile.name ?? person.name;
        person.nameLower = profile.nameLower ?? (profile.name ?? '').toLowerCase();
        person.username = profile.username ?? '';
        person.bio = profile.bio ?? '';
        person.photo = profile.photo ?? '';
        person.icon = profile.icon ?? '';
        person.status = profile.status ?? 'offline';
        person.game = profile.game ?? null;
        person.xp = profile.points ?? 0;
        person.lvl = profile.lvl ?? 1;
        person.streak = profile.streak ?? 0;
    };
    merge(state.friends);
    merge(state.requests);
    merge(state.sentRequests);
    merge(state.suggestions);
}

/**
 * Envia una sol·licitud d'amistat.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function sendFriendRequest(targetUid) {
    const user = currentUser();
    if (!user || !targetUid || targetUid === user.uid) return { ok: false, reason: 'self' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const id = pairId(user.uid, targetUid);
    const ref = api.doc(db, 'friendships', id);

    try {
        // Es mira si la sol·licitud ja hi és. Si aquesta lectura fallés
        // per unes regles velles —el `get` d'un document que encara no
        // existeix pot quedar denegat, perquè `resource` hi és nul—, es
        // tracta com si no hi fos: la regla de creació tornarà a decidir
        // quan s'escrigui.
        let existing = null;
        try {
            existing = await api.getDoc(ref);
        } catch (error) {
            if (describeError(error) !== 'permission') throw error;
        }
        if (existing?.exists()) return { ok: false, reason: 'exists' };

        await api.setDoc(ref, {
            uids: [user.uid, targetUid],
            status: 'pending',
            requestedBy: user.uid,
            at: Date.now(),
            pinned: false
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Accepta una sol·licitud rebuda. */
export async function acceptFriendRequest(requesterUid) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.updateDoc(api.doc(db, 'friendships', pairId(user.uid, requesterUid)), {
            status: 'accepted',
            acceptedAt: Date.now()
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Rebutja una sol·licitud rebuda, o cancel·la una d'enviada: és el mateix document. */
export async function rejectFriendRequest(otherUid) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.deleteDoc(api.doc(db, 'friendships', pairId(user.uid, otherUid)));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Treu un amic de la llista. */
export async function removeFriend(friendUid) {
    return rejectFriendRequest(friendUid);
}

/** Fixa o deixa de fixar un amic a dalt de la llista. */
export async function setFriendPin(friendUid, pinned) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.updateDoc(api.doc(db, 'friendships', pairId(user.uid, friendUid)), {
            pinned: Boolean(pinned)
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/* ================================================================
   Cerca i suggeriments
   ================================================================ */

/**
 * Cerca perfils pel nom (mínim 2 caràcters). Fa servir `nameLower`, així
 * que «ula» troba «Ula» i «ULA».
 *
 * @returns {Promise<Array<object>>}
 */
export async function searchProfiles(term) {
    const query = String(term ?? '').trim().toLowerCase();
    if (query.length < 2) return [];

    const connection = fs();
    if (!connection) return [];
    const { api, db } = connection;

    try {
        const q = api.query(
            api.collection(db, 'profiles'),
            api.orderBy('nameLower'),
            api.startAt(query),
            api.endAt(`${query}\uf8ff`),
            api.limit(10)
        );
        const snap = await api.getDocs(q);
        return snap.docs
            .map((doc) => ({ uid: doc.id, id: doc.id, ...doc.data() }))
            .filter((person) => person.uid !== myUid());
    } catch {
        return [];
    }
}

function watchSuggestions(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const q = api.query(
        api.collection(db, 'profiles'),
        api.orderBy('at', 'desc'),
        api.limit(24)
    );

    unsubs.push(api.onSnapshot(q, (snap) => {
        const known = new Set([
            user.uid,
            ...state.friends.map((p) => p.uid),
            ...state.requests.map((p) => p.uid),
            ...state.sentRequests.map((p) => p.uid)
        ]);

        const suggestions = [];
        snap.forEach((doc) => {
            if (known.has(doc.id)) return;
            const data = doc.data();
            suggestions.push({
                uid: doc.id,
                id: doc.id,
                name: data.name ?? 'Jugador',
                nameLower: data.nameLower ?? '',
                username: data.username ?? '',
                photo: data.photo ?? '',
                icon: data.icon ?? '',
                status: data.status ?? 'offline',
                xp: data.points ?? 0
            });
        });

        state.suggestions = suggestions;
        emit();
    }));
}

/* ================================================================
   Lliga setmanal
   ================================================================ */

/** La setmana ISO d'una data, amb el format 2026-W29. */
export function currentWeek(date = new Date()) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);

    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function watchLeague(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const week = currentWeek();
    state.league = { week, xp: 0, xpTarget: 2000, entries: [] };

    unsubs.push(api.onSnapshot(api.doc(db, 'league', week), (snap) => {
        if (!snap.exists()) {
            state.league = { week, xp: 0, xpTarget: 2000, entries: [] };
            emit();
            return;
        }

        const data = snap.data();
        const entries = Object.values(data.entries ?? {})
            .map((entry) => ({
                uid: entry.uid,
                name: entry.name ?? 'Jugador',
                icon: entry.icon ?? '',
                photo: entry.photo ?? '',
                xp: entry.xp ?? 0
            }))
            .sort((a, b) => b.xp - a.xp);

        const mine = entries.find((entry) => entry.uid === user.uid);
        state.league = {
            week,
            xp: mine?.xp ?? 0,
            xpTarget: data.xpTarget ?? 2000,
            entries
        };
        emit();
    }));
}

/**
 * Suma XP a la meva entrada de la lliga d'aquesta setmana.
 *
 * La lliga s'escriu amb `runTransaction` i només es toca la meva entrada:
 * les regles ho comproven i no deixarien passar res més.
 */
export async function addLeagueXP(amount) {
    const user = currentUser();
    const points = Number(amount);
    if (!user || !Number.isFinite(points) || points === 0) return { ok: false };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const week = currentWeek();
    const ref = api.doc(db, 'league', week);

    try {
        await api.runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            const data = snap.exists() ? snap.data() : {};
            const entries = { ...(data.entries ?? {}) };
            const mine = entries[user.uid] ?? {};

            entries[user.uid] = {
                uid: user.uid,
                name: state.me?.name ?? 'Jugador',
                icon: state.me?.icon ?? '',
                photo: state.me?.photo ?? '',
                xp: (mine.xp ?? 0) + points
            };

            transaction.set(ref, {
                week,
                xpTarget: data.xpTarget ?? 2000,
                entries,
                updatedAt: Date.now()
            }, { merge: true });
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/* ================================================================
   Activitat (feed)
   ================================================================ */

function watchFeed() {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const q = api.query(api.collection(db, 'feed'), api.orderBy('at', 'desc'), api.limit(20));

    unsubs.push(api.onSnapshot(q, (snap) => {
        state.feed = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        emit();
    }));
}

/**
 * Publica una fita al feed. Els camps són els que deixen passar les
 * regles: actorUid, actorName, actorIcon, game, score, at i reactions.
 */
export async function addFeedEntry({ game, score }) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.addDoc(api.collection(db, 'feed'), {
            actorUid: user.uid,
            actorName: state.me?.name ?? 'Jugador',
            actorIcon: state.me?.icon ?? '',
            game: String(game ?? '').slice(0, 60),
            score: Number(score) || 0,
            at: Date.now(),
            reactions: {}
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/* ================================================================
   Regals
   ================================================================ */

function watchGifts() {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const q = api.query(api.collection(db, 'gifts'), api.orderBy('createdAt', 'desc'), api.limit(20));

    unsubs.push(api.onSnapshot(q, (snap) => {
        state.gifts = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((gift) => (gift.claimedBy ?? []).length === 0);
        emit();
    }));
}

/**
 * Reclama un regal. Un regal només es pot reclamar una vegada: qui hi
 * arriba primer se'l queda, i desapareix de la resta de llistes.
 *
 * Els gratuïts donen crèdits i els de pagament en costen; el saldo viu a
 * `profiles/{uid}.giftsBalance`.
 *
 * @returns {Promise<{ok: boolean, reason?: string, reward?: number}>}
 */
export async function claimGift(giftId) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const giftRef = api.doc(db, 'gifts', giftId);
    const profileRef = api.doc(db, 'profiles', user.uid);
    let reward = 0;

    try {
        await api.runTransaction(db, async (transaction) => {
            const giftSnap = await transaction.get(giftRef);
            if (!giftSnap.exists()) {
                const error = new Error('gift-missing');
                error.reason = 'claimed';
                throw error;
            }

            const gift = giftSnap.data();
            if ((gift.claimedBy ?? []).length > 0) {
                const error = new Error('gift-claimed');
                error.reason = 'claimed';
                throw error;
            }

            const profileSnap = await transaction.get(profileRef);
            const balance = profileSnap.exists() ? (profileSnap.data().giftsBalance ?? 0) : 0;
            const price = Math.max(0, Number(gift.price) || 0);

            if (price > 0 && balance < price) {
                const error = new Error('gift-funds');
                error.reason = 'funds';
                throw error;
            }

            reward = price > 0 ? -price : 10;

            transaction.update(giftRef, { claimedBy: [user.uid] });
            transaction.update(profileRef, { giftsBalance: balance + reward });
        });

        return { ok: true, reward };
    } catch (error) {
        return { ok: false, reason: error.reason ?? describeError(error) };
    }
}

/* ================================================================
   Xat
   ================================================================ */

function watchChat() {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    for (const channel of state.chat.channels) {
        state.chat.messages[channel.id] = [];

        const q = api.query(
            api.collection(db, 'chat', channel.id, 'messages'),
            api.orderBy('at', 'desc'),
            api.limit(50)
        );

        unsubs.push(api.onSnapshot(q, (snap) => {
            state.chat.messages[channel.id] = snap.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .reverse();
            emit();
        }));
    }
}

/** Envia un missatge al canal. Els camps són els que deixen passar les regles. */
export async function sendChatMessage(channelId, text) {
    const user = currentUser();
    const message = String(text ?? '').trim().slice(0, 500);
    if (!user || !message) return { ok: false };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.addDoc(api.collection(db, 'chat', channelId || 'global', 'messages'), {
            fromUid: user.uid,
            fromName: state.me?.name ?? 'Jugador',
            fromIcon: state.me?.icon ?? '',
            text: message,
            at: Date.now(),
            reactions: {}
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/* ================================================================
   Avisos locals (la campana)
   ================================================================ */

/** Afegeix un avís local. El text el construeix qui crida, ja traduït. */
export function notify(text) {
    if (!text) return;
    state.notifications.unshift({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        text: String(text).slice(0, 140),
        at: Date.now(),
        read: false
    });
    state.notifications = state.notifications.slice(0, 20);
    emit();
}

/** Marca tots els avisos com a llegits. */
export function markNotificationsRead() {
    for (const notification of state.notifications) notification.read = true;
    emit();
}

/* ================================================================
   Consultes de conveniència
   ================================================================ */

/** Una persona de l'estat, sigui amic, sol·licitud, suggeriment o jo. */
export function findPerson(uid) {
    if (!uid) return state.me;
    if (isMe(uid)) return state.me;
    return state.friends.find((p) => p.uid === uid)
        ?? state.requests.find((p) => p.uid === uid)
        ?? state.sentRequests.find((p) => p.uid === uid)
        ?? state.suggestions.find((p) => p.uid === uid)
        ?? null;
}
