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
 *   leagues/{id}        name, icon, ownerUid, goal, createdAt, memberUids,
 *                       members: { uid: { name, photo, icon } }, at
 *   leagues/{id}/seasons/{n}
 *                       scores: { uid: { xp, seconds, newCount, blockCount,
 *                       boost, games, days } }  (vegeu league-score.js)
 *   leagueWinners/{id}_{n}
 *                       leagueId, season, winnerUids, winners, at
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
import {
    seasonWindow, dayKey, applyPlay, normalize, GOAL_MIN
} from './league-score.js';
import { onPlaytimeFlush } from './playtime.js';

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

        leagues: [],            // les meves lligues, amb la temporada en curs
        leagueError: null,      // si les lligues no s'han pogut escoltar
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

    // Els minuts jugats de debò alimenten les lligues (si n'hi ha). El
    // flush de playtime és el pols natural: cada trenta segons de joc.
    onPlaytimeFlush((play) => {
        recordLeaguePlay(play).catch(() => { /* el temps del joc va a part */ });
    });
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
    watchLeagues(user);    watchFeed(user);
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
   Lligues · temporada de 21 dies
   ================================================================

   Una lliga és un grup tancat: qui la crea hi convida amics i tots
   competeixen per l'objectiu d'XP de la temporada (21 dies). La
   puntuació la porta `league-score.js`; aquí només hi ha les lectures
   i les escriptures.

   Als documents, la temporada es guarda com `seasons/{n}` i el resultat
   final com `leagueWinners/{id}_{n}`. La temporada `n` es calcula des de
   `createdAt` (tantes finestres de 21 dies): així no cal cap escriptura
   per fer-les avançar. */

/** Les puntuacions llegides, per clau `id:n` (fora de `state` perquè
    els listeners les van refrescant). */
let leagueScores = {};
/** Els listeners de temporada, per clau `id:n`. */
let leagueSeasonSubs = {};
/** Els guanyadors ja demanats, per clau `id:n`. */
let leagueWinnersAsked = {};
/** Els rètols dels guanyadors, per id de lliga (sobreviuen als refrescos). */
let leagueBanners = {};

function leagueKey(id, n) {
    return `${id}:${n}`;
}

function watchLeagues(user) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    // Les regles només deixen veure les lligues on consto com a membre.
    const q = api.query(
        api.collection(db, 'leagues'),
        api.where('memberUids', 'array-contains', user.uid)
    );

    unsubs.push(api.onSnapshot(q, (snap) => {
        const list = snap.docs.map((doc) => {
            const league = { id: doc.id, ...doc.data() };
            league.memberUids = Array.isArray(league.memberUids) ? league.memberUids : [];
            league.members = league.members ?? {};
            league.goal = Math.max(GOAL_MIN, Math.round(Number(league.goal) || GOAL_MIN));
            league.season = seasonWindow(league.createdAt);
            league.scores = leagueScores[leagueKey(league.id, league.season.n)] ?? {};
            league.winner = leagueBanners[league.id] ?? null;
            return league;
        });

        // La més nova, primer.
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

        state.leagues = list;
        watchLeagueSeasons(list);
        emit();
    }, (error) => {
        state.leagueError = describeError(error);
        emit();
    }));
}

/** Escolta la temporada en curs de cada lliga (i el rètol de l'anterior). */
function watchLeagueSeasons(list) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const alive = new Set(list.map((league) => leagueKey(league.id, league.season.n)));

    for (const key of Object.keys(leagueSeasonSubs)) {
        if (alive.has(key)) continue;
        try { leagueSeasonSubs[key](); } catch { /* ja no hi era */ }
        delete leagueSeasonSubs[key];
        delete leagueScores[key];
    }

    for (const league of list) {
        const n = league.season.n;
        const key = leagueKey(league.id, n);
        if (leagueSeasonSubs[key]) continue;

        leagueSeasonSubs[key] = api.onSnapshot(
            api.doc(db, 'leagues', league.id, 'seasons', String(n)),
            (snap) => {
                leagueScores[key] = snap.exists() ? (snap.data().scores ?? {}) : {};
                const target = state.leagues.find((item) => item.id === league.id && item.season?.n === n);
                if (target) {
                    target.scores = leagueScores[key];
                    emit();
                }
            }
        );

        // El rètol del guanyador de la temporada passada (una sola vegada).
        if (n > 1 && !leagueWinnersAsked[key]) {
            leagueWinnersAsked[key] = true;
            askWinner(league.id, n - 1);
        }
    }
}

/**
 * Demana (o tanca) el resultat d'una temporada acabada.
 *
 * Si el document del guanyador no existeix, el primer membre que passa
 * per aquí el calcula de les puntuacions i el desa; així el rètol queda
 * per a tothom sense necessitat de cap servidor.
 */
async function askWinner(leagueId, season) {
    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    try {
        const ref = api.doc(db, 'leagueWinners', `${leagueId}_${season}`);
        let snap = await api.getDoc(ref);

        if (!snap.exists()) {
            const seasonSnap = await api.getDoc(api.doc(db, 'leagues', leagueId, 'seasons', String(season)));
            if (!seasonSnap.exists()) return;

            const league = state.leagues.find((item) => item.id === leagueId);
            const winners = topThree(seasonSnap.data().scores ?? {}, league?.members ?? {});
            if (!winners.length) return;

            const banner = {
                leagueId,
                season,
                winnerUids: winners.map((row) => row.uid),
                winners,
                at: Date.now()
            };
            await api.setDoc(ref, banner);
            snap = { data: () => banner };
        }

        const data = snap.data() ?? {};
        leagueBanners[leagueId] = {
            season: data.season ?? season,
            winners: data.winners ?? []
        };
        for (const league of state.leagues) {
            if (league.id === leagueId) league.winner = leagueBanners[leagueId];
        }
        emit();
    } catch {
        // El rètol és informatiu: si no es pot llegir ni escriure, no passa res.
    }
}

/** Els tres primers d'un mapa de puntuacions, amb el nom de la lliga. */
function topThree(scores, members) {
    return Object.entries(scores)
        .map(([uid, score]) => ({
            uid,
            name: members[uid]?.name ?? 'Jugador',
            photo: members[uid]?.photo ?? '',
            icon: members[uid]?.icon ?? '',
            xp: Math.round(Number(score?.xp) || 0)
        }))
        .filter((row) => row.xp > 0)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 3);
}

/** L'entrada d'algú al mapa de membres d'una lliga. */
function memberEntry(person) {
    return {
        name: String(person?.name ?? 'Jugador').slice(0, 40),
        photo: String(person?.photo ?? ''),
        icon: String(person?.icon ?? '')
    };
}

function myMemberEntry() {
    return memberEntry(state.me ?? {});
}

/**
 * Les files de la lliga tal com les dibuixa el hub: cada membre amb la
 * seva puntuació de la temporada, de més XP a menys.
 */
export function leagueRows(league) {
    return league.memberUids
        .map((uid) => {
            const member = league.members[uid] ?? {};
            const score = normalize(league.scores?.[uid] ?? null);
            return {
                uid,
                name: member.name ?? 'Jugador',
                photo: member.photo ?? '',
                icon: member.icon ?? '',
                score,
                xp: score.xp,
                me: uid === state.me?.uid
            };
        })
        .sort((a, b) => b.xp - a.xp);
}

/**
 * Crea una lliga amb un objectiu i, si vols, amb amics a dins.
 *
 * @param {{ name: string, icon?: string, goal?: number, friendUids?: string[] }} options
 */
export async function createLeague({ name, icon = '', goal = GOAL_MIN, friendUids = [] }) {
    const user = currentUser();
    if (!user) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const cleanName = String(name ?? '').trim().slice(0, 40);
    if (!cleanName) return { ok: false, reason: 'name' };

    const memberUids = [user.uid];
    const members = { [user.uid]: myMemberEntry() };

    for (const friend of state.friends) {
        if (!friendUids.includes(friend.uid)) continue;
        memberUids.push(friend.uid);
        members[friend.uid] = memberEntry(friend);
    }

    try {
        await api.addDoc(api.collection(db, 'leagues'), {
            name: cleanName,
            icon: String(icon ?? '').slice(0, 8),
            ownerUid: user.uid,
            goal: Math.max(GOAL_MIN, Math.round(Number(goal) || GOAL_MIN)),
            createdAt: Date.now(),
            memberUids,
            members,
            at: Date.now()
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Convida amics a una lliga de la qual ets l'amo. */
export async function addLeagueMembers(leagueId, friendUids = []) {
    const user = currentUser();
    const league = state.leagues.find((item) => item.id === leagueId);
    if (!user || !league) return { ok: false, reason: 'offline' };
    if (league.ownerUid !== user.uid) return { ok: false, reason: 'owner' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const uids = [];
    const patch = {};
    for (const friend of state.friends) {
        if (!friendUids.includes(friend.uid)) continue;
        if (league.memberUids.includes(friend.uid)) continue;
        uids.push(friend.uid);
        patch[`members.${friend.uid}`] = memberEntry(friend);
    }
    if (!uids.length) return { ok: false, reason: 'empty' };

    try {
        patch.memberUids = api.arrayUnion(...uids);
        patch.at = Date.now();
        await api.updateDoc(api.doc(db, 'leagues', leagueId), patch);
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Toca fora un membre (només l'amo). */
export async function removeLeagueMember(leagueId, uid) {
    const user = currentUser();
    const league = state.leagues.find((item) => item.id === leagueId);
    if (!user || !league) return { ok: false, reason: 'offline' };
    if (league.ownerUid !== user.uid || uid === user.uid) return { ok: false, reason: 'owner' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.updateDoc(api.doc(db, 'leagues', leagueId), {
            memberUids: api.arrayRemove(uid),
            [`members.${uid}`]: api.deleteField(),
            at: Date.now()
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/**
 * Marxa de la lliga. Si l'amo se'n va, el relleu passa al primer membre
 * que hi quedi; si no hi queda ningú, la lliga s'elimina.
 */
export async function leaveLeague(leagueId) {
    const user = currentUser();
    const league = state.leagues.find((item) => item.id === leagueId);
    if (!user || !league) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    const rest = league.memberUids.filter((uid) => uid !== user.uid);

    try {
        const ref = api.doc(db, 'leagues', leagueId);
        if (!rest.length) {
            await api.deleteDoc(ref);
            return { ok: true, closed: true };
        }

        const patch = {
            memberUids: api.arrayRemove(user.uid),
            [`members.${user.uid}`]: api.deleteField(),
            at: Date.now()
        };
        if (league.ownerUid === user.uid) patch.ownerUid = rest[0];

        await api.updateDoc(ref, patch);
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/** Puja (o baixa, mai per sota del terra) l'objectiu de la temporada. */
export async function setLeagueGoal(leagueId, goal) {
    const user = currentUser();
    const league = state.leagues.find((item) => item.id === leagueId);
    if (!user || !league) return { ok: false, reason: 'offline' };

    const connection = fs();
    if (!connection) return { ok: false, reason: 'offline' };
    const { api, db } = connection;

    try {
        await api.updateDoc(api.doc(db, 'leagues', leagueId), {
            goal: Math.max(GOAL_MIN, Math.round(Number(goal) || GOAL_MIN)),
            at: Date.now()
        });
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: describeError(error) };
    }
}

/**
 * Passa els segons que acaben de comptar `playtime` pel motor de
 * puntuació, a cada lliga meva.
 *
 * @param {{ game: string, seconds: number, sessionSeconds: number }} play
 */
export async function recordLeaguePlay({ game, seconds, sessionSeconds }) {
    const user = currentUser();
    const whole = Math.floor(Number(seconds) || 0);
    if (!user || whole <= 0 || !state.leagues.length) return;

    const connection = fs();
    if (!connection) return;
    const { api, db } = connection;

    const day = dayKey();
    const streak = Math.max(0, Number(stats.streak) || 0);

    let changed = false;

    for (const league of state.leagues) {
        const n = league.season?.n;
        if (!n) continue;

        const key = leagueKey(league.id, n);
        const before = leagueScores[key]?.[user.uid] ?? null;
        const { state: next } = applyPlay(before, {
            game,
            seconds: whole,
            sessionSeconds,
            day,
            streak
        });

        // Actualització optimista: l'estat és acumulatiu i es desa sencer,
        // així que si una escriptura falla (sense xarxa), la del proper
        // flush ja hi porta tot el que faltava.
        leagueScores[key] = { ...(leagueScores[key] ?? {}), [user.uid]: next };
        league.scores = leagueScores[key];
        changed = true;

        try {
            await api.setDoc(
                api.doc(db, 'leagues', league.id, 'seasons', String(n)),
                { scores: { [user.uid]: next }, at: Date.now() },
                { merge: true }
            );
        } catch {
            // Sense xarxa o sense permís: es tornarà a provar al proper flush.
        }
    }

    if (changed) emit();
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
