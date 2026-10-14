# Changes Log

Registre de canvis i d'errors trobats, pensat per fer servir com a cos del
commit. Tot és **local**; encara no s'ha fet `push`.

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
