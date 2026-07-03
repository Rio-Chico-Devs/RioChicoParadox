#!/usr/bin/env node
/**
 * integrity-scan.js - controllo byte-per-byte e codepoint-per-codepoint
 *
 * Difende dagli attacchi a livello di ENCODING/UNICODE che superano la review
 * umana e che un'AI compromessa potrebbe usare per nascondere una backdoor:
 *
 *   - Trojan Source (CVE-2021-42574): controlli Unicode bidirezionali che
 *     riordinano il codice -> cio' che leggi != cio' che esegue.
 *   - Homoglyph (CVE-2021-42694): lettere di altri script identiche alle Latine.
 *     Copertura COMPLETA: Cirillico, Greco, Armeno, Cherokee, Coptic,
 *     FULL-WIDTH (U+FF21..), MATEMATICI (U+1D400..), Letterlike (U+2100..).
 *   - Caratteri zero-width / invisibili che nascondono payload.
 *   - UTF-8 malformato (overlong / surrogati / continuazioni invalide).
 *   - Non-caratteri Unicode (U+FFFE/U+FFFF/U+FDD0..FDEF) e Private-Use.
 *   - Entita' XML/SVG (XXE, billion-laughs) e DOCTYPE.
 *
 * Il giapponese (Kana/Kanji) e gli accenti italiani (Latin-1) sono LEGITTIMI e
 * non vengono falsati: si fallisce solo sul MIXED-SCRIPT dentro un token o sui
 * controlli sopra. Ogni reperto e' localizzato a riga:colonna + offset di byte.
 *
 * Esegui: node integrity-scan.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

const FINDINGS = [];
const add = (sev, file, line, col, byte, cp, name, note) =>
  FINDINGS.push({ sev, file, line, col, byte, cp, name, note });
const inventory = {}; // block -> Set(codepoint)

/* ── Code point: bidi, zero-width ───────────────────────────── */
const BIDI = {
  0x202A:'LRE',0x202B:'RLE',0x202C:'PDF',0x202D:'LRO',0x202E:'RLO',
  0x2066:'LRI',0x2067:'RLI',0x2068:'FSI',0x2069:'PDI',
  0x200E:'LRM',0x200F:'RLM',0x061C:'ALM',
};
const ZEROWIDTH = {
  0x200B:'ZWSP',0x200C:'ZWNJ',0x200D:'ZWJ',0x2060:'WORD-JOINER',
  0xFEFF:'ZWNBSP/BOM',0x00AD:'SOFT-HYPHEN',0x180E:'MONGOLIAN-VOWEL-SEP',
  0x2061:'FUNCTION-APP',0x2062:'INVISIBLE-TIMES',0x2063:'INVISIBLE-SEP',
  0x2064:'INVISIBLE-PLUS',
};
const SNEAKY_SPACE = {
  0x00A0:'NBSP',0x2000:'EN-QUAD',0x2001:'EM-QUAD',0x2002:'EN-SPACE',
  0x2003:'EM-SPACE',0x2007:'FIGURE-SPACE',0x2008:'PUNCT-SPACE',
  0x2009:'THIN-SPACE',0x200A:'HAIR-SPACE',0x202F:'NNBSP',
  0x205F:'MMSP',0x3000:'IDEOGRAPHIC-SPACE',
};

/* ── Script confondibili con il Latino (homoglyph) ──────────── */
// NB: Latin-1 accentato (italiano) e Giapponese NON sono qui di proposito.
const CONFUSABLE_RANGES = [
  [0x0370,0x03FF,'Greco'],[0x1F00,0x1FFF,'Greco-Ext'],
  [0x0400,0x052F,'Cirillico'],[0x2DE0,0x2DFF,'Cirillico-Ext'],[0xA640,0xA69F,'Cirillico-Ext-B'],
  [0x0530,0x058F,'Armeno'],[0x13A0,0x13FF,'Cherokee'],[0x2C80,0x2CFF,'Coptic'],
  [0xFF21,0xFF3A,'Fullwidth-Lat-Maiusc'],[0xFF41,0xFF5A,'Fullwidth-Lat-Minusc'],
  [0x1D400,0x1D7CB,'Matematici'],[0x2100,0x214F,'Letterlike'],
];
const isConfusable = cp => CONFUSABLE_RANGES.some(([a,b]) => cp >= a && cp <= b);
const isAsciiLetter = cp => (cp>=0x41&&cp<=0x5A)||(cp>=0x61&&cp<=0x7A);
const isWordChar = cp => isAsciiLetter(cp)||(cp>=0x30&&cp<=0x39)||cp===0x5F||cp>0x7F;

/* ── Non-caratteri Unicode ──────────────────────────────────── */
const isNonChar = cp =>
  (cp >= 0xFDD0 && cp <= 0xFDEF) || (cp & 0xFFFE) === 0xFFFE; // ...FFFE/...FFFF di ogni piano
const isPUA = cp =>
  (cp>=0xE000&&cp<=0xF8FF)||(cp>=0xF0000&&cp<=0xFFFFD)||(cp>=0x100000&&cp<=0x10FFFD);

const blockName = cp => {
  for (const [a,b,n] of CONFUSABLE_RANGES) if (cp>=a&&cp<=b) return n+' (!)';
  if (cp>=0x2500&&cp<=0x257F) return 'Box-Drawing';
  if (cp>=0x2190&&cp<=0x21FF) return 'Arrows';
  if (cp>=0x2600&&cp<=0x27BF) return 'Symbols/Dingbats';
  if (cp>=0x2000&&cp<=0x206F) return 'General-Punct';
  if (cp>=0x00A0&&cp<=0x00FF) return 'Latin-1';
  if (cp>=0x3040&&cp<=0x30FF) return 'Kana-JP';
  if (cp>=0x4E00&&cp<=0x9FFF) return 'Kanji-JP';
  if (cp>=0x1F300&&cp<=0x1FAFF) return 'Emoji';
  if (cp>=0xFE00&&cp<=0xFE0F) return 'Var-Selector';
  return 'altro';
};

/* ── File da scansionare ────────────────────────────────────── */
const SCAN_EXT = /\.(js|css|html|svg|json|md|txt|xml)$/;
const SCAN_EXACT = new Set(['_headers','_redirects','robots.txt','security.txt']);
const walk = dir => {
  let out = [];
  for (const e of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})) {
    if (e.name==='.git'||e.name==='node_modules') continue;
    const rel = path.join(dir,e.name).replace(/^\.\//,'');
    if (e.isDirectory()) out = out.concat(walk(rel));
    else if (!/^preview(-[a-z]+)?\.html$/.test(rel) && (SCAN_EXT.test(e.name)||SCAN_EXACT.has(e.name)))
      out.push(rel);
  }
  return out;
};

const URL_RE = /(?:https?:)?\/\/[^\s"'`<>()]+/g;
const files = walk('.');
let scannedBytes = 0;

for (const file of files) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  scannedBytes += buf.length;

  // 0. Validita' UTF-8 stretta (overlong, surrogati, continuazioni invalide)
  try { new TextDecoder('utf-8',{fatal:true}).decode(buf); }
  catch { add('FAIL', file, 1, 0, 0, null, 'UTF-8-INVALIDO',
              'sequenza di byte UTF-8 malformata (overlong/surrogato/troncata)'); }

  const text = buf.toString('utf8');
  let line = 1, col = 0, byteOff = 0;
  let tok = []; // token corrente per mixed-script

  const flushTok = () => {
    const hasAscii = tok.some(t => isAsciiLetter(t.cp));
    const conf = tok.filter(t => isConfusable(t.cp));
    if (hasAscii && conf.length) {
      const f = conf[0];
      add('FAIL', file, f.line, f.col, f.byte, f.cp, 'MIXED-SCRIPT',
          'token con lettere Latine + script confondibile (homoglyph)');
    } else if (conf.length) {
      for (const f of conf) // confusable isolato: da confermare a mano
        add('WARN', file, f.line, f.col, f.byte, f.cp, 'CONFUSABLE',
            `lettera ${blockName(f.cp)} usata come glifo - confermare intenzionale`);
    }
    tok = [];
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    col++;
    if (cp === 0x0A) { flushTok(); line++; col = 0; byteOff += 1; continue; }

    if (cp > 0x7F) { const b = blockName(cp); (inventory[b] ??= new Set()).add(cp); }

    if (BIDI[cp])
      add('FAIL',file,line,col,byteOff,cp,`BIDI ${BIDI[cp]}`,'controllo bidirezionale -> Trojan Source');
    else if (ZEROWIDTH[cp]) {
      if (cp===0xFEFF && byteOff<=3) add('WARN',file,line,col,byteOff,cp,'BOM','byte-order-mark a inizio file');
      else add('FAIL',file,line,col,byteOff,cp,`ZERO-WIDTH ${ZEROWIDTH[cp]}`,'carattere invisibile -> nasconde payload');
    }
    else if ((cp<0x20 && cp!==0x09 && cp!==0x0D) || cp===0x7F)
      add('FAIL',file,line,col,byteOff,cp,'CONTROL','control char anomalo');
    else if (isNonChar(cp))
      add('FAIL',file,line,col,byteOff,cp,'NON-CHARACTER','codepoint non valido per interscambio');
    else if (isPUA(cp))
      add('WARN',file,line,col,byteOff,cp,'PRIVATE-USE','codepoint Private-Use (puo nascondere/spoofare)');
    else if (SNEAKY_SPACE[cp] && /\.(js|css|json)$/.test(file))
      add('WARN',file,line,col,byteOff,cp,`SPACE ${SNEAKY_SPACE[cp]}`,'spazio Unicode non-ASCII in codice');

    if (isWordChar(cp)) tok.push({cp,line,col,byte:byteOff});
    else flushTok();

    byteOff += Buffer.byteLength(ch);
  }
  flushTok();

  // URL con caratteri non-ASCII (IDN homoglyph)
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    if (/[^\x00-\x7F]/.test(m[0])) {
      const pre = text.slice(0,m.index);
      add('FAIL', file, (pre.match(/\n/g)||[]).length+1, 0, Buffer.byteLength(pre),
          null, 'IDN-HOMOGLYPH', `URL con carattere non-ASCII: ${m[0].slice(0,60)}`);
    }
  }

  // Entita' / DOCTYPE in XML/SVG (XXE, billion-laughs)
  if (/\.(svg|xml)$/.test(file)) {
    if (/<!ENTITY/i.test(text))
      add('FAIL',file,1,0,0,null,'XML-ENTITY','<!ENTITY> -> XXE / billion-laughs');
    else if (/<!DOCTYPE/i.test(text))
      add('WARN',file,1,0,0,null,'XML-DOCTYPE','<!DOCTYPE> in SVG/XML (preferibile rimuoverlo)');
  }
}

/* ── Report ─────────────────────────────────────────────────── */
const fails = FINDINGS.filter(f=>f.sev==='FAIL');
const warns = FINDINGS.filter(f=>f.sev==='WARN');
const fmt = f => `    ${f.sev==='FAIL'?'X':'!'}  ${f.file}  (riga ${f.line}:${f.col}, byte ${f.byte}`+
  `${f.cp!==null?`, U+${f.cp.toString(16).toUpperCase().padStart(4,'0')}`:''})  ${f.name} - ${f.note}`;

console.log('\n'+'='.repeat(66));
console.log('  INTEGRITY SCAN (byte + codepoint) - Rio Chico Studio');
console.log(`  File: ${files.length}  -  Byte: ${scannedBytes.toLocaleString()}`);
console.log('='.repeat(66));

console.log('\n  Inventario non-ASCII (script presenti nei sorgenti):');
for (const [b,s] of Object.entries(inventory).sort((a,c)=>c[1].size-a[1].size))
  console.log(`    ${b.padEnd(22)} ${String(s.size).padStart(3)} codepoint`);

if (fails.length) { console.log(`\nFAIL (${fails.length})`); fails.forEach(f=>console.log(fmt(f))); }
if (warns.length) { console.log(`\nWARN (${warns.length})`); warns.forEach(f=>console.log(fmt(f))); }
if (!fails.length && !warns.length)
  console.log('\n  OK  Nessuna anomalia di encoding/Unicode.');
else if (!fails.length)
  console.log('\n  OK  Nessun FAIL. I WARN sopra sono da confermare a vista, non bug.');

console.log('\n'+'='.repeat(66));
console.log('  Incrocia con `git diff` e un editor che mostra i caratteri Unicode.');
console.log('='.repeat(66)+'\n');
process.exitCode = fails.length ? 1 : 0;
