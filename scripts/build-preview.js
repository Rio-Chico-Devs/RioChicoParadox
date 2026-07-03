#!/usr/bin/env node
/**
 * scripts/build-preview.js — genera una preview autonoma per pagina
 * Inlina tutti i CSS, il JS e le immagini in un unico file HTML,
 * cosi' si puo' aprire (o condividere) senza server e senza
 * dipendere da percorsi relativi.
 * Zero dipendenze npm — solo Node built-in (fs, path).
 * Esegui: node scripts/build-preview.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Ogni pagina reale del sito -> nome del file di preview generato.
// index.html resta preview.html per compatibilita' con l'uso esistente.
const PAGES = [
  ['index.html',      'preview.html'],
  ['gallery.html',    'preview-gallery.html'],
  ['characters.html', 'preview-characters.html'],
  ['profile.html',    'preview-profile.html'],
  ['contact.html',    'preview-contact.html'],
];

// ── converte un path (relativo alla ROOT del repo) in data: URI ──
function toDataURI(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
  }[ext];
  if (!mime) return null;
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildPreview(srcName, outName) {
  const srcPath = path.join(ROOT, srcName);
  if (!fs.existsSync(srcPath)) {
    console.log(`Skip ${srcName}: non trovato`);
    return;
  }
  const src = fs.readFileSync(srcPath, 'utf8');

  let imagesInlined = 0;
  let cssFilesInlined = 0;

  // ── 1. CSS: raccogli ogni <link rel="stylesheet">, inlina anche
  //    gli url(...) interni (SVG/PNG referenziati dal CSS stesso) ──
  const linkRe = /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  let cssOut = '';
  let match;
  while ((match = linkRe.exec(src)) !== null) {
    const href = match[1];
    if (href.startsWith('http')) continue;
    const filePath = path.join(ROOT, href);
    if (!fs.existsSync(filePath)) continue;

    let css = fs.readFileSync(filePath, 'utf8');
    css = css.replace(/url\(\s*(['"]?)([^'")]+\.(?:svg|png|jpe?g|webp|gif))\1\s*\)/gi, (m, q, p) => {
      const uri = toDataURI(path.join(path.dirname(href), p));
      if (uri) { imagesInlined++; return `url(${uri})`; }
      return m;
    });
    cssOut += `\n/* ---- ${href} ---- */\n${css}\n`;
    cssFilesInlined++;
  }

  linkRe.lastIndex = 0;
  let out = src.replace(linkRe, '').replace(
    /<\/head>/i,
    `<style>${cssOut}\n</style>\n</head>`
  );

  // ── 2. JS: inlina lo <script src="..."> al posto del riferimento ──
  const scriptRe = /<script\s+src=["']([^"']+)["'][^>]*><\/script>/i;
  const scriptMatch = out.match(scriptRe);
  let jsInlined = 0;
  if (scriptMatch) {
    const jsPath = path.join(ROOT, scriptMatch[1]);
    if (fs.existsSync(jsPath)) {
      const js = fs.readFileSync(jsPath, 'utf8');
      out = out.replace(scriptRe, `<script>\n${js}\n</script>`);
      jsInlined = 1;
    }
  }

  // ── 3. <img src="..."> nell'HTML: converti in data URI ────────────
  out = out.replace(/(<img\s[^>]*\bsrc=["'])([^"']+)(["'])/gi, (m, pre, p, post) => {
    if (p.startsWith('http') || p.startsWith('data:')) return m;
    const uri = toDataURI(p);
    if (uri) { imagesInlined++; return pre + uri + post; }
    return m;
  });

  fs.writeFileSync(path.join(ROOT, outName), out, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
  console.log(`${outName} = ${kb} KB  (CSS: ${cssFilesInlined}, JS: ${jsInlined}, immagini: ${imagesInlined})`);
}

for (const [srcName, outName] of PAGES) {
  buildPreview(srcName, outName);
}
console.log('Done.');
