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
                console.log("C3 Bridge: SUCCESS! Intercepted Poki Init.");
                if (config) {
                    console.log("-*****-");
                    config.submitScore = (callback) => {
                        // I never come to this
                        console.log("C3 Bridge: Secret callback captured!"); 
                        window.myPokiSecret.submit = callback;
                    };
                }
                return originalInit.call(this, config);
            };
        },
        configurable: true
    });
})();