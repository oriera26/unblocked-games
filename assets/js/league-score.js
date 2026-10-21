/**
 * league-score.js · el motor de puntuació de les lligues.
 *
 * Una lliga és un grup tancat amb una temporada de 21 dies i un objectiu
 * d'XP. Aquí hi ha les regles de com es guanyen aquests punts; és un
 * mòdul pur (no toca Firestore ni el DOM) perquè `social-store.js` el
 * pugui engegar des del flush de `playtime.js` i les proves puguin
 * comprovar els números sense navegador.
 *
 * Què suma XP, i en quin ordre:
 *
 *   ⏱️  Temps       1 XP per minut jugat de debò.
 *   🆕  Joc nou     +40 XP la primera vegada que un joc arriba a 5 min.
 *   🔥  Ratxa       +10 / +20 / +30 per cada bloc de 15 min seguits
 *                   dins la mateixa sessió (el tercer i els següents +30).
 *   🎯  Dies        ×(1 + 0,05 × ratxa de dies) sobre tot el que ha
 *                   sumat el dia.
 *   ⚡  Minuts      ×1,25 a partir de 30 min de dia; ×1,5 a partir de
 *                   60; ×2 a partir de 120.
 *
 * Els dos multiplicadors es combinen sobre la base del dia i el
 * resultat mai no passa de ×4. Com que l'⚡ depèn del total del dia, el
 * multiplicador s'aplica retroactivament: quan el dia creua un llindar,
 * la pujada es recalcula damunt del que ja s'hi havia sumat.
 *
 * L'estat d'un membre dins la temporada és lleuger, perquè a Firestore
 * hi va a `scores.{uid}`: els segons i la base del dia, quants jocs
 * nous, quants blocs de ratxa, la bonificació acumulada i el detall
 * per dia (que és el que ensenya el desplegable de la targeta).
 */

/* --- Les regles, en un sol lloc i amb nom -------------------------- */

/** Dies que dura una temporada. */
export const SEASON_DAYS = 21;

/** Objectiu mínim d'una lliga (XP de la temporada). */
export const GOAL_MIN = 25000;

/** Objectius que ofereix el formulari de crear lliga. */
export const GOAL_STEPS = [25000, 50000, 100000];

/** Un XP per minut de joc. */
export const XP_PER_MINUTE = 1;

/** El cofre del primer cop: +40 XP quan un joc arriba a 5 minuts. */
export const NEW_GAME_XP = 40;
export const NEW_GAME_SECONDS = 5 * 60;

/** Blocs de 15 min seguits: +10, +20 i +30 del tercer en endavant. */
export const BLOCK_SECONDS = 15 * 60;
export const BLOCK_XP = [10, 20, 30];

/** La ratxa de dies suma un 5 % per dia. */
export const STREAK_STEP = 0.05;

/** Llindars de minuts del dia i el seu multiplicador. */
export const DAY_STEPS = [
    { minutes: 30, mult: 1.25 },
    { minutes: 60, mult: 1.5 },
    { minutes: 120, mult: 2 }
];

/** Cap multiplicador combinat no passa d'aquí. */
export const MULT_CAP = 4;

/* --- La temporada -------------------------------------------------- */

const DAY_MS = 86400000;
const SEASON_MS = SEASON_DAYS * DAY_MS;

/**
 * Quina temporada toca i quan comença i acaba.
 *
 * Les temporades es compten des de la creació de la lliga, en blocs de
 * 21 dies. Així no cal cap escriptura per fer-les avançar: qui mira la
 * lliga calcula la temporada en curs i prou.
 *
 * @param {number} createdAt  quan es va crear la lliga, en ms
 * @param {number} [now]
 * @returns {{ n: number, start: number, end: number }}
 */
export function seasonWindow(createdAt, now = Date.now()) {
    const base = Number(createdAt) || 0;
    const n = Math.floor(Math.max(0, now - base) / SEASON_MS) + 1;
    return {
        n,
        start: base + (n - 1) * SEASON_MS,
        end: base + n * SEASON_MS
    };
}

/** La clau del dia (local) amb format 2026-10-15. */
export function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/* --- L'estat d'un membre dins la temporada ------------------------- */

/** Un full de puntuació buit. */
export function newScore() {
    return {
        xp: 0,           // el total de la temporada
        seconds: 0,      // segons de joc comptats
        newCount: 0,     // jocs descoberts (els que han donat els +40)
        blockCount: 0,   // blocs de 15 min seguits
        boost: 0,        // XP que han afegit els multiplicadors
        games: {},       // { joc: segons } per saber quins són nous
        days: {}         // { 'YYYY-MM-DD': { seconds, base, mult, boost } }
    };
}

/** El multiplicador dels minuts del dia. */
export function dayMultiplier(seconds) {
    const minutes = seconds / 60;
    let mult = 1;
    for (const step of DAY_STEPS) {
        if (minutes >= step.minutes) mult = step.mult;
    }
    return mult;
}

/**
 * Passa un tros de partida pel motor.
 *
 * @param {object} score    l'estat del membre (no es toca: se'n torna un de nou)
 * @param {object} update
 * @param {string} update.game            nom del joc, tal com surt a gameList
 * @param {number} update.seconds         segons comptats en aquest tros
 * @param {number} update.sessionSeconds  segons de la sessió sencera (des que s'ha obert el joc)
 * @param {string} update.day             la clau del dia (vegeu `dayKey`)
 * @param {number} update.streak          la ratxa de dies de l'usuari
 * @returns {{ state: object, gain: object }}
 */
export function applyPlay(score, update) {
    const state = normalize(score);
    const ds = Math.max(0, Math.floor(Number(update.seconds) || 0));

    // ⏱️ Només els minuts sencers que encara no s'havien comptat.
    const timeBefore = Math.floor(state.seconds / 60);
    state.seconds += ds;
    const timeXp = (Math.floor(state.seconds / 60) - timeBefore) * XP_PER_MINUTE;

    // 🆕 El primer cop que aquest joc arriba als 5 minuts.
    const game = String(update.game ?? '');
    const gameBefore = state.games[game] ?? 0;
    state.games[game] = gameBefore + ds;
    const isNew = gameBefore < NEW_GAME_SECONDS && state.games[game] >= NEW_GAME_SECONDS;
    const newXp = isNew ? NEW_GAME_XP : 0;
    if (isNew) state.newCount += 1;

    // 🔥 Els blocs de 15 min seguits que s'han creuat des de l'últim cop.
    const session = Math.max(0, Number(update.sessionSeconds) || 0);
    const blocksBefore = Math.floor(Math.max(0, session - ds) / BLOCK_SECONDS);
    const blocksAfter = Math.floor(session / BLOCK_SECONDS);
    let blockXp = 0;
    for (let i = blocksBefore; i < blocksAfter; i++) {
        blockXp += BLOCK_XP[Math.min(i, BLOCK_XP.length - 1)];
        state.blockCount += 1;
    }

    // El que ha sumat aquest tros abans de multiplicadors.
    const base = timeXp + newXp + blockXp;

    // El dia: la base s'acumula sense mulplicar i el multiplicador
    // combinat es recalcula damunt de tot el dia.
    const key = String(update.day ?? dayKey());
    const day = state.days[key] ?? { seconds: 0, base: 0, mult: 1, boost: 0 };
    day.seconds += ds;
    day.base += base;

    const streakMult = 1 + STREAK_STEP * Math.max(0, Number(update.streak) || 0);
    const mult = Math.min(MULT_CAP, streakMult * dayMultiplier(day.seconds));

    const wanted = Math.round(day.base * (mult - 1));
    const extra = wanted - day.boost;
    day.boost = wanted;
    day.mult = mult;
    state.days[key] = day;

    const gain = base + extra;
    state.xp += gain;
    state.boost += extra;

    return {
        state,
        gain: {
            xp: gain,
            base,
            boost: extra,
            timeXp,
            newXp,
            blockXp,
            blocks: blocksAfter - blocksBefore,
            newGame: isNew,
            mult
        }
    };
}

/**
 * Decideix quants segons de les estadístiques locals falten a una
 * temporada de lliga.
 *
 * La primera temporada no té una base anterior: s'hi pot portar tot el
 * temps local que la lliga encara no té. A partir de la segona, el que
 * compta és el temps jugat des que es va veure néixer la temporada
 * (`baseline`), no l'historial sencer, que ja va comptar abans.
 *
 * @param {{ season: number, localSeconds: number, scoreSeconds: number, baseline?: number }} input
 * @returns {{ delta: number, needsBaseline: boolean }}
 */
export function planStatsImport({ season, localSeconds, scoreSeconds, baseline }) {
    const local = Math.max(0, Math.floor(Number(localSeconds) || 0));
    const scored = Math.max(0, Math.floor(Number(scoreSeconds) || 0));

    if (Number(season) === 1) {
        return { delta: Math.max(0, local - scored), needsBaseline: false };
    }

    if (baseline === undefined || baseline === null) {
        return { delta: 0, needsBaseline: true };
    }

    const played = Math.max(0, local - Math.floor(Number(baseline) || 0));
    return { delta: Math.max(0, played - scored), needsBaseline: false };
}

/**
 * Importa un bloc de minuts que ve de fora de la lliga (les
 * estadístiques locals, quan algú demana de sincronitzar-les).
 *
 * No passa pels multiplicadors de dia ni de ratxa perquè no hi ha el
 * detall de quan es va jugar: només compta els minuts sencers i els
 * jocs que arriben als cinc minuts per primera vegada. Els dies no es
 * toquen, així que la sincronització no infla el multiplicador del dia
 * d'avui.
 *
 * @param {object} score  el full del membre
 * @param {{ seconds?: number, games?: Record<string, number> }} update
 *   `games` és el temps acumulat per joc de les estadístiques locals.
 */
export function importPlaytime(score, update) {
    const state = normalize(score);
    const ds = Math.max(0, Math.floor(Number(update?.seconds) || 0));

    let timeXp = 0;
    if (ds > 0) {
        const before = Math.floor(state.seconds / 60);
        state.seconds += ds;
        timeXp = Math.floor(state.seconds / 60) - before;
    }

    let newXp = 0;
    const games = update?.games && typeof update.games === 'object' ? update.games : {};
    for (const [game, value] of Object.entries(games)) {
        const played = Math.max(0, Math.floor(Number(value) || 0));
        if (played < NEW_GAME_SECONDS) continue;
        if ((state.games[game] ?? 0) >= NEW_GAME_SECONDS) continue;

        state.games[game] = Math.max(state.games[game] ?? 0, played);
        state.newCount += 1;
        newXp += NEW_GAME_XP;
    }

    const total = timeXp + newXp;
    state.xp += total;

    return {
        state,
        gain: {
            xp: total,
            base: total,
            boost: 0,
            timeXp,
            newXp,
            blockXp: 0,
            blocks: 0,
            newGame: newXp > 0,
            mult: 1
        }
    };
}

/**
 * Un full guardat que es torna a llegir (de Firestore o de memòria) ha
 * de quedar amb la forma de `newScore()`: els camps que faltin, amb el
 * valor de fàbrica.
 */
export function normalize(score) {
    const stored = score && typeof score === 'object' ? score : {};
    const state = newScore();

    state.xp = Math.max(0, Math.round(Number(stored.xp) || 0));
    state.seconds = Math.max(0, Math.floor(Number(stored.seconds) || 0));
    state.newCount = Math.max(0, Math.floor(Number(stored.newCount) || 0));
    state.blockCount = Math.max(0, Math.floor(Number(stored.blockCount) || 0));
    state.boost = Math.max(0, Math.round(Number(stored.boost) || 0));

    if (stored.games && typeof stored.games === 'object') {
        for (const [game, seconds] of Object.entries(stored.games)) {
            state.games[game] = Math.max(0, Math.floor(Number(seconds) || 0));
        }
    }

    if (stored.days && typeof stored.days === 'object') {
        for (const [key, day] of Object.entries(stored.days)) {
            if (!day || typeof day !== 'object') continue;
            state.days[key] = {
                seconds: Math.max(0, Math.floor(Number(day.seconds) || 0)),
                base: Math.max(0, Math.round(Number(day.base) || 0)),
                mult: Math.max(1, Number(day.mult) || 1),
                boost: Math.max(0, Math.round(Number(day.boost) || 0))
            };
        }
    }

    return state;
}

/**
 * El desplegable de la targeta: d'on surten tots els punts del membre.
 *
 * @param {object} score
 * @returns {{ minutes: number, timeXp: number, newCount: number, newXp: number,
 *            blockCount: number, blockXp: number, boost: number, xp: number }}
 */
export function breakdown(score) {
    const state = normalize(score);
    const minutes = Math.floor(state.seconds / 60);

    // La part de temps i de ratxa es reconstrueix de les regles: el XP
    // total menys les bonificacions i els multiplicadors.
    const timeXp = minutes * XP_PER_MINUTE;
    const newXp = state.newCount * NEW_GAME_XP;
    const blockXp = Math.max(0, state.xp - timeXp - newXp - state.boost);

    return {
        minutes,
        timeXp,
        newCount: state.newCount,
        newXp,
        blockCount: state.blockCount,
        blockXp,
        boost: state.boost,
        xp: state.xp
    };
}
