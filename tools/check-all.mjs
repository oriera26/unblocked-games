/**
 * Comprovació completa de les portades, en una sola comanda.
 *
 *   node C:\Users\Usuari\Downloads\unblocked-games-main\unblocked-games\tools\check-all.mjs
 *
 * No importa des d'on es llanci: totes les rutes es deriven d'aquest fitxer.
 *
 * Què fa, en ordre:
 *
 *   1. Espera que acabi una resolució de portades que ja estigui en marxa
 *      (candau, logs de passada acabats d'escriure, o el procés node que
 *      executi fetch-covers), mostrant l'última línia de progrés cada 15 s.
 *   2. `check-covers.mjs`      → rutes, fitxers, mides i imatges idèntiques
 *   3. `check-case.mjs`        → referències que no casen exactament amb el
 *      nom versionat (a Windows es veuen perquè el disc no distingeix
 *      majúscules; a Linux, on es comprova a CI, no)
 *   4. Si surt alguna imatge idèntica, la re-resol sol (màxim 3 rondes):
 *      `fix-list.mjs --dupes-only` + `fetch-covers.mjs --apply --replace`
 *   5. `audit-covers.mjs`      → portades que amb les regles d'ara no punten
 *   6. `check-modules.mjs`     → grau de mòduls
 *   7. `test-server.mjs`       → servidor, MIME, 404, path traversal
 *   8. `covers-sheet.mjs`      → full de contacte i obre el navegador
 *
 * Flags:  --no-open   no obre el navegador
 *         --no-fix    no re-resol res, només comprova
 *         --help      això
 *
 * Acaba amb codi 0 si tot ha anat bé i 1 si alguna comprovació ha fallat.
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const TMP = join(TOOLS, 'tmp');
const LOCK = join(TMP, 'fetch-covers.lock');

const NO_OPEN = process.argv.includes('--no-open');
const NO_FIX = process.argv.includes('--no-fix');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(readFileSync(join(TOOLS, 'check-all.mjs'), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * Utilitats de sortida
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = () => new Date().toLocaleTimeString('ca-ES', { hour12: false });

function fmt(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function banner(title) {
  const line = '─'.repeat(78);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

const lastLine = (text) => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
};

/* ------------------------------------------------------------------ *
 * 1 · Hi ha algú treballant ara mateix?
 * ------------------------------------------------------------------ */

/**
 * Tres maneres de detectar una resolució en marxa:
 *
 *   a) el candau que escriu fetch-covers amb el seu pid
 *   b) un log de passada (`tools/tmp/runN.log`) que s'ha escrit fa <45 s
 *      i que encara mostra `n/m`
 *   c) un procés node.exe amb fetch-covers a la línia d'ordres
 *      (quan la passada s'ha llançat a mà des d'una altra finestra)
 */
function activeRun() {
  try {
    const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
    process.kill(lock.pid, 0);
    return `fetch-covers pid ${lock.pid} en marxa des de ${lock.started}`;
  } catch {
    /* candau inexistent, trencat o de un procés mort */
  }

  if (existsSync(TMP)) {
    for (const name of readdirSync(TMP)) {
      if (!/^run\d*\.log$/i.test(name)) continue;
      const file = join(TMP, name);
      try {
        if (Date.now() - statSync(file).mtimeMs > 45000) continue;
        const text = readFileSync(file, 'utf8');
        const match = text.match(/^\s*(\d+)\/(\d+)\s+\S*.*$/gm);
        if (match) return `${name} en marxa · ${match[match.length - 1].trim()}`;
      } catch {
        /* log desaparegut a mig llegir */
      }
    }
  }

  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
            "Where-Object { $_.CommandLine -like '*fetch-covers*' } | " +
            'Select-Object -ExpandProperty ProcessId',
        ],
        { encoding: 'utf8', timeout: 10000 }
      );
      const pids = out.split(/\s+/).filter((s) => /^\d+$/.test(s));
      if (pids.length) return `fetch-covers pid ${pids.join(', ')} en marxa`;
    } catch {
      /* sense PowerShell o molt lent: s'ignora */
    }
  }

  return null;
}

async function waitForIdle() {
  let waited = 0;
  for (;;) {
    const running = activeRun();
    if (!running) {
      if (waited) console.log(`  ✓ resolució acabada; es comença a validar (${fmt(waited)})`);
      return;
    }
    console.log(`  ${stamp()}  ⏳ esperant · ${running}`);
    await sleep(15000);
    waited += 15000;
    if (waited >= 45 * 60 * 1000) {
      console.log(`  ! s'han esperat 45 minuts sense acabar: es continua igualment`);
      return;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Execució d'una eina, amb la sortida en directe
 * ------------------------------------------------------------------ */

function run(title, script, args = []) {
  return new Promise((resolve) => {
    const started = Date.now();
    banner(`${title}   ·   node tools/${basename(script)}${args.length ? ` ${args.join(' ')}` : ''}`);
    const child = spawn(process.execPath, [join(TOOLS, script), ...args], {
      cwd: ROOT,
      env: process.env,
    });

    let text = '';
    let pending = '';
    const pump = (chunk) => {
      text += chunk;
      pending += chunk;
      const parts = pending.split(/\r?\n/);
      pending = parts.pop() ?? '';
      for (const line of parts) console.log(line);
    };

    child.stdout.on('data', (d) => pump(d.toString()));
    child.stderr.on('data', (d) => pump(d.toString()));
    child.on('error', (err) => pump(`no s'ha pogut arrencar: ${err.message}\n`));
    child.on('close', (code) => {
      if (pending) console.log(pending);
      const ms = Date.now() - started;
      console.log(
        `\n  ${code === 0 ? '✓' : '✗'} ${title} · ${code === 0 ? 'correcte' : `error (codi ${code})`} · ${fmt(ms)}`
      );
      resolve({ title, script, code: code ?? 1, ms, text });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Xifres que interessen de la sortida de check-covers
 * ------------------------------------------------------------------ */

function coverFigures(text) {
  const want = [
    /^Jocs al llistat/,
    /^Amb portada/,
    /^Portades sintetiques/,
    /^Imatges a assets/,
    /^PROBLEMES/,
    /^Tot correcte/,
  ];
  return text
    .split(/\r?\n/)
    .filter((l) => want.some((re) => re.test(l.trim())))
    .map((l) => l.trim());
}

function coverProblems(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => /^\s*x\s/.test(l));
}

/* ------------------------------------------------------------------ *
 * Programa
 * ------------------------------------------------------------------ */

const results = [];

console.log(`check-all · ${stamp()} · node ${process.version}`);
console.log(`projecte   : ${ROOT}`);

banner('1 · Espera si hi ha una resolució de portades en marxa');
await waitForIdle();

/* --- 2 · validació ------------------------------------------------ */
let covers = await run('Validació de portades', 'check-covers.mjs');
results.push(covers);

/* --- 3 · imatges idèntiques: es resolen soles --------------------- */
let rounds = 0;
while (!NO_FIX && /imatge idèntica/.test(covers.text) && rounds < 3) {
  rounds++;
  console.log(
    `\n  ↻ hi ha imatges idèntiques entre jocs: ronda ${rounds} de re-resolució automàtica`
  );

  const list = await run(`Llista dels afectats (ronda ${rounds})`, 'fix-list.mjs', ['--dupes-only']);
  results.push(list);
  if (/jocs a resoldre\s*:\s*0\b/.test(list.text) || list.code !== 0) break;

  const fix = await run(`Re-resolució (ronda ${rounds})`, 'fetch-covers.mjs', [
    '--apply',
    '--replace',
    '--only-file=tools/fix-list.txt',
    '--concurrency=6',
    '--verbose',
  ]);
  results.push(fix);

  covers = await run(`Re-validació (ronda ${rounds})`, 'check-covers.mjs');
  results.push(covers);
}

/* --- 4 · majúscules de les referències ------------------------------ */
const cases = await run('Majúscules de les referències', 'check-case.mjs');
results.push(cases);

/* --- 5-7 · resta de comprovacions ------------------------------------ */
const audit = await run('Audit de portades baixades', 'audit-covers.mjs');
results.push(audit);

const modules = await run('Mòduls de assets/js', 'check-modules.mjs');
results.push(modules);

const server = await run('Servidor local', 'test-server.mjs');
results.push(server);

/* --- 7 · full de contacte ---------------------------------------- */
const sheetArgs = NO_OPEN ? [] : ['--open'];
const sheet = await run('Full de contacte', 'covers-sheet.mjs', sheetArgs);
results.push(sheet);

/* ------------------------------------------------------------------ *
 * Resum
 * ------------------------------------------------------------------ */

banner('RESUM');

const failed = results.filter((r) => r.code !== 0);
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.title.padEnd(34)} ${fmt(r.ms).padStart(7)}`);
}

console.log('\n  Xifres de les portades:');
for (const line of coverFigures(covers.text)) console.log(`    ${line}`);

const problems = coverProblems(covers.text);
if (problems.length) {
  console.log('\n  Problemes de portades:');
  for (const p of problems) console.log(`    ${p.trim()}`);
} else {
  console.log('\n  Cap problema de portades.');
}

if (/imatge idèntica/.test(covers.text)) {
  console.log('\n  Encara queden imatges idèntiques. Una altra ronda a mà:');
  console.log('    node tools/fix-list.mjs --dupes-only');
  console.log(
    '    node tools/fetch-covers.mjs --apply --replace --only-file=tools/fix-list.txt --concurrency=6 --verbose'
  );
}

const auditLines = audit.text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => /^(sospit|revis|!|x)/i.test(l));
if (auditLines.length) {
  console.log('\n  Audit (portades que convé mirar):');
  for (const l of auditLines.slice(0, 25)) console.log(`    ${l}`);
  if (auditLines.length > 25) console.log(`    … +${auditLines.length - 25} línies més`);
}

if (failed.length) {
  console.log('\n  Han fallat:');
  for (const r of failed) console.log(`    ✗ ${r.title} (codi ${r.code})`);
  console.log('\n  ↑ revisa la sortida de dalt.');
  process.exit(1);
}

console.log('\n  Tot correcte.');
if (!NO_OPEN) console.log(`  Full de contacte: ${join(TOOLS, 'covers-review.html')}`);
process.exit(0);
