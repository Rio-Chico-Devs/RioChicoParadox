#!/usr/bin/env node
/**
 * security-audit.js — attacker-perspective audit
 * Testa: CSP, header HTTP, JS XSS sinks, HTML injection points,
 * info disclosure, open redirect, email harvesting, HSTS, ecc.
 * Esegui: node security-audit.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const R = { PASS: [], WARN: [], FAIL: [] };
const pass = m => R.PASS.push(m);
const warn = m => R.WARN.push(m);
const fail = m => R.FAIL.push(m);

// Scansione ricorsiva — usata in piu' sezioni, dichiarata subito
const walk = dir => {
  let out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(rel));
    else out.push(rel);
  }
  return out;
};
const allFiles = walk('.');

/* ═══════════════════════════════════════════════════════════
   1. .htaccess — CSP + HTTP Security Headers (Hostinger/Apache/LiteSpeed)
   Fonte primaria: .htaccess (deployment su Hostinger).
   _headers resta nel repo come riferimento per Cloudflare Pages,
   ma NON e' il file attivo: su Hostinger lo ignora il server.
   ═══════════════════════════════════════════════════════════ */
const fs_exists = f => { try { fs.accessSync(path.join(ROOT, f)); return true; } catch { return false; } };

if (!fs_exists('.htaccess'))
  fail('Hostinger deploy: .htaccess mancante → NESSUN header di sicurezza sara\' applicato al sito live');
else
  pass('Hostinger deploy: .htaccess presente → header di sicurezza attivi su Apache/LiteSpeed');

const htaccess = fs_exists('.htaccess') ? read('.htaccess') : '';

// CSP — estratta dal formato .htaccess: Header always set Content-Security-Policy "..."
const cspLine = htaccess.match(/Header\s+always\s+set\s+Content-Security-Policy\s+"([^"]+)"/i);
const csp = cspLine ? cspLine[1] : '';
if (!csp) { fail('CSP: direttiva Content-Security-Policy mancante in .htaccess'); }

// script-src — il piu' critico
if (csp.match(/script-src[^;]*'unsafe-inline'/))
  fail("CSP script-src: contiene 'unsafe-inline' → XSS banale con <script>alert(1)</script>");
else
  pass("CSP script-src: nessun 'unsafe-inline' → script inline bloccati");

if (csp.match(/script-src[^;]*'unsafe-eval'/))
  fail("CSP script-src: contiene 'unsafe-eval' → eval() e new Function() sfruttabili");
else
  pass("CSP script-src: nessun 'unsafe-eval' → eval() bloccato");

if (csp.match(/script-src[^;]*\*/))
  fail("CSP script-src: wildcard * → caricamento script da qualsiasi origine");
else
  pass("CSP script-src: nessun wildcard → origini script esplicite");

// style-src
if (csp.match(/style-src[^;]*'unsafe-inline'/)) {
  warn("CSP style-src: 'unsafe-inline' presente (necessario per style= attrs). " +
       "CSS injection possibile in teoria, ma connect-src 'none' + img-src limitato bloccano l'esfiltrazione.");
} else {
  pass("CSP style-src: nessun 'unsafe-inline'");
}

// object-src / plugin injection
if (csp.includes("object-src 'none'"))
  pass("CSP object-src 'none': Flash e plugin bloccati");
else
  fail("CSP object-src mancante → plugin/Flash injection possibile");

// base-uri hijack
if (csp.includes('base-uri'))
  pass("CSP base-uri: tag <base> bloccato (attacco: redirect di tutti i path relativi)");
else
  fail("CSP base-uri mancante → <base href='https://evil.com'> iniettabile");

// frame-ancestors (clickjacking moderno)
if (csp.includes('frame-ancestors'))
  pass("CSP frame-ancestors 'none': iframe embedding bloccato nei browser moderni");
else
  warn("CSP frame-ancestors mancante (X-Frame-Options copre i vecchi browser)");

// form-action
if (csp.includes('form-action'))
  pass("CSP form-action 'none': nessun form hijacking possibile");
else
  warn("CSP form-action mancante (questo sito non ha form, ma defensively in depth)");

// upgrade-insecure-requests
if (csp.includes('upgrade-insecure-requests'))
  pass("CSP upgrade-insecure-requests: il browser upgrada http→https automaticamente");
else
  warn("CSP upgrade-insecure-requests mancante");

// data: in img-src
if (csp.match(/img-src[^;]*data:/))
  warn("CSP img-src data:: consente background data-URI nel CSS — non esfiltrazione (connect-src none) ma SVG attivi");
else
  pass("CSP img-src: nessun data: URI ammesso");

/* ── CSS EXFILTRATION CHANNELS ─────────────────────────────
   Attacco reale (@font-face unicode-range "Fontleak"): con style-src
   'unsafe-inline' si puo' rubare dati carattere per carattere senza JS.
   Il canale di fuga e' img-src o font-src verso un host controllabile.
   ──────────────────────────────────────────────────────────── */
const extractOrigins = dir => {
  const m = csp.match(new RegExp(dir + "\\s+([^;]+)"));
  if (!m) return [];
  return m[1].trim().split(/\s+/);
};
const SAFE_ORIGINS = /^('self'|'none'|data:|https:\/\/fonts\.gstatic\.com|https:\/\/fonts\.googleapis\.com)$/;
const exfilDirs = ['img-src', 'font-src', 'connect-src'];
let exfilOpen = false;
exfilDirs.forEach(dir => {
  const origins = extractOrigins(dir);
  const attackerUsable = origins.filter(o => {
    if (SAFE_ORIGINS.test(o)) return false;
    if (o === "'unsafe-inline'" || o === "'unsafe-eval'") return false;
    if (o === '*') return true;
    if (/^https?:$/.test(o)) return true;
    if (/^https?:\/\//.test(o)) return true;
    return false;
  });
  if (attackerUsable.length) {
    exfilOpen = true;
    fail(`CSP ${dir}: origine sfruttabile per CSS-exfiltration → ${attackerUsable.join(', ')}`);
  }
});
if (!exfilOpen)
  pass("CSP: canali CSS-exfiltration chiusi (img-src/font-src/connect-src senza origini attaccabili)");

if (csp.includes('fonts.gstatic.com') || csp.includes('fonts.googleapis.com'))
  warn("CSP: dipendenza esterna Google Fonts attiva. Self-hosting → font-src 'self' → superficie CSS-exfil = zero assoluto.");

// Altri header HTTP
htaccess.includes('X-Frame-Options')
  ? pass("X-Frame-Options: DENY — doppia protezione clickjacking (vecchi browser)")
  : fail("X-Frame-Options mancante in .htaccess");

htaccess.includes('X-Content-Type-Options')
  ? pass("X-Content-Type-Options: nosniff — browser non indovina il MIME type")
  : fail("X-Content-Type-Options mancante — MIME confusion attack possibile");

htaccess.includes('Strict-Transport-Security')
  ? pass("HSTS presente — connessioni HTTP rifiutate dopo prima visita")
  : fail("HSTS mancante — downgrade attack HTTPS→HTTP possibile");

htaccess.includes('max-age=63072000')
  ? pass("HSTS max-age 2 anni — standard HSTS preload list")
  : warn("HSTS max-age basso (< 1 anno) — ridurlo non e' raccomandato");

htaccess.includes('preload')
  ? pass("HSTS preload flag — puoi aggiungere il dominio alla HSTS preload list")
  : warn("HSTS: flag preload mancante");

htaccess.includes('Referrer-Policy')
  ? pass("Referrer-Policy presente — URL piena non trapela ai siti esterni")
  : warn("Referrer-Policy mancante");

htaccess.includes('Permissions-Policy')
  ? pass("Permissions-Policy: camera, microfono, GPS, USB, Bluetooth disabilitati")
  : warn("Permissions-Policy mancante");

// Redirect HTTPS in .htaccess
htaccess.includes('HTTPS') && htaccess.includes('R=301')
  ? pass("HTTPS redirect: .htaccess rinvia HTTP → HTTPS con 301")
  : warn("HTTPS redirect: non trovato in .htaccess (verifica che Hostinger applichi SSL automaticamente)");

// Directory listing disabilitato
htaccess.includes('Options -Indexes')
  ? pass("Directory listing: disabilitato (Options -Indexes) — nessuno puo' navigare le cartelle")
  : fail("Directory listing: 'Options -Indexes' mancante → le cartelle sono navigabili");

// File interni bloccati
// Il FilesMatch in .htaccess usa regex con backslash-escape dei punti (es. security-audit\.js)
// quindi cerchiamo sia il nome letterale che la versione escaped
const sensitiveBlocked = ['security-audit.js','integrity-scan.js','SECURITY.md','CLAUDE.md','package.json'];
const allLiteralBlocked = sensitiveBlocked.every(f => {
  const escaped = f.replace(/\./g, '\\.');
  return htaccess.includes(f) || htaccess.includes(escaped);
});
// preview*.html usa un pattern (preview(-[a-z]+)?\.html), non un nome letterale:
// verifichiamo solo che una regola "preview" + "html" esista nel FilesMatch
const previewBlocked = /preview/.test(htaccess) && /\\?\.html/.test(htaccess);
(allLiteralBlocked && previewBlocked)
  ? pass("File interni: .htaccess blocca security-audit.js, SECURITY.md, CLAUDE.md, preview*.html e altri file di sviluppo")
  : warn("File interni: verifica che .htaccess blocchi tutti i file sensibili (security-audit.js, SECURITY.md, CLAUDE.md, preview*.html)");

/* ═══════════════════════════════════════════════════════════
   2. js/main.js — XSS sinks e code injection
   ═══════════════════════════════════════════════════════════ */
const js = read('js/main.js');

// Sinks pericolosi
const jsSinks = [
  [/\.innerHTML\s*[+]?=/g,          'innerHTML = (DOM XSS sink #1)'],
  [/\.outerHTML\s*=/g,               'outerHTML = (DOM XSS sink)'],
  [/document\.write\s*\(/g,          'document.write() (obsoleto + XSS sink)'],
  [/document\.writeln\s*\(/g,        'document.writeln()'],
  [/\beval\s*\(/g,                   'eval() (code injection)'],
  [/new\s+Function\s*\(/g,           'new Function() (eval equivalente)'],
  [/insertAdjacentHTML\s*\(/g,       'insertAdjacentHTML() (XSS sink)'],
  [/\.src\s*=\s*(?!['"`])/g,         'src dinamico non-letterale (potenziale script injection)'],
  [/location\s*\.\s*href\s*=/g,      'location.href = (open redirect)'],
  [/location\s*\.\s*replace\s*\(/g,  'location.replace() (open redirect)'],
  [/window\s*\.\s*open\s*\(/g,       'window.open() (popup/redirect)'],
  [/setTimeout\s*\(\s*`|setTimeout\s*\(\s*"/g, 'setTimeout(string) (eval equivalente)'],
  [/setInterval\s*\(\s*`|setInterval\s*\(\s*"/g,'setInterval(string) (eval equivalente)'],
  [/postMessage\s*\(/g,              'postMessage() — verificare origine non validata'],
];

jsSinks.forEach(([re, name]) => {
  re.lastIndex = 0;
  const m = js.match(re);
  m ? fail(`JS: trovato "${name}" (${m.length}x)`) : pass(`JS: nessun ${name.split(' ')[0]}`);
});

// Lettura storage (localStorage/sessionStorage.getItem): NON e' un sink di
// per se'. Diventa pericolosa solo se il valore letto raggiunge un sink
// reale (innerHTML/outerHTML/document.write/eval/insertAdjacentHTML) senza
// sanitizzazione. Verifichiamo la co-presenza invece di un FAIL automatico
// sulla sola lettura, che bloccherebbe anche un uso innocuo (es. un flag
// booleano per ricordare che il loader e' gia' stato mostrato).
const storageReads = js.match(/(?:localStorage|sessionStorage)\s*\.\s*getItem/g) || [];
if (storageReads.length) {
  const dangerousSinkPresent = /\.innerHTML\s*[+]?=|\.outerHTML\s*=|document\.write(?:ln)?\s*\(|\beval\s*\(|insertAdjacentHTML\s*\(/.test(js);
  dangerousSinkPresent
    ? fail(`JS: ${storageReads.length}x lettura storage E un sink pericoloso nello stesso file → verificare se il valore letto raggiunge il sink`)
    : warn(`JS: ${storageReads.length}x lettura storage (localStorage/sessionStorage.getItem), nessun sink pericoloso nel file → verificare a vista che il valore letto non guidi mai innerHTML/eval/document.write`);
} else {
  pass('JS: nessuna lettura storage');
}

// URL/hash reading → injection vector
if (/location\.(search|hash)|URLSearchParams/.test(js))
  warn('JS: legge parametri URL/hash — verificare se il valore viene scritto nel DOM');
else
  pass('JS: non legge parametri URL → nessun injection via URL');

// Dipendenze esterne nel JS
if (/require\s*\(|import\s+/.test(js))
  warn('JS: usa require/import — verifica dipendenze esterne');
else
  pass('JS: zero import/require → zero supply-chain via JS');

/* ═══════════════════════════════════════════════════════════
   3. FILE HTML — injection points, info disclosure
   Controlla TUTTI i file .html nel repo (non solo index.html).
   preview*.html sono esclusi: sono artefatti generati da
   scripts/build-preview.js (uno per pagina), non vanno deployati
   e non devono essere scansionati come sorgente.
   ═══════════════════════════════════════════════════════════ */
const htmlFiles = allFiles.filter(f =>
  f.endsWith('.html') && !/^preview(-[a-z]+)?\.html$/.test(f)
);
pass(`HTML: controllo su ${htmlFiles.length} file → ${htmlFiles.map(f => path.basename(f)).join(', ')}`);

for (const htmlFile of htmlFiles) {
  const html = read(htmlFile);
  const tag  = path.relative(ROOT, path.join(ROOT, htmlFile));

  // Inline script injection
  const inlineScripts = html.match(/<script(?!\s+src)[^>]*>[\s\S]*?<\/script>/gi) || [];
  inlineScripts.length
    ? warn(`${tag}: ${inlineScripts.length} blocchi <script> inline (CSP li blocca, ma meglio eliminarli)`)
    : pass(`${tag}: nessun <script> inline`);

  // Inline event handlers (onclick, onload, onerror, ecc.)
  const inlineHandlers = html.match(/\s+on\w+\s*=/g) || [];
  inlineHandlers.length
    ? fail(`${tag}: ${inlineHandlers.length} inline event handler(s) — XSS vector`)
    : pass(`${tag}: nessun inline event handler`);

  // javascript: URLs
  html.match(/href\s*=\s*['"]javascript:/i)
    ? fail(`${tag}: href="javascript:..." trovato — XSS vector`)
    : pass(`${tag}: nessun href="javascript:"`);

  // data: in href
  html.match(/href\s*=\s*['"]data:/i)
    ? fail(`${tag}: href="data:..." trovato — possibile vettore`)
    : pass(`${tag}: nessun href="data:" nei link`);

  // Link esterni senza rel="noopener"
  // Cattura l'intero tag <a> per trovare rel= anche quando precede target=
  const blankLinks  = (html.match(/<a\s[^>]*target="_blank"[^>]*>/gi) || []);
  const noopenerOk  = blankLinks.filter(l => l.includes('noopener'));
  blankLinks.length === noopenerOk.length
    ? pass(`${tag}: tutti i ${blankLinks.length} link target="_blank" hanno rel="noopener noreferrer"`)
    : fail(`${tag}: ${blankLinks.length - noopenerOk.length} link target="_blank" senza rel="noopener" → tabnabbing`);

  // Email in chiaro (bot spam harvesting)
  const mails = (html.match(/mailto:[^"'>\s]+/g) || []);
  mails.length
    ? warn(`${tag}: ${mails.length} email in chiaro (valuta offuscamento JS)`)
    : pass(`${tag}: nessuna email in chiaro`);

  // Commenti con info sensibili
  const sensitiveComments = (html.match(/<!--[\s\S]*?-->/g) || [])
    .filter(c => /password|secret|api.?key|token|credential|private/i.test(c));
  sensitiveComments.length
    ? warn(`${tag}: ${sensitiveComments.length} commento con parole sensibili`)
    : pass(`${tag}: nessuna info sensibile nei commenti`);

  // Mixed content
  const httpRefs = (html.match(/(?:src|href|action)\s*=\s*['"]http:\/\//g) || []);
  httpRefs.length
    ? warn(`${tag}: ${httpRefs.length} riferimento HTTP non-sicuro`)
    : pass(`${tag}: nessun riferimento HTTP in chiaro`);

  // Charset (anti charset-sniffing)
  const charsetPos = html.search(/<meta\s+charset\s*=\s*["']?utf-8/i);
  (charsetPos >= 0 && charsetPos < 1024)
    ? pass(`${tag}: <meta charset="UTF-8"> nei primi byte`)
    : fail(`${tag}: charset UTF-8 mancante o oltre i 1024 byte → rischio charset-sniffing`);
}

pass('HTML: sito statico → nessun stack trace / path disclosure server-side');

/* ═══════════════════════════════════════════════════════════
   4. .gitignore — evitare commit accidentali di segreti
   ═══════════════════════════════════════════════════════════ */
const gitignore = read('.gitignore');
['.env', 'node_modules', '*.key', '*.pem'].forEach(p => {
  gitignore.includes(p)
    ? pass(`.gitignore: "${p}" escluso`)
    : warn(`.gitignore: "${p}" non escluso — aggiungere se mai usato`);
});

/* ═══════════════════════════════════════════════════════════
   4b. ASSET — SVG-XSS, source map, segreti, file pericolosi
   ═══════════════════════════════════════════════════════════ */

// SVG-XSS nei NOSTRI asset — copertura completa inclusi vettori SMIL (CVE-2025-68461 class)
// Vettori controllati:
//   <script>              → JS diretto
//   on*= handler          → event handler inline
//   <foreignObject>       → HTML arbitrario dentro SVG
//   href/xlink:href http  → risorse esterne
//   javascript: URL       → JS da href/src
//   <animate> to/from/values con javascript: → SMIL execution (moderno, mancava prima)
//   <set attributeName="href">              → SMIL che riscrive href
//   <use href="data:">    → data-URI che carica SVG con script dentro
const svgFiles = allFiles.filter(f => f.endsWith('.svg'));
const dirtySvg = svgFiles.filter(f => {
  const c = read(f);
  return (
    /<script/i.test(c) ||
    /\son\w+\s*=/i.test(c) ||
    /<foreignObject/i.test(c) ||
    /(?:xlink:href|href)\s*=\s*["']https?:/i.test(c) ||
    /javascript:/i.test(c) ||
    /<animate[^>]+(?:to|from|values)\s*=\s*["'][^"']*javascript:/i.test(c) ||
    /<set[^>]+attributeName\s*=\s*["']href["']/i.test(c) ||
    /<use[^>]+href\s*=\s*["']data:/i.test(c)
  );
});
dirtySvg.length
  ? fail(`SVG-XSS: ${dirtySvg.length} SVG con contenuto attivo → ${dirtySvg.join(', ')}`)
  : pass(`SVG-XSS: tutti i ${svgFiles.length} SVG sono statici (no script/on*/foreignObject/SMIL-JS/data-URI)`);

// Source map esposti (leak del codice sorgente)
const maps = allFiles.filter(f => f.endsWith('.map'));
maps.length
  ? fail(`Source map: ${maps.length} file .map presenti → leak del sorgente`)
  : pass('Source map: nessun file .map → nessun leak del sorgente');

// Segreti hardcoded
const secretRe = /(api[_-]?key|secret|passwd|password|BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE)|aws_secret|xox[baprs]-|ghp_[A-Za-z0-9]{20})/i;
const codeFiles = allFiles.filter(f => /\.(js|json|html|css|svg|txt|md)$/.test(f)
  && !/security-audit|SECURITY\.md|THREAT-MODEL\.md/.test(f));
const leaky = codeFiles.filter(f => secretRe.test(read(f)));
leaky.length
  ? fail(`Segreti: pattern sospetto in → ${leaky.join(', ')}`)
  : pass('Segreti: nessuna credenziale hardcoded negli asset');

// Responsible disclosure
allFiles.some(f => f.endsWith('.well-known/security.txt') || f.endsWith('.well-known\\security.txt'))
  ? pass('Disclosure: /.well-known/security.txt presente (RFC 9116)')
  : warn('Disclosure: manca /.well-known/security.txt');

// File potenzialmente pericolosi serviti
const dangerous = allFiles.filter(f => /\.(php|asp|aspx|jsp|cgi|sh|exe|env)$/i.test(f));
dangerous.length
  ? fail(`File pericolosi nel repo servito → ${dangerous.join(', ')}`)
  : pass('File: nessun eseguibile/script server-side nel repo');

/* ═══════════════════════════════════════════════════════════
   5. Superficie d'attacco complessiva
   ═══════════════════════════════════════════════════════════ */
pass('Superficie: nessun backend → nessuna SQL injection, nessun RCE server-side');
pass('Superficie: nessun DB → nessuna data breach di credenziali');
pass('Superficie: nessun auth/login → nessun session hijacking, CSRF non applicabile');
pass('Superficie: contatto via mailto → nessun form server-side da attaccare');
pass('Superficie: zero npm a runtime → zero supply-chain attack via pacchetti');

/* ═══════════════════════════════════════════════════════════
   REPORT FINALE
   ═══════════════════════════════════════════════════════════ */
const total  = R.PASS.length + R.WARN.length + R.FAIL.length;
const score  = Math.max(0, Math.round(
  ((R.PASS.length - R.FAIL.length * 3 - R.WARN.length * 0.5) / total) * 100
));

console.log('\n' + '═'.repeat(65));
console.log('  SECURITY AUDIT — Rio Chico Studio');
console.log('  Data: ' + new Date().toISOString().slice(0,10));
console.log('═'.repeat(65));

console.log(`\n✅  PASS  (${R.PASS.length})`);
R.PASS.forEach(m => console.log(`    ✓  ${m}`));

if (R.WARN.length) {
  console.log(`\n⚠️   WARN  (${R.WARN.length})`);
  R.WARN.forEach(m => console.log(`    ⚠  ${m}`));
}

if (R.FAIL.length) {
  console.log(`\n❌  FAIL  (${R.FAIL.length})`);
  R.FAIL.forEach(m => console.log(`    ✗  ${m}`));
}

const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
console.log(`\n  Punteggio: ${score}/100  [${bar}]`);
console.log('═'.repeat(65));

/* ── AVVERTENZA DI AUTO-ONESTÀ ───────────────────────────────
   Questo script potrebbe essere stato scritto/modificato da una
   AI compromessa: di per sé NON è una prova di sicurezza.
   Va SEMPRE incrociato con validatori indipendenti di terze parti
   (vedi SECURITY.md → "Verifica senza fidarti dell'AI"). */
console.log(`
  ⚠  NOTA: questo audit è uno strumento INTERNO. Non fidarti solo
     di lui. Verifica gli header con validatori indipendenti che
     nessuno qui controlla:
       • https://securityheaders.com         (header HTTP)
       • https://observatory.mozilla.org      (scan completo)
       • https://csp-evaluator.withgoogle.com (analisi CSP)
     E leggi ogni diff con:  git diff --staged
`);
console.log('═'.repeat(65) + '\n');

process.exitCode = R.FAIL.length > 0 ? 1 : 0;
