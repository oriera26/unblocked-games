/**
 * game-path.js · la ruta d'un joc dins del projecte.
 *
 * Viu en un mòdul propi perquè el necessiten `player.js`, la capa
 * offline i `volume.js`, i posar-lo a `player.js` crearia un cicle
 * d'imports (player → offline → player).
 *
 * Els jocs normals surten de `assets/games/`; els offline, de
 * `assets/offline/`, que és la carpeta que el service worker tracta de
 * manera especial.
 */

import { GAMES_DIR, OFFLINE_GAMES_DIR } from './config.js';

/**
 * La ruta del fitxer HTML d'un joc.
 *
 * Al llistat hi ha tres formes de nom i s'han de respectar totes:
 *
 *   crossbarchallenge.html  -> tal qual
 *   clextremerun3d          -> sense extensió, hi afegim .html
 *   clsuperkidadventure.htm -> extensió .htm, NO hi afegim .html
 *
 * El cas .htm és el que fa que no es pugui decidir amb un `endsWith('.html')`:
 * hi ha un joc que es diu exactament així i el fitxer real és
 * `clsuperkidadventure.htm`. Afegir-hi .html donava un 404.
 *
 * @param {{url: string, type?: string}|string} game entrada del catàleg,
 *        o només l'url (compatibilitat amb el codi antic)
 */
export function gameSrc(game) {
    const url = typeof game === 'string' ? game : game.url;
    const offline = typeof game === 'object' && game !== null && game.type === 'offline';
    const dir = offline ? OFFLINE_GAMES_DIR : GAMES_DIR;
    const hasExtension = /\.[a-z0-9]+$/i.test(url);
    return `${dir}${hasExtension ? url : `${url}.html`}`;
}
