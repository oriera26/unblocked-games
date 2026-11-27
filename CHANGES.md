# Changes Log

Registre de canvis i d'errors trobats, pensat per fer servir com a cos del
commit. Tot és **local**; encara no s'ha fet `push`.

## Penalty Shooters 1, 2 i 3: còpies completes i offline

El catàleg tenia només el 3, i era un wrapper que carregava el joc de
GameDistribution des de la xarxa. Ara els tres jocs són còpies completes
dins del repositori i funcionen sense cap connexió: el 1 i el 2 de les build
oficials de Poki (`*.gdn.poki.com`) i el 3 del build de GameDistribution que
embebeix la llista regional de Poki.

### Què s'ha canviat

- `assets/games/penaltyshooters1/` — build de Construct 2 de Poki: 149 fitxers
  del manifest offline (`offline.js`) més `index.html`, `offlineClient.js`,
  `sw.js` i `offline.js`.
- `assets/games/penaltyshooters2/` — build de Construct 3 de Poki: 90 fitxers
  del manifest (`offline.json`) més `index.html`, `offline.json` i `sw.js`.
- `assets/games/penaltyshooters3/` — build de GameDistribution (Construct 3):
  311 fitxers del manifest més `index.html`, `offline.json` i `sw.js`.
  L'antic `assets/games/penaltyshooters3.html` (el wrapper amb l'iframe
  remote) s'ha esborrat.
- Adaptadors locals en lloc dels SDK publicitaris remots:
  - `poki-sdk.js` (1 i 2): `PokiSDK` amb les API que fa servir el joc,
    sense anunci ni xarxa.
  - `gamedistribution-sdk.js` i `crazygames-sdk.js` (3): `gdsdk` i
    `CrazyGamesConstructSDK` locals.
- `assets/games/penaltyshooters2/scripts/main.js`: el beacon de
  `leveldata.poki.io` (que depenia de `poki_doBeacon`, activat al projecte)
  s'ha desactivat: la còpia local no ha de trucar cap servidor de Poki.
- `assets/games/penaltyshooters3/index.html`: els dos adaptadors es carreguen
  de forma sincrona abans del runtime, i es treuen les injeccions
  dinàmiques equivalents de `scripts/project/main.js` i
  `scripts/project/gd-sdk.js` (hi havia una carrera: el joc podia cridar el
  SDK abans que existís).
- `server.js`: nous Content-Type per als fitxers que necessiten aquests jocs
  (`.wasm`, `.glb`, `.gltf`, `.m4a`, `.txt`). Abans el servidor local
  responia 415 i el 2 i el 3 no arrencaven a l'app d'escriptori.
- `assets/js/gameList.js`: entrades de *Penalty Shooters*, *Penalty Shooters
  2* i *Penalty Shooters 3* (el 3 passa de `penaltyshooters3.html` a
  `penaltyshooters3/index.html`).
- `assets/images/`: portades oficials de Poki per al 1 i el 2, amb les
  variants de 400×400, 140×140 i lqip de 16×16.

### Verificació

- Manifests: 149 + 90 + 311 fitxers, tots al disc i tots servits amb HTTP
  200 pel servidor local.
- Playwright (Chromium): els tres jocs arrenquen, renderitzen i es juguen
  dins l'iframe del reproductor, amb els service workers actius i sense cap
  petició externa, cap error de consola i cap error de pàgina.
- `npm run check` → **8/8 correctes**.

## Correcció: el lloc no s'obria (ERR_FAILED + version.json 404)

Símptomes: `Failed to convert value to 'Response'`, `The FetchEvent for
"…/unblocked-games/" resulted in a network error response`, l'avís
`version.json: Unexpected token '<'` i, al final, `ERR_FAILED`.

### Causes

1. **La navegació responia `undefined`.** Al gestor de `fetch`, la branca
   `request.mode === 'navigate'` feia `fetch(request).then((response) => {
   … return cache.put(...) })`. `cache.put` resol a `undefined`, així que
   `respondWith` rebia `undefined` i el navegador tombava la navegació amb
   ERR_FAILED. Passava a *totes* les càrregues de pàgina un cop el service
   worker agafava el control, i per això el lloc sencer semblava caigut.
2. **La branca d'assets podia resoldre `undefined`.** `return cached ||
   fetchPromise`, amb `fetchPromise.catch(() => cached)` quan no hi ha
   còpia, també donava un `undefined` a `respondWith` (mateix TypeError).
3. **`version.json` no es publicava.** El workflow `pages.yml` copiava a
   `_site` un llistat fix de fitxers i no hi havia `version.json`; GitHub
   Pages responia 404 amb la pàgina d'error en HTML i `resp.json()` petava
   amb `Unexpected token '<'`. Passava el mateix a l'app d'escriptori
   (`extraResources` de `package.json`).
4. **`storeGame` podava una cau inexistent.** Cridava `trimCache(GAMES_CACHE,
   …)` i `GAMES_CACHE` no està definit enlloc: la poda sempre fallava.

### Què s'ha canviat

- `service-worker.js`
  - `serveNavigation()` i `serveAsset()` noves: **totes** les branques
    resolen un `Response`. Si la xarxa falla, es mira la cau i, si no hi
    ha res, es retorna una pàgina pròpia «Sense connexió» (503) en comptes
    de `Response.error()` o `undefined`.
  - `keepAlive(event, work)`: marca la feina de fons amb `waitUntil` sense
    que un rebuig puga tombar la resposta.
  - `loadCacheVersion()` comprova `resp.ok` i que el cos comence per `{`
    abans de fer `JSON.parse`; el fallback ja no escup l'error de sintaxi.
  - `serveGame`, `serveImage`, `serveLQIP` i `serveOffline` tenen fallback
    a la cau i mai no retornen `undefined`.
  - `storeGame(cache, cacheName, …)` rep el nom real de la cau i la poda
    funciona.
  - `GET_VERSION` respon pel `MessagePort` que envia la pàgina (abans
    responia pel `client` i la comprovació de versió sempre caducava).
- `.github/workflows/pages.yml` i `package.json`: `version.json` passa a
  formar part del lloc publicat i de l'app d'escriptori.
- `assets/js/settings.js`: el registre del SW usa `updateViaCache: 'none'`,
  fa `registration.update()` i envia `SKIP_WAITING` a la versió en espera;
  arreglats els `</div>` que tancaven un `<span>` al botó de sincronitzar.
- `version.json`: pujada a `ula-v1.18.0` per forçar la rotació de caches.

## Secció Social (navbar → hub → xat → lligues)

Petició: una secció **Social** al costat de *Jocs* i *Estadístiques*, amb
hub d'amics i presència, cerca, notificacions, lligues/competicions/duels,
xat, feed d'activitat, regals i mode espectador. I, en un segon moment,
que tot això estigués **en codi modular** en comptes d'un sol fitxer.

### Què s'ha fet

- `index.html`
  - Afegida la píndola `<span class="nav-link" id="link-social"
    data-view="social" data-i18n="nav.social">Social</span>` dins de
    `.nav-center`, entre *Estadístiques* i el final del contenidor.
  - Eliminats el botó `#socialBtn` i el menú desplegable `#socialMenu`
    que s'havien afegit abans a `.nav-right` i que desbordaven la barra.
  - Eliminat el bloc `<script>` que hi havia al final del document i que
    només servia per obrir/tancar aquell menú.
  - Restaurada la clausura `</html>` i la línia en blanc que s'havien
    perdut durant les proves.
  - Nova secció `<section id="view-social" class="view">` amb una
    capçalera (`nav.social` + `social.subtitle`) i `<div id="socialRoot">`.
  - Nou enllaç a `assets/css/social.css`, **abans** de `responsive.css`
    perquè els punts de tall puguin guanyar-lo.
  - L'ordre final de `.nav-right` és: `#searchContainer`,
    `#settingsWrap`, `#themeBtn`, `#accountBtn`.

- `assets/js/` — el Social, en set mòduls plans (no un de sol):
  - `social-store.js` — l'única capa que sap com es desa l'estat
    (`localStorage`, clau `ulaSocial`), amb dades de demostració
    (`seed`/`merge`/`ensureChat`), consultes (`findPerson`,
    `iconOfName`), `notify` i la setmana ISO de la lliga.
  - `social-ui.js` — utilitats de dibuix: `byId`, `esc`, `t` (traducció
    **ja escapada**), `get` (traducció crua, per a atributs i dades),
    noms d'estat/activitat, `timeAgo` i `countdown`.
  - `social-hub.js` — les quatre targetes (amics, lliga, activitat,
    regals), la cerca, i `handleAction` amb totes les mutacions.
  - `social-modals.js` — mini-perfil i mode espectador.
  - `social-chat.js` — el calaix: canals, «escrivint…», reaccions i
    mini-jocs.
  - `social-sim.js` — la presència simulada (cada 12 s un amic canvia
    d'estat) i el reinici setmanal de la lliga.
  - `social.js` — l'orquestrador: munta les peces, escolta els botons
    dels modals i repinta quan canvia l'idioma.
  - El graf queda **sense cicles**: `store → ui`, `hub → modals`,
    `social.js` ho enganxa tot. Els botons `[data-soc]` de dins dels
    modals els escolta l'orquestrador, no el hub.
- `assets/css/social.css` — estil glass propi (classes `soc-*`), amb
  punts de tall per a tauleta i mòbil.
- `assets/lang/*.json` (100 fitxers)
  - Afegida la clau `nav.social` just després de `nav.stats`.
  - Afegides les **32 claus `social.*`** després de `nav.social`, en el
    mateix ordre a tots els fitxers. Traduïdes una a una als ~98 idiomes
    que no són `ca` ni `en` (fet amb grups de subagents en paral·lel).
- `assets/js/router.js` — `'social'` a `VIEWS` i comentari al dia.
- `assets/js/main.js` — `initSocial()` després de l'idioma i del compte.
- `assets/js/config.js` — `STORAGE_KEYS.social = 'ulaSocial'`.

### Errors trobats i arreglats

1. **`renderChat()` cridava `chatMessageRow`, que no existeix.** El
   render de missatges feia servir `messageRow`. En unificar-ho, el xat
   hauria petat en pintar l'historial. Unificat a `messageRow`.
2. **`social.giftSend` no existeix a `ca.json`.** L'antic codi demanava
   aquesta clau (singular) quan l'única que hi ha és `social.giftSent`.
   `check-lang` ho hauria marcat com a «clau usada però absent». El botó
   de regal fa servir `social.accept`, i `social.giftSent` s'usa per a la
   notificació d'enviar un regal des del mini-perfil.
3. **L'enllaç profund `?view=social` no obria la secció.** `main.js`
   només navegava cap a `stats` quan l'URL ho demanava; recarregar la
   pàgina a la secció Social tornava a *Jocs*. Afegit el cas `social`.
4. **La campana comptava les sol·licituds d'amistat.** Amb dues
   sol·licituds pendents, la insígnia marcava «2» tot i no haver-hi cap
   notificació, i en obrir-la no hi sortien. Ara compta només
   notificacions no llegides; les sol·licituds tenen la seva secció.
5. **`tt()` no el veia `check-lang`.** Les claus amb majúscules
   (`social.searchPlayers`, `social.noFriends`, `social.chatPh`,
   `social.status*`) només es detecten amb crides `t('…')` o `get('…')`,
   i `tt('…')` no encaixava amb cap patró. Renombrat a `t` (text escapat)
   i `get` (text cru per a dades i atributs).
6. **L'aragonès (`an`) va quedar en anglès.** El subagent del grup
   `am/an/ar` en va traduir dos i va deixar aquest. Traduït a mà
   (`tools/tmp/fix-an-social.mjs`), respectant ordre, indentació i salts
   de línia del fitxer.

### Què **no** s'ha tocat

- `assets/games/clgtavicecity.html` i `assets/games/clhollowknight.html`
  estan modificats al directori de treball però són **fora d'aquest
  canvi** (l'últim ja ho estava abans de començar; el primer és la
  pàgina original de gtavice.city i no el wrapper net del repositori). No
  s'inclouen al commit.

## Sincronització del compte (claus i fitxers compartits)

La feina de sincronització del compte comparteix fitxers amb el Social
(`config.js`, `main.js` i els 100 fitxers d'idioma amb les claus
`sync.*`), així que va al mateix commit:

- `assets/js/state.js` — `readCloudState()` i `applyCloudState()`.
- `assets/js/cloud.js`, `assets/js/cloud-ui.js`, `assets/js/sync-core.js`
  — motor de sincronització i interfície del modal de conflictes.
- `assets/css/components.css` — estil `.auth-sync` i `#syncModal`.
- `assets/js/config.js` — `SYNC_INTERVAL_MS`, `SYNC_IDB_INTERVAL_MS` i
  les claus `sync.*` de `STORAGE_KEYS`.

## Verificació

- `node tools/check-all.mjs` → **9/9 correctes**.
- `node tools/check-lang.mjs` → **100 idiomes × 123 claus**, ordre i
  marcadors correctes, **cap avís** de clau sense usar.
- `node tools/check-modules.mjs` → **31 mòduls, graf correcte**.
- `node tools/tmp/pw-navbar.mjs` (Chromium) → **7/7 OK**: logotip a
  l'esquerra, 3 píndoles amb els textos exactes, ordre de `.nav-right`
  correcte, res no desborda, clic a *Social* sense excepcions, 0 errors
  de consola.
- `node tools/tmp/pw-social.mjs` (Chromium) → **54/54 OK**, entre d'altres:
  les 4 targetes del hub, 6 amics, 9 posicions de lliga amb ascensos i
  descensos, el temporitzador del torneig, la cerca que filtra, desafiar
  (campana), fixar, mini-perfil amb 3 estadístiques, mode espectador,
  regalar, acceptar/rebutjar sol·licituds, reclamar regals, reaccionar al
  feed, el xat (4 canals, enviar missatge, mini-joc, reaccions, tancar),
  el canvi d'idioma en calent i l'enllaç `?view=social`; sense
  desbordament horitzontal ni a 1366 ni a 390 px, i 0 errors de consola.

---

*Fitxer de treball; es farà servir com a missatge del commit local.*
