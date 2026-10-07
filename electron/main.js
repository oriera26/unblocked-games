/**
 * Punt d'entrada de l'app d'Escriptori.
 *
 * El lloc és estàtic, així que l'app només fa dues coses: engegar
 * server.js (el servidor que serveix l'arrel del projecte, el mateix que
 * fa servir la web de GitHub Pages) i obrir-lo dins d'una finestra. Cap
 * fitxer del catàleg canvia: el que funciona al navegador funciona aquí.
 *
 * No hi ha barra de menú. Tot l'operativa va amb dreceres de teclat
 * (F11 pantalla completa, F5 o Ctrl+R recarregar, Ctrl +/- zoom), i el
 * joc es queda amb tota l'alçada de la finestra.
 */
import { BrowserWindow, Menu, app, shell } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Arrel del projecte: on hi ha index.html, server.js i assets/. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * D'on es serveixen els fitxers. En un build empaquetat van dins de
 * resources/site (extraResources, no dins de l'asar, perquè s'han de
 * llegir com a fitxers normals); en desenvolupament, a l'arrel.
 */
const SITE = app.isPackaged ? join(process.resourcesPath, 'site') : ROOT;

/**
 * Port fix. L'origen (esquema + host + port) és la clau de localStorage i
 * de la cache del service worker: amb port a l'atzar cada engegada
 * començaria sense favorits, sense tema i amb les caches buides. Si el
 * 3131 és ocupat (una altra còpia de l'app o un `npm start`), es deixa
 * que el sistema trii un de lliure.
 */
const PREFERRED_PORT = 3131;

const WINDOW_ICON = join(SITE, 'assets', 'icons', 'icon-512x512.png');
const SMOKE = process.argv.includes('--smoke');

let mainWindow = null;
let site = null;

/**
 * Engega el servidor local.
 *
 * server.js calcula la seva arrel a partir de la seva pròpia ubicació, de
 * manera que serveix el que té al costat tant en desenvolupament com
 * dins de l'app empaquetada: no cal cap configuració extra.
 *
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
async function startSite() {
    const { startServer } = await import(pathToFileURL(join(SITE, 'server.js')).href);

    try {
        return await startServer({ port: PREFERRED_PORT, quiet: true });
    } catch {
        // El 3131 és ocupat (o qualsevol altre error del port preferit):
        // port lliure a l'atzar abans que renunciar a obrir l'app.
        return await startServer({ port: 0, quiet: true });
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 640,
        minHeight: 480,
        backgroundColor: '#05060a',
        title: 'UnblockedGames by Ula',
        icon: WINDOW_ICON,
        // Sense barra de menú dalt: `Menu.setApplicationMenu(null)` a
        // boot() ja n'elimina qualsevol rastre a totes les plataformes.
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    // Els enllaços externes (YouTube, Discord, el repositori…) van al
    // navegador del sistema; el que sigui d'aquest servidor, dins l'app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(site.url)) return { action: 'allow' };
        void shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith(site.url)) return;
        event.preventDefault();
        void shell.openExternal(url);
    });

    // Sense menú no hi ha dreceres heretades: aquí queden les de sempre.
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;

        const key = input.key.toLowerCase();

        if (input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        } else if (input.key === 'F5' || (input.control && key === 'r')) {
            mainWindow.webContents.reload();
        } else if (input.control && (key === '+' || key === '=')) {
            mainWindow.webContents.zoomIn();
        } else if (input.control && key === '-') {
            mainWindow.webContents.zoomOut();
        } else {
            return;
        }

        event.preventDefault();
    });

    void mainWindow.loadURL(site.url);
}

/** Comprovació ràpida que servidor, catàleg i jocs responen. */
async function smoke() {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
        // async IIFE: el resultat ha de ser un objecte pla; una promesa
        // dins de l'objecte no s'espera i l'execució es quedaria penjada.
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
            const estats = await Promise.all(
                ['/', '/assets/games/zigzag/index.html', '/assets/images/zigzag.webp']
                    .map((u) => fetch(u).then((r) => r.status).catch(() => 0))
            );
            return {
                title: document.title,
                estats
            };
        })()`);

        const estats = await result.estats;
        const ok = Boolean(result.title) && estats.every((s) => s === 200);

        console.log(
            `SMOKE ${ok ? 'OK' : 'FAIL'} · "${result.title}" · estats=[${estats.join(', ')}]`
        );
        app.exit(ok ? 0 : 1);
    } catch (err) {
        console.log(`SMOKE FAIL · ${err?.message ?? err}`);
        app.exit(1);
    }
}

async function boot() {
    // Cap barra de menú: ni "Edició", ni "Visualització", ni "Ajuda".
    Menu.setApplicationMenu(null);

    try {
        site = await startSite();
    } catch (err) {
        console.error(`No s'ha pogut engegar el servidor local: ${err?.message ?? err}`);
        app.exit(1);
        return;
    }

    createWindow();

    if (SMOKE) {
        mainWindow.webContents.once('did-finish-load', () => void smoke());
        mainWindow.webContents.on('did-fail-load', (_e, _c, desc) => {
            console.log(`SMOKE FAIL · ${desc}`);
            app.exit(1);
        });
    }
}

// Una sola còpia de l'app: la segona engegada porta la primera al davant.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady().then(boot).catch((err) => {
        console.error(err);
        app.exit(1);
    });
}

app.on('window-all-closed', () => {
    app.quit();
});

app.on('will-quit', () => {
    // Cap procés del servidor sobranta quan l'app es tanca.
    void site?.close?.();
});
