# SECURITY — Rio Chico Studio

Threat model, difese attive e — soprattutto — **come verificare la sicurezza
senza doverti fidare di nessuno** (incluso l'assistente AI che ha scritto questo
codice).

📖 **Catalogo completo dei vettori d'attacco e contromisure → [THREAT-MODEL.md](./THREAT-MODEL.md)**
(40+ vettori 2025-2026 mappati sul nostro stack, con stato e azione per ciascuno).

Ultimo audit: vedi `node security-audit.js` · Punteggio attuale: 56 PASS / 0 FAIL.

---

## 1. Threat model — cosa può e non può succedere

Il sito è **statico**: HTML/CSS/JS serviti da CDN, nessun backend, nessun
database, nessun login, contatto via `mailto:`. Questo elimina in partenza
intere classi di attacco.

| Vettore | Esposizione | Perché |
|---|---|---|
| SQL injection | ❌ Impossibile | Nessun database |
| RCE / server-side | ❌ Impossibile | Nessun server applicativo |
| Session hijacking / CSRF | ❌ Impossibile | Nessun login, nessun cookie di sessione |
| XSS da input utente | ❌ Impossibile | Nessun input, nessun contenuto dinamico |
| Supply-chain npm (runtime) | ❌ Impossibile | Zero dipendenze runtime |
| Clickjacking | ✅ Bloccato | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Tab-nabbing | ✅ Bloccato | `rel="noopener noreferrer"` su tutti i link esterni |
| MIME confusion | ✅ Bloccato | `X-Content-Type-Options: nosniff` |
| HTTPS downgrade | ✅ Bloccato | HSTS 2 anni + preload |
| Script injection | ✅ Bloccato | CSP `script-src 'self'`, zero inline |
| CSS exfiltration (Fontleak) | ✅ Bloccato | img-src/font-src/connect-src senza origini attaccabili |
| Email harvesting (bot spam) | 🟡 Mitigato | Indirizzi offuscati via JS (`.js-mailto`) |
| **AI compromessa** | 🟡 **Vedi §4** | **Il rischio residuo più importante** |

---

## 2. Difese attive (file `_headers`, applicato da Cloudflare Pages)

- **CSP** `default-src 'none'` + allow-list esplicita per ogni tipo di risorsa.
  Nessun wildcard `*`. `script-src 'self'` → nessuno script inline o da CDN.
- **HSTS** `max-age=63072000; includeSubDomains; preload`.
- **X-Frame-Options / X-Content-Type-Options / Referrer-Policy /
  Permissions-Policy** (camera, microfono, GPS, USB, Bluetooth tutti negati).

### Punto debole noto e perché è accettabile
`style-src 'unsafe-inline'` è necessario per gli attributi `style="--item-i:0"`
nell'HTML. Da solo permetterebbe la CSS-exfiltration — **ma** serve un punto di
iniezione (qui inesistente: sito statico) **e** un'origine di fuga
(qui inesistente: img-src/font-src/connect-src non ammettono host attaccabili).
Doppiamente mitigato. Eliminazione definitiva: spostare gli inline style in
classi CSS → rimuovere `'unsafe-inline'`.

---

## 3. Hardening futuro (in ordine di valore)

1. **Self-hostare i font** (Bebas Neue, Inter, Noto Serif JP).
   Scaricare i `.woff2`, metterli in `assets/fonts/`, creare i `@font-face`,
   poi rimuovere `fonts.googleapis.com` e `fonts.gstatic.com` dalla CSP e
   portare `font-src` a `'self'`. Elimina: (a) l'unica dipendenza esterna,
   (b) il leak di privacy verso Google, (c) il canale CSS-exfil teorico.
2. **Rimuovere `style-src 'unsafe-inline'`** spostando gli inline style in classi.
3. **DNSSEC** sul dominio (dal registrar) — anti DNS-hijacking.
4. **Aggiungere il dominio alla HSTS preload list** → https://hstspreload.org
5. **Cloudflare**: attivare "Email Address Obfuscation" e "Bot Fight Mode".

---

## 4. Verifica SENZA fidarti dell'AI ⚠️

> Un assistente AI può essere manipolato via *prompt injection* (un commento in
> una PR, una pagina web letta, il README di una dipendenza) per introdurre una
> backdoor mentre tu ti fidi. Nel 2025 questo è documentato come vettore reale
> contro Cursor, GitHub Copilot e Gemini. Quindi: **non fidarti. Verifica.**

Il codice di questo repo è strutturato per essere **verificabile da te o da
terzi senza dover credere a una sola parola dell'AssistenteAI:**

### a) Ogni modifica è un diff leggibile
Niente è nascosto. Prima di accettare qualsiasi lavoro:
```bash
git diff --staged          # leggi OGNI riga prima di committare
git log -p                 # rivedi la storia completa
```
Se una modifica tocca file che non c'entrano col task richiesto → sospetto.

### b) Validatori indipendenti che l'AI NON controlla
Dopo il deploy, verifica gli header con servizi terzi:
- **https://securityheaders.com** → deve dare A o A+
- **https://observatory.mozilla.org** → scan completo
- **https://csp-evaluator.withgoogle.com** → incolla la CSP, cerca debolezze

Se l'audit interno (`security-audit.js`) dice "tutto ok" ma questi no →
**fidati di questi, non dell'audit interno** (l'AI potrebbe aver truccato lo
script).

### c) Zero dipendenze = niente "slopsquatting"
L'attacco AI più comune è far installare un pacchetto npm malevolo dal nome
plausibile (le AI ne "allucinano" ~5%). Qui `package.json` ha **zero
dependencies**: qualsiasi `npm install <x>` proposto va trattato come
**red flag** e verificato a mano sul registro ufficiale.

### d) Nessun build step = quello che leggi è quello che gira
Il sito non ha trasformazione di build: il codice nel repo è **byte per byte**
quello servito ai visitatori. Niente bundle in cui nascondere codice. Con un
framework (Astro/Webpack) dovresti fidarti anche dell'output compilato — qui no.

### e) La CSP è difesa-in-profondità anche contro l'AI
Se anche l'AI iniettasse uno script malevolo o un'immagine di tracking,
la CSP (`script-src 'self'`, `img-src 'self' data:`, `connect-src 'none'`)
lo **bloccherebbe nel browser**. La sicurezza non dipende dalla buona fede di
chi scrive il codice.

### g) Scansione byte-level contro il codice "invisibile"
Un'AI compromessa potrebbe nascondere una backdoor con caratteri Unicode
invisibili o homoglyph (Cirillico che sembra Latino) che superano la review
umana — è l'attacco *Trojan Source* (CVE-2021-42574). Difesa:
```bash
node integrity-scan.js      # scandisce OGNI byte: bidi, zero-width, homoglyph, IDN
```
Deve dare 0 FAIL. (Ha già scovato un `README.md` in UTF-16 e va eseguito a ogni
modifica.) In più, VS Code evidenzia i caratteri bidi/invisibili di default.

### h) Checklist rapida prima di ogni merge
- [ ] Ho letto `git diff --staged` per intero?
- [ ] Le modifiche riguardano SOLO ciò che ho chiesto?
- [ ] Nessun nuovo `<script src=...>` esterno, `fetch`, `eval`, `innerHTML`?
- [ ] Nessuna nuova dipendenza in `package.json`?
- [ ] Nessun URL sconosciuto (esfiltrazione)?
- [ ] `node security-audit.js` → 0 FAIL
- [ ] `node integrity-scan.js` → 0 FAIL
- [ ] securityheaders.com → A+ (validatore indipendente)
- [ ] (opzionale) commit firmati "Verified" su GitHub

---

## 5. Come segnalare un problema
Sito personale: scrivi all'indirizzo email nel footer del sito.

---

## Fonti / ricerca alla base di questo documento
- Content Security Policy bypass — HackTricks, content-security-policy.com
- CSS exfiltration (`@font-face`/`unicode-range`, "Fontleak" 2025) —
  PayloadsAllTheThings, Huli's blog, aszx87410 "Beyond XSS"
- Prompt injection su AI coding assistant (2025) — arXiv 2509.22040,
  OpenSSF "Security-Focused Guide for AI Code Assistant Instructions",
  GitHub Docs "Review AI-generated code"
- Cloudflare WAF ACME bypass zero-day (ott. 2025) — FearsOff / HackerOne
