/**
 * offline.js · la pàgina «sense connexió».
 *
 * Aquesta pàgina es mostra dins de l'iframe del joc quan no hi ha xarxa
 * o quan un joc no carrega, així que no pot importar cap mòdul: és un
 * script clàssic que només toca aquesta pàgina.
 *
 * Abans tot anava en un <script> en línia i el botó feia servir un
 * `onclick=`. Amb la CSP activa, els scripts en línia no s'executen, de
 * manera que el codi viu aquí i l'esdeveniment s'enganxa amb
 * `addEventListener`.
 */
(function () {
    'use strict';

    var RTL = ['ar', 'he', 'fa', 'ur'];

    var STRINGS = {
        retry: 'Reintentar connexió',
        checking: 'Comprovant...',
        reloading: 'Tornant a carregar...'
    };

    var title = document.getElementById('offlineTitle');
    var text = document.getElementById('offlineText');
    var button = document.getElementById('retryBtn');
    var btnText = document.getElementById('btnText');
    var icon = document.getElementById('retryIcon');

    /** Tradueix la pàgina amb el diccionari de l'idioma triat, si es pot. */
    function applyLang() {
        var lang;
        try {
            lang = localStorage.getItem('ulaLang');
        } catch (err) {
            lang = null;
        }

        if (!lang || lang === 'ca') return;

        fetch('assets/lang/' + lang + '.json')
            .then(function (response) {
                return response.ok ? response.json() : null;
            })
            .then(function (dict) {
                if (!dict) return;

                var get = function (key) {
                    return typeof dict[key] === 'string' ? dict[key] : null;
                };

                var pageTitle = get('offline.title');
                if (pageTitle) {
                    document.title = pageTitle;
                    if (title) title.textContent = pageTitle;
                    document.documentElement.lang = lang;
                    if (RTL.indexOf(lang) !== -1) document.documentElement.dir = 'rtl';
                }

                var pageText = get('offline.text');
                if (pageText && text) text.textContent = pageText;

                var retry = get('offline.retry');
                if (retry) {
                    STRINGS.retry = retry;
                    if (btnText) btnText.textContent = retry;
                }

                var checking = get('offline.checking');
                if (checking) STRINGS.checking = checking;

                var reloading = get('offline.reloading');
                if (reloading) STRINGS.reloading = reloading;
            })
            .catch(function () {
                // Sense xarxa: el català de fàbrica ja és al HTML.
            });
    }

    function handleRetry() {
        if (!button) return;

        button.disabled = true;
        if (icon) icon.classList.add('spin');
        if (btnText) btnText.textContent = STRINGS.checking;

        window.setTimeout(function () {
            if (navigator.onLine) {
                if (btnText) btnText.textContent = STRINGS.reloading;
                window.setTimeout(function () {
                    window.location.reload();
                }, 500);
                return;
            }

            // Encara sense xarxa: es torna a deixar el botó a punt.
            button.disabled = false;
            if (icon) icon.classList.remove('spin');
            if (btnText) btnText.textContent = STRINGS.retry;
        }, 600);
    }

    if (button) button.addEventListener('click', handleRetry);

    applyLang();
})();
