/**
 * check-tabs · comprova que canviar de vista no amaga l'arcade.
 *
 * Regressió concreta: entrar a Estadístiques i tornar a Inici o a Jocs
 * deixava `#view-arcade` amb un `display: none` inline (que es posava en
 * acabar l'animació de sortida) i aquell estil guanyava sobre
 * `.view.active { display: block }`: la vista quedava activa però
 * invisible, així que la llista "desapareixia" sense cap error de consola.
 *
 * Obre el lloc en Electron, navega com ho faria l'usuari i mesura l'estat
 * real de `#view-arcade` (estil calculat, estil inline, targetes de la
 * graella i errors de consola).
 *
 *   npx electron tools/check-tabs.mjs
 *
 * Sortida 0 si les dues anades i tornades deixen l'arcade visible, 1 si no.
 *
 * No és un pas de `check-all` perquè necessita Electron i una finestra
 * gràfica (a CI no n'hi ha); llançar-lo a mà després de tocar router.js.
 */

import { app, BrowserWindow } from 'electron';

import { startServer } from '../server.js';

/** Ha de coincidir amb VIEW_TRANSITION_MS de assets/js/config.js. */
const TRANSITION = 320;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function measure(win) {
    return win.webContents.executeJavaScript(`(() => {
        const v = document.getElementById('view-arcade');
        const g = document.getElementById('gameGrid');
        const s = document.getElementById('view-stats');
        return {
            arcadeActive: v.classList.contains('active'),
            statsActive: s.classList.contains('active'),
            inline: v.getAttribute('style') || '',
            display: getComputedStyle(v).display,
            statsDisplay: getComputedStyle(s).display,
            cards: g ? g.children.length : -1,
            errors: (window.__ulaErrors || []).slice(0, 5)
        };
    })()`);
}

function click(win, sel) {
    return win.webContents.executeJavaScript(
        `(() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return 'no trobat: ' + ${JSON.stringify(sel)};
            el.click();
            return 'ok';
        })()`
    );
}

async function main() {
    const site = await startServer({ port: 0, quiet: true });
    const win = new BrowserWindow({ show: false, width: 1280, height: 900 });

    await win.loadURL(site.url);

    // Recull els errors de consola de la pàgina: l'usuari n'ha dit que no
    // n'hi ha cap, i volem confirmar-ho nosaltres mateixos.
    await win.webContents.executeJavaScript(`(() => {
        window.__ulaErrors = [];
        const keep = console.error.bind(console);
        console.error = (...args) => {
            window.__ulaErrors.push(args.map(String).join(' '));
            keep(...args);
        };
        window.addEventListener('error', (e) => window.__ulaErrors.push(String(e.message)));
    })()`);

    // Espera que la llista s'hagi pintat.
    let baseline = null;
    for (let i = 0; i < 100; i++) {
        baseline = await measure(win);
        if (baseline.cards > 0) break;
        await wait(100);
    }

    console.log('inicial          ', JSON.stringify(baseline));
    const problems = [];

    if (!baseline || baseline.cards <= 0) {
        problems.push('la llista no s\'ha pintat mai');
    }
    if (baseline.display !== 'block') {
        problems.push(`inicialment l'arcade no és visible (${baseline.display})`);
    }

    /* --- 1 · Jocs → Estadístiques → Jocs ------------------------------ */

    console.log('click stats      ', await click(win, '#link-stats'));
    await wait(TRANSITION + 250);
    const onStats = await measure(win);
    console.log('a estadístiques  ', JSON.stringify(onStats));

    console.log('click jocs       ', await click(win, '#link-arcade'));
    await wait(TRANSITION + 250);
    const backToJocs = await measure(win);
    console.log('tornada a jocs   ', JSON.stringify(backToJocs));

    if (backToJocs.display !== 'block' || !backToJocs.arcadeActive) {
        problems.push(
            `en tornar a Jocs l'arcade és "${backToJocs.display}" ` +
                `(inline: "${backToJocs.inline}", active: ${backToJocs.arcadeActive})`
        );
    }
    // El scroll infinit pot fer créixer la llista; el símptoma dolent és
    // que s'escurci o que es quede buida.
    if (backToJocs.cards < baseline.cards || backToJocs.cards === 0) {
        problems.push(
            `la llista ha deixat de renderitzar: ${baseline.cards} → ${backToJocs.cards} targetes`
        );
    }

    /* --- 2 · Estadístiques → logo (Inici) ----------------------------- */

    console.log('click stats      ', await click(win, '#link-stats'));
    await wait(TRANSITION + 250);
    console.log('click logo       ', await click(win, '.logo'));
    await wait(TRANSITION + 250);
    const backToHome = await measure(win);
    console.log('tornada a inici  ', JSON.stringify(backToHome));

    if (backToHome.display !== 'block' || !backToHome.arcadeActive) {
        problems.push(
            `en tornar a Inici l'arcade és "${backToHome.display}" ` +
                `(inline: "${backToHome.inline}", active: ${backToHome.arcadeActive})`
        );
    }

    /* --- errors de consola ------------------------------------------- */

    const errs = [...new Set([...(baseline?.errors ?? []), ...backToJocs.errors, ...backToHome.errors])];
    if (errs.length) {
        console.log('errors de consola:', errs);
        problems.push(`${errs.length} errors de consola`);
    }

    console.log('');
    if (problems.length) {
        for (const p of problems) console.log(`  ✗ ${p}`);
        console.log(`\nSONDA FALLIDA (${problems.length})`);
    } else {
        console.log('  ✓ l\'arcade torna a ser visible i la llista es manté');
        console.log('\nSONDA OK');
    }

    await site.close();
    app.exit(problems.length ? 1 : 0);
}

app.whenReady().then(() => {
    main().catch((e) => {
        console.error('SONDA ERROR', e);
        app.exit(2);
    });
});
