/**
 * social-store.js · dades i persistència de la secció Social.
 *
 * Aquesta és l'única capa que sap com es guarda l'estat social. Avui viu
 * a `localStorage` (clau `ulaSocial`) amb dades de demostració, perquè el
 * projecte és al pla gratuït de Firebase i no hi ha cap servidor social
 * en temps real. El dia que n'hi hagi, es canvia aquest fitxer i la resta
 * de mòduls del Social no se n'han d'assabentar.
 *
 * El que hi ha aquí és estat: no dibuixa res ni tradueix res. Els noms,
 * els rècords i els missatges de xat són contingut (de demostració), no
 * interfície, i per tant no passen per `t()`.
 */

import { STORAGE_KEYS } from './config.js';

/* ================================================================
   Dades de demostració
   ================================================================ */

const PEOPLE = [
    { id: 'p1', name: 'Nil', icon: '🦊' },
    { id: 'p2', name: 'Lia', icon: '🦄' },
    { id: 'p3', name: 'Marc', icon: '🐺' },
    { id: 'p4', name: 'Aina', icon: '🦊' },
    { id: 'p5', name: 'Ona', icon: '🐯' },
    { id: 'p6', name: 'Pau', icon: '🐧' },
    { id: 'p7', name: 'Jana', icon: '🐙' },
    { id: 'p8', name: 'Arnau', icon: '🦅' },
    { id: 'p9', name: 'Biel', icon: '🐉' },
    { id: 'p10', name: 'Rita', icon: '🐨' },
    { id: 'p11', name: 'Sergi', icon: '🐸' },
    { id: 'p12', name: 'Neus', icon: '🦉' }
];

export const GAME_NAMES = ['2048', 'Slope', 'Tetris', 'Basketball Stars', 'Retro Bowl', 'Moto X3M'];

export const STATUSES = ['online', 'online', 'idle', 'dnd', 'offline'];

/** Les respostes amb què el xat fingeix que algú contesta. */
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

/** L'estat inicial, amb dades de demostració coherents entre seccions. */
function seed() {
    const now = Date.now();

    const friends = PEOPLE.slice(0, 6).map((person, index) => ({
        id: person.id,
        name: person.name,
        icon: person.icon,
        status: STATUSES[index % STATUSES.length],
        activity: index % 3 === 0
            ? { kind: 'playing', game: GAME_NAMES[index % GAME_NAMES.length] }
            : { kind: 'lobby', game: null },
        pinned: index < 2,
        wins: 8 + index * 3,
        losses: 2 + index,
        level: 10 + index * 4,
        record: { game: GAME_NAMES[index % GAME_NAMES.length], score: 2048 * (index + 1) }
    }));

    return {
        me: { id: 'me', icon: '😎', name: 'Tu', level: 12, points: 4820, streak: 7 },
        friends,
        requests: PEOPLE.slice(6, 8).map((person) => ({ id: person.id, name: person.name, icon: person.icon })),
        suggestions: PEOPLE.slice(8, 12).map((person) => ({ id: person.id, name: person.name, icon: person.icon })),
        notifications: [],
        league: {
            division: 'Or',
            week: currentWeek(),
            xp: 1240,
            xpTarget: 2000,
            entries: [
                { id: 'p8', name: 'Arnau', icon: '🦅', xp: 3120 },
                { id: 'p5', name: 'Ona', icon: '🐯', xp: 2210 },
                { id: 'p3', name: 'Marc', icon: '🐺', xp: 1980 },
                { id: 'p1', name: 'Nil', icon: '🦊', xp: 1540 },
                { id: 'me', name: 'me', icon: '😎', xp: 1240 },
                { id: 'p2', name: 'Lia', icon: '🦄', xp: 1120 },
                { id: 'p6', name: 'Pau', icon: '🐧', xp: 980 },
                { id: 'p4', name: 'Aina', icon: '🦊', xp: 640 },
                { id: 'p7', name: 'Jana', icon: '🐙', xp: 410 }
            ]
        },
        duels: [
            { id: 'p3', name: 'Marc', icon: '🐺', wins: 7, losses: 4 },
            { id: 'p5', name: 'Ona', icon: '🐯', wins: 5, losses: 5 },
            { id: 'p2', name: 'Lia', icon: '🦄', wins: 3, losses: 6 }
        ],
        tournaments: [
            {
                id: 't1',
                name: 'Copa 24 h',
                endsAt: now + 5.5 * 3600e3,
                joined: true,
                bracket: [
                    ['Tu vs Pau', 'Ona vs Marc'],
                    ['Tu vs Ona']
                ]
            }
        ],
        community: { goal: 50000, done: 31400 },
        titles: [
            { label: 'El Viciat', rare: true },
            { label: '7 dies seguits', rare: false },
            { label: 'Rei dels duels', rare: true },
            { label: 'Matinador', rare: false }
        ],
        feed: [
            { id: 'f1', actor: 'Lia', icon: '🦄', game: '2048', score: 4096, at: now - 300e3, reactions: { '🔥': 3, '👏': 1 } },
            { id: 'f2', actor: 'Marc', icon: '🐺', game: 'Slope', at: now - 1200e3, reactions: { '😮': 2 } },
            { id: 'f3', actor: 'Ona', icon: '🐯', game: 'Tetris', at: now - 3600e3, reactions: {} },
            { id: 'f4', actor: 'Pau', icon: '🐧', game: 'Copa 24 h', at: now - 7200e3, reactions: { '🔥': 1 } }
        ],
        gifts: [
            { id: 'g1', label: 'Moneda', icon: '🪙', price: 0, claimed: false },
            { id: 'g2', label: 'Estrella', icon: '⭐', price: 0, claimed: false },
            { id: 'g3', label: 'Trofeu', icon: '🏆', price: 20, claimed: false },
            { id: 'g4', label: 'Corona', icon: '👑', price: 50, claimed: false }
        ],
        giftsBalance: 120,
        chat: {
            active: 'global',
            channels: [
                { id: 'global', name: 'Global', kind: 'global' },
                { id: 'grp-colla', name: 'Colla del divendres', kind: 'group' },
                { id: 'dm-nil', name: 'Nil', kind: 'dm' },
                { id: 'dm-lia', name: 'Lia', kind: 'dm' }
            ],
            messages: {},
            unread: { 'grp-colla': 2, 'dm-nil': 1 }
        },
        ui: { showNotifs: false, search: '' }
    };
}

/** Omple els missatges de demostració de cada canal si no n'hi ha cap. */
function ensureChat(state) {
    state.chat.messages ??= {};
    if (Object.keys(state.chat.messages).length > 0) return state;

    const now = Date.now();
    state.chat.messages = {
        global: [
            makeMessage('Lia', '🦄', 'Algú per un 2048? 🙌', now - 18 * 60e3, { '👍': 2 }),
            makeMessage('Marc', '🐺', 'Jo vinc! però aviso: faig rècords 😎', now - 16 * 60e3),
            makeMessage('Pau', '🐧', 'GG a tots 🔥', now - 12 * 60e3, { '🔥': 3 })
        ],
        'grp-colla': [
            makeMessage('Nil', '🦊', "Diumenge torneig, qui s'hi apunta?", now - 40 * 60e3),
            makeMessage('Aina', '🦊', 'Compto amb tu! 🔥', now - 36 * 60e3)
        ]
    };
    return state;
}

/* ================================================================
   Persistència
   ================================================================ */

/**
 * Fusió tolerant entre l'estat desat i el nou.
 *
 * Si s'afegeix una secció nova al `seed()`, un estat vell no la tindrà:
 * cal que els camps que falten s'omplin amb el valor de demostració i
 * que els que hi són es respectin.
 */
function merge(base, saved) {
    if (Array.isArray(base) || Array.isArray(saved)) {
        return Array.isArray(saved) ? saved : base;
    }
    if (base && typeof base === 'object' && saved && typeof saved === 'object') {
        const out = {};
        for (const key of new Set([...Object.keys(base), ...Object.keys(saved)])) {
            out[key] = key in saved ? merge(base[key], saved[key]) : base[key];
        }
        return out;
    }
    return saved === undefined ? base : saved;
}

function readState() {
    let raw = null;
    try {
        raw = localStorage.getItem(STORAGE_KEYS.social);
    } catch {
        raw = null;
    }

    if (!raw) return ensureChat(seed());

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return ensureChat(seed());
        return ensureChat(merge(seed(), parsed));
    } catch {
        // Un valor corrupte no ha de deixar la secció en blanc.
        return ensureChat(seed());
    }
}

/**
 * L'estat viu de la secció.
 *
 * S'exporta com a objecte perquè els mòduls de la interfície el mutin
 * directament; després cal cridar `saveState()`. No se li reassigna mai
 * el binding, només les seves propietats.
 */
export const state = readState();

export function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.social, JSON.stringify(state));
    } catch {
        // Sense desament, la sessió continua en memòria.
    }
}

/* ================================================================
   Consultes
   ================================================================ */

/** El nom amb què el xat i la lliga anomenen el jugador de casa. */
export function myName() {
    return state.me.name;
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
}
