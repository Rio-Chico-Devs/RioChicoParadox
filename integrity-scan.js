#!/usr/bin/env node
/**
 * integrity-scan.js — controllo byte-per-byte dei sorgenti
 *
 * Difende contro attacchi a livello di ENCODING che un occhio umano (o una
 * review distratta) non vede, e che un'AI compromessa potrebbe usare per
 * nascondere una backdoor superando la code review:
 *
 *   • Trojan Source (CVE-2021-42574): caratteri Unicode bidirezionali che
 *     riordinano il codice → quello che leggi ≠ quello che esegue.
 *   • Homoglyph (CVE-2021-42694): lettere Cirilliche/Greche identiche alle
 *     Latine (es. 'а' U+0430 al posto di 'a') in identificatori o URL.
 *   • Caratteri zero-width / invisibili che nascondono payload.
 *   • Control chars C0/DEL anomali, BOM fuori posto, spazi Unicode ingannevoli.
 *
 * Ogni reperto è localizzato a riga:colonna + offset di byte + code point.
 * Esegui: node integrity-scan.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

const FINDINGS = [];
const add = (sev, file, line, col, byte, cp, name, note) =>
  FINDINGS.push({ sev, file, line, col, byte, cp, name, note });

/* ── Tabelle di code point ──────────────────────────────────── */
// Bidirectional controls — MAI legittimi nei nostri sorgenti (Trojan Source)
const BIDI = {
  0x202A:'LRE', 0x202B:'RLE', 0x202C:'PDF', 0x202D:'LRO', 0x202E:'RLO',
  0x2066:'LRI', 0x2067:'RLI', 0x2068:'FSI', 0x2069:'PDI',
  0x200E:'LRM', 0x200F:'RLM', 0x061C:'ALM',
};
// Zero-width / invisibili — nascondono dati o spezzano token
const ZEROWIDTH = {
  0x200B:'ZWSP', 0x200C:'ZWNJ', 0x200D:'ZWJ', 0x2060:'WORD-JOINER',
  0xFEFF:'ZWNBSP/BOM', 0x00AD:'SOFT-HYPHEN', 0x180E:'MONGOLIAN-VOWEL-SEP',
  0x2061:'FUNCTION-APP', 0x2062:'INVISIBLE-TIMES', 0x2063:'INVISIBLE-SEP',
  0x2064:'INVISIBLE-PLUS', 0xFFF9:'IAA', 0xFFFA:'IAS', 0xFFFB:'IAT',
};
// Spazi Unicode "ingannevoli" (non lo spazio ASCII 0x20)
const SNEAKY_SPACE = {
  0x00A0:'NBSP', 0x2000:'EN-QUAD', 0x2001:'EM-QUAD', 0x2002:'EN-SPACE',
  0x2003:'EM-SPACE', 0x2007:'FIGURE-SPACE', 0x2008:'PUNCT-SPACE',
  0x2009:'THIN-SPACE', 0x200A:'HAIR-SPACE', 0x202F:'NNBSP',
  0x205F:'MMSP', 0x3000:'IDEOGRAPHIC-SPACE',
};
// Lettere confondibili con le Latine (homoglyph). NB: Latin-1 accentato
// (à è ò ù — italiano) è ESCLUSO di proposito. Giapponese/Kanji è ESCLUSO
// (non confondibile con ASCII, non "mixed-script").
const isConfusableLetter = cp =>
  (cp >= 0x0400 && cp <= 0x052F) || // Cirillico
  (cp >= 0x0370 && cp <= 0x03FF) || // Greco
  (cp >= 0x1F00 && cp <= 0x1FFF) || // Greco esteso
  (cp >= 0x0530 && cp <= 0x058F) || // Armeno
  (cp >= 0x13A0 && cp <= 0x13FF);   // Cherokee
const isAsciiLetter = cp =>
  (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A);
const isWordChar = cp =>
  isAsciiLetter(cp) || (cp >= 0x30 && cp <= 0x39) || cp === 0x5F /* _ */ ||
  cp > 0x7F; // qualsiasi non-ASCII conta come parte di "parola" per il mixed-script

/* ── File da scansionare ───────────────────────────────────── */
const SCAN_EXT = /\.(js|css|html|svg|json|md|txt|xml)$/;
const SCAN_EXACT = new Set(['_headers', '_redirects', 'robots.txt', 'security.txt']);
const SKIP_FILE = /preview\.html$/; // generato, base64 inline → non è sorgente
const walk = dir => {
  let out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = path.join(dir, e.name).replace(/^\.\//, '');
    if (e.isDirectory()) out = out.concat(walk(rel));
    else if (!SKIP_FILE.test(rel) && (SCAN_EXT.test(e.name) || SCAN_EXACT.has(e.name)))
      out.push(rel);
  }
  return out;
};

const URL_RE = /(?:https?:)?\/\/[^\s"'`<>()]+/g;

/* ── Scansione ─────────────────────────────────────────────── */
const files = walk('.');
let scannedBytes = 0;

for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  scannedBytes += Buffer.byteLength(text);
  let line = 1, col = 0, idx = 0;

  // run di "parola" per mixed-script
  let wordHasAscii = false, wordHasConfusable = false, wordStart = null;

  const flushWord = () => {
    if (wordHasAscii && wordHasConfusable && wordStart)
      add('FAIL', file, wordStart.line, wordStart.col, wordStart.byte, null,
          'MIXED-SCRIPT', 'parola con lettere Latine + Cirillico/Greco (homoglyph)');
    wordHasAscii = wordHasConfusable = false; wordStart = null;
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    col++;
    if (cp === 0x0A) { // newline
      flushWord();
      line++; col = 0; idx += ch.length; continue;
    }
    const byteOff = Buffer.byteLength(text.slice(0, idx));

    // 1. Bidi controls (Trojan Source)
    if (BIDI[cp]) add('FAIL', file, line, col, byteOff, cp, `BIDI ${BIDI[cp]}`,
                      'controllo bidirezionale Unicode → Trojan Source');
    // 2. Zero-width / invisibili
    else if (ZEROWIDTH[cp]) {
      if (cp === 0xFEFF && idx === 0)
        add('WARN', file, line, col, byteOff, cp, 'BOM', 'byte-order-mark a inizio file');
      else
        add('FAIL', file, line, col, byteOff, cp, `ZERO-WIDTH ${ZEROWIDTH[cp]}`,
            'carattere invisibile → può nascondere payload');
    }
    // 3. Control chars C0 (tranne TAB/CR) e DEL
    else if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0D) || cp === 0x7F)
      add('FAIL', file, line, col, byteOff, cp, 'CONTROL', 'control char di controllo anomalo');
    // 4. Spazi Unicode ingannevoli (solo in codice/config, non in testo HTML/MD)
    else if (SNEAKY_SPACE[cp] && /\.(js|css|json)$/.test(file))
      add('WARN', file, line, col, byteOff, cp, `SPACE ${SNEAKY_SPACE[cp]}`,
          'spazio Unicode non-ASCII in codice → possibile escamotage');

    // mixed-script word tracking
    if (isWordChar(cp)) {
      if (wordStart === null) wordStart = { line, col, byte: byteOff };
      if (isAsciiLetter(cp)) wordHasAscii = true;
      if (isConfusableLetter(cp)) wordHasConfusable = true;
    } else {
      flushWord();
    }
    idx += ch.length;
  }
  flushWord();

  // 5. URL con caratteri non-ASCII (IDN homoglyph)
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    if (/[^\x00-\x7F]/.test(m[0])) {
      const pre = text.slice(0, m.index);
      const ln = (pre.match(/\n/g) || []).length + 1;
      add('FAIL', file, ln, 0, Buffer.byteLength(pre), null, 'IDN-HOMOGLYPH',
          `URL con carattere non-ASCII: ${m[0].slice(0, 60)}`);
    }
  }
}

/* ── Report ────────────────────────────────────────────────── */
const fails = FINDINGS.filter(f => f.sev === 'FAIL');
const warns = FINDINGS.filter(f => f.sev === 'WARN');

console.log('\n' + '═'.repeat(65));
console.log('  INTEGRITY SCAN (byte-level) — Rio Chico Studio');
console.log(`  File analizzati: ${files.length}  ·  Byte: ${scannedBytes.toLocaleString()}`);
console.log('═'.repeat(65));

if (!FINDINGS.length) {
  console.log('\n  ✅  Nessuna anomalia di encoding.');
  console.log('      Nessun carattere bidi (Trojan Source), zero-width,');
  console.log('      homoglyph mixed-script o URL IDN sospetto.');
} else {
  const fmt = f => `    ${f.sev === 'FAIL' ? '✗' : '⚠'}  ${f.file}  ` +
    `(riga ${f.line}:${f.col}, byte ${f.byte}` +
    `${f.cp !== null ? `, U+${f.cp.toString(16).toUpperCase().padStart(4,'0')}` : ''})  ` +
    `${f.name} — ${f.note}`;
  if (fails.length) { console.log(`\n❌  FAIL (${fails.length})`); fails.forEach(f => console.log(fmt(f))); }
  if (warns.length) { console.log(`\n⚠️   WARN (${warns.length})`); warns.forEach(f => console.log(fmt(f))); }
}

console.log('\n' + '═'.repeat(65));
console.log('  Nota: incrocia con `git diff` e con un editor che mostra i');
console.log('  caratteri Unicode (VS Code evidenzia bidi/invisibili di default).');
console.log('═'.repeat(65) + '\n');

process.exitCode = fails.length ? 1 : 0;
