/*
 * Adaptador local de les API del SDK de CrazyGames que utilitza el joc.
 * Conserva el comportament del joc sense carregar anunci ni serveis externs.
 */
(() => {
    'use strict';

    const noop = () => {};

    window.CrazyGamesConstructSDK = {
        game: {
            gameplayStart: noop,
            gameplayStop: noop,
            happytime: noop
        },
        ad: {
            requestAd: () => Promise.resolve({ adFinished: true, adError: false })
        }
    };
})();
