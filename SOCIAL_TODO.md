# SOCIAL · Llista de feina (TODO)

Objectiu: implementar la secció **Social** (navbar → hub d'amics + xat +
lligues + feed + regals + mode espectador) amb el màxim abast possible,
i fer-ho tot **en codi modular** en comptes d'un sol fitxer.

## Estat

- [x] **0. Navbar** — píndoles `Jocs · Estadístiques · Social` i ordre de
      botons a la dreta (cerca, configuració, tema, perfil). Verificat.
- [x] **1. Router** — `'social'` a `VIEWS` de `router.js`, i enllaç
      profund `?view=social` a `main.js`.
- [x] **1b. i18n** — `nav.social` als 100 idiomes.
- [x] **1.5. i18n Social** — les **32 claus `social.*`** als 100 idiomes,
      en el mateix ordre, amb traducció pròpia (excepte els manlleus
      inevitables). `check-lang` sense avisos.
- [x] **2. Config** — `STORAGE_KEYS.social = 'ulaSocial'`.
- [x] **3. HTML** — secció `#view-social` (`index.html`):
  - [x] Capçalera (`nav.social`) i subtítol (`social.subtitle`).
  - [x] `#socialRoot` on el hub pinta les targetes.
  - [x] Enllaç de `assets/css/social.css` abans de `responsive.css`.
- [x] **3b. Hub** (`social-hub.js`):
  - [x] Card d'amics: capçalera, cerca, campana de notificacions, llista
        amb presència, perfil, accions ràpides, sol·licituds i
        suggeriments.
  - [x] Card de lliga: ascens/manteniment/descens, duels H2H, torneigs,
        repte comunitari i títols.
  - [x] Card de feed d'activitat amb reaccions.
  - [x] Card de regals diaris amb saldo.
- [x] **3c. Xat** (`social-chat.js`) — calaix amb canals (global i 1 a 1),
      «escrivint…», reaccions i mini-jocs.
- [x] **3d. Modals** (`social-modals.js`) — mini-perfil i mode espectador.
- [x] **3e. Simulació** (`social-sim.js`) — presència que canvia i reinici
      setmanal de la lliga.
- [x] **4. CSS** — `assets/css/social.css`, estil glass propi, amb punts
      de tall per a tauleta i mòbil.
- [x] **5. JS modular** — `assets/js/`:
  - [x] `social-store.js` — dades i `localStorage` (sense DOM).
  - [x] `social-ui.js` — utilitats (`esc`, `t`, `get`, temps, presència).
  - [x] `social-hub.js`, `social-chat.js`, `social-modals.js`,
        `social-sim.js`.
  - [x] `social.js` — orquestrador prim (`initSocial`, canvi d'idioma i
        botons dels modals).
- [x] **6. main.js** — `initSocial()` després de l'idioma i del compte.
- [x] **7. Test** — `tools/tmp/pw-social.mjs` (Chromium), **54/54 OK**.
- [x] **8. Validació** — `check-all` 9/9, `check-lang` 100×123 sense
      avisos, `check-modules` 31 mòduls amb graf correcte.
- [x] **9. CHANGES.md** i commit local (sense push).

## Graf de mòduls

Sense cicles (comprovat per `check-modules`):

```
social.js      → i18n, social-chat, social-modals, social-hub,
                 social-sim, social-ui
social-hub.js  → social-modals, social-store, social-ui
social-sim.js  → social-store, social-hub
social-chat.js → social-store, social-ui
social-modals.js → social-store, social-ui
social-store.js / social-ui.js → (fulles)
```

## Convencions

- **Traducció**: `t(clau)` retorna el text **ja escapzat** (per a
  `innerHTML`); `get(clau)` el retorna **cru** (per a atributs, dades i
  `textContent`). `check-lang` reconeix les crides `t('…')` i `get('…')`.
- **Botons**: tots porten `data-soc="acció"`. Els del hub els gestiona
  `handleAction`; els de dins dels modals, l'orquestrador (`social.js`).
- **Dades**: només `social-store.js` sap on es guarden. La resta de
  mòduls no toquen `localStorage` directament.

## Notes de disseny

- Sense backend propi (pla Spark): l'estat viu a `localStorage` amb dades
  de demostració persistents; les funcions de xarxa (Firestore) queden
  aïllades darrere d'una capa de dades per poder-hi connectar després.
- i18n: les claus noves s'afegeixen als 100 idiomes; on no hi ha
  traducció pròpia, es fa servir l'anglès (documentat a CHANGES.md).
- Estil: mateix llenguatge visual (glass, squircles, variables CSS).
