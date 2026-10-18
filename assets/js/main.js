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
    retryCovers,
    setActiveCategory,
    setVisibleGames,
    updateLogo,
    updateOfflineCard,
    watchLogoLoad
} from './ui.js';
import { hydrateDataLucide } from './icons.js';
import { initAuth } from './auth.js';
import { initCloud } from './cloud.js';
import { initCloudUi } from './cloud-ui.js';
import { initOffline, onOfflineChange } from './offline-games.js';
import { currentView, go, startRouter } from './router.js';
import { close, initGate, isGameOpen, launch } from './player.js';
import { checkStreak, filters, resetProgress, toggleFavorite } from './state.js';
import { initCacheControl, initLangSelect, initProgressReset, initSettings, registerServiceWorker } from './settings.js';
import { startDetection } from './detection.js';
import { initI18n, onLangChange, t } from './i18n.js';
import { initPlayerMenu } from './volume.js';

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
    syncSearchShift();
}

/* ================================================================
   Arrencada
   ================================================================ */

function bindSearch() {
    const search = byId('gameSearch');
    const container = byId('searchContainer');
    const trigger = container?.querySelector('.search-trigger');

    // Es filtra amb un debounce curt. Amb 1.866 jocs, fer la filtració a
    // cada pulsació treballa el fil principal per cada tecla i repinta la
    // graella; esperar 120 ms no es nota i estalvia molts repintats.
    let searchTimer = 0;
    search?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            filters.search = search.value.trim().toLowerCase();
            applyFilters();
        }, 120);
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

/** Punt d'entrada per refrescar el desplaçament del segment del nav;
    l'assigna `bindSearchShift()` quan el nav hi és. */
let syncSearchShift = () => {};

/* Quan la cerca s'eixampla (hover, focus, `.open` o text viu), el
   segment Jocs/Estadístiques/Social s'aparta per no tocar-s'hi i quedar
   centrat entre el logo i la barra. El moviment el fa el CSS amb una
   `cubic-bezier`; aquí només es pren la mesura, que viatja a
   `--nav-shift`. */
function bindSearchShift() {
    const nav = document.querySelector('nav');
    const center = nav?.querySelector('.nav-center');
    const container = byId('searchContainer');
    const search = byId('gameSearch');
    const trigger = container?.querySelector('.search-trigger');
    const logoZone = nav?.querySelector('.nav-left');
    if (!nav || !center || !container || !search || !trigger || !logoZone) return;

    // La barra eixamplada ocupa 144px més que plegada: 140px d'ample
    // (amb el padding a dins: els camps són `border-box`) + 4 de
    // `margin-right` (vegeu components.css).
    const EXPANDED = 144;

    // Marge mínim garantit a l'esquerra del cercador: si l'espai no
    // permet centrar el segment, es prioritza aquest coixí.
    const GAP = 22;

    // A les dues files (mòbil) la píndola és lluny de la cerca, i al
    // tàctil no hi ha hover: en aquests casos no s'ha de moure res.
    const shiftable = () => window.matchMedia('(min-width: 641px) and (hover: hover)').matches;

    const expanded = () => (
        container.matches(':hover') ||
        container.matches(':focus-within') ||
        container.classList.contains('open') ||
        container.classList.contains('has-query')
    );

    syncSearchShift = () => {
        // El text viu decideix si, sense hover, la barra es queda
        // oberta: `has-query` la fa perdurar (responsive.css).
        container.classList.toggle('has-query', search.value.trim() !== '');

        if (!expanded() || !shiftable()) {
            nav.classList.remove('search-on');
            nav.style.removeProperty('--nav-shift');
            return;
        }

        // El botó de la lupa no es mou mai: la barra creix cap a
        // l'esquerra des d'ell. Ja eixamplada, la barra començaria
        // `EXPANDED` píxels a l'esquerra d'on és ara.
        const rightStart = trigger.getBoundingClientRect().left - EXPANDED;
        const navRect = nav.getBoundingClientRect();
        const leftEnd = logoZone.getBoundingClientRect().right;

        // El punt on aniria el centre del segment sense desplaçar-lo.
        const centerX = navRect.left + navRect.width / 2;
        const width = center.offsetWidth;
        // Centrat entre el logo i la barra; si l'espai no ho permet,
        // es garanteix com a mínim el coixí a l'esquerra del cercador.
        // Mai cap a la dreta.
        const shift = Math.max(
            centerX - (leftEnd + rightStart) / 2,
            centerX + width / 2 + GAP - rightStart,
            0
        );

        nav.classList.add('search-on');
        nav.style.setProperty('--nav-shift', `${Math.round(shift)}px`);
    };

    container.addEventListener('pointerenter', syncSearchShift);
    container.addEventListener('pointerleave', syncSearchShift);
    container.addEventListener('focusin', syncSearchShift);
    container.addEventListener('focusout', syncSearchShift);
    search.addEventListener('input', syncSearchShift);
    window.addEventListener('resize', syncSearchShift);
    syncSearchShift();
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

    syncSearchShift();
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
    initPlayerMenu();

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
 * El catàleg quan la xarxa cau: un avís amb el botó de tornar-hi.
 *
 * El catàleg és local i continua funcionant, però les portades que no
 * siguin a la memòria cau no arribaran i els jocs nous no s'obriran.
 * L'avís ho diu, i el botó —o la connexió, quan torna sola— torna a
 * provar les portades que van quedar a mitges.
 */
function bindOfflineNotice() {
    const notice = byId('offlineNotice');
    if (!notice) return;

    const retry = byId('offlineRetry');

    const sync = () => {
        const offline = navigator.onLine === false;
        notice.hidden = !offline;
        if (!offline) retryCovers();
    };

    retry?.addEventListener('click', () => {
        if (navigator.onLine === false) {
            // Sense xarxa no hi ha res a tornar a provar: que es vegi
            // que el botó hi és i respon.
            notice.classList.remove('is-poked');
            void notice.offsetWidth; // reinicia l'animació
            notice.classList.add('is-poked');
            return;
        }

        retryCovers();
        sync();
    });

    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
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

/**
 * L'orba de fons (`#orb-1`) es mou amb una animació de 60 s i, a cada
 * fotograma que es mou, obliga el navegador a tornar a compondre tots
 * els vidres que té a sobre (les targetes, el nav...). Als equips
 * fluixos això és el que enfonsa els fotogrames. Aquí:
 *
 * 1. Es pausa mentre l'usuari navega (scroll): el gest ja tapa el
 *    moviment i s'estalvia la recomposició just quan més cou.
 * 2. Als equips de gamma baixa (quatre nuclis o menys, o amb poca
 *    memòria) no s'espera cap mesura: l'orba queda quieta des de
 *    l'arrencada. És el cas que ho va motivar —un N150 amb 8 GB—, on
 *    cada fotograma de l'orba se serveix de tota la CPU que dona la
 *    màquina.
 * 3. A la resta, si amb les portades ja a lloc el navegador no manté
 *    el ritme (menys de ~44 fps en repòs), s'atura del tot amb
 *    `low-fx`: l'orba queda quieta al mateix lloc, com amb
 *    `prefers-reduced-motion`, i els shimmers queden quiets.
 */
function optimitzaOrba() {
    let timer = 0;
    document.addEventListener(
        'scroll',
        () => {
            document.body.classList.add('is-scrolling');
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                document.body.classList.remove('is-scrolling');
            }, 180);
        },
        // L'esdeveniment de scroll no fa bombolla fins al document: cal
        // la fase de captura. Passiu perquè aquí només es mira.
        { capture: true, passive: true }
    );

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // `hardwareConcurrency` i `deviceMemory` són pistes de gamma baixa i
    // no hi són a tots els navegadors: si no existeixen, el `undefined`
    // no activa res i l'equip passa per la mesura de sempre.
    if (navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4) {
        document.body.classList.add('low-fx');
        return;
    }

    // La mostra s'avorta si la pestanya no és visible: amb
    // `document.hidden` els fotogrames no corren i el comptatge sortiria
    // esbiaixat. El llindar és ~44 fps de mitjana: per sota, l'orba
    // animada val més el rendiment que el moviment.
    let decidit = false;
    const mostra = () => {
        if (decidit) return;
        decidit = true;
        // Dues finestres seguides de 1,2 s. Amb una de sola, un sot
        // puntual (una imatge que acaba d'arribar, una recollida de
        // brossa...) podria aturar l'orba d'un equip que va bé.
        let frames = 0;
        let t0 = 0;
        let primera = -1;
        const tick = () => {
            if (document.hidden) return;
            if (!t0) t0 = performance.now();
            frames += 1;
            if (performance.now() - t0 < 1200) {
                requestAnimationFrame(tick);
            } else if (primera < 0) {
                primera = frames;
                frames = 0;
                t0 = 0;
                requestAnimationFrame(tick);
            } else if (primera + frames < 105) {
                document.body.classList.add('low-fx');
            }
        };
        requestAnimationFrame(tick);
    };

    // No es mesura fins que la graella té targetes i les seves portades
    // han arribat: mentre la graella treballa els fotogrames baixen per
    // la xarxa i les imatges, no per l'equip, i la decisió sortiria
    // esbiaixada (mesurat: un equip capaç baixa fins a 5-40 fps amb les
    // portades a mig arribar). Amb un sostre, per si alguna cosa no
    // acaba d'arribar mai.
    let arrancat = false;
    const arrenca = () => {
        if (arrancat) return;
        arrancat = true;
        window.setTimeout(mostra, 7000);
        const espera = () => {
            if (decidit) return;
            const grid = document.querySelectorAll('#gameGrid .card-wrapper').length;
            const carregant = document.querySelectorAll('.card-loading').length;
            if (grid > 0 && carregant === 0) {
                window.setTimeout(mostra, 300);
            } else {
                window.setTimeout(espera, 400);
            }
        };
        espera();
    };
    if (document.readyState === 'complete') {
        arrenca();
    } else {
        window.addEventListener('load', arrenca, { once: true });
    }
    // Si `load` no arribés mai (algun recurs que penja), no ens hi quedem.
    window.setTimeout(arrenca, 8000);
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

    // El menú del reproductor també pot canviar un favorit; quan ho fa,
    // la graella s'ha de repintar igual que si s'hagués pitjat
    // l'estrella de la targeta.
    document.addEventListener('ula:favorites', applyFilters);
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

/**
 * En arribar a una vista: tanca el joc si no som a l'arcade i manten les
 * estadístiques al dia.
 *
 * Si s'obre un joc i es canvia de vista, el joc no ha de continuar
 * executant-se en segon pla: tancar-lo elimina l'iframe i el navegador
 * n'allibera els timers, els workers i l'àudio.
 */
function onViewArrive(id) {
    if (id !== 'arcade' && isGameOpen()) close();
    if (id === 'stats') renderStats();
    if (id === 'social') openSocial();
}

/**
 * El Social només es carrega quan s'hi arriba: són uns quants mòduls i
 * unes quantes escoltes de Firestore que qui no hi entra no ha de pagar
 * —ni a l'arrencada ni de fons—. El primer cop es demana el mòdul; els
 * vinents ja el tenen a la memòria.
 */
let socialLoad = null;
function openSocial() {
    if (!socialLoad) socialLoad = import('./social.js');
    return socialLoad.then((mod) => mod.initSocial());
}

async function start() {
    // L'aplicació ja corre: el marge de `boot-watch.js` es pot plegar
    // (l'escolta al document; vegeu el seu capçal).
    document.documentElement.dataset.booted = '1';
    document.dispatchEvent(new CustomEvent('ula:boot-ok'));

    // El forat del logotip (esquelet del HTML) s'allibera tan bon
    // punt la imatge és sencera: la descàrrega no ha d'esperar que
    // arribi l'idioma ni la resta d'arrencada.
    watchLogoLoad();

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
    bindSearchShift();
    bindTheme();
    bindModal();
    bindFavorites();
    bindInfiniteScroll();
    bindWheelForwarding();
    optimitzaOrba();
    initGate();
    bindOfflineNotice();

    initSettings();
    initCacheControl();
    initProgressReset('resetProgressBtn', () => {
        resetProgress();
        // Si les estadístiques són a la pantalla, han de reflectir-ho
        // a l'instant: sinó semblaria que el botó no ha fet res.
        if (currentView() === 'stats') renderStats();
    });
    onLangChange(onLanguageChange);

    // El compte, després de l'idioma (el seu modal es tradueix com la
    // resta) i abans d'arrencar el routing: el que pengi de la sessió
    // pot esperar `whenAuthReady()` sense por de perdre's res.
    initAuth();

    // La sincronització va després del compte: escolta els mateixos
    // canvis de sessió i, si algú ja hi és, no es perd el primer avís.
    initCloud();
    initCloudUi();

    // Quan el compte envia progrés (els punts, els favorits o els
    // volums), el que es veu ha de canviar també: la graella i les
    // estadístiques ja estan dibuixades amb els valors d'abans.
    window.addEventListener('ula:cloud', () => {
        if (currentView() === 'stats') renderStats();
        else applyFilters();
    });

    // El routing s'arrenca abans de la primera càrrega perquè l'enllaç
    // profund decideixi quina vista s'obre, i `onArrive` mantingui les
    // estadístiques al dia cada cop que hi arribem.
    const initial = startRouter({ onArrive: onViewArrive });

    // L'estat dels jocs offline abans de dibuixar: així una targeta ja
    // baixada surt amb el botó de jugar des del primer moment. Mentre
    // baixa, els canvis arriben per `onOfflineChange`.
    onOfflineChange((url, info) => updateOfflineCard(url, info));
    await initOffline(GAMES);

    applyFilters();

    // Si l'URL demanava les estadístiques o el social i no hi ha jocs
    // visibles, `applyFilters` no hi arriba, així que hi anem igualment.
    if (initial === 'stats') {
        go('stats', { animate: false });
        renderStats();
    } else if (initial === 'social') {
        go('social', { animate: false });
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