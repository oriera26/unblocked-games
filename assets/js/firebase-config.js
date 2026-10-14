/**
 * firebase-config.js · la configuració del projecte de Firebase.
 *
 * Aquest és l'únic fitxer que cal tocar per moure l'aplicació d'un
 * projecte de Firebase a un altre. Generat amb
 * `tools/tmp/gen-firebase-config.mjs` a partir de l'sdkconfig de la CLI.
 *
 * AVÍS sobre què és secret i què no:
 *
 *   El que hi ha aquí NO és una clau privada. És la configuració
 *   pública d'una app web: el navegador ha de tenir-la per poder parlar
 *   amb els serveis de Firebase, i com que no hi ha pas de build (GitHub
 *   Pages serveix els fitxers tal com estan), viu al repo així. El que
 *   realament protegeix les dades és `firestore.rules` (qui pot llegir i
 *   escriure) i el llistat de dominis autoritzats de la consola.
 *
 *   Les claus que SÍ són secrets i que mai no s'han de tocar aquest
 *   repositori són: la clau de compte de servei (`service account`), els
 *   secrets del client OAuth i qualsevol `.json` de credencials.
 *
 * S'han omès a posta dos camps del sdkconfig:
 *
 *   storageBucket  no fem servir Cloud Storage (pla gratuït; les
 *                  imatges ja van dins del repo).
 *   measurementId  activaria Google Analytics, que obligaria a ampliar
 *                  la CSP amb dominis de tercers.
 *
 * Si alguna vegada cal desconnectar-ho tot de cop (per exemple per fer
 * proves offline), es posa `apiKey: ''`: els mòduls que depenen
 * d'aquí miren `IS_CONFIGURED` i es retiren sols, sense cap error a
 * consola.
 */

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQXm65oJufX6rjMmGNXaBlxGGOh8AtFKc",
    authDomain: "unblocked-games-by-ula.firebaseapp.com",
    projectId: "unblocked-games-by-ula",
    appId: "1:732759932709:web:357073866017951ace24cc",
    messagingSenderId: "732759932709",
};

/** Cert quan hi ha prou configuració per intentar connectar. */
export const IS_CONFIGURED =
    Boolean(FIREBASE_CONFIG.apiKey) && Boolean(FIREBASE_CONFIG.projectId);

/**
 * Com es guarda la sessió de compte:
 *
 *   'local'   sobreviu a tancar el navegador (el que toca per defecte:
 *             l'usuari espera trobar-se dins en tornar-hi)
 *   'session'  esborra en tancar la finestra
 *   'none'    només en memòria: la segura, però obliga a entrar-hi a
 *             cada recàrrega
 *
 * Qualsevol altre valor cau a 'local'. El nom ha de ser exactament
 * aquest: auth.js els fa servir com a claus i un `'memory'` es
 * desaria al disc sense dir-ho.
 *
 * En qualsevol dels tres la clau de recuperació no surt del dispositiu
 * del mateix usuari: només canvia quant de temps hi és.
 */
export const SESSION_MODE = 'local';
