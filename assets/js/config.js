/**
 * config.js · les constants del projecte, en un sol lloc.
 *
 * Aquest fitxer no importa res: és la capa on tot es connecta sense
 * dependre de cap altre mòdul.
 */

/* --- Temps, en mil·lisegons ------------------------------------- */

/** Temps màxim que es mostra el spinner mentre carrega un joc. */
export const LOADER_DURATION = 7000;

/** Temps que esperem l'iframe abans de substituir-la per offline.html. */
export const FALLBACK_DURATION = 10000;

/** Durada de la transició entre vistes (ha de coincidir amb el CSS). */
export const VIEW_TRANSITION_MS = 320;

/* --- Categories -------------------------------------------------- */

/**
 * Els ids han de coincidir amb el camp `type` de gameList.js.
 * 'tots' és la categoria neutra: no filtra.
 *
 * `label` és el català de fàbrica (el que es veu si la traducció no
 * arriba) i `key` és la clau d'i18n, resolta a t() en dibuixar-les.
 */
export const CATEGORIES = [
    { id: 'tots', label: 'Tots', key: 'cat.tots', icon: 'layout-grid' },
    { id: 'accio', label: 'Acció', key: 'cat.accio', icon: 'zap' },
    { id: 'puzle', label: 'Puzle', key: 'cat.puzle', icon: 'brain' },
    { id: 'esports', label: 'Esports', key: 'cat.esports', icon: 'trophy' },
    { id: 'retro', label: 'Retro', key: 'cat.retro', icon: 'joystick' },
    { id: 'altres', label: 'Altres', key: 'cat.altres', icon: 'more-horizontal' }
];

export const CATEGORY_ALL = 'tots';

/* --- Renderitzat del grid ---------------------------------------- */

/**
 * Virtualització lleugera: quantes targetes es deixen al DOM com a
 * màxim. El grid mostra 697 jocs, però en posar-los tots es fan
 * pagar de dues maneres: memoria i cost de maquetació en cada scroll.
 */
export const MAX_DOM_CARDS = 150;

/** Quantes targetes s'afegeixen a cada acumulació. */
export const CHUNK_SIZE = 30;

/** Retard escalonat entre l'aparició de dues targetes consecutives. */
export const REVEAL_STAGGER = 15;

/** Punts que suma cada partida. */
export const POINTS_PER_PLAY = 15;

/* --- Persistència ------------------------------------------------- */

export const STORAGE_KEYS = {
    favorites: 'ulaFavorites',
    stats: 'ulaStats',
    performanceMode: 'ulaPerformanceMode',
    appBannerDismissed: 'ulaAppBannerDismissed',
    /** Idioma triat. Absent = el que diu el navegador. El llegeix també offline.html. */
    lang: 'ulaLang',
    /**
     * Volum de cada joc, com a mapa `{ "cl2048.html": 0.5 }`.
     *
     * El llegeix també `game-volume.js`, que corre dins de l'iframe i
     * no pot importar aquest mòdul: el nom de la clau hi està escrit
     * literalment i ha de ser el mateix.
     */
    gameVolumes: 'ulaGameVolumes'
};

/** Volum d'un joc de nou (0–1), quan l'usuari encara no n'ha tocat cap. */
export const DEFAULT_GAME_VOLUME = 1;

/** Forma de `userStats` en una instal·lació nova. */
export const DEFAULT_STATS = {
    plays: 0,
    points: 0,
    timeSeconds: 0,
    streak: 0,
    lastDate: null,
    gameHistory: {}
};

/* --- Rutes --------------------------------------------------------- */

export const GAMES_DIR = 'assets/games/';

/**
 * Rutes relatives, no absolutes. Amb `/offline.html` l'aplicació només
 * funciona si es serveix a l'arrel del domini; en_relative funciona
 * igual sota un subdirectori, que és el cas quan l'Electron es serveix
 * des d'un port o que la PWA s'instal·la en una subruta.
 */
export const OFFLINE_URL = 'offline.html';
export const SERVICE_WORKER_URL = 'service-worker.js';

/** Logotip segons el tema actiu. */
export const LOGO_DARK = 'assets/icons/icon-large-dark.png';
export const LOGO_LIGHT = 'assets/icons/icon-large-light.png';