#!/usr/bin/env node
/**
 * setup-fonts.js — scarica i font da Google Fonts e genera css/fonts.css
 *
 * Eseguire UNA VOLTA sul proprio computer (non in CI, non in produzione):
 *   node scripts/setup-fonts.js
 *
 * Poi committare:
 *   git add assets/fonts/ css/fonts.css
 *   git commit -m "feat: add self-hosted font files"
 *
 * Richiede: Node.js 16+ (solo moduli built-in, zero npm install)
 * e accesso a fonts.googleapis.com / fonts.gstatic.com.
 *
 * Cosa fa:
 *   - Scarica Anton, Instrument Sans (400/500/600 + italic 400),
 *     IBM Plex Mono (400/500/600), Noto Sans JP
 *   - Per i font latini tiene SOLO i subset latin + latin-ext
 *     (accenti italiani inclusi, scarta cyrillic/greek/vietnamese)
 *   - Per Noto Sans JP scarica solo i katakana effettivamente usati
 *     nel sito (legge index.html) -> file minuscolo invece dei MB del CJK
 *   - Rigenera css/fonts.css con i nomi file reali e gli unicode-range
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ROOT      = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');
const CSS_OUT   = path.join(ROOT, 'css', 'fonts.css');
const INDEX     = path.join(ROOT, 'index.html');

/* User-Agent moderno: Google serve woff2 solo a browser recenti.
   Senza questo header risponde con formati legacy (ttf) o 403. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* Subset da tenere per i font latini. Tutto il resto (cyrillic, greek,
   vietnamese...) viene scartato: non serve a un sito in italiano. */
const KEEP = /^(latin|latin-ext|\[\d+\]|unlabeled)$/;

/* ── Katakana usati nel sito ──────────────────────────────────────────
   Letti da index.html (range U+30A0-30FF). Cosi se cambi i nomi dei
   personaggi, il subset si aggiorna da solo. Fallback: set hardcoded. */
function katakanaFromSite() {
  let text = '';
  try { text = fs.readFileSync(INDEX, 'utf8'); } catch (_) {}
  const chars = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x30A0 && cp <= 0x30FF) chars.add(ch);
  }
  if (chars.size === 0) return [...new Set('プロタゴニストラテジアン')].join('');
  return [...chars].join('');
}

const FONTS = [
  { tag: 'anton',    url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  { tag: 'instrument', url: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap' },
  { tag: 'plexmono', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap' },
  { tag: 'noto',     url: () => 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap&text=' +
                                 encodeURIComponent(katakanaFromSite()) }
];

/* ── helpers ──────────────────────────────────────────────────────── */

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode))
        return get(new URL(res.headers.location, url).href).then(resolve).catch(reject);
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode} su ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Estrae ogni @font-face con la sua etichetta-subset.
// Google di solito mette un commento con il nome del subset prima di ogni
// blocco (/* latin */), ma NON per le richieste ristrette con &text=
// (es. il nostro katakana JP): li' il blocco non ha commento, e senza
// questo fallback veniva scartato in silenzio -> zero file scaricati,
// nessun errore visibile. 'unlabeled' viene sempre tenuto (vedi KEEP).
function parseFaces(css) {
  const faces = [];
  const re = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const label = m[1] ? m[1].trim() : 'unlabeled';
    const body  = m[2];
    const prop  = (k) => { const x = body.match(new RegExp(k + '\\s*:\\s*([^;]+)')); return x ? x[1].trim() : null; };
    const src   = body.match(/url\(["']?([^"')]+\.woff2)["']?\)/);
    if (!src) continue;
    faces.push({
      label,
      family:       (prop('font-family') || '').replace(/['"]/g, ''),
      style:        prop('font-style')  || 'normal',
      weight:       prop('font-weight') || '400',
      unicodeRange: prop('unicode-range'),
      woff2:        src[1]
    });
  }
  return faces;
}

function slug(s) { return s.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'x'; }

function filename(face) {
  const fam = slug(face.family);
  const ital = face.style === 'italic' ? 'i' : '';
  return `${fam}-${face.weight}${ital}-${slug(face.label)}.woff2`;
}

function faceCSS(face, file) {
  const ur = face.unicodeRange ? `\n  unicode-range: ${face.unicodeRange};` : '';
  return [
    `@font-face {`,
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    `  font-display: swap;`,
    `  src: url('../assets/fonts/${file}') format('woff2');${ur}`,
    `}`
  ].join('\n');
}

/* ── main ─────────────────────────────────────────────────────────── */

async function main() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  const kept = [];

  for (const f of FONTS) {
    const url = typeof f.url === 'function' ? f.url() : f.url;
    process.stdout.write(`Fetching CSS [${f.tag}] ... `);
    const css   = (await get(url)).toString('utf8');
    const faces = parseFaces(css).filter(x => KEEP.test(x.label));
    console.log(`${faces.length} face(s) tenute`);
    kept.push(...faces);
  }

  if (kept.length === 0)
    throw new Error('Nessun @font-face estratto. Google ha cambiato formato o la rete blocca la richiesta.');

  console.log(`\nScarico ${kept.length} file in assets/fonts/ ...`);

  const out = [
    '/* =================================================================',
    '   FONT SELF-HOSTED — generato da scripts/setup-fonts.js',
    '   NON modificare a mano: rieseguire lo script per rigenerare.',
    '   ================================================================= */',
    ''
  ];

  let total = 0;
  for (const face of kept) {
    const file = filename(face);
    process.stdout.write(`  ${file} ... `);
    const buf = await get(face.woff2);
    fs.writeFileSync(path.join(FONTS_DIR, file), buf);
    total += buf.length;
    console.log(`${(buf.length / 1024).toFixed(1)} KB`);
    out.push(faceCSS(face, file), '');
  }

  fs.writeFileSync(CSS_OUT, out.join('\n'));

  console.log(`\nFatto.`);
  console.log(`  ${kept.length} file .woff2 (${(total / 1024).toFixed(0)} KB totali) in assets/fonts/`);
  console.log(`  css/fonts.css rigenerato`);
  console.log(`\nProssimo passo:`);
  console.log(`  git add assets/fonts/ css/fonts.css`);
  console.log(`  git commit -m "feat: add self-hosted font files"`);
  console.log(`  git push`);
}

main().catch(e => { console.error('\nERRORE:', e.message); process.exit(1); });
