/**
 * main.js · punt d'entrada.
 *
 * Tot el que fa és enganxar les peces: pregunta a l'usuari què vol
 * veure, li passa les dades a la interfície i connecta els esdeveniments.
 * La lògica viu als mòduls; aquí no hi ha cap regla de negoci.
 */

import { CATEGORY_ALL } from './config.js';
import { GAMES } from './gameList.js';
import {
    applyTheme,
    bindGrid,
    filterGames,
    hasMoreGames,
    loadMore,
    moveActivePill,
    renderCategories,
    renderStats,
    resetGrid,
    setActiveCategory,
    setVisibleGames,
    updateLogo
} from './ui.js';
import { hydrateDataLucide } from './icons.js';
import { currentView, go, startRouter } from './router.js';
import { close, launch } from './player.js';
import { checkStreak, filters, toggleFavorite } from './state.js';
import { initCacheControl, initSettings, registerServiceWorker } from './settings.js';
import { startDetection } from './detection.js';

/** Dins d'Electron no hi ha pestanya: la detecció i el SW no hi tenen sentit. */
const isDesktop = Boolean(window.ulaDesktop);

function byId(id) {
    return document.getElementById(id);
}

/* ================================================================
   Aplicar els filtres
   ================================================================ */

/**
 * Recalcula la llista visible i la dibuixa.
 *
 * Canviar de vista des d'aquí seria un error: l'usuari pot estar
 * escrivint a la barra de cerca des de la pestanya d'estadístiques i
 * el mouríem a l'arcade sota el dit. Així que la llista es calcula
 * sempre, però la vista només canvia si ja érem a l'arcade o al 404.
 */
function applyFilters() {
    const visible = filterGames(GAMES);
    setVisibleGames(visible);

    const here = currentView();
    const inArcade = here === 'arcade' || here === '404';

    if (visible.length === 0) {
        if (inArcade) go('404', { animate: false });
        return;
    }

    if (!inArcade) return; // les dades queden llestes per quan torni

    go('arcade', { animate: false });
    resetGrid();
    loadMore();
}

function resetFilters() {
    const search = byId('gameSearch');
    if (search) search.value = '';

    filters.search = '';
    filters.category = CATEGORY_ALL;

    setActiveCategory(CATEGORY_ALL);
    applyFilters();
}

/* ================================================================
   Arrencada
   ================================================================ */

function bindSearch() {
    const search = byId('gameSearch');

    // Es filtra en cada pulsació. Amb 697 jocs és una filtració lineal de
    // poc cost, i un debounce aquí només afegiria complexitat per estalviar
    // unes poques centèsimes de mil·lisegon.
    search?.addEventListener('input', () => {
        filters.search = search.value.trim().toLowerCase();
        applyFilters();
    });

    byId('resetFilters')?.addEventListener('click', resetFilters);
}

function bindTheme() {
    const button = byId('themeBtn');

    // Partim del que diu el cos: el tema inicial és `dark-theme` al
    // markup, i el que decideix l'usuari ha de guanyar.
    let dark = document.body.classList.contains('dark-theme');

    button?.addEventListener('click', () => {
        dark = !dark;
        applyTheme(dark);
    });
}

function bindModal() {
    byId('closeModal')?.addEventListener('click', close);
    byId('fullscreenModal')?.addEventListener('click', toggleFullscreen);

    // La icona i l'etiqueta del botó han de seguir el que fa el navegador:
    // Esc surt de pantalla completa sense passar per aquest codi.
    document.addEventListener('fullscreenchange', syncFullscreenButton);

    // Tancar amb Escape és el que tothom espera d'un modal. Abans només
    // es tancava amb el botó o clicant fora, i cap dels dos estava lligat.
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        // En pantalla completa l'Esc ha de sortir-ne, no tancar el joc:
        // sinó qui vulgui només baixar la finestra es trobaria el joc
        // tancat a la primera pulsació.
        if (document.fullscreenElement) return;
        if (byId('gameModal')?.classList.contains('active')) {
            close();
            byId('themeBtn')?.focus();
        }
    });
}

/**
 * Posa el modal del joc a pantalla completa, o en surt.
 *
 * Es demana al contenidor i no a l'iframe perquè, si es posa a pantalla
 * completa només el joc, desapareixen els botons de dalt i l'única manera
 * de sortir és l'Esc del navegador (que en un joc amb Esc propi es
 * baralla amb aquest).
 */
async function toggleFullscreen() {
    const modal = byId('gameModal');
    if (!modal) return;

    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await modal.requestFullscreen();
    } catch {
        // El navegador ho pot rebutjar (permís denegat, finestra embebuda,
        // suport antic): el botó es queda on era i no passa res més.
    }
}

/** Pinta l'estat real de pantalla completa al botó. */
function syncFullscreenButton() {
    const button = byId('fullscreenModal');
    if (!button) return;

    const on = document.fullscreenElement === byId('gameModal');
    button.classList.toggle('is-fullscreen', on);
    button.setAttribute('aria-label', on ? 'Surt de pantalla completa' : 'Pantalla completa');
}

/** Carrega més targetes quan l'usuari arriba al final de la llista. */
function bindInfiniteScroll() {
    const trigger = byId('loadMoreTrigger');
    const container = byId('scrollContainer');
    if (!trigger) return;

    const observer = new IntersectionObserver(
        (entries) => {
            if (entries[0]?.isIntersecting && hasMoreGames()) loadMore();
        },
        // `rootMargin` comença a carregar abans que l'usuari arribi al
        // final, que és el que evita que es vegi el buit.
        { root: container, threshold: 0.1, rootMargin: '400px 0px' }
    );

    observer.observe(trigger);
}

function bindFavorites() {
    bindGrid({
        onLaunch: launch,
        onFavorite: (url) => {
            toggleFavorite(url);
            // Es torna a filtrar perquè el canvi de favorit reordena la
            // llista i pot moure la targeta d'un bloc a un altre.
            applyFilters();
        }
    });
}

function start() {
    // La ratxa s'ha de comptar un sol cop per sessió, quan arribem.
    checkStreak();

    renderCategories((categoryId) => {
        filters.category = categoryId;
        setActiveCategory(categoryId);
        applyFilters();
    });

    // Les icones estàtiques del nav. Les del grid les demana el mateix
    // render que les crea.
    hydrateDataLucide();
    updateLogo();

    bindSearch();
    bindTheme();
    bindModal();
    bindFavorites();
    bindInfiniteScroll();

    initSettings();
    initCacheControl();

    // El routing s'arrenca abans de la primera càrrega perquè l'enllaç
    // profund decideixi quina vista s'obre, i `onArrive` mantingui les
    // estadístiques al dia cada cop que hi arribem.
    const initial = startRouter({ onArrive: (id) => (id === 'stats' ? renderStats() : undefined) });

    applyFilters();

    // Si l'URL demanava les estadístiques i no hi ha jocs visibles,
    // `applyFilters` no hi arriba, així que les pintem igual.
    if (initial === 'stats') {
        go('stats', { animate: false });
        renderStats();
    }

    // Un cop maquetat, la píldora activa té mides reals i es pot col·locar.
    requestAnimationFrame(moveActivePill);
    window.addEventListener('resize', moveActivePill);

    registerServiceWorker(isDesktop);
    if (!isDesktop) startDetection();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}