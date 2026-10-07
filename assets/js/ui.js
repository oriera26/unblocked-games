/**
 * ui.js · tot el que dibuixa i manipula el DOM.
 *
 * El mòdul no coneix cap global: rep els elements que necessita per
 * paràmetre o els busca per id, que és prou perquè el HTML està a la
 * nostra disposició. El que fa és agrupar el codi que abans vivia
 * escampat dins del <script> inline d'index.html, i treure'n els
 * `onclick=` que hi havia agafats al DOM.
 */

import {
    CATEGORIES,
    CATEGORY_ALL,
    CHUNK_SIZE,
    LOGO_DARK,
    LOGO_LIGHT,
    MAX_DOM_CARDS,
    REVEAL_STAGGER
} from './config.js';
import { filters, isFavorite, stats } from './state.js';
import { getLevelForPoints } from './levels.js';
import { iconMarkup } from './icons.js';
import { localeOf, t } from './i18n.js';

export const $ = (id) => document.getElementById(id);

/* ================================================================
   Categories
   ================================================================ */

/**
 * L'etiqueta d'una categoria en l'idioma actiu.
 *
 * Si la clau no és enlloc (fitxer d'idioma pendent de carregar), es fa
 * servir el català que porta la pròpia constant: `t()` en aquest cas
 * retornaria la clau literal, i `cat.accio` a la píldora seria pitjor
 * que `Acció`.
 */
function categoryText(category) {
    const text = t(category.key);
    return text === category.key ? category.label : text;
}

/**
 * Construeix les píldores de categoria dins de #pillWrapper.
 *
 * Abans es creaven amb `item.onclick = ...`, un atributi de funció que
 * no serialitza i que impedeix que el botó respongui al teclado. Aquí
 * cada píldora és un <button>, que ja és focusable i ja té el
 * comportament d'Espai i Retorn de gratuït.
 */
export function renderCategories(onSelect) {
    const wrapper = $('pillWrapper');
    if (!wrapper) return;

    wrapper.replaceChildren();

    for (const category of CATEGORIES) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'category-item';
        pill.id = `cat-${category.id}`;
        pill.setAttribute('aria-pressed', String(category.id === filters.category));
        pill.innerHTML = `${iconMarkup(category.icon, { size: 13 })}<span>${categoryText(category)}</span>`;
        pill.addEventListener('click', () => onSelect(category.id));

        wrapper.appendChild(pill);
    }
}

/** Marca com a activa la píldora de la categoria filtrada. */
export function setActiveCategory(categoryId) {
    for (const pill of document.querySelectorAll('.category-item')) {
        const active = pill.id === `cat-${categoryId}`;
        pill.classList.toggle('active', active);
        pill.setAttribute('aria-pressed', String(active));
    }
    moveActivePill();
}

/**
 * Desplaça el fons quadrat que remarca la píldora activa perquè
 * quedi a sota de la píldora corresponent.
 *
 * Depèn de les mides reals dels elements, així que s'ha de cridar
 * després que el navegador hagi maquetat: abans del primer paint, les
 * mides són zero i el fons aniria a la cantonada.
 */
export function moveActivePill() {
    const active = document.querySelector('.category-item.active');
    const pill = $('activePill');
    if (!active || !pill) return;

    pill.style.width = `${active.offsetWidth}px`;
    pill.style.left = `${active.offsetLeft}px`;
}

/* ================================================================
   El grid de jocs
   ================================================================ */

/** Quantes targetes s'han dibuixat ja, per saber on continuar. */
let itemsShown = 0;

/** Els jocs que apliquen els filtres actius, en ordre. */
let visibleGames = [];

export function setVisibleGames(games) {
    visibleGames = games;
}

/** Substitueix el contingut del grid per esqueletos de càrrega. */
export function showSkeleton(count = CHUNK_SIZE) {
    const grid = $('gameGrid');
    if (!grid) return;

    grid.classList.add('skeleton-grid');
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'skeleton skeleton-card skeleton-grid-item';
        placeholder.style.animationDelay = `${i * 50}ms`;
        fragment.appendChild(placeholder);
    }

    grid.replaceChildren(fragment);
}

/**
 * Dibuixa una targeta de joc.
 *
 * El nom i l'URL es posen amb `textContent` i `dataset`, mai
 * interpolats dins d'un `innerHTML`: hi ha jocs com `Don't Fall` i
 * `FNAF 4` amb apostrofs, i construir l'etiqueta amb cadena feia que
 * l'apòstrof trenqués l'atribut onclick de la estrella i, amb un nom
 * amb cometa, trenqués tot el markup.
 */
function buildCard(game) {
    const favorite = isFavorite(game.url);

    const wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';
    wrapper.dataset.url = game.url;
    if (favorite) wrapper.classList.add('favorite-card');

    const favButton = document.createElement('button');
    favButton.type = 'button';
    favButton.className = favorite ? 'fav-btn active' : 'fav-btn';
    favButton.dataset.action = 'favorite';
    favButton.setAttribute('aria-label', t(favorite ? 'card.fav.remove' : 'card.fav.add'));
    favButton.setAttribute('aria-pressed', String(favorite));
    favButton.innerHTML = iconMarkup('star', { size: 18, fill: favorite ? '#FFD60A' : 'none' });

    const media = document.createElement('div');
    media.className = 'card';

    if (game.image) {
        const img = document.createElement('img');
        img.src = game.image;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        // Una portada que no existeix deixa un requadre buit al mig de
        // la targeta. Amagant-la, es veu el fons de la targeta, que és
        // millor que un error de càrrega.
        img.addEventListener('error', () => img.remove());
        media.appendChild(img);
    } else {
        // Sense portada: la icona de mando. És el que es veu a 627 dels
        // 697 jocs, així que ha de quedar ben centrada.
        media.innerHTML = iconMarkup('gamepad-2', { size: 40, className: 'game-icon' });
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = game.name;

    wrapper.append(favButton, media, title);
    return wrapper;
}

/** Buida el grid i deixa el comptador a zero. */
export function resetGrid() {
    const grid = $('gameGrid');
    if (!grid) return;

    grid.classList.remove('skeleton-grid');
    grid.replaceChildren();
    itemsShown = 0;
}

/**
 * Un sol delegat per a totes les targetes.
 *
 * El delegat viu al grid, que no es recrea mai, i mira cap amunt amb
 * `closest` per saber quina targeta s'ha premut. Així ni cal un
 * `onclick` per targeta ni cal tornar-lo a assignar a cada càrrega, i
 * el cost no creix amb els 150 jocs que hi ha al DOM.
 *
 * @param {{ onLaunch: (game: object) => void, onFavorite: (url: string) => void }} handlers
 */
export function bindGrid({ onLaunch, onFavorite }) {
    const grid = $('gameGrid');
    if (!grid) return;

    grid.addEventListener('click', (event) => {
        const card = event.target.closest('.card-wrapper');
        if (!card || !grid.contains(card)) return;

        if (event.target.closest('[data-action="favorite"]')) {
            event.stopPropagation();
            onFavorite(card.dataset.url);
            return;
        }

        const game = visibleGames.find((g) => g.url === card.dataset.url);
        if (game) onLaunch(game);
    });
}

/**
 * Afegeix el següent bloc de targetes.
 *
 * Dues decisions que valen la pena:
 *
 *  - Un sol DocumentFragment. Sense això, cada targeta seria una
 *    inserció al DOM i el navegador maquetaria 30 cops seguides.
 *
 *  - `.visible` s'afegeix en un únic requestAnimationFrame per a tot
 *    el bloc. Aplicar la classe targeta per targeta desferia l'escalonat,
 *    que és justament el que fa que l'aparició es llegeixi com una
 *    animació i no com un cop de pantalla.
 */
export function loadMore() {
    const grid = $('gameGrid');
    if (!grid) return;

    const batch = visibleGames.slice(itemsShown, itemsShown + CHUNK_SIZE);
    if (batch.length === 0) return;

    const fragment = document.createDocumentFragment();
    for (const game of batch) fragment.appendChild(buildCard(game));
    grid.appendChild(fragment);

    itemsShown += batch.length;
    grid.classList.remove('skeleton-grid');

    requestAnimationFrame(() => {
        const fresh = grid.querySelectorAll('.card-wrapper:not(.visible)');
        for (let i = 0; i < fresh.length; i++) {
            fresh[i].style.transitionDelay = `${i * REVEAL_STAGGER}ms`;
            fresh[i].classList.add('visible');
        }
    });

    pruneGrid();
}

/** Que al DOM no hi hagi més de MAX_DOM_CARDS targetes. */
function pruneGrid() {
    const grid = $('gameGrid');
    if (!grid) return;

    const excess = grid.children.length - MAX_DOM_CARDS;
    for (let i = 0; i < excess; i++) grid.firstElementChild.remove();
}

export function hasMoreGames() {
    return itemsShown < visibleGames.length;
}

export function shownCount() {
    return itemsShown;
}

/* ================================================================
   Filtres
   ================================================================ */

function matches(game) {
    const term = filters.search;
    const matchesSearch = !term || game.name.toLowerCase().includes(term);
    const matchesCategory =
        filters.category === CATEGORY_ALL ||
        (game.type ?? '').toLowerCase() === filters.category;
    return matchesSearch && matchesCategory;
}

/**
 * Els favorits primer, sense canviar l'ordre relatiu dels altres.
 *
 * `Array.prototype.sort` és estable a l'especificació des del 2019, però
 * el navegador hauria de ser capaç de garantir-ho igualment en tots
 * els casos.
 */
function favoritesFirst(games) {
    return games
        .map((game, index) => ({ game, index }))
        .sort((a, b) => {
            const aFav = isFavorite(a.game.url);
            const bFav = isFavorite(b.game.url);
            if (aFav === bFav) return a.index - b.index;
            return aFav ? -1 : 1;
        })
        .map((entry) => entry.game);
}

export function filterGames(games) {
    return favoritesFirst(games.filter(matches));
}

/* ================================================================
   Logo i tema
   ================================================================ */

export function updateLogo() {
    const logo = $('logoImg');
    if (!logo) return;
    logo.src = document.body.classList.contains('dark-theme') ? LOGO_DARK : LOGO_LIGHT;
}

/**
 * Canvia el tema i actualitza la icona del botó.
 *
 * Canvia el contingut de #themeIcon en lloc de substituir l'element.
 * Substituir-lo volia dir que el handler del botó havia de tornar a
 * capturar el SVG nou pel mateix id, i que qualsevol referència
 * antiga apuntava a un node que ja no existia.
 */
export function applyTheme(dark) {
    document.body.classList.toggle('dark-theme', dark);

    const button = $('themeIcon');
    if (button) button.innerHTML = iconMarkup(dark ? 'sun' : 'moon', { size: 16 });

    updateLogo();
}

/* ================================================================
   Pantalla d'estadístiques
   ================================================================ */

/**
 * El locale per a les dates depèn de l'idioma triat: `ca-ES` fixava el
 * format en català per a tothom, i un castellà hauria vist «5 oct.
 * 14:30» en lloc del que ell espera.
 *
 * `localeOf` també tradueix `por` → `pt`, perquè `por` no és un tag
 * BCP47 vàlid i `toLocaleDateString('por')` llençaria error.
 */
const dateOptions = {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
};

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return t('stats.duration', { m: minutes, s: rest });
}

/**
 * Els minuts sols, amb la seva unitat en l'idioma triat.
 *
 * En comptes d'inventar una clau nova (i haver de fer-la arribar als
 * 100 fitxers), es reutilitza la plantilla de durada: tot el que hi ha
 * abans de `{s}` és el nombre amb la seva unitat — «12m» en català,
 * «12 นาที» en tailandès, «12 min» en italià.
 */
function formatMinutes(totalSeconds) {
    const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
    const head = t('stats.duration', {}).split('{s}')[0];

    // Si alguna plantilla no comença pels minuts (no n'hi ha cap, però
    // el fitxer el pot editar qualsevol), no es queda la casella buida.
    if (!head.includes('{m}')) return `${minutes}m`;

    return head.replace('{m}', String(minutes)).trim();
}

function formatDate(iso) {
    if (!iso) return t('stats.never');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t('stats.never');
    return date.toLocaleDateString(localeOf(), dateOptions);
}

export function renderStats() {
    const streak = $('stat-streak');
    const points = $('stat-points');
    const time = $('stat-time');
    const levelEl = $('stat-level');
    const progressEl = $('level-progress');

    if (streak) streak.textContent = String(stats.streak);
    if (points) points.textContent = String(stats.points);
    if (time) time.textContent = formatMinutes(stats.timeSeconds);

    const level = getLevelForPoints(stats.points);
    if (levelEl) levelEl.textContent = level.title;
    if (progressEl) progressEl.style.width = `${level.progress}%`;

    const body = $('historyBody');
    if (!body) return;

    const history = stats.gameHistory ?? {};
    const names = Object.keys(history).sort(
        (a, b) => new Date(history[b].lastPlayed ?? 0) - new Date(history[a].lastPlayed ?? 0)
    );

    if (names.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.className = 'history-empty';
        cell.textContent = t('stats.empty');
        row.appendChild(cell);
        body.replaceChildren(row);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const name of names) {
        const entry = history[name];
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = name;

        const countCell = document.createElement('td');
        countCell.className = 'history-count';
        const badge = document.createElement('span');
        badge.className = 'game-badge';
        badge.textContent = String(entry.count ?? 0);
        countCell.appendChild(badge);

        const timeCell = document.createElement('td');
        timeCell.className = 'history-count';
        timeCell.textContent = formatDuration(entry.timePlayed ?? 0);

        const dateCell = document.createElement('td');
        dateCell.className = 'history-date';
        dateCell.textContent = formatDate(entry.lastPlayed);

        row.append(nameCell, countCell, timeCell, dateCell);
        fragment.appendChild(row);
    }

    body.replaceChildren(fragment);
}