/**
 * boot-watch.js · el pla B si l'aplicació no arriba a arrencar.
 *
 * És un script clàssic (no un mòdul) carregat amb `defer` just abans de
 * `main.js`. Si el mòdul no arriba mai —xarxa caiguda, servidor a
 * mitges—, aquest fitxer igualment corre i, al cap d'uns segons,
 * converteix els esquelets de la graella en un avís amb un botó per
 * tornar-ho a provar. Si l'aplicació arrenca, `main.js` despacha
 * `ula:boot-ok` al document i el temporitzador s'apaga.
 *
 * El text va escrit a mà en tres idiomes: quan aquesta pantalla surt,
 * `i18n.js` no s'ha pogut carregar i no hi ha ningú que tradueixi res.
 * Es tria pel que diu el navegador; la resta d'idiomes veuen l'anglès.
 */

(function () {
    'use strict';

    /** Marge generós: en una xarxa lenta la graella pot trigar, i el pla
        B no ha de sortir mentre l'aplicació encara pot arribar. */
    var LIMIT_MS = 9000;

    var STRINGS = {
        ca: [
            'El catàleg no s\'ha pogut carregar',
            'Sembla que la connexió no va. Comprova-la i torna-ho a provar.',
            'Torna-ho a provar'
        ],
        es: [
            'El catálogo no se ha podido cargar',
            'Parece que la conexión no funciona. Compruébala y vuelve a intentarlo.',
            'Vuelve a intentarlo'
        ],
        en: [
            'The catalog could not load',
            'Your connection seems to be down. Check it and try again.',
            'Try again'
        ]
    };

    function strings() {
        var lang = String(navigator.language || 'en').slice(0, 2).toLowerCase();
        return STRINGS[lang] || STRINGS.en;
    }

    // El forat del logotip del nav porta un esquelet (`logo-loading` al
    // HTML). S'ha de treure tan bon punt la imatge és sencera: si
    // esperéssim l'arrencada dels mòduls, en una xarxa lenta el PNG
    // arribaria molt abans i el shimmer es veuria per les vores
    // transparents del logo. ui.js fa la mateixa comprovació quan corre.
    (function watchLogo() {
        var img = document.getElementById('logoImg');
        if (!img) return;
        var clear = function () {
            img.classList.remove('logo-loading');
        };
        if (img.complete && img.naturalWidth) return clear();
        img.addEventListener('load', clear, { once: true });
        img.addEventListener('error', clear, { once: true });
    })();

    var timer = null;
    var ok = false;

    function showFallback() {
        // Si l'aplicació ja ha arrencat (o el document ja n'ha estat
        // informat), no hi ha res a fer.
        if (ok || document.documentElement.dataset.booted === '1') return;

        var grid = document.getElementById('gameGrid');
        if (!grid) return;

        var text = strings();

        var panel = document.createElement('div');
        panel.className = 'boot-fallback';
        panel.id = 'bootFallback';

        var title = document.createElement('p');
        title.className = 'boot-fallback-title';
        title.textContent = text[0];

        var desc = document.createElement('p');
        desc.className = 'boot-fallback-text';
        desc.textContent = text[1];

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'reset-btn boot-fallback-btn';
        button.textContent = text[2];
        button.addEventListener('click', function () {
            window.location.reload();
        });

        panel.appendChild(title);
        panel.appendChild(desc);
        panel.appendChild(button);

        grid.classList.remove('skeleton-grid');
        grid.replaceChildren(panel);

        // Les píndoles d'esquelet de la barra de categories tampoc no
        // tenen qui les substitueixi en aquest camí.
        var chips = document.querySelectorAll('#pillWrapper .skeleton-cat');
        for (var i = 0; i < chips.length; i++) chips[i].remove();
    }

    /** La crida que fa `main.js` quan l'aplicació ja corre. */
    document.addEventListener('ula:boot-ok', function () {
        ok = true;
        if (timer) clearTimeout(timer);
        timer = null;
        document.documentElement.dataset.booted = '1';
    });

    // Si la connexió torna abans que l'usuari hi faci res, es recarrega
    // sol: aquesta pantalla només hi és perquè no hi havia xarxa.
    window.addEventListener('online', function () {
        if (!ok) window.location.reload();
    });

    timer = setTimeout(showFallback, LIMIT_MS);
})();
