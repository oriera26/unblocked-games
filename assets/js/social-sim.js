/**
 * social-sim.js · la vida que fingeix el Social.
 *
 * Com que no hi ha backend, la presència dels amics i els rellotges dels
 * torneigs s'han de moure sols o la secció semblaria congelada. Cada
 * `TICK_MS` un amic canvia d'estat i el hub es refresca; si els clics els
 * fan els usuaris, això només omple els buits.
 *
 * El reinici setmanal de la lliga també viu aquí: es mira en arrencar i
 * quan canvia la setmana ISO, la classificació torna a zero.
 */

import { GAME_NAMES, STATUSES, currentWeek, saveState, state } from './social-store.js';
import { refreshFriends } from './social-hub.js';

const TICK_MS = 12000;

let timer = 0;

export function startSimulation() {
    if (timer) return;
    timer = window.setInterval(tick, TICK_MS);
}

function tick() {
    driftPresence();
    saveState();
    refreshFriends();
}

/** Fa que un amic a l'atzar canviï d'estat i, si pot, comenci a jugar. */
function driftPresence() {
    if (!state.friends.length) return;

    const friend = state.friends[Math.floor(Math.random() * state.friends.length)];
    const next = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    friend.status = next;
    friend.activity = next === 'online'
        ? { kind: 'playing', game: GAME_NAMES[Math.floor(Math.random() * GAME_NAMES.length)] }
        : { kind: 'lobby', game: null };
}

/** Si ha canviat la setmana, la lliga torna a començar. */
export function maybeResetWeek() {
    const week = currentWeek();
    if (state.league.week === week) return;

    state.league.week = week;
    state.league.xp = 0;
    state.league.entries.forEach((entry) => { entry.xp = 0; });
    saveState();
}
