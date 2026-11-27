/*
 * Adaptador local del SDK de Poki.
 *
 * El joc original carregava el SDK publicitari de Poki des de la xarxa.
 * Aquesta còpia conserva només les API que el joc necessita, sense
 * anunci ni cap connexió externa, perquè la partida funcioni completament
 * sense Internet.
 */
(() => {
    'use strict';

    const resolved = Promise.resolve();
    const noop = () => {};

    globalThis.PokiSDK = {
        init: () => resolved,
        setDebug: noop,
        setLogging: noop,
        commercialBreak: () => resolved,
        rewardedBreak: () => resolved,
        displayAd: (_onStart, onComplete) => {
            if (typeof onComplete === 'function') onComplete();
            return resolved;
        },
        destroyAd: noop,
        gameLoadingStart: noop,
        gameLoadingFinished: noop,
        gameLoadingProgress: noop,
        gameInteractive: noop,
        gameplayStart: noop,
        gameplayStop: noop,
        happyTime: noop,
        roundStart: noop,
        roundEnd: noop,
        measure: noop,
        sendHighscore: noop,
        muteAd: noop,
        customEvent: noop,
        captureError: noop,
        getUser: () => Promise.resolve(null),
        getToken: () => Promise.resolve(null),
        login: () => Promise.resolve(null),
        shareableURL: () => Promise.resolve(''),
        openExternalLink: (url) => window.open(url, '_blank', 'noopener'),
        movePill: noop,
        updateGameAndReload: noop,
        isAdBlocked: () => true
    };
})();
