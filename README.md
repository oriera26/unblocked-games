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

## 📁 Estructura

```
.
├── index.html            Interfície principal
├── offline.html          Pàgina sense connexió
├── service-worker.js     PWA: cau i funcionalitat offline
├── manifest.json         Manifest de la PWA
├── server.js             Servidor estàtic local
├── electron/             Codi de l'app d'escriptori
└── assets/
    ├── css/              Estils
    ├── js/               Lògica (mòduls ES)
    ├── games/            Els jocs (fitxers HTML)
    ├── offline/          Jocs descarregables offline
    ├── images/           Portades dels jocs
    ├── lang/             100 idiomes
    └── icons/            Icones
```

## 📜 Crèdits

Fet amb 💖 per **Ula** · © 2026 Ula. Tots els drets reservats.

Els jocs inclosos són propietat dels seus autors i es distribueixen als seus repositoris o plataformes originals.
