/**
 * game-volume.js · el volum, a dins del joc.
 *
 * Aquest fitxer corre DINS de l'iframe, al costat del joc. No és un
 * mòdul (ha de córrer abans que cap script del joc, així que és un
 * IIFE clàssic) i no importa res de fora: tot el que necessita hi és.
 *
 * Qui el carrega és el service worker (a la web) i server.js (a l'app
 * d'Escripteri i al servidor local), que l'insereixen a l'HTML del joc
 * abans dels seus scripts. Si cap dels dos hi passa — la primera visita,
 * abans que el service worker mani — la pàgina mare el fica des de fora
 * en detectar que l'iframe ja té document; quan arriba tan tard, els
 * `<audio>` es poden escalar igualment, però els contextos de Web Audio
 * creats abans ja no.
 *
 * Fa tres coses:
 *
 *   1. Llegeix el seu volum a localStorage (mateixa clau que la mare) i
 *      l'actualitza quan la mare el canvia, per dues vies: l'esdeveniment
 *      `storage` (que arriba sol a aquesta finestra) i un missatge de la
 *      mare, pel cas que localStorage estigui bloquejat.
 *
 *   2. Escala els `<audio>` i `<video>`: els que ja hi siguin, els que el
 *      joc creï després (MutationObserver) i els que reprodueixi (play).
 *      El `volume` públic continua sent el del joc; per sota multiplica,
 *      així que el joc no se n'adona de res.
 *
 *   3. Intercepta les connexions de Web Audio cap al `destination` i hi
 *      intercala un gain de mestre per contexte: tot el que soni passa
 *      per ell, i baixar-lo baixa el joc sencer.
 *
 * Tot va dins d'un `try`: si una API no existeix o un joc fa alguna cosa
 * estranya, es continua sense control de volum en comptes de trencar el
 * joc. Això és el que menys es pot testejar i el que menys s'ha de
 * deixar caure.
 */
(function () {
    'use strict';

    /**
     * Marca al DOM. Fa dues feines: evita que el pedaç s'instal·li dues
     * vegades i diu a la pàgina mare que ja hi és (i que, per tant, no
     * cal injectar-lo des de fora).
     */
    var MARK = 'ula-volume-bridge';

    function mark() {
        var el = document.documentElement;
        if (el) el.setAttribute('data-ula-volume', MARK);
    }

    var root = document.documentElement;
    if (root && root.hasAttribute('data-ula-volume')) return;
    mark();
    // Si el pedaç s'insereix just després del doctype, l'element <html>
    // encara no existeix: es deixa la marca per a quan hi sigui.
    if (!document.documentElement) document.addEventListener('DOMContentLoaded', mark, { once: true });

    /** Mateixa clau que `STORAGE_KEYS.gameVolumes` de la pàgina mare. */
    var STORAGE_KEY = 'ulaGameVolumes';

    var DEFAULT_VOLUME = 1;
    var current = DEFAULT_VOLUME;

    function clamp(value) {
        var number = Number(value);
        if (!isFinite(number)) return DEFAULT_VOLUME;
        return number < 0 ? 0 : number > 1 ? 1 : number;
    }

    /** Nom del fitxer del joc: la clau amb la que la mare el desa. */
    function gameId() {
        try {
            var path = decodeURIComponent(window.location.pathname || '');
            return path.split('/').pop() || '';
        } catch (err) {
            return (window.location.pathname || '').split('/').pop() || '';
        }
    }

    function storedVolume() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return DEFAULT_VOLUME;

            var map = JSON.parse(raw);
            var value = map && typeof map === 'object' ? map[gameId()] : null;
            if (value === null || value === undefined) return DEFAULT_VOLUME;
            return clamp(value);
        } catch (err) {
            // localStorage inaccessible o valor corrupte: volum de fàbrica.
            return DEFAULT_VOLUME;
        }
    }

    /* ================================================================
       2 · Elements multimèdia
       ================================================================ */

    /** Què li va escriure el joc a cada element (el valor real és aquest × current). */
    var mediaBase = new WeakMap();

    /** Elements que sonen pel graph de Web Audio: ells ja no s'escalen a més. */
    var mediaSkip = new WeakSet();

    var mediaDesc = null;
    try {
        mediaDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    } catch (err) {
        mediaDesc = null;
    }

    function mediaRead(el) {
        try {
            return mediaDesc.get.call(el);
        } catch (err) {
            return DEFAULT_VOLUME;
        }
    }

    function mediaWrite(el, value) {
        try {
            mediaDesc.set.call(el, value);
        } catch (err) {
            // Alguns elements rebutgen posar-hi volum (p. ex. si la llista
            // de reproducció encara no existeix): es continua.
        }
    }

    /** Posa un element al nivell actual, sense acumular escalats. */
    function scaleMedia(el) {
        if (!mediaDesc || mediaSkip.has(el)) return;
        if (!mediaBase.has(el)) mediaBase.set(el, mediaRead(el));
        mediaWrite(el, mediaBase.get(el) * current);
    }

    function scaleAllMedia() {
        if (!mediaDesc) return;
        var all = document.querySelectorAll('audio, video');
        for (var i = 0; i < all.length; i++) scaleMedia(all[i]);
    }

    /** El `volume` públic continua sent el del joc; per sota multiplica. */
    function patchMediaVolume() {
        if (!mediaDesc || !mediaDesc.configurable) return;

        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
            configurable: true,
            enumerable: mediaDesc.enumerable,
            get: function () {
                if (mediaBase.has(this)) return mediaBase.get(this);
                return mediaRead(this);
            },
            set: function (value) {
                var base = clamp(value);
                mediaBase.set(this, base);
                mediaWrite(this, mediaSkip.has(this) ? base : base * current);
            }
        });
    }

    /**
     * Abans de sonar, l'element ha d'estar escalat.
     *
     * El MutationObserver no arriba abans que el joc: crea l'element, el
     * reprodueix i només després, quan s'acaba la tasca, es cobra la
     * mutació. Amb el `play` interceptat, un joc no escapa ni un xic de
     * so al volum de fàbrica.
     */
    function patchMediaPlay() {
        if (!mediaDesc || !HTMLMediaElement.prototype.play) return;

        var original = HTMLMediaElement.prototype.play;
        if (original.__ulaVolume) return;

        var patched = function () {
            try {
                scaleMedia(this);
            } catch (err) {
                /* res: que soni tal com ell vol */
            }
            return original.apply(this, arguments);
        };
        patched.__ulaVolume = true;
        HTMLMediaElement.prototype.play = patched;
    }

    /** Elements nous: el joc els acaba de crear i encara sonarien al màxim. */
    function observeNewMedia() {
        if (!document.documentElement) return;
        try {
            var observer = new MutationObserver(function (records) {
                for (var i = 0; i < records.length; i++) {
                    var added = records[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var node = added[j];
                        if (!node || node.nodeType !== 1) continue;

                        var name = node.nodeName;
                        if (name === 'AUDIO' || name === 'VIDEO') scaleMedia(node);

                        if (node.querySelectorAll) {
                            var nested = node.querySelectorAll('audio, video');
                            for (var k = 0; k < nested.length; k++) scaleMedia(nested[k]);
                        }
                    }
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } catch (err) {
            // Sense MutationObserver només es controla el que ja hi hagi.
        }
    }

    /* ================================================================
       3 · Web Audio
       ================================================================ */

    /** Gain de mestre per contexte, creat el primer cop que algú hi connecta. */
    var masters = [];

    /** El `connect` original, per connectar el gain sense passar per nosaltres. */
    var realConnect = null;

    function masterFor(ctx) {
        for (var i = 0; i < masters.length; i++) {
            if (masters[i].ctx === ctx) return masters[i].gain;
        }

        var gain = ctx.createGain();
        gain.gain.value = current;
        masters.push({ ctx: ctx, gain: gain });

        // El gain ha de sortir cap al destí de debò; si es fes servir el
        // `connect` interceptat, es tornaria a redirigir cap a si mateix.
        try {
            realConnect.call(gain, ctx.destination);
        } catch (err) {
            /* res: sense sortida, però no es trenca res més */
        }

        return gain;
    }

    function setAllMasters(value) {
        for (var i = 0; i < masters.length; i++) {
            try {
                masters[i].gain.gain.value = value;
            } catch (err) {
                // Un contexte tancat ja no accepta canvis: es passa d'ell.
            }
        }
    }

    /**
     * Si el node que connecta és un `MediaElementAudioSourceNode`, el seu
     * `<audio>` ja sona pel graph: escalar-lo a ell i després el gain de
     * mestre seria escalar dues vegades. Se'l treu de la llista i que
     * mani només el gain.
     */
    function unskipElementSource(node) {
        if (typeof MediaElementAudioSourceNode === 'undefined') return;
        if (!(node instanceof MediaElementAudioSourceNode)) return;

        var el = node.mediaElement;
        if (!el) return;

        if (mediaBase.has(el)) mediaWrite(el, mediaBase.get(el));
        mediaSkip.add(el);
    }

    function patchWebAudio() {
        if (typeof AudioNode === 'undefined' || !AudioNode.prototype) return;

        var original = AudioNode.prototype.connect;
        if (typeof original !== 'function' || original.__ulaVolume) return;

        realConnect = original;

        var patched = function (dest) {
            try {
                unskipElementSource(this);

                var ctx = this.context;
                // Els OfflineAudioContext renderitzen i no sonen: no s'hi
                // toca res, que un buffer renderitzat ha de sortir igual.
                if (ctx && typeof ctx.startRendering !== 'function' && dest === ctx.destination) {
                    var output = arguments.length > 1 ? arguments[1] : 0;
                    original.call(this, masterFor(ctx), output);
                    // El que connecta espera tornar a rebre el destí.
                    return dest;
                }
            } catch (err) {
                // Qualsevol cosa rara: connecta tal com estava previst.
            }
            return original.apply(this, arguments);
        };

        patched.__ulaVolume = true;
        AudioNode.prototype.connect = patched;
    }

    /* ================================================================
       1 · El valor
       ================================================================ */

    function setVolume(value) {
        current = clamp(value);
        scaleAllMedia();
        setAllMasters(current);
    }

    // La mare escriu a localStorage des d'una altra finestra: l'esdeveniment
    // `storage` arriba aquí sol, fins i tot si el joc s'ha recarregat.
    window.addEventListener('storage', function (event) {
        if (event.key !== null && event.key !== STORAGE_KEY) return;
        setVolume(storedVolume());
    });

    // I també envia un missatge en obrir el joc i a cada moviment del
    // control: per si localStorage està bloquejat i `storage` no arriba.
    window.addEventListener('message', function (event) {
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.type !== 'ula.volume') return;
        setVolume(event.data.value);
    });

    /* ================================================================ */

    try {
        current = storedVolume();
        patchMediaVolume();
        patchMediaPlay();
        observeNewMedia();
        scaleAllMedia();
        patchWebAudio();
    } catch (err) {
        // Res d'això no pot trencar el joc: es continua amb el so tal com ve.
        try {
            console.warn('[ula] no s\'ha pogut aplicar el control de volum', err);
        } catch (err2) {
            /* res */
        }
    }
})();
