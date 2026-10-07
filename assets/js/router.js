/**
 * router.js · quina vista es mostra i com s'hi arriba.
 *
 * L'aplicació té tres vistes: arcade, stats i 404. Abans el canvi es
 * feia amb una funció global i la vista es triava de dues maneres
 * diferents segons qui ho demanés, de manera que l'estat es desincronitzava
 * fàcilment. Aquí hi ha un únic `go()`, i tothom hi passa per ell.
 */

import { VIEW_TRANSITION_MS } from './config.js';

export const VIEWS = ['arcade', 'stats'];

/** La vista que hi ha visible ara mateix. */
let current = 'arcade';

/** Hi ha una transició en marxa? Ignora els clics que hi arriben. */
let animating = false;

function viewEl(id) {
    return document.getElementById(`view-${id}`);
}

/** Les vistes que mostren el selector de categories. */
function showsCategories(id) {
    return id === 'arcade' || id === '404';
}

function markNav(id) {
    for (const link of document.querySelectorAll('.nav-link')) {
        link.classList.toggle('active', link.dataset.view === id);
    }
}

function showCategoriesBar(visible) {
    const bar = document.getElementById('categoryContainer');
    if (bar) bar.style.display = visible ? 'block' : 'none';
}

/**
 * Vés a una vista. Retorna cert si s'ha canviat.
 *
 * @param {string} id
 * @param {{animate?: boolean, direction?: 'forward'|'back', onArrive?: (id: string) => void}} [options]
 */
export function go(id, options = {}) {
    const { animate = true, direction = 'forward', onArrive } = options;

    if (!viewEl(id)) {
        console.warn(`[ula] vista desconeguda: ${id}`);
        return false;
    }
    if (id === current) {
        onArrive?.(id);
        return false;
    }

    // El 404 no té link al nav; hi posem l'arcade, que és on tornarem.
    markNav(showsCategories(id) ? 'arcade' : id);
    showCategoriesBar(showsCategories(id));

    const from = viewEl(current);
    const to = viewEl(id);

    if (!animate) {
        for (const view of document.querySelectorAll('.view')) view.classList.remove('active');
        // L'estil inline no pot quedar-se atrapat d'una vista a una altra:
        // `display: none` inline guanyaria `.view.active { display: block }`
        // i la vista activa no es veuria (l'error de "la llista desapareix").
        to.style.display = '';
        to.classList.add('active');
        current = id;
        writeUrl(id);
        onArrive?.(id);
        return true;
    }

    if (animating) return false;
    animating = true;

    // El CSS ho defineix així: slideFromRight entra per la dreta i
    // slideToLeft surt per l'esquerra. Avançar és, doncs, empènyer el
    // contingut nou des de la dreta mentre el vell surt per l'esquerra;
    // retrocedir és el revés.
    const forward = direction === 'forward';
    const outClass = forward ? 'animate-out-left' : 'animate-out-right';
    const inClass = forward ? 'animate-in-right' : 'animate-in-left';

    from?.classList.remove('active');
    from?.classList.add(outClass);
    // Idem que en el cas sense animació: netegem qualsevol `display: none`
    // inline pendent abans d'activar-la.
    to.style.display = '';
    to.classList.add('active', inClass);

    setTimeout(() => {
        // En sortir no cal amagar `from` a mà: `.view` ja té `display: none`
        // de base i a més li llevem `active` i la classe d'animació. Posar-hi
        // un `display: none` inline era el que trencava la tornada.
        from?.classList.remove(outClass);
        to.classList.remove(inClass);
        animating = false;
        current = id;
        writeUrl(id);
        onArrive?.(id);
    }, VIEW_TRANSITION_MS);

    return true;
}

/**
 * Escriu la vista a la barra d'adreces.
 *
 * El manifest.json anuncia dos accesos directes, `/?view=arcade` i
 * `/?view=stats`, però res llegia el paràmetre: obrir-los sempre mostrava
 * l'arcade. Ara l'estat es reflecteix a l'URL amb `replaceState`, de
 * manera que el botó enrere no acumula un històric de pantalles que
 * l'usuari no ha navegat de debò.
 */
function writeUrl(id) {
    const url = new URL(window.location.href);
    if (id === 'arcade') url.searchParams.delete('view');
    else url.searchParams.set('view', id);

    try {
        history.replaceState({ view: id }, '', url);
    } catch {
        // Algunes finestres (sandbox, alguns WebView d'Electron amb
        // file://) no permeten history. No és motiu per aturar res.
    }
}

/** L'id demanat a l'URL, si n'hi ha un de vàlid. */
export function viewFromUrl() {
    const requested = new URL(window.location.href).searchParams.get('view');
    return VIEWS.includes(requested) ? requested : 'arcade';
}

export function currentView() {
    return current;
}

/**
 * Enganxa el routing a la interfície.
 *
 * @param {{ onArrive?: (id: string) => void }} hooks
 */
export function startRouter({ onArrive } = {}) {
    // El logo torna sempre a l'arcade.
    document.querySelector('.logo')?.addEventListener('click', () => {
        go('arcade', { direction: 'back', onArrive });
    });

    for (const link of document.querySelectorAll('.nav-link')) {
        link.addEventListener('click', () => {
            // Avançar és anar de l'arcade a les estadístiques; des de les
            // estadístiques qualsevol altra cosa és retrocedir.
            const forward = current === 'arcade';
            go(link.dataset.view, { direction: forward ? 'forward' : 'back', onArrive });
        });
    }

    // L'enllaç profund pot arribar en qualsevol moment.
    window.addEventListener('popstate', () => {
        go(viewFromUrl(), { animate: false, onArrive });
    });

    return viewFromUrl();
}