window.myPokiSecret = { submit: null };

(function() {
    let _poki = window.PokiSDK;

    Object.defineProperty(window, 'PokiSDK', {
        get: function() {
            return _poki;
        },
        set: function(val) {
            console.log("C3 Bridge: PokiSDK assigned! Applying interceptor...");
            _poki = val;
            
            // Immediately hook the init function the moment it's assigned
            const originalInit = _poki.init;
            _poki.init = function(config) {
    console.log("C3 Bridge: Intercepted Poki Init.");

    // FORCE a config object if the plugin didn't provide one
    if (!config) {
        console.log("C3 Bridge: Plugin sent no config. Injecting a fresh one!");
        config = {}; 
    }

    // Now that we ARE sure config exists, we set up the listener
    Object.defineProperty(config, 'submitScore', {
        get: function() { return this._internalSubmitHandler; },
        set: function(callbackFromServer) {
            console.log("C3 Bridge: Secret callback captured!");
            window.myPokiSecret.submit = callbackFromServer;
            this._internalSubmitHandler = callbackFromServer;
        },
        configurable: true
    });

    // Pass our injected config into the real Poki initialization
    return originalInit.call(this, config);
};
        },
        configurable: true
    });
})();