#!/usr/bin/env node
/**
 * setup-fonts.js — scarica i font da Google Fonts e genera css/fonts.css
 *
 * Eseguire UNA VOLTA sul proprio computer (non in CI, non in produzione):
 *   node scripts/setup-fonts.js
 *
 * Poi committare:
 *   git add assets/fonts/ css/fonts.css
 *   git commit -m "feat: self-host fonts"
 *
 * Richiede: Node.js 18+ (fetch nativo) e accesso a fonts.googleapis.com.
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ROOT      = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');
const CSS_OUT   = path.join(ROOT, 'css', 'fonts.css');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* Solo i katakana effettivamente presenti nel sito (deduplicate).
   Google Fonts risponde con un subset minuscolo invece dell'intero font CJK. */
const KATAKANA_CHARS = [...new Set('プロタゴニストラテジアン')].join('');

const REQUESTS = [
  {
    url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
    tag: 'bebas'
  },
  {
    url: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;1,300&display=swap',
    tag: 'inter'
  },
  {
    url: `https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap&text=${encodeURIComponent(KATAKANA_CHARS)}`,
    tag: 'noto'
  }
];

/* ── helpers ──────────────────────────────────────────────────────── */

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return get(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function parseFaces(css) {
  const faces = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    const b    = block[1];
    const prop = (k) => { const m = b.match(new RegExp(k + '\\s*:\\s*([^;]+)')); return m ? m[1].trim() : null; };
    const src  = b.match(/url\(["']?([^"')]+\.woff2)["']?\)/);
    if (!src) continue;
    faces.push({
      family:       (prop('font-family') || '').replace(/['"]/g, ''),
      style:        prop('font-style')  || 'normal',
      weight:       prop('font-weight') || '400',
      unicodeRange: prop('unicode-range'),
      woff2:        src[1]
    });
  }
  return faces;
}

function filename(face, idx) {
  const fam = face.family.toLowerCase().replace(/\s+/g, '-');
  const suf = face.style === 'italic' ? 'i' : '';
  return `${fam}-${face.weight}${suf}-${String(idx).padStart(2,'0')}.woff2`;
}

function faceCSS(face, file) {
  const ur = face.unicodeRange ? `\n  unicode-range: ${face.unicodeRange};` : '';
  return [
    '@font-face {',
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    `  font-display: swap;`,
    `  src: url('../assets/fonts/${file}') format('woff2');${ur}`,
    '}'
  ].join('\n');
}

/* ── main ─────────────────────────────────────────────────────────── */

async function main() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  const allFaces = [];

  for (const { url, tag } of REQUESTS) {
    process.stdout.write(`Fetching CSS [${tag}]... `);
    const css = (await get(url)).toString('utf8');
    const faces = parseFaces(css);
    console.log(`${faces.length} face(s)`);
    allFaces.push(...faces);
  }

  /* Deduplicate by family+style+weight (keep first occurrence = smallest/latin subset) */
  const seen = new Set();
  const unique = allFaces.filter(f => {
    const k = `${f.family}|${f.style}|${f.weight}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`\nDownloading ${unique.length} file(s) to assets/fonts/ ...`);

  const cssParts = [
    '/* =================================================================',
    '   FONT SELF-HOSTED — generato da scripts/setup-fonts.js',
    '   Non modificare manualmente. Rieseguire lo script per aggiornare.',
    '   ================================================================= */',
    ''
  ];

  for (const [i, face] of unique.entries()) {
    const file = filename(face, i + 1);
    process.stdout.write(`  ${file} ... `);
    const buf = await get(face.woff2);
    fs.writeFileSync(path.join(FONTS_DIR, file), buf);
    console.log(`${(buf.length / 1024).toFixed(1)} KB`);
    cssParts.push(faceCSS(face, file), '');
  }

  fs.writeFileSync(CSS_OUT, cssParts.join('\n'));

  console.log(`\nDone.`);
  console.log(`  ${unique.length} .woff2 in assets/fonts/`);
  console.log(`  css/fonts.css aggiornato`);
  console.log(`\nProssimo passo:`);
  console.log(`  git add assets/fonts/ css/fonts.css`);
  console.log(`  git commit -m "feat: self-host fonts (GDPR + zero external requests)"`);
}

main().catch(e => { console.error('\nERRORE:', e.message); process.exit(1); });
