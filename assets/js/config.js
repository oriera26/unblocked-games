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

/**
 * Cada quant es mira si l'usuari continua actiu mentre hi ha un joc
 * obert. Un segon n'hi ha prou: el que es compta són segons.
 */
export const PLAY_TICK_MS = 1000;

/**
 * Sense cap interacció durant aquest temps, el comptador es pausa.
 *
 * Un joc pot estar renderitzant una cinemàtica, un vídeo o una intro
 * sense que ningú hi toqui res: allò no és temps de joc.
 */
export const PLAY_IDLE_MS = 60000;

/**
 * Cada quant es desa el temps acumulat.
 *
 * Es desa mentre es juga i no només en tancar: si el navegador es tanca
 * de cop, la partida no es perd del tot.
 */
export const PLAY_FLUSH_MS = 30000;

/**
 * Cada quant es compara el que hi ha al dispositiu amb el que hi ha al
 * compte.
 *
 * No és temps real: una ronda cada deu segons fa que el que facis en un
 * dispositiu arribi a l'altre en menys d'un minut, i en canvi no fa
 * pagar lectures de Firestore cada vegada que es mou una coma.
 */
export const SYNC_INTERVAL_MS = 10000;

/**
 * Cada quant es torna a llegir IndexedDB sencera.
 *
 * Llegeix tots els desats dels jocs, així que es fa menys sovint que la
 * ronda normal: les partides d'IndexedDB canvien molt menys que les
 * estadístiques.
 */
export const SYNC_IDB_INTERVAL_MS = 40000;

/**
 * Sostres del que s'agafa d'IndexedDB.
 *
 * Les bases dels jocs no només contenen desats: els motors (Unity, per
 * exemple) hi deixen memòries cau senceres de megabytes. Un valor gros
 * gairebé mai no és una partida, i llegir-lo i codificar-lo costaria
 * CPU i memòria per a res. Aquests límits el deixen fora sense deixar
 * de sincronitzar els desats de debò, que són petits.
 */
export const SYNC_IDB_MAX_ROW_BYTES = 1024 * 1024;
export const SYNC_IDB_MAX_DB_BYTES = 2 * 1024 * 1024;

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
    { id: 'offline', label: 'Offline', key: 'cat.offline', icon: 'download' },
    { id: 'ula', label: 'Ula', key: 'cat.ula', icon: 'volleyball' },
    { id: 'altres', label: 'Altres', key: 'cat.altres', icon: 'more-horizontal' }
];

export const CATEGORY_ALL = 'tots';

/* --- Renderitzat del grid ---------------------------------------- */

/**
 * Virtualització lleugera: quantes targetes es deixen al DOM com a
 * màxim. El grid mostra 1.867 jocs, però en posar-los tots es fan
 * pagar de dues maneres: memoria i cost de maquetació en cada scroll.
 */
export const MAX_DOM_CARDS = 150;

/** Quantes targetes s'afegeixen a cada acumulació. */
export const CHUNK_SIZE = 30;

/** Retard escalonat entre l'aparició de dues targetes consecutives. */
export const REVEAL_STAGGER = 15;

/* --- Cua de les portades ------------------------------------------ */

/**
 * Quantes portades es demanen alhora com a màxim i quant es respira
 * entre tanda i tanda. És el que manté la CPU i la RAM planes mentre
 * la graella es va omplint: més val trigar una estona que clavar
 * l'equip (30 portades de cop, en un equip fluix, es noten).
 */
export const COVER_CONCURRENCY = 2;
export const COVER_GAP_MS = 60;

/**
 * Màxim que una portada pot retenir un torn de la cua. Si la xarxa es
 * queda penjada o `decode()` no resol (una imatge que s'ha desmuntat a
 * mig camí), la cua ha de poder seguir: la resta de targetes no poden
 * quedar-se amb l'esquelet per sempre.
 */
export const COVER_TIMEOUT_MS = 10000;

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
    gameVolumes: 'ulaGameVolumes',
    /**
     * Tria de mode rendiment feta des del menú del joc, per joc: mapa
     * `{ "cl2048.html": true }`. Sense entrada, val el global.
     *
     * Com el mode rendiment global, és una preferència del dispositiu i
     * no es sincronitza amb el compte.
     */
    gamePerformance: 'ulaGamePerf',
    /** Zoom triat per al reproductor, en % (50…200). Del dispositiu. */
    playerZoom: 'ulaPlayerZoom',
    /**
     * Metadades de sincronització d'aquest dispositiu (sense sincronitzar).
     *
     * Per a cada entrada guardada al compte, què hi havia quan es va
     * sincronitzar l'últim cop: sense això, en reobrir la pàgina no
     * hi hauria manera de saber si el que hi ha a local ha canviat des
     * de llavors i tot valdria com a conflicte.
     */
    syncMeta: 'ulaSyncMeta',
    /**
     * L'estat de la secció Social (amics, xat, lligues, feed…).
     *
     * Viu al dispositiu mentre no hi hagi un backend social connectat;
     * `social.js` n'és l'únic amo.
     */
    social: 'ulaSocial',
    /**
     * El `stats.timeSeconds` amb què va començar cada temporada de lliga
     * (`{ "leagueId:2": 3600 }`), a partir de la segona. És del
     * dispositiu i serveix perquè la sincronització manual no torni a
     * portar a la lliga l'historial de temporades anteriors.
     */
    leagueSync: 'ulaLeagueSync'
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
 * Els jocs offline viuen en una carpeta pròpia.
 *
 * No és un detall estètic: el service worker reconeix aquesta carpeta i
 * els serveix sense el pedaç de volum (que exigiria llegir 50 MB de text
 * a cada obertura) i sense desar-los a la memòria cau automàticament.
 * Només s'hi baixen quan l'usuari pitja el botó de descàrrega.
 */
export const OFFLINE_GAMES_DIR = 'assets/offline/';

/**
 * Nom de la memòria cau dels jocs offline (Cache Storage).
 *
 * El service worker no pot importar aquest mòdul i porta el mateix
 * literal escrit a mà; si es canvia, cal canviar-lo als dos llocs.
 */
export const OFFLINE_CACHE_NAME = 'ula-offline-games';

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