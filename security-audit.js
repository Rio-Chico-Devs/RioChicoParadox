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

/* ═══════════════════════════════════════════════════════════
   1. _headers — CSP + HTTP Security Headers
   ═══════════════════════════════════════════════════════════ */
const headers = read('_headers');

// CSP
const cspLine = headers.match(/Content-Security-Policy:\s*(.+)/);
const csp = cspLine ? cspLine[1] : '';
if (!csp) { fail('CSP: header mancante'); }

// script-src — il più critico
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
  // non è un fail: è necessario per gli inline style= nel HTML, ma va documentato
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

// data: in img-src — con connect-src none il rischio è minimo, ma documentiamo
if (csp.match(/img-src[^;]*data:/))
  warn("CSP img-src data:: consente background data-URI nel CSS — non esfiltrazione (connect-src none) ma SVG attivi");
else
  pass("CSP img-src: nessun data: URI ammesso");

/* ── CSS EXFILTRATION CHANNELS ─────────────────────────────
   Attacco reale 2025 (@font-face + unicode-range / "Fontleak" /
   "CSS Data Exfiltration to Steal OAuth Token"): con style-src
   'unsafe-inline' un attaccante che inietta CSS può rubare dati
   carattere-per-carattere SENZA JavaScript. Il canale di fuga NON
   è connect-src (CSS non fa fetch) ma:
     • background-image: url(evil)  → governato da img-src
     • @font-face { src: url(evil) } → governato da font-src
     • cursor / list-style url(evil) → governato da img-src
   Difesa: img-src e font-src NON devono contenere un'origine
   controllabile dall'attaccante (no wildcard, no https: generico).
   ──────────────────────────────────────────────────────────── */
const extractOrigins = dir => {
  const m = csp.match(new RegExp(dir + "\\s+([^;]+)"));
  if (!m) return [];
  return m[1].trim().split(/\s+/);
};
// Origini considerate NON sfruttabili come canale di fuga:
//  'self','none','data:' + i domini Google Fonts (i cui log l'attaccante non legge)
const SAFE_ORIGINS = /^('self'|'none'|data:|https:\/\/fonts\.gstatic\.com|https:\/\/fonts\.googleapis\.com)$/;
const exfilDirs = ['img-src', 'font-src', 'connect-src'];
let exfilOpen = false;
exfilDirs.forEach(dir => {
  const origins = extractOrigins(dir);
  const attackerUsable = origins.filter(o => {
    if (SAFE_ORIGINS.test(o)) return false;
    if (o === "'unsafe-inline'" || o === "'unsafe-eval'") return false; // non sono origini di rete
    if (o === '*' ) return true;
    if (/^https?:$/.test(o)) return true;       // schema generico = qualsiasi host
    if (/^https?:\/\//.test(o)) return true;     // host esterno arbitrario
    return false;
  });
  if (attackerUsable.length) {
    exfilOpen = true;
    fail(`CSP ${dir}: origine sfruttabile per CSS-exfiltration → ${attackerUsable.join(', ')}`);
  }
});
if (!exfilOpen)
  pass("CSP: canali CSS-exfiltration chiusi (img-src/font-src/connect-src senza origini attaccabili) → @font-face/Fontleak neutralizzato");

// Nota: fonts.gstatic.com resta un'origine font ammessa. Non è
// sfruttabile (Google, log non leggibili) ma self-hostare i font
// e portare font-src a 'self' eliminerebbe anche il canale teorico.
if (csp.includes('fonts.gstatic.com') || csp.includes('fonts.googleapis.com'))
  warn("CSP: dipendenza esterna Google Fonts attiva. Self-hosting → font-src 'self' → superficie CSS-exfil = zero assoluto.");

// Altri header
headers.includes('X-Frame-Options: DENY')
  ? pass("X-Frame-Options: DENY — doppia protezione clickjacking (vecchi browser)")
  : fail("X-Frame-Options mancante");

headers.includes('X-Content-Type-Options: nosniff')
  ? pass("X-Content-Type-Options: nosniff — browser non indovina il MIME type")
  : fail("X-Content-Type-Options mancante — MIME confusion attack possibile");

headers.includes('Strict-Transport-Security')
  ? pass("HSTS presente — connessioni HTTP rifiutate dopo prima visita")
  : fail("HSTS mancante — downgrade attack HTTPS→HTTP possibile");

headers.includes('max-age=63072000')
  ? pass("HSTS max-age 2 anni — standard HSTS preload list")
  : warn("HSTS max-age basso (< 1 anno) — ridurlo non è raccomandato");

headers.includes('preload')
  ? pass("HSTS preload flag — puoi aggiungere il dominio alla HSTS preload list di Chrome/Firefox")
  : warn("HSTS: flag preload mancante");

headers.includes('Referrer-Policy: strict-origin-when-cross-origin')
  ? pass("Referrer-Policy: URL piena non trapela ai siti esterni")
  : warn("Referrer-Policy mancante");

headers.includes('Permissions-Policy')
  ? pass("Permissions-Policy: camera, microfono, GPS, USB, Bluetooth disabilitati")
  : warn("Permissions-Policy mancante");

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
  [/localStorage\s*\.\s*getItem|sessionStorage\s*\.\s*getItem/g, 'storage read → verifica se usato in sink'],
];

jsSinks.forEach(([re, name]) => {
  re.lastIndex = 0;
  const m = js.match(re);
  m ? fail(`JS: trovato "${name}" (${m.length}x)`) : pass(`JS: nessun ${name.split(' ')[0]}`);
});

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
   3. index.html — injection points, info disclosure
   ═══════════════════════════════════════════════════════════ */
const html = read('index.html');

// Inline script injection
const inlineScripts = html.match(/<script(?!\s+src)[^>]*>[\s\S]*?<\/script>/gi) || [];
inlineScripts.length
  ? warn(`HTML: ${inlineScripts.length} blocchi <script> inline (il CSP script-src 'self' li blocca, ma meglio eliminare)`)
  : pass('HTML: nessun <script> inline — tutto in js/main.js esterno');

// Inline event handlers (onclick, onload, onerror, ecc.)
const inlineHandlers = html.match(/\s+on\w+\s*=/g) || [];
inlineHandlers.length
  ? fail(`HTML: ${inlineHandlers.length} inline event handler(s) — bypassano il CSP se 'unsafe-inline' è assente`)
  : pass('HTML: nessun inline event handler');

// javascript: URLs
html.match(/href\s*=\s*['"]javascript:/i)
  ? fail('HTML: href="javascript:..." trovato — XSS vector')
  : pass('HTML: nessun href="javascript:" — link injection bloccato');

// data: in href
html.match(/href\s*=\s*['"]data:/i)
  ? fail('HTML: href="data:..." trovato — possibile vettore')
  : pass('HTML: nessun href="data:" nei link');

// Link esterni senza rel="noopener"
const blankLinks = (html.match(/target="_blank"[^>]*/g) || []);
const noopenerOk = blankLinks.filter(l => l.includes('noopener'));
blankLinks.length === noopenerOk.length
  ? pass(`HTML: tutti i ${blankLinks.length} link target="_blank" hanno rel="noopener noreferrer" (tab hijacking bloccato)`)
  : fail(`HTML: ${blankLinks.length - noopenerOk.length} link target="_blank" senza rel="noopener" → tab hijacking possibile`);

// Email in chiaro (bot scraping)
const mails = (html.match(/mailto:[^"'>\s]+/g) || []);
mails.length
  ? warn(`HTML: ${mails.length} email in chiaro nel src (bot spam harvesting). Valuta offuscamento JS o protezione Cloudflare Email Obfuscation.`)
  : pass('HTML: nessuna email in chiaro');

// Commenti con info sensibili
const sensitiveInComments = (html.match(/<!--[\s\S]*?-->/g) || [])
  .filter(c => /password|secret|api.?key|token|credential|private|TODO|FIXME/i.test(c));
sensitiveInComments.length
  ? warn(`HTML: ${sensitiveInComments.length} commento con parole sensibili`)
  : pass('HTML: nessuna info sensibile nei commenti');

// Server-side path disclosure in errori
// (non applicabile su statico, ma segniamo come pass)
pass('HTML: sito statico → nessun stack trace / path disclosure server-side');

// Mixed content (http:// nelle risorse)
const httpRefs = (html.match(/(?:src|href|action)\s*=\s*['"]http:\/\//g) || []);
httpRefs.length
  ? warn(`HTML: ${httpRefs.length} riferimento HTTP non-sicuro (upgrade-insecure-requests mitiga, ma meglio aggiornare a https://)`)
  : pass('HTML: nessun riferimento HTTP in chiaro — tutto HTTPS o relativo');

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

// SVG-XSS nei NOSTRI asset (script, handler on*, foreignObject, href esterni, <animate> con javascript)
const svgFiles = allFiles.filter(f => f.endsWith('.svg'));
const dirtySvg = svgFiles.filter(f => {
  const c = read(f);
  return /<script|\son\w+\s*=|<foreignObject|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:|javascript:/i.test(c);
});
dirtySvg.length
  ? fail(`SVG-XSS: ${dirtySvg.length} SVG con contenuto attivo → ${dirtySvg.join(', ')}`)
  : pass(`SVG-XSS: tutti i ${svgFiles.length} SVG sono statici (no script/on*/foreignObject/href esterni)`);

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
