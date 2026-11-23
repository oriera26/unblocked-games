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
    COVER_CONCURRENCY,
    COVER_GAP_MS,
    COVER_TIMEOUT_MS,
    LOGO_DARK,
    LOGO_LIGHT,
    MAX_DOM_CARDS,
    REVEAL_STAGGER
} from './config.js';
import { filters, isFavorite, stats } from './state.js';
import { getLevelForPoints } from './levels.js';
import { iconMarkup } from './icons.js';
import { localeOf, t } from './i18n.js';
import { createQueue, SKIP } from './load-queue.js';
import { isOfflineGame, stateOf } from './offline-games.js';

export const $ = (id) => document.getElementById(id);

// LQIP helpers from lqip.js (loaded via defer before this module)
const { getImageUrls, attachImageListeners, HERO_SIZES } = window;

/** Logger centralitzat per observabilitat de càrrega d'imatges. */
const ImageLog = {
    enabled: true,
    _prefix: '[ula:img]',
    info(...args) { if (this.enabled) console.log(this._prefix, ...args); },
    warn(...args) { if (this.enabled) console.warn(this._prefix, ...args); },
    error(...args) { if (this.enabled) console.error(this._prefix, ...args); },
    debug(...args) { if (this.enabled) console.debug(this._prefix, ...args); }
};

/** Generació d'ID únic per rastrejar càrregues. */
let coverRequestId = 0;
function nextRequestId() { return ++coverRequestId; }

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

    // `replaceChildren` s'emporta també el fons que remarca la categoria
    // activa, i `moveActivePill` el necessita per pintar-lo sota la
    // píndola triada. El tornem a crear sempre, abans de les píndoles.
    const activeBg = document.createElement('div');
    activeBg.className = 'category-active-bg';
    activeBg.id = 'activePill';
    wrapper.appendChild(activeBg);

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

    watchPills();
}

/** Marca com a activa la píldora de la categoria filtrada. */
export function setActiveCategory(categoryId) {
    for (const pill of document.querySelectorAll('.category-item')) {
        const active = pill.id === `cat-${categoryId}`;
        pill.classList.toggle('active', active);
        pill.setAttribute('aria-pressed', String(active));
    }
    moveActivePill();
    observePills();
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

/**
 * Manté el fons de la categoria activa al seu lloc.
 *
 * `moveActivePill` llegeix mides reals (offsetWidth/offsetLeft), i hi ha
 * dos moments en què aquestes mides canvien sense que cap clic ho
 * provoqui: en canviar d'idioma (les etiquetes fan una altra amplada) i
 * quan la barra passa d'amagada a visible (en tornar de les vistes
 * d'estadístiques o social les mides encara eren zero i el fons quedava
 * invisible). Un ResizeObserver sobre la barra i la píndola activa
 * cobreix tots dos casos i qualsevol altre canvi de mida.
 *
 * El reposicionament va dins d'un rAF per no llegir mides dins del
 * mateix callback de l'observer, que dispararia l'avís de bucle.
 */
let pillObserver = null;

function watchPills() {
    if (pillObserver || typeof ResizeObserver !== 'function') return;
    pillObserver = new ResizeObserver(() => requestAnimationFrame(moveActivePill));
    observePills();
}

/** La barra i la píndola activa són les que es vigilen. */
function observePills() {
    if (!pillObserver) return;
    pillObserver.disconnect();

    const wrapper = $('pillWrapper');
    if (wrapper) pillObserver.observe(wrapper);

    const active = document.querySelector('.category-item.active');
    if (active) pillObserver.observe(active);
}

/* ================================================================
   El grid de jocs
   ================================================================ */

/** Quantes targetes s'han dibuixat ja, per saber on continuar. */
let itemsShown = 0;

/** Els jocs que apliquen els filtres actius, en ordre. */
let visibleGames = [];

/** Protecció contra race conditions: evita càrregues simultànies de loadMore. */
let isLoadingMore = false;

/** Protecció contra race conditions a resetGrid/applyFilters. */
let isResetting = false;

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
/**
 * Només acceptem portades locals sota `assets/images/` amb una extensió
 * d'imatge coneguda.
 *
 * `gameList.js` és dades controlades, però si mai una entrada arribés
 * amb `javascript:` o `data:` maliciós, `img.src = game.image` el
 * carregaria. El filtre el deixa fora.
 */
function safeCoverImage(src) {
    if (typeof src !== 'string') return null;
    // Accepta paths relatius a assets/images/ i també paths absoluts al mateix origen
    const normalized = src.replace(/\\/g, '/');
    if (!normalized.startsWith('assets/images/') && !normalized.startsWith('/assets/images/')) return null;
    if (normalized.includes('..')) return null;
    const extOk = /\.(webp|jpe?g|png|gif|avif)$/i.test(normalized);
    if (!extOk) {
        ImageLog.warn('Rejected cover (bad extension):', src);
        return null;
    }
    return normalized.startsWith('/') ? normalized : normalized;
}

/** La cua compartida que reparteix les portades de tot el grid. */
const coverQueue = createQueue({ concurrency: COVER_CONCURRENCY, gap: COVER_GAP_MS });

/**
 * Les portades que ja s'han pintat en aquesta sessió.
 *
 * Sense això, cada canvi de filtre tornava a passar totes les portades
 * per la cua (dues alhora i 60 ms de pausa): la graella ja les tenia a
 * la memòria cau del navegador, però l'usuari veia esquelets durant
 * segons. Una portada ja coneguda es demana a l'instant i no espera
 * torn.
 */
const loadedCovers = new Set();

/**
 * Demana la imatge i espera que es pugui pintar, però amb una sortida
 * per als casos que abans deixaven la cua encallada:
 *
 *   - `cover-cancel`: la targeta s'ha desmuntat (canvi de filtre,
 *     cerca esborrada, poda). No té sentit esperar més.
 *   - temps màxim: si `decode()` no resol mai (imatge desmuntada a mig
 *     camí, xarxa penjada), la cua ha de poder continuar amb la resta.
 *
 * @param {HTMLImageElement} img
 * @returns {Promise<'decode'|'error'|'cancel'|'timeout'>}
 */
function waitForCover(img) {
    const requestId = img.dataset.coverRequestId || 'unknown';
    return new Promise((resolve) => {
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            img.removeEventListener('cover-cancel', onCancel);
            window.clearTimeout(timer);
            ImageLog.debug(`Cover ${requestId} finished:`, result);
            resolve(result);
        };

        const onCancel = () => finish('cancel');
        const timer = window.setTimeout(() => finish('timeout'), COVER_TIMEOUT_MS);

        img.addEventListener('cover-cancel', onCancel);
        img.decode().then(() => finish('decode'), (err) => {
            ImageLog.warn(`Cover ${requestId} decode error:`, err);
            finish('error');
        });
    });
}

/** La imatge ja té píxels: es fon sobre l'esquelet i es dona per carregada. */
function revealCover(media, img, cover) {
    // Pot ser que la targeta encara no sigui al DOM: quan es construeix
    // un bloc, `appendCover` corre abans que el fragment s'enganxi a la
    // graella. La imatge ja té píxels igualment, i la classe de sortida
    // la trobarà connectada en el proper fotograma.
    if (img.naturalWidth === 0) return false;

    loadedCovers.add(cover);
    media.classList.add('card-done');
    media.classList.remove('card-loading');
    window.setTimeout(() => media.classList.remove('card-done'), 600);
    return true;
}

/**
 * Acaba de carregar una portada que ja té `src`.
 *
 * @returns {Promise<symbol|undefined>} `SKIP` si no s'ha de fer res més
 */
async function finishCover(media, img, cover) {
    const requestId = img.dataset.coverRequestId || 'unknown';
    const result = await waitForCover(img);

    if (result === 'cancel') return SKIP;

    // Reintent automàtic per timeouts i errors de xarxa (màxim 2 reintents)
    const retryCount = parseInt(img.dataset.coverRetryCount || '0', 10);
    const maxRetries = 2;

    if ((result === 'timeout' || result === 'error') && img.naturalWidth === 0 && retryCount < maxRetries) {
        ImageLog.warn(`Cover ${requestId} ${result}, scheduling retry ${retryCount + 1}/${maxRetries}`);
        
        // Backoff exponencial: 1s, 2s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        img.dataset.coverRetryCount = String(retryCount + 1);
        
        // Marquem com a carregant per evitar que retryCovers() la toqui
        media.classList.add('card-loading');
        media.classList.remove('card-done');
        
        await new Promise(r => setTimeout(r, delay));
        
        if (!img.isConnected) return SKIP; // Targeta desmuntada
        
        // Reintentem la càrrega
        return finishCover(media, img, cover);
    }

    if (result === 'timeout' && img.naturalWidth === 0) {
        // No bloquegem la cua per una imatge que encara pot arribar:
        // es lleva l'esquelet i, si el navegador l'acaba tenint, es
        // pinta sola. Si falla, s'elimina com qualsevol portada perduda.
        media.classList.remove('card-loading');
        img.addEventListener('load', () => revealCover(media, img, cover), { once: true });
        img.addEventListener('error', () => {
            img.classList.add('error'); // Per a retryCovers()
            img.remove();
        }, { once: true });
        if (img.complete && img.naturalWidth > 0) revealCover(media, img, cover);
        return SKIP;
    }

    if (result === 'error' && img.naturalWidth === 0) {
        // La portada no ha arribat (sense xarxa, 404...): es treu del
        // DOM i es reintentarà quan convingui.
        img.classList.add('error'); // Per a retryCovers()
        img.remove();
        media.classList.remove('card-loading');
        return SKIP;
    }

    revealCover(media, img, cover);
    return undefined;
}

/**
 * Posa la portada a la caixa de la targeta, si el joc en té.
 *
 * La imatge no es demana a l'instant: passa per la cua compartida
 * (`load-queue.js`), que en serveix poques alhora i amb pausa per no
 * clavar la CPU ni la RAM. Mentrestant, la caixa és un esquelet
 * (`.card-loading`, `skeleton.css`): la graella no s'omple a trossos
 * —cada targeta ja és sencera— i, quan el bitmap arriba sencer, la
 * portada fa un fundido per sobre de l'esquelet (`card-done`) i la
 * caixa queda llesta.
 *
 * Una portada que no existeix o que no pot arribar (sense xarxa) es
 * treu del DOM: quedaria un requadre trencat al mig de la targeta, i
 * el fons és més digne. `retryCovers()` la tornarà a provar quan la
 * connexió torni, i també passa per la cua: una tanda de reintents no
 * torna a sacsejar l'equip.
 *
 * @returns {boolean} si el joc té portada per ensenyar
 */
function appendCover(media, game) {
    const cover = game.image ? safeCoverImage(game.image) : null;
    if (!cover) return false;

    const img = document.createElement('img');
    img.decoding = 'async';
    img.alt = '';
    // ID únic per rastrejar aquesta càrrega als logs
    img.dataset.coverRequestId = String(nextRequestId());
    img.dataset.coverRetryCount = '0';

    // Un reintent pot trobar la targeta encara dins del fundido: la
    // classe de sortida es neta abans de tornar a l'esquelet.
    media.classList.remove('card-done');
    media.classList.add('card-loading');
    media.prepend(img);

    // Ja l'hem vista: el navegador la té a la cau, així que no cal fer
    // esperar la cua. Si encara no és completa, `finishCover` espera el
    // decode sense ocupar cap torn.
    if (loadedCovers.has(cover)) {
        img.src = cover;
        if (img.complete && img.naturalWidth > 0) revealCover(media, img, cover);
        else finishCover(media, img, cover);
        return true;
    }

    coverQueue.add(async () => {
        // La poda o un canvi de filtre poden haver desmuntat la targeta
        // abans que li toqués el torn: no cal anar a la xarxa per res.
        if (!img.isConnected) return SKIP;

        img.src = cover;
        ImageLog.debug(`Cover ${img.dataset.coverRequestId} queued for:`, cover);

        // La cau del navegador pot tenir-la a punt abans que la cua
        // arribi a esperar cap esdeveniment.
        if (img.complete) {
            if (img.naturalWidth > 0) {
                revealCover(media, img, cover);
                return undefined;
            }
            img.remove();
            media.classList.remove('card-loading');
            return SKIP;
        }

        return finishCover(media, img, cover);
    });

    return true;
}

/** Atura una portada que ja no interessa i allibera el seu bitmap. */
function cancelCover(img) {
    if (!img) return;
    const requestId = img.dataset.coverRequestId || 'unknown';
    
    // Revoca object URLs si n'hi ha (per alliberar memòria)
    if (img.src && img.src.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.src); } catch {}
    }
    if (img.srcset) {
        img.srcset.split(',').forEach(s => {
            const url = s.trim().split(' ')[0];
            if (url.startsWith('blob:')) {
                try { URL.revokeObjectURL(url); } catch {}
            }
        });
    }
    
    img.dataset.cancelled = '1';
    img.removeAttribute('src');
    img.removeAttribute('srcset');
    img.dispatchEvent(new CustomEvent('cover-cancel'));
    ImageLog.debug(`Cover ${requestId} cancelled`);
}

function buildCard(game, globalIndex = Infinity) {
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

    // Crear estructura per LQIP i imatge
    const urls = getImageUrls(game.image);
    if (urls) {
        const fig = document.createElement('figure');
        fig.className = 'img-wrap';
        fig.style.setProperty('--lqip', `url('${urls.lqip}')`);
        
        // Placeholder per la imatge - appendCover crearà la imatge real
        media.appendChild(fig);
        // Assegurar que appendCover s'executi després que el media estigui al DOM
        // ho fem diferent perquè appendCover necessita el media element
        setTimeout(() => appendCover(media, game), 0);
    } else if (game.image) {
        // Fallback per imatges sense LQIP
        const img = document.createElement('img');
        img.src = game.image;
        img.width = 400;
        img.height = 400;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = game.name;
        media.appendChild(img);
    }

    if (isOfflineGame(game)) media.appendChild(offlineBadge(game));

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = game.name;

    wrapper.append(favButton, media, title);
    return wrapper;
}

/**
 * La card de presentació dels jocs de la casa (`hero: true`).
 *
 * No és una targeta de la graella retocada: és una peça nova, amb la
 * portada a l'esquerra i el nom, una explicació i el botó de jugar a la
 * dreta. Les cards de la casa van dins d'un `.hero-row` que les
 * reparteix en dues columnes.
 *
 * El botó no té comportament propi: la card sencera és clicable (el
 * delegat del grid decideix entre obrir i baixar) i el botó només
 * ensenya l'estat de la baixada, com el badge de les targetes.
 */
function buildHeroCard(game, globalIndex = Infinity) {
    const card = document.createElement('article');
    card.className = 'hero-card';
    card.dataset.url = game.url;

    const cover = document.createElement('div');
    cover.className = 'hero-card__cover';

    const urls = getImageUrls(game.image);
    if (urls) {
        const fig = document.createElement('figure');
        fig.className = 'img-wrap hero-cover';
        fig.style.setProperty('--lqip', `url('${urls.lqip}')`);
        
        cover.appendChild(fig);
        // Usar appendCoverHero per a hero cards (mateixa cua, mateix control)
        setTimeout(() => appendCoverHero(cover, game), 0);
    } else if (game.image) {
        const img = document.createElement('img');
        img.src = game.image;
        img.width = 400;
        img.height = 250;
        img.loading = 'eager';
        img.decoding = 'async';
        img.alt = game.name;
        cover.appendChild(img);
    }

    if (game.credit) {
        const credit = document.createElement('span');
        credit.className = 'hero-card__credit';
        credit.textContent = game.credit;
        cover.appendChild(credit);
    }

    const title = document.createElement('h3');
    title.className = 'hero-card__title';
    title.textContent = game.name;

    const desc = document.createElement('p');
    desc.className = 'hero-card__desc';
    desc.textContent = t(game.descKey ?? 'ula.desc');

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'hero-card__btn';
    paintHeroButton(play, stateOf(game), isOfflineGame(game));

    const body = document.createElement('div');
    body.className = 'hero-card__body';
    body.append(title, desc, play);

    card.append(cover, body);
    return card;
}

/**
 * Versió d'appendCover per a hero cards (contenidor .hero-card__cover).
 * Comparteix la mateixa cua i cache loadedCovers.
 */
function appendCoverHero(cover, game) {
    const imgUrl = game.image ? safeCoverImage(game.image) : null;
    if (!imgUrl) return false;

    // El cover conte un .img-wrap (fig) on posarem la imatge
    const fig = cover.querySelector('.img-wrap');
    if (!fig) return false;

    const img = document.createElement('img');
    img.decoding = 'async';
    img.alt = '';
    img.dataset.coverRequestId = String(nextRequestId());
    img.dataset.coverRetryCount = '0';

    cover.classList.remove('card-done');
    cover.classList.add('card-loading');
    fig.appendChild(img);

    if (loadedCovers.has(imgUrl)) {
        img.src = imgUrl;
        if (img.complete && img.naturalWidth > 0) revealCoverHero(cover, img, imgUrl);
        else finishCoverHero(cover, img, imgUrl);
        return true;
    }

    coverQueue.add(async () => {
        if (!img.isConnected) return SKIP;

        img.src = imgUrl;
        ImageLog.debug(`Hero cover ${img.dataset.coverRequestId} queued for:`, imgUrl);

        if (img.complete) {
            if (img.naturalWidth > 0) {
                revealCoverHero(cover, img, imgUrl);
                return undefined;
            }
            img.remove();
            cover.classList.remove('card-loading');
            return SKIP;
        }

        return finishCoverHero(cover, img, imgUrl);
    });

    return true;
}

/** revealCover adaptat per hero cards (contenidor .hero-card__cover) */
function revealCoverHero(cover, img, coverUrl) {
    if (img.naturalWidth === 0) return false;
    loadedCovers.add(coverUrl);
    cover.classList.add('card-done');
    cover.classList.remove('card-loading');
    window.setTimeout(() => cover.classList.remove('card-done'), 600);
    return true;
}

/** finishCover adaptat per hero cards */
async function finishCoverHero(cover, img, coverUrl) {
    const requestId = img.dataset.coverRequestId || 'unknown';
    const result = await waitForCover(img);

    if (result === 'cancel') return SKIP;

    const retryCount = parseInt(img.dataset.coverRetryCount || '0', 10);
    const maxRetries = 2;

    if ((result === 'timeout' || result === 'error') && img.naturalWidth === 0 && retryCount < maxRetries) {
        ImageLog.warn(`Hero cover ${requestId} ${result}, scheduling retry ${retryCount + 1}/${maxRetries}`);
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        img.dataset.coverRetryCount = String(retryCount + 1);
        cover.classList.add('card-loading');
        cover.classList.remove('card-done');
        await new Promise(r => setTimeout(r, delay));
        if (!img.isConnected) return SKIP;
        return finishCoverHero(cover, img, coverUrl);
    }

    if (result === 'timeout' && img.naturalWidth === 0) {
        cover.classList.remove('card-loading');
        img.addEventListener('load', () => revealCoverHero(cover, img, coverUrl), { once: true });
        img.addEventListener('error', () => {
            img.classList.add('error');
            img.remove();
        }, { once: true });
        if (img.complete && img.naturalWidth > 0) revealCoverHero(cover, img, coverUrl);
        return SKIP;
    }

    if (result === 'error' && img.naturalWidth === 0) {
        img.classList.add('error');
        img.remove();
        cover.classList.remove('card-loading');
        return SKIP;
    }

    revealCoverHero(cover, img, coverUrl);
    return undefined;
}

/**
 * L'estat de la baixada al botó de la card de la casa: el mateix
 * contracte que `paintOfflineBadge`, però amb text llegible al botó.
 */
function paintHeroButton(button, info, offline) {
    // Els jocs de la casa que no es baixen (Neon Arena) no passen per la
    // cua de descàrrega: per al botó és com si ja estiguessin a punt.
    const state = offline ? info.state : 'ready';
    button.dataset.offlineState = state;

    if (state === 'downloading') {
        button.innerHTML = `<span class="hero-card__percent">${info.percent || 0}%</span>`;
        button.title = t('offline.downloading');
        button.setAttribute('aria-label', t('offline.downloading'));
        return;
    }

    if (state === 'ready') {
        button.innerHTML =
            `${iconMarkup('play', { size: 16, fill: 'currentColor' })}<span>${t('offline.play')}</span>`;
        button.title = t('offline.play');
        button.setAttribute('aria-label', t('offline.play'));
        return;
    }

    if (state === 'failed') {
        button.innerHTML = `${iconMarkup('rotate-cw', { size: 16 })}<span>${t('offline.failed')}</span>`;
        button.title = t('offline.failed');
        button.setAttribute('aria-label', t('offline.failed'));
        return;
    }

    button.innerHTML = `${iconMarkup('download', { size: 16 })}<span>${t('offline.download')}</span>`;
    button.title = t('offline.download');
    button.setAttribute('aria-label', t('offline.download'));
}

/**
 * El botó de descàrrega/estat d'un joc offline.
 *
 * No rep clics (la targeta sencera ja decideix entre baixar i obrir):
 * només és l'indicador de l'estat, que canvia en rebre l'avenç.
 */
function offlineBadge(game) {
    const badge = document.createElement('span');
    badge.className = 'offline-btn';
    badge.setAttribute('role', 'img');
    badge.tabIndex = -1;
    paintOfflineBadge(badge, stateOf(game));
    return badge;
}

function paintOfflineBadge(badge, info) {
    badge.dataset.offlineState = info.state;

    if (info.state === 'downloading') {
        badge.innerHTML = `<span class="offline-percent">${info.percent || 0}%</span>`;
        badge.title = t('offline.downloading');
        badge.setAttribute('aria-label', t('offline.downloading'));
        return;
    }

    if (info.state === 'ready') {
        badge.innerHTML = iconMarkup('play', { size: 16, fill: 'currentColor' });
        badge.title = t('offline.play');
        badge.setAttribute('aria-label', t('offline.play'));
        return;
    }

    if (info.state === 'error') {
        badge.innerHTML = iconMarkup('rotate-cw', { size: 16 });
        badge.title = t('offline.failed');
        badge.setAttribute('aria-label', t('offline.failed'));
        return;
    }

    badge.innerHTML = iconMarkup('download', { size: 16 });
    badge.title = t('offline.download');
    badge.setAttribute('aria-label', t('offline.download'));
}

/**
 * Repinta el badge d'una targeta ja dibuixada, si és al DOM.
 * (La virtualització en té poques de vives; la resta es pinten en
 * construir-se amb l'estat que els toqui.)
 */
export function updateOfflineCard(url, info) {
    const grid = $('gameGrid');
    if (!grid) return;

    for (const card of grid.querySelectorAll('.card-wrapper, .hero-card')) {
        if (card.dataset.url !== url) continue;

        if (card.classList.contains('hero-card')) {
            const button = card.querySelector('.hero-card__btn');
            if (button) paintHeroButton(button, info);
        } else {
            const badge = card.querySelector('.offline-btn');
            if (badge) paintOfflineBadge(badge, info);
        }
        return;
    }
}

/** Buida el grid i deixa el comptador a zero. */
export function resetGrid() {
    const grid = $('gameGrid');
    if (!grid) return;
    
    // Protecció contra race conditions
    if (isResetting) {
        ImageLog.debug('resetGrid skipped: already resetting');
        return;
    }
    isResetting = true;

    try {
        grid.classList.remove('skeleton-grid');
        // Igual que a la poda: s'avisa la cua (perquè no es quedi esperant
        // un `decode()` que ja no acabarà) i, sense `src`, els bitmaps de
        // les portades que es desmunten queden lliures per al navegador.
        for (const img of grid.querySelectorAll('img')) cancelCover(img);
        grid.replaceChildren();
        itemsShown = 0;
        ImageLog.debug('Grid reset complete');
    } finally {
        isResetting = false;
    }
}

/**
 * Torna a provar les portades que han fallat explicitament.
 *
 * Només reintenta imatges amb classe `.error` (fallida confirmada),
 * no les que encara estan carregant. Màxim 3 intents per imatge.
 * Els reintents passen per la cua per respectar la concurrència.
 */
export function retryCovers() {
    const grid = $('gameGrid');
    if (!grid) return;

    for (const fig of grid.querySelectorAll('.img-wrap')) {
        const img = fig.querySelector('img');
        if (!img || !img.classList.contains('error')) continue;

        const wrapper = fig.closest('.card-wrapper, .hero-card');
        if (!wrapper) continue;

        const game = visibleGames.find(g => g.url === wrapper.dataset.url);
        if (game) rebuildImage(fig, game);
    }
}

function rebuildImage(fig, game) {
    const oldImg = fig.querySelector('img');
    const retryCount = parseInt(oldImg.dataset.retryCount || '0', 10);
    if (retryCount >= 3) return;

    const urls = getImageUrls(game.image);
    if (!urls) return;

    const isHero = fig.classList.contains('hero-cover');
    const coverUrl = game.image ? safeCoverImage(game.image) : null;
    if (!coverUrl) return;

    // Neteja la imatge vella
    cancelCover(oldImg);
    oldImg.remove();

    // Crear nova imatge amb recompte de reintent
    const newImg = document.createElement('img');
    newImg.decoding = 'async';
    newImg.alt = game.name;
    newImg.dataset.coverRequestId = String(nextRequestId());
    newImg.dataset.coverRetryCount = String(retryCount + 1);
    newImg.dataset.originalSrc = game.image;
    newImg.dataset.full = urls.full;
    newImg.loading = 'lazy';

    const isHeroCover = fig.classList.contains('hero-cover');
    if (isHeroCover) {
        newImg.width = 400;
        newImg.height = 250;
    } else {
        newImg.width = 400;
        newImg.height = 400;
    }

    fig.appendChild(newImg);

    // Passar per la cua per respectar concurrència
    coverQueue.add(async () => {
        if (!newImg.isConnected) return SKIP;
        
        newImg.src = coverUrl;
        ImageLog.debug(`Retry cover ${newImg.dataset.coverRequestId} (attempt ${retryCount + 1}) for:`, coverUrl);

        if (newImg.complete) {
            if (newImg.naturalWidth > 0) {
                if (isHeroCover) revealCoverHero(fig.closest('.hero-card__cover'), newImg, coverUrl);
                else revealCover(fig.closest('.card'), newImg, coverUrl);
                return undefined;
            }
            newImg.remove();
            if (isHeroCover) fig.closest('.hero-card__cover').classList.remove('card-loading');
            else fig.closest('.card').classList.remove('card-loading');
            return SKIP;
        }

        if (isHeroCover) return finishCoverHero(fig.closest('.hero-card__cover'), newImg, coverUrl);
        return finishCover(fig.closest('.card'), newImg, coverUrl);
    });
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
        const card = event.target.closest('.card-wrapper, .hero-card');
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
    
    // Protecció contra race conditions: evita càrregues simultànies
    if (isLoadingMore) {
        ImageLog.debug('loadMore skipped: already loading');
        return;
    }
    isLoadingMore = true;

    try {
        const batch = visibleGames.slice(itemsShown, itemsShown + CHUNK_SIZE);
        if (batch.length === 0) return;

        const fragment = document.createDocumentFragment();
        // Les cards de la casa comparteixen una fila pròpia: el contenidor
        // les reparteix en dues columnes i, si només n'hi ha una, la deixa
        // ocupar tota l'amplada.
        let heroRow = null;
        for (let i = 0; i < batch.length; i++) {
            const game = batch[i];
            const globalIndex = itemsShown + i;
            if (game.hero) {
                if (!heroRow) {
                    heroRow = document.createElement('div');
                    heroRow.className = 'hero-row';
                    fragment.appendChild(heroRow);
                }
                heroRow.appendChild(buildHeroCard(game, globalIndex));
            } else {
                heroRow = null;
                fragment.appendChild(buildCard(game, globalIndex));
            }
        }
        grid.appendChild(fragment);

        itemsShown += batch.length;
        grid.classList.remove('skeleton-grid');

        requestAnimationFrame(() => {
            const fresh = grid.querySelectorAll('.card-wrapper:not(.visible), .hero-card:not(.visible)');
            for (let i = 0; i < fresh.length; i++) {
                fresh[i].style.transitionDelay = `${i * REVEAL_STAGGER}ms`;
                fresh[i].classList.add('visible');
            }
        });
    } finally {
        isLoadingMore = false;
    }
}

/** Que al DOM no hi hagi més de MAX_DOM_CARDS targetes. */
function pruneGrid() {
    const grid = $('gameGrid');
    if (!grid) return;

    // Un `.hero-row` pot dur més d'una card: es compten les peces, no
    // els fills, perquè la fila dels jocs de la casa no desquadri el
    // límit de la virtualització.
    let excess = grid.querySelectorAll('.card-wrapper, .hero-card').length - MAX_DOM_CARDS;
    while (excess > 0 && grid.firstElementChild) {
        const block = grid.firstElementChild;
        const count = block.classList.contains('hero-row')
            ? block.querySelectorAll('.hero-card').length
            : 1;

        // Abans de desmuntar-la, es deixa la portada: el navegador ja
        // pot alliberar el seu bitmap (RAM), perquè la targeta no hi
        // tornarà. Si la graella es refés, es reconstruiria sencera.
        // També s'avisa la cua perquè un `decode()` pendent no ocupi
        // un torn per sempre.
        for (const img of block.querySelectorAll('img')) cancelCover(img);
        block.remove();
        excess -= count;
    }
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

/**
 * Noms alternatius per al cercador.
 *
 * Hi ha jocs que es coneixen per una abreviació que no apareix a la
 * targeta («GTA» per a «Grand Theft Auto»). Aquí hi ha aquests àlies,
 * amb l'URL del joc com a clau —estable encara que canviï el nom—, i
 * `matches` els té en compte a més del nom.
 */
const SEARCH_ALIASES = {
    'clgta.html': ['gta', 'gta i', 'gta 1']
};

function matches(game) {
    const term = filters.search;
    const name = game.name.toLowerCase();
    const aliases = SEARCH_ALIASES[game.url] ?? [];
    const matchesSearch =
        !term ||
        name.includes(term) ||
        aliases.some((alias) => alias.includes(term));
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

/**
 * El forat del logotip fa d'esquelet fins que la imatge és sencera.
 *
 * `.logo-loading` ve del HTML perquè l'esquelet ja es vegi a la
 * primera pintada, abans que cap mòdul corri; aquí el retirem quan la
 * imatge ha arribat sencera. Si no el traguéssim, el shimmer es
 * veuria per les vores transparents del PNG per sempre. `start()`
 * (main.js) la crida aviat — la imatge no ha d'esperar l'idioma — i
 * `updateLogo` la torna a cridar en canviar de tema, que fa tornar a
 * baixar la imatge.
 */
export function watchLogoLoad() {
    const logo = $('logoImg');
    if (!logo) return;

    const clear = () => logo.classList.remove('logo-loading');
    if (logo.complete && logo.naturalWidth) {
        clear();
        return;
    }
    logo.classList.add('logo-loading');
    logo.addEventListener('load', clear, { once: true });
    logo.addEventListener('error', clear, { once: true });
}

export function updateLogo() {
    const logo = $('logoImg');
    if (!logo) return;
    const want = document.body.classList.contains('dark-theme') ? LOGO_DARK : LOGO_LIGHT;
    // Sense la guarda, reescriure la mateixa `src` tornaria a començar
    // la descàrrega del logotip a cada arrencada.
    if (logo.getAttribute('src') !== want) logo.src = want;
    watchLogoLoad();
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

/**
 * Una durada que s'adapta al tamany del número.
 *
 * La plantilla `stats.duration` («{d}d {h}h {m}m {s}s») porta la unitat
 * i el separador de cada idioma darrere del seu marcador, però no cal
 * mostrar-ho sempre tot: cada bloc surt quan aporta informació. Per
 * sota de l'hora, la unitat petita és viva — segons per a les xifres
 * petites («12m 30s», «45s») — i a partir d'allà el format s'allarga
 * cap a «2h 35m» i «2d 3h 15m». Un comptador «0d 0h 5m» no diu res que
 * el número no digui més bé.
 */
function formatPlaytime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const values = {
        d: Math.floor(seconds / 86400),
        h: Math.floor((seconds % 86400) / 3600),
        m: Math.floor((seconds % 3600) / 60),
        s: seconds % 60
    };
    // Segons només quan no hi hauria cap unitat major; els minuts es
    // callen quan la xifra és de pocs segons («45s» en lloc de «0m 45s»).
    const shown = {
        d: values.d > 0,
        h: values.d > 0 || values.h > 0,
        m: !(values.d === 0 && values.h === 0 && values.m === 0),
        s: values.d === 0 && values.h === 0
    };

    const template = t('stats.duration');
    // Es parteix pels marcadors: darrere de cada un hi ha la seva unitat
    // («d », «時間 », « นาที»…) i el separador cap a la següent.
    const parts = template.split(/(\{[dhms]\})/);
    if (parts.length !== 9) return `${values.m}m ${values.s}s`;

    let out = parts[0];
    ['d', 'h', 'm', 's'].forEach((unit, index) => {
        if (!shown[unit]) return;
        out += `${values[unit]}${parts[index * 2 + 2]}`;
    });

    return out.trim();
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
    if (time) time.textContent = formatPlaytime(stats.timeSeconds);

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
        timeCell.textContent = formatPlaytime(entry.timePlayed ?? 0);

        const dateCell = document.createElement('td');
        dateCell.className = 'history-date';
        dateCell.textContent = formatDate(entry.lastPlayed);

        row.append(nameCell, countCell, timeCell, dateCell);
        fragment.appendChild(row);
    }

    body.replaceChildren(fragment);
}