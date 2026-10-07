// Baixa lucide (UMD) a assets/vendor/ perquè el lloc no depengi d'un CDN
// extern en temps d'execució. Mateix paquet i mateixa versió que demanava
// `https://unpkg.com/lucide@latest`, pero guardat al repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(import.meta.dirname, '..', 'assets', 'vendor');
const OUT = join(OUT_DIR, 'lucide.min.js');

const res = await fetch('https://unpkg.com/lucide@latest', {
  redirect: 'follow',
  headers: { 'user-agent': 'Mozilla/5.0' },
});
const text = await res.text();
if (!res.ok || !/lucide/i.test(text.slice(0, 5000))) {
  console.error(`descàrrega dolenta: ${res.status} ${res.url}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, text, 'utf8');
console.log(`${res.url}\n  -> assets/vendor/lucide.min.js (${text.length} bytes)`);
