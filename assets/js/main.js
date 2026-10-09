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
    updateLogo,
    updateOfflineCard
} from './ui.js';
import { hydrateDataLucide } from './icons.js';
import { initOffline, onOfflineChange } from './offline-games.js';
import { currentView, go, startRouter } from './router.js';
import { close, initGate, launch } from './player.js';
import { checkStreak, filters, toggleFavorite } from './state.js';
import { initCacheControl, initLangSelect, initSettings, registerServiceWorker } from './settings.js';
import { startDetection } from './detection.js';
import { initI18n, onLangChange, t } from './i18n.js';
import { initVolume } from './volume.js';

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
    const container = byId('searchContainer');
    const trigger = container?.querySelector('.search-trigger');

    // Es filtra en cada pulsació. Amb 697 jocs és una filtració lineal de
    // poc cost, i un debounce aquí només afegiria complexitat per estalviar
    // unes poques centèsimes de mil·lisegon.
    search?.addEventListener('input', () => {
        filters.search = search.value.trim().toLowerCase();
        applyFilters();
    });

    // El botó obre i tanca la barra. Obre-la el clic i no l'hover: en
    // pantalla tàctil no hi ha hover i allà el botó era mort.
    //
    // El `pointerdown` és el que fa que funcioni el segon clic: en
    // pitjar el botó amb el camp enfocat, el camp perdria l'enfocament,
    // el `blur` de sota llevaria la classe i el clic la tornaria a posar
    // (és a dir, no es tancaria mai).
    trigger?.addEventListener('pointerdown', (event) => event.preventDefault());
    trigger?.addEventListener('click', () => {
        setSearchOpen(!container?.classList.contains('open'));
    });

    // En perdre l'enfocament, la barra es tanca. El filtre es queda,
    // com passava abans: per treure'l hi ha el botó de neteja de la
    // vista de sense resultats.
    search?.addEventListener('blur', () => setSearchOpen(false));
    search?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setSearchOpen(false);
    });

    byId('resetFilters')?.addEventListener('click', resetFilters);
}

/** Obre o tanca la barra de cerca i explica l'estat qui no hi veu. */
function setSearchOpen(open) {
    const container = byId('searchContainer');
    if (!container) return;

    const search = byId('gameSearch');
    const trigger = container.querySelector('.search-trigger');

    container.classList.toggle('open', open);
    trigger?.setAttribute('aria-expanded', String(open));

    if (open) search?.focus();
    else search?.blur();
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
    initVolume();

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
    button.setAttribute('aria-label', on ? t('modal.fullscreenExit') : t('modal.fullscreen'));
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

/**
 * La roda del ratolí ha de desplaçar la llista des de qualsevol punt de
 * la pàgina, no només damunt de la columna de contingut. El contenidor
 * ja ocupa tota l'amplada, però el nav i la barra de categories són
 * elements fixos que el sobrevolen i no són dins seu: la roda que hi cau
 * a sobre no el mouria. Aquí ho arreglem.
 */
function bindWheelForwarding() {
    const container = byId('scrollContainer');
    if (!container) return;

    window.addEventListener('wheel', (event) => {
        if (event.ctrlKey) return; // amb Ctrl la roda fa zoom
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        // Dins del contenidor ja el mou el navegador tot sol.
        if (!target.closest('nav, .category-container')) return;

        // deltaMode 1 són línies (Firefox); la resta, píxels.
        container.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    }, { passive: true });
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

function onCategorySelect(categoryId) {
    filters.category = categoryId;
    setActiveCategory(categoryId);
    applyFilters();
}

/**
 * Quan algú canvia d'idioma, tot el que s'ha dibuixat amb `t()` es
 * torna a dibuixar: les píldores de categoria, la graella —les
 * etiquetes dels botons de favorit es posen en crear cada targeta— i
 * les estadístiques, si hi som.
 *
 * El text estàtic del HTML ja l'ha repassat `applyI18n` abans de
 * cridar-nos, així que aquí només toca el que neix del codi.
 */
function onLanguageChange() {
    renderCategories(onCategorySelect);
    setActiveCategory(filters.category);
    applyFilters();
    if (currentView() === 'stats') renderStats();
}

async function start() {
    // L'idioma abans de res: categories i estadístiques es dibuixen
    // amb `t()`, i corregir-les després seria un parpelleig.
    await initI18n();
    initLangSelect();

    // La ratxa s'ha de comptar un sol cop per sessió, quan arribem.
    checkStreak();

    renderCategories(onCategorySelect);
    // Marca la categoria activa (per defecte, Tots) un cop les píndoles
    // existeixen: si es fa abans, no hi ha cap element on posar-hi la
    // classe i el fons blau no es veu.
    setActiveCategory(filters.category);

    // Les icones estàtiques del nav. Les del grid les demana el mateix
    // render que les crea.
    hydrateDataLucide();
    updateLogo();

    bindSearch();
    bindTheme();
    bindModal();
    bindFavorites();
    bindInfiniteScroll();
    bindWheelForwarding();
    initGate();

    initSettings();
    initCacheControl();
    onLangChange(onLanguageChange);

    // El routing s'arrenca abans de la primera càrrega perquè l'enllaç
    // profund decideixi quina vista s'obre, i `onArrive` mantingui les
    // estadístiques al dia cada cop que hi arribem.
    const initial = startRouter({ onArrive: (id) => (id === 'stats' ? renderStats() : undefined) });

    // L'estat dels jocs offline abans de dibuixar: així una targeta ja
    // baixada surt amb el botó de jugar des del primer moment. Mentre
    // baixa, els canvis arriben per `onOfflineChange`.
    onOfflineChange((url, info) => updateOfflineCard(url, info));
    await initOffline(GAMES);

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

// `start` és asíncron (carrega l'idioma), i un `async` retornat d'un
// listener es menja les promeses sense rebug: d'això `void`.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
} else {
    void start();
}