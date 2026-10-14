<div align="center">
  <a href="https://ibb.co/ZpjfKzr0">
    <img src="https://i.ibb.co/9kDp2H07/Gemini-Generated-Image-72qch772qch772qc.jpg" alt="UnblockedGames by Ula" width="760">
  </a>

  <h1>UnblockedGames by Ula</h1>

  <p><strong>1.864 jocs al navegador.</strong> Sense instal·lar res, sense registre i amb suport offline.</p>

  <p>
    <a href="https://oriera26.github.io/unblocked-games/">
      <img src="https://img.shields.io/badge/juga--hi-al%20navegador-007AFF?style=for-the-badge&logo=githubpages&logoColor=white" alt="Juga-hi al navegador">
    </a>
    <a href="https://github.com/oriera26/unblocked-games/releases/latest">
      <img src="https://img.shields.io/badge/descarrega-Windows%20%7C%20Linux-0A84FF?style=for-the-badge&logo=electron&logoColor=white" alt="Descarrega l'app">
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/jocs-1.864-007AFF" alt="1.864 jocs">
    <img src="https://img.shields.io/badge/idiomes-100-007AFF" alt="100 idiomes">
    <img src="https://img.shields.io/badge/PWA-offline-007AFF" alt="PWA offline">
    <img src="https://img.shields.io/badge/Electron-Windows%20%7C%20Linux-007AFF" alt="Windows i Linux">
  </p>
</div>

---

## 🎮 Què és

**UnblockedGames by Ula** és un catàleg de jocs unblocked per jugar directament al navegador, sense descarregar res ni crear cap compte. Funciona com a web estàtica (GitHub Pages) i també com a aplicació d'escriptori per a **Windows** i **Linux**.

El catàleg reuneix **1.864 jocs** en una sola interfície ràpida, amb cerca instantània, categories, favorits, perfil de jugador i suport per jugar sense connexió.

## ✨ Funcions

- **1.864 jocs** de tot tipus, organitzats en categories (Acció, Puzle, Esports, Retro, Offline i Altres).
- **6 jocs offline** descarregables des del propi navegador: *Granny*, *Papa's Cheeseria*, *1v1.lol*, *Escape Road*, *Rocket Soccer Derby* i *Subway Surfers Havana*. Es guarden en una memòria cau dedicada i es poden esborrar quan vulguis.
- **Cerca instantània** i filtres de categoria amb una interfície àgil i animada.
- **Volum per joc**: cada joc recorda el seu propi nivell de so.
- **100 idiomes** amb canvi d'idioma en calent.
- **El teu perfil**: ratxa actual, puntuació, nivell, temps jugat i historial detallat de partides.
- **Favorits** per tenir a mà els jocs de sempre.
- **Tema clar i fosc** i **mode rendiment** per a equips modestos.
- **PWA instal·lable**: funciona offline i s'obre en la seva pròpia finestra.
- **App d'escriptori** per a Windows i Linux a partir de la mateixa base de codi.

## 🌐 Juga-hi al navegador

Obre-ho directament a **[oriera26.github.io/unblocked-games](https://oriera26.github.io/unblocked-games/)**.

En ser una PWA, pots instal·lar-la com una app des del mateix navegador i continuar jugant sense connexió.

## 💻 App d'escriptori

A cada versió es publiquen dos binaris a **[Releases](https://github.com/oriera26/unblocked-games/releases/latest)**:

| Plataforma | Format |
| --- | --- |
| Windows | Instal·lador `.exe` (NSIS, un sol clic) |
| Linux (Debian/Ubuntu) | Paquet `.deb` |

## 🛠️ Desenvolupament

Cal tenir **Node.js** instal·lat.

```bash
npm install             # instal·la Electron i les eines de compilació
npm start               # obre l'app d'escriptori en mode desenvolupament
node server.js          # servidor estàtic local a http://127.0.0.1:3000
node server.js 8080     # ...o en un altre port
npm run dist            # genera l'instal·lador de Windows (.exe)
npm run dist:linux      # genera el paquet de Debian/Ubuntu (.deb)
```

> La verificació automàtica (`npm run check`) depèn d'eines de desenvolupament que viuen només al disc local i **no es versionen** (vegeu `/tools/` a `.gitignore`).

## 🧱 Com està fet

- HTML, CSS i JavaScript purs amb **mòduls ES**, sense frameworks ni dependències en temps d'execució.
- **`service-worker.js`** per a la PWA: cau estàtica, cau de jocs i cau separada per als jocs offline.
- **`electron/` + `electron-builder`** per empaquetar l'aplicació d'escriptori.
- Un fitxer JSON per idioma a **`assets/lang/`** (100 llengües).

## 🔒 Seguretat

- **Política de contingut (CSP) estricta** en tota l'aplicació: només s'executa codi propi (`script-src 'self'`), sense `object`, sense `base` i sense enviaments de formularis. A GitHub Pages s'aplica mitjançant el `<meta http-equiv="Content-Security-Policy">` d'`index.html`; al servidor local i a Electron, a més, s'hi envien capçaleres HTTP (`server.js`). L'única escletxa són els dominis que necessita el compte —els quatre de Firebase i `apis.google.com` per al carregador del popup— (vegeu «Compte de Firebase»), tots explícits i comprovats per `tools/check-firebase.mjs`.
- **Capçaleres HTTP** al servidor local i a Electron: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` i `Cross-Origin-Resource-Policy`. La COOP és **`same-origin-allow-popups`** (no `same-origin`): la finestra del popup de Google ha de poder parlar amb `window.opener`. **No** s'envia `Cross-Origin-Embedder-Policy`: un document amb COEP només pot incrustar marcs que també en portin i faria fallar l'iframe del joc.
- **Els jocs comparteixen el mateix origen que l'aplicació** (cal perquè el pedaç de volum i l'`storage` funcionin). Per això **no hi ha un aïllament real**: l'iframe porta un `sandbox` que limita navegacions de la finestra de dalt, popups i descàrregues fora de control, però un joc pot treure-se'l amb `window.frameElement`. És una mitigació d'accidents, no una frontera de seguretat.
- **El service worker valida** l'origen dels missatges (`ev.source === window.parent`), que les ordres vinguin de l'aplicació i que les URLs del joc siguin del propi origen.
- **`offline.html` no carrega res de cap CDN**: tot el seu CSS i JS viu al repositori, de manera que la pàgina d'error funciona sense xarxa.

## ☁️ Compte de Firebase

L'aplicació està preparada per tenir **compte propi** (correu i Google) i per sincronitzar el progrés entre dispositius. Aquesta secció descriu la **configuració del projecte**, que ja existeix i és comprovable localment. La implementació de la sincronització arriba per fases: primer el login, després el progrés de l'aplicació, després els saves dels jocs i, per últim, l'exportació i la importació.

### El projecte

| Camp | Valor |
| --- | --- |
| Projecte | `unblocked-games-by-ula` (Unblocked Games by Ula) |
| Consola | [console.firebase.google.com/project/unblocked-games-by-ula](https://console.firebase.google.com/project/unblocked-games-by-ula) |
| App web | *Unblocked Games Web* |

### On viu la configuració

| Fitxer | Què hi fa |
| --- | --- |
| `assets/js/firebase-config.js` | La configuració pública que el navegador necessita per parlar amb Firebase. Es genera amb `tools/tmp/gen-firebase-config.mjs` a partir de l'sdkconfig de la CLI, i s'hi exporten `FIREBASE_CONFIG`, `IS_CONFIGURED` i `SESSION_MODE`. |
| `.firebaserc` | El projecte per defecte de la línia d'ordres |
| `firebase.json` | Apunta a les regles i als índexs de Firestore |
| `firestore.rules` | Qui pot llegir i escriure. L'única font de seguretat de debò. |
| `firestore.indexes.json` | Índexs compostos (buit de moment: no cal cap) |
| `assets/vendor/firebase-*.js` | El SDK de Firebase, baixat del CDN amb els imports reescrits perquè es carregui del **propi origen**. La CSP diu `script-src 'self'`, així que un CDN no aniria. |

> **La clau d'API de `firebase-config.js` és pública per disseny.** És el que el navegador ha de rebre per poder parlar amb els serveis de Firebase, i com que no hi ha cap pas de compilació (GitHub Pages serveix els fitxers tal com estan), viu al repositori. El que protegeix les dades és `firestore.rules`, no amagar aquesta clau.
>
> El que **mai no s'ha de tocar** aquest repositori són les credencials de compte de servei (`.json` de `service account`), els secrets del client OAuth i qualsevol token d'accés. `node tools/check-firebase.mjs` ho comprova a cada passada.

### Com funciona el compte

El compte viu a **`assets/js/auth.js`** i no toca res més: la resta de mòduls s'hi enganxen amb `onAuthChange` i esperen `whenAuthReady()` abans de decidir què fan amb les dades del disc (fins que Firebase no diu qui hi ha, no se sap si el que hi ha a `localStorage` és d'un convidat o d'un compte).

| Peça | Què fa |
| --- | --- |
| El botó del nav | Reutilitza l'estil del botó de configuració (`settings-btn account-btn`). Sense sessió hi surt la icona de sempre; amb sessió, s'omple amb l'accent i hi surt **la inicial del correu** (no la foto de Google: no cal afegir `googleusercontent` a la CSP per una imatge de 32 px). |
| El modal | Un sol modal amb dos panells, `#authGuest` i `#authAccount`, que es mostren segons si hi ha sessió. El formulari commuta entre **entrar** i **crear compte** canviant la clau `data-i18n` de cada element, així que el canvi d'idioma el segueix gestionant `i18n.js` com a tota la pàgina. |
| El SDK | **Es carrega mandrós.** Només es baixa (uns 300 kB) si hi ha el rastre d'una sessió anterior (`localStorage` → `ulaSignedIn`) o quan algú prem un botó d'entrar. Qui no té compte no el paga mai. |
| On viu la sessió | Ho diu `SESSION_MODE` a `firebase-config.js`: `local` (per defecte: qui entra segueix dins en tornar), `session` (es tanca en tancar la pestanya) o `none` (només memòria). |
| Errors | Es tradueixen, no s'ensenyen en cru: `auth.*` → `auth.err.*` segons el codi de Firebase. Tancar el popup de Google a mig camí no diu res, perquè no és cap error. |

Si `firebase-config.js` digués `IS_CONFIGURED: false`, `initAuth()` esborra el botó i el modal i la pàgina funciona igual que sempre.

**Quatre coses de la CSP que són per al compte** (i que `check-firebase.mjs` comprova que parlin del mateix projecte que `firebase-config.js`):

- `script-src` deixa passar **`apis.google.com`**: abans d'obrir el popup, el SDK baixa d'aquí el carregador de Google (`gapi`) *dins de la nostra pàgina* i en fa servir el `gapi.iframes` per parlar amb l'iframe del projecte. Sense això la consola diu «violates… script-src» i el popup ni s'arriba a obrir.
- `frame-src` i `connect-src` incorporen el domini del projecte (`<projectId>.firebaseapp.com`), que és on viu l'iframe del popup.
- `connect-src` també deixa passar `identitytoolkit.googleapis.com` (entrar i crear compte), `securetoken.googleapis.com` (renovar el token) i `firestore.googleapis.com` (la sincronització de les fases següents).
- `Cross-Origin-Opener-Policy` passa de `same-origin` a **`same-origin-allow-popups`**: amb `same-origin`, el popup de Google arriba sense accés a `window.opener` i la resposta no torna mai. (Amb aquesta COOP, el navegador registra un avís «would block the `window.closed` call» mentre el popup és a Google: és del sondeig del SDK i no afecta el flux, que es tanca per `postMessage`.)

A l'**app d'escriptori**, a més, `electron/main.js` té una **llista blanca** per al popup d'entrada (el domini del projecte, `accounts.google.com`, `apis.google.com` i `gstatic.com`): `signInWithPopup` obre una finestra filla de debò, i al navegador del sistema la resposta no tornaria. La resta d'enllaços segueixen obrint-se fora, com sempre.

### Com es guarden les dades

Tot és per sota de l'usuari, i la regla és que cadascú només toca lo seu:

```
users/{uid}                 Metadades del compte
users/{uid}/state/{clau}    Progrés de l'aplicació: una entrada per clau `ula*` de localStorage
users/{uid}/saves/{joc}     Els saves d'un joc concret, un document per joc
```

Límits del pla gratuït que cal tenir presents: **1 MiB per document** i **20.000 escriptures al dia**. D'aquí ve que els saves es parteixin per joc i que les escriptures es retardin i s'agrupin en lloc d'escriure a cada canvi.

### Què queda per fer a la consola

Aquests passos **no es poden fer des de la línia d'ordres** i s'han de fer un cop a la [consola de Firebase](https://console.firebase.google.com/project/unblocked-games-by-ula):

1. **Authentication → Sign-in method** → activar **Email/Password** i **Google**.
2. **Build → Firestore Database → Create database** → mode de producció. El projecte nou surt amb l'API de Cloud Firestore desactivada, així que caldrà prémer el botó que ofereix la pròpia consola per activar-la.
3. **Authentication → Settings → Authorized domains** → afegir `oriera26.github.io` i `127.0.0.1` (el domini de l'app d'escriptori).

Fins que els proveïdors no estiguin activats, els intents d'entrar donaran error («Error de sessió») i la resta de l'aplicació continuarà funcionant exactament com ara, sense compte i sense sincronitzar res.

### Desplegar les regles

```bash
firebase deploy --only firestore:rules --project unblocked-games-by-ula
```

### Comprovar que tot quadra

```bash
node tools/check-firebase.mjs   # només aquesta comprovació
node tools/check-all.mjs        # ...o amb la resta, ja hi és inclosa
```

`check-firebase.mjs` comprova que `.firebaserc`, `firebase-config.js` i `firestore.rules` parlin del **mateix projecte**, que les regles tinguin la negativa per defecte (`match /{document=**}` → `if false`) i el control del propietari, que el SDK vendoritzat no depengui de cap URL externa, que la CSP d'`index.html` i la de `server.js` deixin passar els dominis del projecte, i que no s'hagi escapat cap credencial al repositori.

## 📁 Estructura

```
.
├── index.html            Interfície principal
├── offline.html          Pàgina sense connexió
├── service-worker.js     PWA: cau i funcionalitat offline
├── manifest.json         Manifest de la PWA
├── server.js             Servidor estàtic local
├── firebase.json         Configuració de Firebase (Firestore)
├── firestore.rules       Regles de seguretat de Firestore
├── firestore.indexes.json Índexs de Firestore
├── .firebaserc           Projecte per defecte de la CLI
├── electron/             Codi de l'app d'escriptori
└── assets/
    ├── css/              Estils
    ├── js/               Lògica (mòduls ES): auth.js, firebase-config.js…
    ├── games/            Els jocs (fitxers HTML)
    ├── offline/          Jocs descarregables offline
    ├── images/           Portades dels jocs
    ├── lang/             100 idiomes
    ├── vendor/           SDK de tercers (lucide, Firebase)
    └── icons/            Icones
```

## 📜 Crèdits

Fet amb 💖 per **Ula** · © 2026 Ula. Tots els drets reservats.

Els jocs inclosos són propietat dels seus autors i es distribueixen als seus repositoris o plataformes originals.
