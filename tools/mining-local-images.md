# Mineria d'imatges dins dels fitxers HTML de joc

Escanejats **707** fitxers HTML de `assets/games/` (la carpeta es **pla**: cap subdirectori,
cap fitxer d'imatge al costat dels jocs). Objectiu: trobar una imatge de portada que **ja existeixi
al repositori**, sense baixar res de xarxa.

## Resultat principal

| Categoria | Jocs |
| --- | --- |
| Portada utilitzable en forma de **fitxer existent al repo** | **0** |
| Portada utilitzable **embeguda** en el propi HTML (`data:image`) | **1** |
| Portada utilitzable pero **només remota** (cal baixar-la, depen de xarxa) | 15 |
| **Sense portada identificable** | **691** |
| *Total fitxers HTML escanejats* | *707* |

**A curt termini: 1 joc de 707 (0.14%) te una portada local aprofitable.** Els 691
restants no tenen cap imatge utilitzable dins del repo. Aixo **no** es un error de l'escaneig:
`assets/games/` no contingu cap imatge, nomes HTML que en referencien.

Dades de control del propi repo: `gameList.js` te **697** entrades, de les quals **70** tenen
portada a `assets/images/` i **627** no en tenen. Els 627 tenen el seu HTML a `assets/games/`,
i cap d'ells aporta una imatge al repo.

## Per que hi ha 0 imatges locals en forma de fitxer

Aquesta es la conclusio central de la mineria i no porta bones noticies: **cap** ruta relativa
d'imatge dels 707 HTML resol a un fitxer d'imatge que existeixi al repositori.

| Comprovacio | Valor |
| --- | --- |
| Jocs amb almenys una ruta relativa d'imatge | 337 |
| Referències relatives totals trobades | 743 |
| D'aquestes, que resolen a un **fitxer d'imatge existent** | **0** |
| Que resolen a un existent que **no** és imatge ( carpetes, no imatges) | 1 (`\`) |
| Fitxers d'imatge dins de `assets/games/` (costat dels HTML) | **0** |
| Subdirectoris dins de `assets/games/` | 0 |
| Fitxers d'imatge a `assets/` (93 del total) | 93 |
| Fitxers d'imatge a `assets/images/` (les portades que mes utilitzen) | 76 |
| Fitxers d'imatge al repo sencer, `tools/` inclos | 349 |

La causa es estructural, no un error de parseig del script:

1. `assets/games/` es un directori **pla**: 707 fitxers HTML, **0** subdirectoris i **0** fitxers
   d'imatge al costat. No hi ha res que "extreure": les imatges no hi son, nomes n'hi ha les
   referencies.
2. A mes, els HTML usen `<base href="https://cdn.jsdelivr.net/...">`. Aquest `<base>` fa que el
   navegador resolgui `img/adr.png` contra el **CDN**, no contra `assets/`.
   **374** dels 707 jocs (53%) tenen un `<base>` apuntant a un CDN.
3. Per tant aquestes rutes son **correctes al servidor original i trencades aqui**. No son assets
   que se'ns hagin perdut en una còpia: son URLs que el joc visitema nosaltres com si locals.

Les poques rutes que **no** depenen del `<base>` son `../images/ico.ico` (i variants). Aquestes
apunten a la icona del **site**, no a la de cap joc, i a mes el fitxer `images/ico.ico` ni tan
s hi troba al repo.

### Consequencia practica

Aquesta font de minederia **no pot ser la solucio** per als 627 jocs sense portada. No es que
costi extreure les imatges: es que **no hi son**. Les uniques opcions que queden son:

1. Descarregar des del CDN que cada joc ja declara (`fetch-covers.mjs` fa servir aquesta via), o
2. Capturar la pantalla del joc quan s'executa (playwright/headless), o
3. Generar una portada sintetica (color + initials) per als jocs que no se'n pugui.

## Portades EMBEGUDES (data:image dins l'HTML)

L'**unica** font local que ha donat alguna portada: 53 jocs tenen imatges embegudes
en base64 dins del propi HTML (`data:image/...`). D'aquestes, nomes
1 supera el llindar de qualitat:

| # | HTML del joc | Procedencia | Tipus | Dimensions | Mida | Per que serveix |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `clpaperio3d.html` | img | image/png | 568x691 | 51.6 KB | <img> +45; 568x691, imatge gran +30; EMBEBUDA dins del propi HTML, no cal baixar +30; 52 KB, imatge de veritat +5 |

Els altres **52** jocs amb imatges embegudes no serveixen com a
portada. Es tracta de decoracio d'interficie:

- el T-Rex i els obstacles del Chrome Dino (`1x-`/`2x-`, 80x80 px),
- les `blockIconURI` / `menuIconURI` de les extensions de Scratch (icones de blocs de programacio),
- cursors i botons de GUI.

Casos concrets verificats a mà:

| HTML del joc | Què és la imatge embeguda | Per què NO serveix com a portada |
| --- | --- | --- |
| `clgoogledino.html` | 26 imatges: dino, obstacles, núvols, text, terra | Són els sprites del joc, no una imatge de la partida |
| `clgeometrydashscratch.html` | icones d'extensions Scratch + favicon 512x512 | Favicon del motor, no del joc |
| `clcuttherope.html` | 17 imatges 200x63 | Trossos de corda, un per estat |
| `clpaperio3d.html` | 568x691, 52 KB, mans del personatge a la pantalla de start | **Aquesta sí que val** com a portada |
| `clgdsubzero.html`, `Eaglercraft*.html`, `Shadow_Client.html` | payloads base64 de varis KB | Textures i dades serialitzades, no imatges de portada |

## Portades NOMÉS REMOTES (cal baixar-les)

15 jocs tenen una bona portada declarada pero servida per un CDN o un servidor
extern. Aquests **no** son locals: depenen de xarxa i cal descarregar-los. Es llisten per
transparencia i perquè son la millor pista de quins jocs es podrien recuperar, pero no son un
guany offline immediat.

| # | HTML del joc | Procedencia | URL |
| --- | --- | --- | --- |
| 1 | `clburgerandfrights.html` | img | `https://cdn.jsdelivr.net/gh/7nightz/selenitee@f7612ed1599a748d84fe5cbde422ad0062a971d0/semag/bur...` |
| 2 | `clducklingsio.html` | og:image | `https://ducklings.io/img/thumb.png` |
| 3 | `clfireblob.html` | img | `https://gamemonetize.com/gamemonetize-logo.png` |
| 4 | `clgrowdenio.html` | og:image | `https://growden.io/background-og.webp` |
| 5 | `clkaratebros.html` | og:image | `https://basketbros.io/karate/splash2.jpg` |
| 6 | `clkartbros.html` | og:image | `https://kartbros.io/TemplateData/kartbros_embed.jpg` |
| 7 | `clmonstertracks.html` | img | `https://cdn.jsdelivr.net/gh/genizy/google-class/monster-tracks/webapp/cover.jpg` |
| 8 | `clovo2.html` | apple-touch-icon | `https://cdn.jsdelivr.net/gh/ov464534asa4rb/786132@main/icons/icon-512.png` |
| 9 | `clovodimensions.html` | apple-touch-icon | `https://cdn.jsdelivr.net/gh/genizy/ovo-3-dimension@102179bf4242fd237c46c555ba154c2f325d351c/icon...` |
| 10 | `clpinkbike.html` | og:image | `https://es.pinkbike.org/246/sprt/i/share/grimdonutgame.jpg` |
| 11 | `clsandboxels.html` | og:image | `https://sandboxels.r74n.com/icons/cover-3840x1240px-text.png` |
| 12 | `clskibidiinthebackrooms.html` | apple-touch-icon | `https://cdn.jsdelivr.net/gh/dayyiq/teyetey@main/icons/icon-512.png` |
| 13 | `clsniperv2.html` | img | `https://cdn.jsdelivr.net/gh/tty67hlt6jf6/c2@main/TemplateData/img/Logo.png` |
| 14 | `clsupercold.html` | og:image | `https://import-this.github.io/supercold/img/wallpaper.png` |
| 15 | `clwordle.html` | apple-touch-icon | `https://cdn.jsdelivr.net/gh/Nailington/3kh0-assets@aeb371b7e88542fd5e61eeed9e967a446d84fe1b/word...` |

Local contra remot, en una linia: `clducklingsio.html` declara
`og:image = https://ducklings.io/img/thumb.png`. Aqui el navegador no el pot llegir sense
connectar-se a `ducklings.io`. Un fitxer local, en canvi, seria `assets/images/clducklingsio.webp`.

## Jocs sense portada identificable

**691** jocs. Motius:

- **306** - cap referencia a imatge
- **288** - nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN)
- **49** - nomes sprites/icones embegudes (data:image)
- **46** - nomes imatges remotes de baixa qualitat
- **2** - nomes remotes + sprites embeguts

Llista completa dels 691 fitxers amb la seva millor candidata (rebutjada) i el perque:

| HTML del joc | Millor candidata | Origen | Score | Motiu del rebut |
| --- | --- | --- | --- | --- |
| `Dragonxclient.html` | `data:image (image/png, 1.2 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `Eaglercraft-Alpha-1.2.6-Offline.html` | `-` | - | - | cap referencia a imatge |
| `Eaglercraft-Beta-1.3-Offline.html` | `data:image (image/x-icon, 0.8 KB)` | embed / favicon | 12 | nomes sprites/icones embegudes (data:image) |
| `Eaglercraft-Beta-1.7.3-Offline.html` | `-` | - | - | cap referencia a imatge |
| `Eaglercraft-Indev-Offline.html` | `-` | - | - | cap referencia a imatge |
| `Eaglercraft1.12.html` | `data:image (image/png, 1.2 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `EaglercraftL_1.9_v0_7_0_Offline_Signed.html` | `data:image (image/png, 1.2 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `EaglercraftX 1.8.8(u29).html` | `data:image (image/png, 1.2 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `EaglercraftZ_1.11.2.html` | `data:image (image/png, 1.2 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `Shadow_Client.html` | `data:image (image/png, 0.3 KB)` | embed / favicon | -8 | nomes sprites/icones embegudes (data:image) |
| `cl10minutestildawn.html` | `images/ico.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cl12minibattles.html` | `-` | - | - | cap referencia a imatge |
| `cl1v1lol.html` | `-` | - | - | cap referencia a imatge |
| `cl2048.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cl2048cupcakes.html` | `-` | - | - | cap referencia a imatge |
| `cl2Dshooting.html` | `https://cdn.jsdelivr.net/gh/dayyiq/fdfd@main/manifest.webmanifest` | remote / manifest | -990 | nomes imatges remotes de baixa qualitat |
| `cl2doom.html` | `assets/games/2doom/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cl3dash.html` | `-` | - | - | cap referencia a imatge |
| `cl4thandgoal.html` | `-` | - | - | cap referencia a imatge |
| `cl500calibercontractz.html` | `-` | - | - | cap referencia a imatge |
| `cl9007199254740992.html` | `assets/games/9007199254740992_files/tmp9.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cl99balls.html` | `-` | - | - | cap referencia a imatge |
| `cl99nightsitf.html` | `-` | - | - | cap referencia a imatge |
| `clADOFAI.html` | `-` | - | - | cap referencia a imatge |
| `clADarkRoom.html` | `assets/games/img/adr.png` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clBountyOfOne.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clCartoonNetworkTableTennisUltimateTournament.html` | `-` | - | - | cap referencia a imatge |
| `clCircloO2.html` | `-` | - | - | cap referencia a imatge |
| `clFNAF.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clFNAF2.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clFNAF3.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clFNAF4.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clHiNoHomo.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clNutsandBoltsScrewingPuzzle.html` | `assets/games/appmanifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clStickmanKingdomclash.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clUZG.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/UGZ/TemplateData/fa...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clUltimatecardrivingsimulator.html` | `assets/games/TemplateData/img/Logo.png` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cladayintheoffice.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cladventneon.html` | `assets/games/AdventNEON/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cladventurecapitalist.html` | `https://10288944-884245489883600444.preview.editmysite.com/uploads/b/4...` | remote / img | 45 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clagariolite.html` | `-` | - | - | cap referencia a imatge |
| `clahoysurvival.html` | `-` | - | - | cap referencia a imatge |
| `clallocation.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clamidstthesky.html` | `assets/games/Clouds/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clamongus.html` | `-` | - | - | cap referencia a imatge |
| `clamorphous.html` | `-` | - | - | cap referencia a imatge |
| `clancientsins.html` | `-` | - | - | cap referencia a imatge |
| `clangrybirds.html` | `-` | - | - | cap referencia a imatge |
| `clangrybirdsshowdown.html` | `-` | - | - | cap referencia a imatge |
| `claquaparkio.html` | `assets/games/Aquaparkio512.jpg` | local / img | -30 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clarcheryworldtour.html` | `-` | - | - | cap referencia a imatge |
| `clarsonate.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clascent.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clasmallworldcup.html` | `-` | - | - | cap referencia a imatge |
| `classesmentexaminationque.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clasteroidsALT.html` | `assets/games/loading.gif` | local / img | -125 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `claviamastersbuggy.html` | `assets/games/data:,` | local / favicon | -1078 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbabeltower.html` | `assets/games/art/icon16x16.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbabychiccoadventure.html` | `-` | - | - | cap referencia a imatge |
| `clbabysniperinvietnam.html` | `-` | - | - | cap referencia a imatge |
| `clbackrooms.html` | `assets/games/"https:/cdn.jsdelivr.net/gh/aKevbo/lumassets@39dcf72cfd3d...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbackrooms2D.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbaconmaydie.html` | `assets/games/html5game/spider.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbadbodyguards.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbadparenting.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbadtimesim (1).html` | `-` | - | - | cap referencia a imatge |
| `clbadtimesim.html` | `-` | - | - | cap referencia a imatge |
| `clbaldidecomp.html` | `assets/games/TemplateData/AppIcon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbaldisbasics.html` | `favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbaldisbasicsremaster.html` | `-` | - | - | cap referencia a imatge |
| `clbaldisfunnewschoolultimate.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clballsandbricksgood.html` | `-` | - | - | cap referencia a imatge |
| `clbankrobbery2.html` | `-` | - | - | cap referencia a imatge |
| `clbarryhasasecret.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbas.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clbaseballbros.html` | `assets/games/assets/loading4.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbasketballfrvr.html` | `-` | - | - | cap referencia a imatge |
| `clbasketballstars.html` | `-` | - | - | cap referencia a imatge |
| `clbasketbattle.html` | `-` | - | - | cap referencia a imatge |
| `clbasketbros.html` | `-` | - | - | cap referencia a imatge |
| `clbasketrandom.html` | `-` | - | - | cap referencia a imatge |
| `clbasketslamdunk2.html` | `https://cdn.jsdelivr.net/gh/yrgen73/BSD2@174be0db9145f7375365bda889a20...` | remote / favicon | 52 | nomes imatges remotes de baixa qualitat |
| `clbatterup.html` | `-` | - | - | cap referencia a imatge |
| `clbattlekarts.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbattles.html` | `-` | - | - | cap referencia a imatge |
| `clbattlesim.html` | `-` | - | - | cap referencia a imatge |
| `clbeachboxingsim.html` | `-` | - | - | cap referencia a imatge |
| `clbearsus.html` | `assets/games/icons/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbergentruck201x.html` | `assets/games/BERGENTRUCK_201X.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbfdia5b.html` | `-` | - | - | cap referencia a imatge |
| `clbigicetowertinysquare.html` | `-` | - | - | cap referencia a imatge |
| `clbigneontowertinysquare.html` | `-` | - | - | cap referencia a imatge |
| `clbigshotboxing2.html` | `-` | - | - | cap referencia a imatge |
| `clbioevil4.html` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbitlife.html` | `assets/img/logo-big.png` | local / css:url | -36 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbitplanes.html` | `-` | - | - | cap referencia a imatge |
| `clblackjackhhhh.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clblastronaut.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clblazedrifter.html` | `-` | - | - | cap referencia a imatge |
| `clblightborne.html` | `assets/games/Template/Blight-Borne.jpg` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clblockblast.html` | `https://cdn.jsdelivr.net/gh/genizy/bl/TemplateData/favicon.ico` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clblockcraftparkour.html` | `-` | - | - | cap referencia a imatge |
| `clblockcraftshooter.html` | `assets/games/"https:/cdn.jsdelivr.net/gh/co6cohad/mc@main/TemplateData...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clblockpost.html` | `-` | - | - | cap referencia a imatge |
| `clblockthepig.html` | `-` | - | - | cap referencia a imatge |
| `clblockydemolitionderby.html` | `-` | - | - | cap referencia a imatge |
| `clblockysnakes.html` | `-` | - | - | cap referencia a imatge |
| `clbloodmoney.html` | `assets/games/icon/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbloodtournament.html` | `-` | - | - | cap referencia a imatge |
| `clbloonsTD6scratch.html` | `-` | - | - | cap referencia a imatge |
| `clblumgiracers.html` | `assets/games/appmanifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clbobtherobber2.html` | `-` | - | - | cap referencia a imatge |
| `clbobtherobber5.html` | `-` | - | - | cap referencia a imatge |
| `clboomslingers.html` | `-` | - | - | cap referencia a imatge |
| `clbottlecracks.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/bottlecracks/Templa...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clbounceback.html` | `-` | - | - | cap referencia a imatge |
| `clbouncemasters.html` | `-` | - | - | cap referencia a imatge |
| `clbouncymotors.html` | `assets/games/icon.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clboxingrandom.html` | `-` | - | - | cap referencia a imatge |
| `clbrainrot.html` | `-` | - | - | cap referencia a imatge |
| `clbridgerace.html` | `-` | - | - | cap referencia a imatge |
| `clbtts.html` | `-` | - | - | cap referencia a imatge |
| `clbtts2.html` | `-` | - | - | cap referencia a imatge |
| `clbuildnowgg.html` | `-` | - | - | cap referencia a imatge |
| `clbunnyland.html` | `-` | - | - | cap referencia a imatge |
| `clburritobisonlaunchalibre.html` | `-` | - | - | cap referencia a imatge |
| `clcannonballs3d.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcapybaraclicker.html` | `assets/games/logo-capybara-licker.png` | local / favicon | -46 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcarcrash3.html` | `-` | - | - | cap referencia a imatge |
| `clcardrawing.html` | `-` | - | - | cap referencia a imatge |
| `clcarkingarena (1).html` | `-` | - | - | cap referencia a imatge |
| `clcarkingarena.html` | `-` | - | - | cap referencia a imatge |
| `clcastlewarsmodern.html` | `-` | - | - | cap referencia a imatge |
| `clcatmario.html` | `-` | - | - | cap referencia a imatge |
| `clcatslovecake2.html` | `-` | - | - | cap referencia a imatge |
| `clcavestory.html` | `-` | - | - | cap referencia a imatge |
| `clceleste.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clceleste2.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clcellmachine.html` | `assets/games/img/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clchaosfaction2.html` | `-` | - | - | cap referencia a imatge |
| `clcheesechompers3d.html` | `https://cdn.jsdelivr.net/gh/classroomusers/notlook@main/TemplateData/f...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clchessclassic.html` | `-` | - | - | cap referencia a imatge |
| `clchickenscream.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/UGS@main/UNITY/chickenscream/...` | remote / img | 77 | nomes imatges remotes de baixa qualitat |
| `clchickenwar.html` | `-` | - | - | cap referencia a imatge |
| `clchoppyorc.html` | `-` | - | - | cap referencia a imatge |
| `clciviballs.html` | `-` | - | - | cap referencia a imatge |
| `clciviballs2.html` | `-` | - | - | cap referencia a imatge |
| `clclashofvikings.html` | `https://cdn-factory.marketjs.com/generic.png` | remote / img | 45 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clclassof09.html` | `assets/games/icons/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcleanupio.html` | `-` | - | - | cap referencia a imatge |
| `clclusterrush.html` | `-` | - | - | cap referencia a imatge |
| `clcoalllcdemo.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcoffeemaker.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clcombatreload.html` | `https://www.megaigry.ru/images/logo-ru.png` | remote / img | 77 | nomes imatges remotes de baixa qualitat |
| `clcombopool.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clcookieclickercool.html` | `assets/games/img/AQWorlds_CookieClicker_300x40.png` | local / css:url | -46 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcoreball.html` | `-` | - | - | cap referencia a imatge |
| `clcotlk.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clcountmastersstickmangames.html` | `-` | - | - | cap referencia a imatge |
| `clcrankit!.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcrazycars.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcrazycattle3d.html` | `https://cdn.jsdelivr.net/gh/bubbls/cc3d-merge/index.apple-touch-icon.p...` | remote / apple-touch-icon | 75 | nomes imatges remotes de baixa qualitat |
| `clcrazychicken3D.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcrazymotorcycle.html` | `assets/games/icon.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clcrossyroad.html` | `-` | - | - | cap referencia a imatge |
| `clcs1.6.html` | `https://cdn.jsdelivr.net/gh/sel-lers/x@main/logo.png` | remote / img | 77 | nomes imatges remotes de baixa qualitat |
| `clcsgoclicker.html` | `http://i.imgur.com/Bz uCWzL.png` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `clcuttherope.html` | `https://638401824-140825937501728463.preview.editmysite.com/uploads/b/...` | remote / img | 62 | nomes remotes + sprites embeguts |
| `clcyberbungracing.html` | `-` | - | - | cap referencia a imatge |
| `cldanktomb.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `cldbsniper.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldeadestate.html` | `-` | - | - | cap referencia a imatge |
| `cldeadlydescent.html` | `assets/games/icon.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldeadplate.html` | `assets/games/icon/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldeepestsword.html` | `-` | - | - | cap referencia a imatge |
| `cldeltarune.html` | `-` | - | - | cap referencia a imatge |
| `cldeltatraveler (1).html` | `-` | - | - | cap referencia a imatge |
| `cldeltatraveler.html` | `-` | - | - | cap referencia a imatge |
| `cldemolitionderbycrashracing.html` | `-` | - | - | cap referencia a imatge |
| `cldieinthedungeon.html` | `-` | - | - | cap referencia a imatge |
| `cldiredecks.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldoblox.html` | `-` | - | - | cap referencia a imatge |
| `cldogeminer.html` | `https://cdn.jsdelivr.net/gh/Nailington/3kh0-assets@aeb371b7e88542fd5e6...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `cldogeminer2.html` | `https://gnhustgames.github.io/assets/imageLogo/logo.jpg` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldokidokiliteratureclub.html` | `assets/games/web-presplash.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldoodlejumpgoober.html` | `data:image (image/png, 7.3 KB)` | embed / css:url | 62 | nomes remotes + sprites embeguts |
| `cldoomemscripten.html` | `-` | - | - | cap referencia a imatge |
| `cldoomzio.html` | `-` | - | - | cap referencia a imatge |
| `cldrawclimber.html` | `-` | - | - | cap referencia a imatge |
| `cldrawtheline.html` | `-` | - | - | cap referencia a imatge |
| `cldreader (1).html` | `-` | - | - | cap referencia a imatge |
| `cldreader.html` | `-` | - | - | cap referencia a imatge |
| `cldriftboss.html` | `media/graphics/misc/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldrifthuntersmerge.html` | `assets/games/progressLogo.Light.png` | local / css:url | -36 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldrivemady (1).html` | `assets/games/webapp/cover.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldrivemady.html` | `assets/games/webapp/cover.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldrivenwild.html` | `assets/games/assets/DrivenWild.png` | local / twitter:image | -10 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldrweedgaster.html` | `-` | - | - | cap referencia a imatge |
| `cldubstep.html` | `https://cdn.jsdelivr.net/gh/by5b/fdf@main/logo.png` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clducklifebattle.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clducklifespace.html` | `-` | - | - | cap referencia a imatge |
| `cldud.html` | `assets/games/itch_fullscreen_img_enlarge.svg` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldukenukem3d.html` | `-` | - | - | cap referencia a imatge |
| `cldungeondeck.html` | `-` | - | - | cap referencia a imatge |
| `cldungeonraid.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldungeonsanddegenerategamblers.html` | `assets/games/gamble.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cldunkshot.html` | `-` | - | - | cap referencia a imatge |
| `clduskchild.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `cldyingdreams.html` | `-` | - | - | cap referencia a imatge |
| `cleagleride.html` | `-` | - | - | cap referencia a imatge |
| `cledelweiss.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/Edelweiss/TemplateD...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `cledyscarsimulator.html` | `-` | - | - | cap referencia a imatge |
| `cleffinghail.html` | `-` | - | - | cap referencia a imatge |
| `clegg.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clelasticface.html` | `-` | - | - | cap referencia a imatge |
| `clenchain.html` | `-` | - | - | cap referencia a imatge |
| `clescalatingduel.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clescaperoad-2.html` | `assets/games/fullscreen-button.png` | local / css:url | -108 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clescaperoad.html` | `assets/games/az_logo.png` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clevilglitch.html` | `https://s3-us-west-2.amazonaws.com/codepen-thumbnails/Pen/17929092/thu...` | remote / css:url | 64 | nomes imatges remotes de baixa qualitat |
| `clevolution.html` | `-` | - | - | cap referencia a imatge |
| `clextremerun3d.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfashionbattle.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfearstofathomhomealone.html` | `-` | - | - | cap referencia a imatge |
| `clfinalearth2.html` | `assets/games/icons/apple_touch_icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfireboyandwatergirl2.html` | `-` | - | - | cap referencia a imatge |
| `clfireboyandwatergirl3.html` | `-` | - | - | cap referencia a imatge |
| `clfisheatgettingbig.html` | `assets/games/icons/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfisquarium.html` | `-` | - | - | cap referencia a imatge |
| `clfivenightsatbaldisredone.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfluidism.html` | `assets/games/logo.png` | local / apple-touch-icon | 7 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnac1.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnac2.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnaf4halloween.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnafps.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnafucn.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfnafworldd.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfolderdungeon.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfootballbros.html` | `assets/games/assets/loading4.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clforknsausage.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfortzone.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfreegemas.html` | `-` | - | - | cap referencia a imatge |
| `clfruitninja.html` | `assets/games/assets/font/gangofchinese.ttf` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfunnybattle.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfunnybattle2.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfunnymadracing.html` | `assets/games/TemplateData/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clfunnyshooter22.html` | `https://rawcdn.githack.com/hilfig3r/lolshooter2/97a7b3542843419db52216...` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgdlite.html` | `assets/games/image/process_bar_back.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgdsubzero.html` | `-` | - | - | cap referencia a imatge |
| `clgenericfightermaybe.html` | `-` | - | - | cap referencia a imatge |
| `clgeometrydashscratch.html` | `data:image (image/png, 37.0 KB)` | embed / favicon | 87 | nomes sprites/icones embegudes (data:image) |
| `clgeometryvibes.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/UGS@main/UNITY/geometryvibes/...` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgeorgeandtheprinter.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgetawayshootout.html` | `-` | - | - | cap referencia a imatge |
| `clgetontop.html` | `assets/games/appmanifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgetyoked.html` | `-` | - | - | cap referencia a imatge |
| `clgimmietheairpod.html` | `-` | - | - | cap referencia a imatge |
| `clgladdihoppers.html` | `-` | - | - | cap referencia a imatge |
| `clgloryhunters.html` | `-` | - | - | cap referencia a imatge |
| `clgobble.html` | `assets/games/webapp/cover.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgoingballs.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgolddiggerfrvr.html` | `assets/games/v/1576154523809/i/web/icon60x60.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgoldminer.html` | `-` | - | - | cap referencia a imatge |
| `clgooglebaseball.html` | `assets/games/CTA.png` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgoogledino.html` | `data:image (image/png, 3.1 KB)` | embed / css:url | 70 | nomes sprites/icones embegudes (data:image) |
| `clgorescriptclassic.html` | `-` | - | - | cap referencia a imatge |
| `clgrandactionsimulator-ny.html` | `-` | - | - | cap referencia a imatge |
| `clgranny22.html` | `https://cdn.jsdelivr.net/gh/forms-docs-slides-glgl/ngng@main/TemplateD...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clgranny3.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgrassmowing.html` | `-` | - | - | cap referencia a imatge |
| `clgravity.html` | `firecasterwhitesmall.png` | local / img | -30 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgrey-box-testing.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgrindcraft.html` | `assets/games/fonts/ARIAL.svg` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgrn.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgrowagarden.html` | `https://lh4.googleusercontent.com/lUEWrXMVEr4AdjKISyJahDRJ61bwfvHdpeYm...` | remote / img | -955 | nomes imatges remotes de baixa qualitat |
| `clgrowyourgarden.html` | `assets/games/loading.png` | local / css:url | -108 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clguesstheiranswer.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clgun-spin.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clguncho.html` | `data:image (image/png, 1.8 KB)` | embed / css:url | 45 | nomes sprites/icones embegudes (data:image) |
| `clgunnight.html` | `-` | - | - | cap referencia a imatge |
| `clgymstack.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhalflife.html` | `assets/games/xd.png` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhandshakes.html` | `-` | - | - | cap referencia a imatge |
| `clhandulum.html` | `-` | - | - | cap referencia a imatge |
| `clhanger2.html` | `-` | - | - | cap referencia a imatge |
| `clhappyroom.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhardwaretycoon.html` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clharvestio.html` | `-` | - | - | cap referencia a imatge |
| `clhei$t.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhelixjump.html` | `-` | - | - | cap referencia a imatge |
| `clhellron.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhelpnobrakes.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhero3flyingrobot.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhextris.html` | `../../images/facebook-opengraph.png` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhighstakes.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clhighwayracer2.html` | `-` | - | - | cap referencia a imatge |
| `clhillclimbracinglite.html` | `-` | - | - | cap referencia a imatge |
| `clhit8ox.html` | `data:image (image/png, 0.5 KB)` | embed / img | 35 | nomes sprites/icones embegudes (data:image) |
| `clhl2doom.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clholeio.html` | `-` | - | - | cap referencia a imatge |
| `clhouseofhazards.html` | `-` | - | - | cap referencia a imatge |
| `clhoverracerdrive.html` | `assets/games/"https:/cdn.jsdelivr.net/gh/aidenm05/pencil@d964959ea159b...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhumanexpenditureprogram.html` | `assets/games/icon/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clhungryknight.html` | `-` | - | - | cap referencia a imatge |
| `clhungrylamu.html` | `-` | - | - | cap referencia a imatge |
| `clhyppersandbox.html` | `-` | - | - | cap referencia a imatge |
| `clicedodo.html` | `https://cdn.jsdelivr.net/gh/genizy/ice-dodo@b950830c255518c930fbc2a0bd...` | remote / img | 45 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clicypurplehead.html` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clidlebreakout.html` | `-` | - | - | cap referencia a imatge |
| `clidledice.html` | `https://10160876-110595420412453794.preview.editmysite.com/uploads/b/1...` | remote / css:url | -968 | nomes imatges remotes de baixa qualitat |
| `clidleidlegamedev.html` | `assets/games/assets/img/lutsgameslogo.svg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clidleminertycoon.html` | `-` | - | - | cap referencia a imatge |
| `clinfinitecraft.html` | `https://cdn.jsdelivr.net/gh/genizy/google-class/nova-craft/vite.svg` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clinkgame.html` | `-` | - | - | cap referencia a imatge |
| `clintoruins.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clintothedeepweb.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clironsnout.html` | `-` | - | - | cap referencia a imatge |
| `clislander.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `cliwbtg.html` | `-` | - | - | cap referencia a imatge |
| `cljailbreakobbbobob.html` | `-` | - | - | cap referencia a imatge |
| `cljefflings.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/jefflings/TemplateD...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `cljellydrift.html` | `-` | - | - | cap referencia a imatge |
| `cljellytruckgood.html` | `https://cdn.jsdelivr.net/gh/MopNop/jello@6fc0bb6fff02f6a562752375b847a...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `cljetpackjoyride.html` | `https://cdn.jsdelivr.net/gh/genizy/jride@475e65ec2f642cf50bb80f09f4f41...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `cljetrush.html` | `assets/games/style/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cljetskiracing (1).html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cljetskiracing.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cljohnnytrigger.html` | `-` | - | - | cap referencia a imatge |
| `cljohnnyupgrade.html` | `-` | - | - | cap referencia a imatge |
| `cljourneydownhill.html` | `https://cdn.jsdelivr.net/gh/tty67hlt6jf6/j@main/style/favicon.ico` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `cljsvecx.html` | `assets/games/images/banner.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cljumpingshell.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cljustfalllol.html` | `-` | - | - | cap referencia a imatge |
| `cljusthitthebutton.html` | `-` | - | - | cap referencia a imatge |
| `cljustoneboss.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clkalikan.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clkarlson.html` | `-` | - | - | cap referencia a imatge |
| `clkillover.html` | `assets/games/index.png` | local / img | -30 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clkilltheiceagebabyadventure.html` | `-` | - | - | cap referencia a imatge |
| `clklifur.html` | `-` | - | - | cap referencia a imatge |
| `clkonkrio.html` | `assets/games/icons/regular-192.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clkourio.html` | `assets/games/TemplateData/background-og.webp` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cllaceysflashgames.html` | `assets/games/Lacey's Flash Games.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cllasthorizon.html` | `-` | - | - | cap referencia a imatge |
| `clleaderstrike.html` | `assets/games/style/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clleveldevil.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clleverwarriors.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/leverwarriors/Templ...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `cllittlerunmo.html` | `assets/games/Little Runmo - The Game.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cllockthedoor.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cllowknight.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clluckyblocks.html` | `https://cdn.jsdelivr.net/gh/bubbls/UGS-file-encryption@754a57837e92bb4...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `clmadalinstuntcarsmultiplayerfixed.html` | `assets/games/"https:/rawcdn.githack.com/IdkDwij/The-Hamster-Calculator...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmadnesss2010.html` | `-` | - | - | cap referencia a imatge |
| `clmadnessstand.html` | `-` | - | - | cap referencia a imatge |
| `clmadskillsmotocross2.html` | `assets/games/body.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmadstick.html` | `-` | - | - | cap referencia a imatge |
| `clmakesureitsclosed.html` | `-` | - | - | cap referencia a imatge |
| `clmanagod.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmaskedforcesunlimited.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmedalofhonor.html` | `-` | - | - | cap referencia a imatge |
| `clmegachess.html` | `-` | - | - | cap referencia a imatge |
| `clmelonplayground.html` | `-` | - | - | cap referencia a imatge |
| `clmergeroundracers.html` | `assets/games/thumb_anim_2x.gif` | local / css:url | -36 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmimic.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clminecraft1-8-8.html` | `-` | - | - | cap referencia a imatge |
| `clmineshooter.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clminesweeperplus.html` | `assets/games/MinesweeperPlus.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clminicrossword.html` | `assets/games/media/graphics/orientate/landscape.jpg` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clminishooters.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clminitooth.html` | `-` | - | - | cap referencia a imatge |
| `clmoneyrush.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmonkeymart.html` | `assets/games/load_bar_bg.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmonstertruckportstunt.html` | `https://cdn.jsdelivr.net/gh/mailgma-class/mos@main/TemplateData/favico...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clmotox3m2.html` | `-` | - | - | cap referencia a imatge |
| `clmotox3mm (1).html` | `assets/games/${faviconUrl}` | local / favicon | -1078 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmotox3mm.html` | `assets/games/${faviconUrl}` | local / favicon | -1078 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmotox3mpoolparty.html` | `-` | - | - | cap referencia a imatge |
| `clmotox3mspookyland.html` | `-` | - | - | cap referencia a imatge |
| `clmotox3mwinter.html` | `-` | - | - | cap referencia a imatge |
| `clmountainbikeracer.html` | `-` | - | - | cap referencia a imatge |
| `clmrracer.html` | `assets/games/icon.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmxoffroadmaster.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clmyteardrop.html` | `assets/games/Sprites/Load.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clneonblaster.html` | `-` | - | - | cap referencia a imatge |
| `clnetattack.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/net.attack/Template...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clneverendinglegacy.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clnextdoor.html` | `-` | - | - | cap referencia a imatge |
| `clngon.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clnightclubshowdown.html` | `-` | - | - | cap referencia a imatge |
| `clnimrods.html` | `-` | - | - | cap referencia a imatge |
| `clnoobminer.html` | `-` | - | - | cap referencia a imatge |
| `clnotyourpawn.html` | `-` | - | - | cap referencia a imatge |
| `clnubbysnumberfactory.html` | `assets/games/runner.svg` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clnullkevin.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clnzp.html` | `https://hits.sh/hits.sh/nzp-team.github.io/latest/game.html/hits.svg` | remote / img | 45 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clobby-99-will-lose.html` | `-` | - | - | cap referencia a imatge |
| `clobbyonlyup.html` | `-` | - | - | cap referencia a imatge |
| `clofflineparadise.html` | `-` | - | - | cap referencia a imatge |
| `clomeganuggetclicker.html` | `-` | - | - | cap referencia a imatge |
| `clonebitadventure.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clonenightasfreddy.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/onenightasfreddy/Te...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clonlyup.html` | `https://cdn.jsdelivr.net/gh/sz-games/Games8@d12ca56d8b0a51ee19122003c7...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `cloperius.html` | `-` | - | - | cap referencia a imatge |
| `cloppositeday.html` | `-` | - | - | cap referencia a imatge |
| `clorbofcreation.html` | `-` | - | - | cap referencia a imatge |
| `closu.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clovofixed.html` | `-` | - | - | cap referencia a imatge |
| `clpaperio.html` | `https://cdn.jsdelivr.net/gh/MartinTintin3/melvin-games@e4de505d194355c...` | remote / img | 77 | nomes imatges remotes de baixa qualitat |
| `clpaperiomania.html` | `https://cdn.jsdelivr.net/gh/bessiegasbarro/papman@01527b751e7c26a0579a...` | remote / img | 45 | nomes imatges remotes de baixa qualitat |
| `clparkingfury.html` | `-` | - | - | cap referencia a imatge |
| `clparkingfury2.html` | `-` | - | - | cap referencia a imatge |
| `clparkingfury3.html` | `-` | - | - | cap referencia a imatge |
| `clparkingrush.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpenguindiner.html` | `assets/games/assets/cover.jpg` | local / og:image | 32 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpereelous.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clperfecthotel.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clphasma.html` | `-` | - | - | cap referencia a imatge |
| `clpicodriller.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clpicohot.html` | `data:image (image/png, 2.2 KB)` | embed / css:url | 45 | nomes sprites/icones embegudes (data:image) |
| `clpicolife.html` | `data:image (image/png, 0.5 KB)` | embed / img | 35 | nomes sprites/icones embegudes (data:image) |
| `clpiconightpunkin.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clpingpongchaos.html` | `-` | - | - | cap referencia a imatge |
| `clpixelcombat2.html` | `assets/games/style/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpixelshooter.html` | `-` | - | - | cap referencia a imatge |
| `clpixelspeedrun.html` | `-` | - | - | cap referencia a imatge |
| `clpixelwarfare.html` | `-` | - | - | cap referencia a imatge |
| `clpizzatower.html` | `-` | - | - | cap referencia a imatge |
| `clplangman.html` | `-` | - | - | cap referencia a imatge |
| `clplinko.html` | `_app/immutable/assets/og_image.PzHn9Bxz.jpg` | local / og:image | 32 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clplonky.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpogo3D.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/pogo3D/TemplateData...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clpolicepursuit2.html` | `-` | - | - | cap referencia a imatge |
| `clpolyold.html` | `-` | - | - | cap referencia a imatge |
| `clpoorbunny.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clporklike.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clportal2d.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clporter.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clpossessquest.html` | `-` | - | - | cap referencia a imatge |
| `clpostal.html` | `assets/games/play-postal-free.jpg` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpraxisfighterx.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clpullfrog.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clpuppethockey.html` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clpushyourluck.html` | `-` | - | - | cap referencia a imatge |
| `clpvz2gardenless.html` | `assets/games/.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clquake3.html` | `-` | - | - | cap referencia a imatge |
| `clragdollarchers.html` | `assets/games/logo.jpeg` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clragdollhit.html` | `-` | - | - | cap referencia a imatge |
| `clragdollrunners.html` | `assets/games/"data:@file/png;base64,iVBORw0KGgoAAAANSUhEUgAACAAAAAgACA...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clragdollsoccer.html` | `-` | - | - | cap referencia a imatge |
| `clrealflightsim.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clrecoil.html` | `assets/games/webapp/cover.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clredhanded.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clredtierunner.html` | `-` | - | - | cap referencia a imatge |
| `clredvsblue2.html` | `-` | - | - | cap referencia a imatge |
| `clredvsbluewar.html` | `https://cdn.jsdelivr.net/gh/tty67hlt6jf6/ghj@main/logo.png` | remote / img | 77 | nomes imatges remotes de baixa qualitat |
| `clresizer.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clretrobowl.html` | `assets/games/html5game/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clretrobowlcollege.html` | `assets/games/html5game/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clretrohighway.html` | `assets/games/retrohighway/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clretropingpong.html` | `-` | - | - | cap referencia a imatge |
| `clreturntoriddleschool.html` | `-` | - | - | cap referencia a imatge |
| `clriddlemiddleschool.html` | `-` | - | - | cap referencia a imatge |
| `clrocketleague.html` | `-` | - | - | cap referencia a imatge |
| `clrocketpult.html` | `assets/games/icons/icon-512.png` | local / favicon | -48 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clrocketsoccerderby.html` | `-` | - | - | cap referencia a imatge |
| `clrodha.html` | `-` | - | - | cap referencia a imatge |
| `clrollerballer.html` | `-` | - | - | cap referencia a imatge |
| `clrollingsky.html` | `-` | - | - | cap referencia a imatge |
| `clrollyvortex.html` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clrooftopsnipers.html` | `-` | - | - | cap referencia a imatge |
| `clrooftopsnipers2.html` | `-` | - | - | cap referencia a imatge |
| `clrouletteknight.html` | `assets/games/html5game/splash.png` | local / img | -28 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clrun3.html` | `assets/games/font/COMFORTAA-BOLD.svg` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clrussiancardriver.html` | `-` | - | - | cap referencia a imatge |
| `clsandboxcity.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsandtris.html` | `-` | - | - | cap referencia a imatge |
| `clscarletshift.html` | `-` | - | - | cap referencia a imatge |
| `clscrapmetal3.html` | `-` | - | - | cap referencia a imatge |
| `clscubabear.html` | `-` | - | - | cap referencia a imatge |
| `clseamongrel.html` | `-` | - | - | cap referencia a imatge |
| `clserenitrove.html` | `assets/games/turtle.png` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsfk.html` | `-` | - | - | cap referencia a imatge |
| `clsfk2.html` | `-` | - | - | cap referencia a imatge |
| `clsfklaststand.html` | `-` | - | - | cap referencia a imatge |
| `clsfkleague.html` | `-` | - | - | cap referencia a imatge |
| `clshift.html` | `-` | - | - | cap referencia a imatge |
| `clshift2.html` | `-` | - | - | cap referencia a imatge |
| `clshortlife.html` | `-` | - | - | cap referencia a imatge |
| `clshredmill.html` | `-` | - | - | cap referencia a imatge |
| `clsideeffects.html` | `-` | - | - | cap referencia a imatge |
| `clsiloshowdow.html` | `assets/games/SilhoutteShowdownV090.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsixwaystodie.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clskibididibidygyattohiorizzingallovertheplacestillwatermangotheoryfemboydrool (1).html` | `-` | - | - | cap referencia a imatge |
| `clskibididibidygyattohiorizzingallovertheplacestillwatermangotheoryfemboydrool.html` | `-` | - | - | cap referencia a imatge |
| `clskibidishooter.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clskyrace-3d.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsliceitall.html` | `-` | - | - | cap referencia a imatge |
| `clslideinthewoods.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clslipways.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clslitherio.html` | `https://26515722-282596139816136697.preview.editmysite.com/uploads/b/7...` | remote / css:url | -968 | nomes imatges remotes de baixa qualitat |
| `clslope2player.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clslope3.html` | `assets/games/style/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clslopeplus.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clslotornot.html` | `data:image (image/png, 6.2 KB)` | embed / css:url | 62 | nomes sprites/icones embegudes (data:image) |
| `clslowroads.html` | `assets/games/img.jpg` | local / og:image | 0 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsm63redux.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsmashkartsworking.html` | `\ -> no resol a cap fitxer` | local / img | -1055 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsnakelike.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clsnipershot.html` | `https://cdn.jsdelivr.net/gh/meymenet645x/xu@main/logo.png` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsnowballio.html` | `-` | - | - | cap referencia a imatge |
| `clsnowrider.html` | `-` | - | - | cap referencia a imatge |
| `clsnowriderrrr.html` | `-` | - | - | cap referencia a imatge |
| `clsnowroad.html` | `assets/games/background.png` | local / img | -30 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsoccerbros.html` | `assets/games/assets/loading4.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsoccerrandomgood.html` | `-` | - | - | cap referencia a imatge |
| `clsolarsandbox.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsolarsmash.html` | `-` | - | - | cap referencia a imatge |
| `clsoniceexeog.html` | `assets/games/runner.svg` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsonicrevert.html` | `-` | - | - | cap referencia a imatge |
| `clsouljumper.html` | `-` | - | - | cap referencia a imatge |
| `clspacebarclicker.html` | `data:image (image/png, 1.0 KB)` | embed / css:url | 2 | nomes sprites/icones embegudes (data:image) |
| `clspacecompany.html` | `assets/games/whiteLogo.png` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clspacewarsbattleground.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clspacewaves.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clspeedperclick.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clspiralroll.html` | `-` | - | - | cap referencia a imatge |
| `clsprunked.html` | `-` | - | - | cap referencia a imatge |
| `clsprunki.html` | `-` | - | - | cap referencia a imatge |
| `clsprunkiclicker.html` | `-` | - | - | cap referencia a imatge |
| `clsquidplayground.html` | `assets/games/icons/icon-512.png` | local / favicon | -48 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstackballio.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstacktris.html` | `assets/games/webapp/cover.jpg` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstackydash.html` | `-` | - | - | cap referencia a imatge |
| `clstateio.html` | `-` | - | - | cap referencia a imatge |
| `clstation141.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstationmeltdown.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstealbrainrotonline.html` | `-` | - | - | cap referencia a imatge |
| `clstealthmaster.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsteelsurge.html` | `data:image (image/png, 3.0 KB)` | embed / css:url | 45 | nomes sprites/icones embegudes (data:image) |
| `clstickarchersbattle.html` | `-` | - | - | cap referencia a imatge |
| `clstickfighter.html` | `assets/games/icons/icon-32.png` | local / favicon | -98 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstickjetchallenge.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstickmanandguns.html` | `-` | - | - | cap referencia a imatge |
| `clstickmanclash.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstickmanduel.html` | `-` | - | - | cap referencia a imatge |
| `clstickmangtacity.html` | `-` | - | - | cap referencia a imatge |
| `clstickmanhook.html` | `-` | - | - | cap referencia a imatge |
| `clstickmankombat2d.html` | `assets/games/appmanifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstickmerge.html` | `assets/games/images/thumb_anim_2x.gif` | local / css:url | -36 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clstickslasher.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/stickslasher/Templa...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clstrikerdummies.html` | `-` | - | - | cap referencia a imatge |
| `clsubwaysurfersbarcelona.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersbeijing.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersberlin.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfershavana.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfershouston.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersiceland.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurferslondon.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersmexico.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersmiami (1).html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersmiami.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersmonaco.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurferssanfrancisco (1).html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurfersstpetersburg.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurferswinterholiday.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsubwaysurferszurich.html` | `assets/games/img/FirstAvatar.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsuika.html` | `-` | - | - | cap referencia a imatge |
| `clsuikapico.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clsunandmoon.html` | `-` | - | - | cap referencia a imatge |
| `clsupercarrush.html` | `-` | - | - | cap referencia a imatge |
| `clsuperdarkdeception.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsuperhot.html` | `assets/games/hot.jpg` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsuperhotlinemiami.html` | `-` | - | - | cap referencia a imatge |
| `clsuperkidadventure.htm` | `assets/games/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsuperliquidsoccer.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsupermariobros.html` | `https://57264959-967300405472742195.preview.editmysite.com/uploads/b/1...` | remote / css:url | 32 | nomes imatges remotes de baixa qualitat |
| `clsuperoliverworld.html` | `-` | - | - | cap referencia a imatge |
| `clsuperpickleballadventure.html` | `-` | - | - | cap referencia a imatge |
| `clsupitdept.html` | `assets/games/Images/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsupremeduelist.html` | `-` | - | - | cap referencia a imatge |
| `clsurvevio.html` | `https://cdn.jsdelivr.net/gh/lmssiehdev/resurviv@0f4784d97eb25d57d855ea...` | remote / css:url | 64 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clsurvivalracev2.html` | `-` | - | - | cap referencia a imatge |
| `clsushiunroll.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clswitchblade.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clswordfight.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clswordplay.html` | `-` | - | - | cap referencia a imatge |
| `cltabletanks.html` | `-` | - | - | cap referencia a imatge |
| `cltabletennisworldtour.html` | `-` | - | - | cap referencia a imatge |
| `cltag-.html` | `-` | - | - | cap referencia a imatge |
| `cltagc3.html` | `assets/games/icons/icon-512.png` | local / apple-touch-icon | 5 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltaisei.html` | `assets/games/background.webp` | local / css:url | -68 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltallmanrun.html` | `-` | - | - | cap referencia a imatge |
| `cltankpixel.html` | `-` | - | - | cap referencia a imatge |
| `cltanukisunsetuhhhhhhhh.html` | `-` | - | - | cap referencia a imatge |
| `cltaproad.html` | `assets/games/image/logo.png` | local / img | 2 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltelephonetrouble.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltemplerun2.html` | `https://cdn.jsdelivr.net/gh/genizy/google-class/temple-run-2/img/og-ic...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clterra.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clterritorialio.html` | `-` | - | - | cap referencia a imatge |
| `clthemaninthewindow.html` | `-` | - | - | cap referencia a imatge |
| `clthereisnofile.html` | `https://lh4.googleusercontent.com/lUEWrXMVEr4AdjKISyJahDRJ61bwfvHdpeYm...` | remote / img | -955 | nomes imatges remotes de baixa qualitat |
| `clthermomorph.html` | `-` | - | - | cap referencia a imatge |
| `clthreegoblets.html` | `https://517352059-274610048362274831.preview.editmysite.com/uploads/b/...` | remote / css:url | -8 | nomes imatges remotes de baixa qualitat |
| `clthrowapotato.html` | `-` | - | - | cap referencia a imatge |
| `clthrowapotatoagain.html` | `-` | - | - | cap referencia a imatge |
| `clthwack.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltimeshooter2.html` | `https://cdn.jsdelivr.net/gh/mistirk/googleapis@499ff451605f5a085318b5d...` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltimeshooter3.html` | `https://cdn.jsdelivr.net/gh/mistirk/google@eebffdf79a14f6e01e153d5cd4b...` | remote / img | 77 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltimewarriors.html` | `assets/games/game_logo_en.png` | local / css:url | -36 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltinyfishing.html` | `https://lh4.googleusercontent.com/lUEWrXMVEr4AdjKISyJahDRJ61bwfvHdpeYm...` | remote / img | -955 | nomes imatges remotes de baixa qualitat |
| `cltoastarling.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `cltoasterball.html` | `-` | - | - | cap referencia a imatge |
| `cltommorowandyesterday.html` | `-` | - | - | cap referencia a imatge |
| `cltopspeedracing3d.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltotm.html` | `-` | - | - | cap referencia a imatge |
| `cltownscraper.html` | `-` | - | - | cap referencia a imatge |
| `cltrace.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltrafficjam3d.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltrapthecat.html` | `https://fonts.googleapis.com/css?family=Tangerine` | remote / css:url | -968 | nomes imatges remotes de baixa qualitat |
| `cltrechoroustrials.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltrechoroustrialspart2.html` | `-` | - | - | cap referencia a imatge |
| `cltriachnid.html` | `-` | - | - | cap referencia a imatge |
| `cltriviacrack.html` | `assets/games/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltrucksim.html` | `-` | - | - | cap referencia a imatge |
| `cltubejumpers.html` | `-` | - | - | cap referencia a imatge |
| `cltunnelrush.html` | `-` | - | - | cap referencia a imatge |
| `cltunnelrushbetter.html` | `-` | - | - | cap referencia a imatge |
| `clturbostars.html` | `assets/games/logo.png` | local / img | -23 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cltwoball3d.html` | `assets/games/"https:/cdn.jsdelivr.net/gh/tyler6974/TwoBall3D@2ab5c5b38...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clucds.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cluckyblockobbyEUOPHRATESRIVER.html` | `-` | - | - | cap referencia a imatge |
| `clufoswampoddysey.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clultrakill.html` | `-` | - | - | cap referencia a imatge |
| `cluncannycatgolf.html` | `assets/games/Uncanny Cat Golf.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clunderneath.html` | `-` | - | - | cap referencia a imatge |
| `clundertaleyellow.html` | `https://cdn.jsdelivr.net/gh/1e295a49108e716ce8ab7eba0c8dca7d/9326265e4...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clunfairundyne.html` | `-` | - | - | cap referencia a imatge |
| `clunicyclehero.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `cluno.html` | `-` | - | - | cap referencia a imatge |
| `cluntime.html` | `-` | - | - | cap referencia a imatge |
| `clupslash.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvampiresurvivors.html` | `assets/games/icons/icons-512.png` | local / favicon | -48 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvaportrails.html` | `https://cdn.jsdelivr.net/gh/Stinkalistic/junk@main/Vapor%20Trails/Temp...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clvex3.html` | `-` | - | - | cap referencia a imatge |
| `clvex3xmas.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvex4.html` | `https://cdn.jsdelivr.net/gh/CFiltered/Matt@50f9c1bd0d376b40cb8545519b1...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clvex5.html` | `https://cdn.jsdelivr.net/gh/EXM1LITARY/lio@7beab336469d96d153903e03dfe...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clvex6.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvex7.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvex8.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvexchallenges.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvexx3m.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvexx3m2.html` | `assets/games/assets/icon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clvillager.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clvincentmansionofthedead.html` | `-` | - | - | cap referencia a imatge |
| `clvisitor.html` | `-` | - | - | cap referencia a imatge |
| `clvolleyrandom.html` | `-` | - | - | cap referencia a imatge |
| `clvollyballchallenge.html` | `-` | - | - | cap referencia a imatge |
| `clwaluigitacostand.html` | `-` | - | - | cap referencia a imatge |
| `clwartheknight.html` | `-` | - | - | cap referencia a imatge |
| `clwaterpoolio.html` | `https://cdn.jsdelivr.net/gh/tty67hlt6jf6/a@main/TemplateData/favicon.i...` | remote / favicon | 22 | nomes imatges remotes de baixa qualitat |
| `clwavedash.html` | `-` | - | - | cap referencia a imatge |
| `clwaverun.html` | `https://lh4.googleusercontent.com/lUEWrXMVEr4AdjKISyJahDRJ61bwfvHdpeYm...` | remote / img | -955 | nomes imatges remotes de baixa qualitat |
| `clwebecomewhatwebehold.html` | `-` | - | - | cap referencia a imatge |
| `clwebfishing.html` | `assets/games/webfishing.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clwermhole.html` | `assets/games/index.apple-touch-icon.png` | local / apple-touch-icon | -25 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clwheeliebike.html` | `assets/games/icons/icon-256.png` | local / apple-touch-icon | -3 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clwinterfalling.html` | `-` | - | - | cap referencia a imatge |
| `clwitchcrafttd.html` | `data:image (image/png, 0.6 KB)` | embed / css:url | 44 | nomes sprites/icones embegudes (data:image) |
| `clwolfenstein.html` | `-` | - | - | cap referencia a imatge |
| `clwoodworm.html` | `data:image (image/png, 3.1 KB)` | embed / css:url | 70 | nomes sprites/icones embegudes (data:image) |
| `clwrassling.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clwrestlebros.html` | `assets/games/assets/loading4.png` | local / img | -55 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clyanderesimulator.html` | `-` | - | - | cap referencia a imatge |
| `clyouvs100skibidi.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clyumenikki.html` | `-` | - | - | cap referencia a imatge |
| `clzenword.html` | `assets/games/font/JosefinSans-Bold.ttf` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clzombieroad.html` | `assets/games/"https:/cdn.jsdelivr.net/gh/dem-google-usa/userconetn@mai...` | local / css:url | -1068 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clzombierush.html` | `-` | - | - | cap referencia a imatge |
| `clzombotronreboot.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `clzrist.html` | `-` | - | - | cap referencia a imatge |
| `clÖoo.html` | `-` | - | - | cap referencia a imatge |
| `clʘ.html` | `-` | - | - | cap referencia a imatge |
| `crossbarchallenge.html` | `-` | - | - | cap referencia a imatge |
| `eaglercraft.1.5.2.html` | `data:image (image/png, 1.6 KB)` | embed / favicon | 7 | nomes sprites/icones embegudes (data:image) |
| `marbleracer.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `penaltykicks.html` | `-` | - | - | cap referencia a imatge |
| `penaltyshooters3.html` | `-` | - | - | cap referencia a imatge |
| `polytrackbutnotflagged.html` | `assets/games/manifest.json` | local / manifest | -1090 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `superdromebugs.html` | `assets/games/favicon.png` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |
| `tonyhawks.html` | `assets/games/TemplateData/favicon.ico` | local / favicon | -78 | nomes rutes relatives que NO existeixen al repo (el joc les resol des del CDN) |

## Criteris de classificacio

Cada referencia rep un score; mes alt = mes bona portada. El llindar de "portada utilitzable"
es **90**.

**1. Procedencia (on apareix)**

| Procedencia | Punts | Per que |
| --- | --- | --- |
| `og:image` | +100 | Portada declarada explicitament pel autor. |
| `twitter:image` | +90 | Mateixa intencio que og:image. |
| `apple-touch-icon` | +75 | Icona oficial del joc, 180x180. |
| `video:poster`, `body background` | +65 | Cobreixen tota la pantalla. |
| `msapplication-tile` | +50 | Icona de pantalla d'inici. |
| `<img>` / `<img srcset>` | +45 / +40 | Imatge visible del document. |
| CSS `url()` | +32 | Fons o elemente amb imatge. |
| `favicon` | +22 | Identitat del joc, pero es petite. |

**2. Nom del fitxer i atributs del `<img>`**

- `cover`, `thumb`, `poster`, `banner`, `splash`, `hero`, `logo`, `start-screen` -> **+32**.
- `sprite`, `atlas`, `tileset`, `button`, `cursor`, `obstacle`, `trex`, `cloud`, `restart` -> **-40**.
- `id`/`class`/`alt` del `<img>` que digui `logo`/`cover` -> **+25**; si diu `sprite`/`btn` -> **-30**.

**3. Dimensions**

- costat >= 400 px -> **+30**; >= 180 px -> **+22**; >= 100 px -> **+8**; <= 64 px -> **-20**.
- Per als embeguts llegim les dimensions reals del PNG/GIF/WEBP/SVG.

**4. Origen i mida**

- LOCAL existent al repo -> **+30**. EMBEGUDA -> **+30**. (Cap es deixa sense baixar.)
- < 1 KB -> **-40**; < 3 KB -> **-25**; > 30 KB -> **+5** (senyal d'imatge de veritat).

## Com reproduir

```
node tools/mine-local-images.mjs --csv=tools/mining-local-images.csv
```

El CSV te una fila per joc amb la millor candidata, el seu origen, score i el perque ha estat
acceptada o rebutjada. El script no escriu res fora de `tools/`.
