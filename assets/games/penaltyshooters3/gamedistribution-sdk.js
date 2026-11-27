/*
 * Adaptador local de les API del SDK de GameDistribution que utilitza el
 * joc. Les peticions d'anunci es resolen immediatament i continuen el joc.
 */
(() => {
    'use strict';

    const finishAd = () => {
        const options = window.GD_OPTIONS;
        if (options && typeof options.onEvent === 'function') {
            options.onEvent({ name: 'SDK_GAME_START' });
        }
        return Promise.resolve({ adFinished: true, adError: false });
    };

    globalThis.gdsdk = {
        showAd: finishAd,
        preloadAd: () => Promise.resolve({ adFinished: false, adError: false }),
        showBanner: () => Promise.resolve({ adFinished: true, adError: false }),
        openConsole: () => {},
        init: () => Promise.resolve(),
        gameReady: () => {}
    };
})();
