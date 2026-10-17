/**
 * load-queue.js · la cua del treball de fons.
 *
 * Hi ha feina que la pàgina no es pot permetre de fer tota alhora:
 * demanar i descodificar les portades és el cas clar —d'un cop són
 * desenes de peticions i de bitmaps—, i en un equip de gamma baixa això
 * es nota a la CPU i a la RAM. Aquesta cua la reparteix: com a molt
 * `concurrency` tasques alhora (dues, per a les portades) i una pausa
 * de `gap` ms després de cada tasca. Triga més, però no es nota: cada
 * targeta ensenya el seu propi esquelet mentrestant.
 *
 * Una tasca que retorna `SKIP` (p. ex. la portada d'una targeta que ja
 * no és al DOM) es buida a l'instant: no fa esperar ningú.
 */

/** Retorn d'una tasca que s'ha descartat sense fer feina. */
export const SKIP = 'skip';

const dorm = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Crea una cua de tasques de fons, FIFO.
 *
 * @param {{ concurrency?: number, gap?: number }} [opcions]
 *   `concurrency`: tasques simultànies com a màxim (1 per defecte).
 *   `gap`: pausa en ms després de cada tasca que ha treballat de debò
 *   (0 per defecte).
 * @returns {{ add: (tasca: () => Promise<unknown> | unknown) => void }}
 */
export function createQueue({ concurrency = 1, gap = 0 } = {}) {
    const pendents = [];
    let actives = 0;

    function bomba() {
        while (actives < concurrency && pendents.length) {
            const tasca = pendents.shift();
            actives += 1;
            Promise.resolve()
                .then(tasca)
                .then((resultat) => (resultat === SKIP ? null : dorm(gap)))
                .catch(() => null) // una tasca que peta no atura la cua
                .then(() => {
                    actives -= 1;
                    bomba();
                });
        }
    }

    return {
        add(tasca) {
            pendents.push(tasca);
            bomba();
        }
    };
}
