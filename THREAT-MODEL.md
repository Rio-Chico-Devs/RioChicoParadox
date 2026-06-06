# THREAT MODEL — Rio Chico Studio
### Catalogo completo dei vettori d'attacco e contromisure

Frutto di ricerca sistematica su attacchi reali 2025-2026, mappati sul **nostro
stack effettivo**: sito statico + Cloudflare Pages + dominio/DNS + email per
commissioni + upload immagini/arte + GitHub. Non solo schemi noti: include
vettori emergenti (Fontleak, SVG-XSS via `<animate>`, preview URL permanenti,
prompt-injection AI).

> Tu analizzi e approvi. Ogni voce ha **stato** e **azione**.

### Legenda stato
- ✅ **MITIGATO** — già risolto nel codice di questo repo
- 🔧 **REPO** — implementato ora in questo commit (file nel repo)
- ⚙️ **PIATTAFORMA** — richiede un'azione su Cloudflare / DNS / registrar / GitHub (istruzioni esatte sotto)
- 📋 **OPERATIVO** — processo continuo, non una tantum

---

## A. Attacchi client-side / browser

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| A1 | XSS stored/reflected/DOM | ✅ | Nessun input utente, nessun contenuto dinamico, CSP `script-src 'self'` |
| A2 | CSP bypass | ✅ | CSP `default-src 'none'`, nessun wildcard, audita con csp-evaluator |
| A3 | CSS injection / exfiltration ("Fontleak" 2025) | ✅ | Nessun punto d'iniezione + img-src/font-src/connect-src senza origini attaccabili |
| A4 | Clickjacking / UI redress | ✅ | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| A5 | Tabnabbing | ✅ | `rel="noopener noreferrer"` su tutti i link `target="_blank"` |
| A6 | HTML injection / dangling markup | ✅ | HTML statico, nessuna concatenazione di stringhe nel DOM |
| A7 | Prototype pollution | ✅ | Zero librerie, nessun merge ricorsivo di oggetti |
| A8 | Open redirect | ✅ | Nessuna logica di redirect basata su input |
| A9 | Service worker hijack / cache | ✅ | Nessun service worker registrato |
| **A10** | **SVG-XSS** (script/`onload`/`<animate>` — CVE-2025-68461) | 🔧 | **I nostri SVG sono scansionati e puliti. POLICY: l'arte caricata va convertita in raster (PNG/WebP/AVIF), MAI inline SVG da fonti esterne** |

**A10 in dettaglio (importante per te che carichi arte):** un file `.svg` è codice
XML che può contenere `<script>`, `onload=`, o `<animate>` malevoli ed eseguire JS
nel browser. **Regola:** la tua arte si carica come **PNG/WebP/AVIF** (raster), non
come SVG. Gli SVG nel sito restano solo quelli "di sistema" (icone, decori) che
scriviamo noi e che l'audit verifica. Se mai serve un SVG esterno, va sanitizzato
(rimozione di `<script>`, `<foreignObject>`, handler `on*`, `href` esterni).

---

## B. Transport / TLS

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| B1 | HTTPS downgrade / SSL strip | ✅ | HSTS `max-age=63072000; includeSubDomains; preload` |
| B2 | Mixed content | ✅ | Nessun riferimento `http://`, CSP `upgrade-insecure-requests` |
| B3 | Certificato emesso da CA non autorizzata | ⚙️ | **Record CAA** (sotto) → solo le CA scelte possono emettere |
| B4 | TLS debole | ⚙️ | Cloudflare: SSL/TLS mode **Full (Strict)**, **Minimum TLS 1.2**, TLS 1.3 ON |

---

## C. DNS / Dominio  ⚙️ (il punto più trascurato)

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| C1 | DNS hijacking / cache poisoning (CVE-2025-40778 BIND) | ⚙️ | **DNSSEC** attivo sul dominio |
| C2 | Domain hijacking (furto del dominio) | ⚙️ | **Registry/Registrar Lock** + 2FA sul registrar + WHOIS privacy |
| C3 | Subdomain takeover / dangling DNS | ⚙️📋 | Rimuovere i record DNS *prima* di dismettere un servizio; mai il contrario |
| C4 | Typosquatting / homograph (riochіco con la "і" cirillica) | ⚙️📋 | Monitoraggio lookalike + DMARC + (opz.) registrazione difensiva |
| **C5** | **Email spoofing → phishing dei tuoi clienti** | 🔧⚙️ | **SPF + DKIM + DMARC `p=reject`** (record pronti sotto) |

**C5 è critico per te:** raccogli commissioni via email. Senza protezione,
un truffatore può inviare email che sembrano venire dal **tuo** dominio
("ciao, paga la commissione su questo IBAN") ai tuoi clienti. I record DNS
qui sotto lo impediscono — anche se **non** invii email dal dominio (in quel
caso si blocca *tutto* lo spoofing, che è ancora meglio).

### 📋 Record DNS da incollare (sostituisci `tuodominio.com`)

```dns
; ── Anti-spoofing email (anche se non invii email dal dominio) ──
; SPF: nessun server è autorizzato a inviare per questo dominio
tuodominio.com.        TXT   "v=spf1 -all"

; DMARC: rifiuta tutto ciò che non passa, e mandami i report
_dmarc.tuodominio.com. TXT   "v=DMARC1; p=reject; rua=mailto:tua@email.com; fo=1; adkim=s; aspf=s"

; DKIM: "null" key — nessuna chiave valida = nessuna firma falsificabile
*._domainkey.tuodominio.com. TXT "v=DKIM1; p="

; ── Certificate Authority Authorization: solo Let's Encrypt + Google (Cloudflare) ──
tuodominio.com.        CAA   0 issue "letsencrypt.org"
tuodominio.com.        CAA   0 issue "pki.goog"
tuodominio.com.        CAA   0 issuewild ";"
tuodominio.com.        CAA   0 iodef "mailto:tua@email.com"
```

> Se in futuro **invierai** email dal dominio (es. Google Workspace), aggiorneremo
> SPF/DKIM con i valori del provider e DMARC a `p=quarantine` durante il rollout.

---

## D. Hosting / CDN (Cloudflare Pages)

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| **D1** | **Preview URL pubblici e PERMANENTI** (`hash.progetto.pages.dev` resta vivo per sempre) | ⚙️ | Cloudflare Pages → **Access Policy** sui preview + blocca/redirigi `*.pages.dev` al dominio canonico |
| D2 | Origin server exposure | ✅ | Nessun origin: servito direttamente dalla CDN |
| D3 | WAF/edge CVE (es. ACME bypass ott-2025) | 📋 | Patchato dal vendor; teniamo d'occhio i bollettini Cloudflare |
| D4 | HTTP request smuggling (CVE-2025-32094 classe) | 📋 | Responsabilità edge Cloudflare; noi statici, nessun origin desync |
| D5 | Host header injection | ✅🔧 | Sito statico (nessun riflesso dell'Host) + `<link rel="canonical">` |
| D6 | Web cache poisoning / deception (bypass `.avif`) | ⚙️🔧 | Cloudflare **Cache Deception Armor** ON + header `Cache-Control` (sotto) |
| D7 | DDoS / bandwidth abuse | ⚙️ | Cloudflare DDoS protection (default) + **Bot Fight Mode** |

### ⚙️ Checklist dashboard Cloudflare
- [ ] **Pages → Settings → Access policy**: abilita su *Preview deployments*
- [ ] **Redirect Rule**: `*.pages.dev/*` → `https://tuodominio.com/$1` (301)
- [ ] **Scrape Shield → Hotlink Protection**: ON (vedi F2)
- [ ] **Scrape Shield → Email Obfuscation**: ON
- [ ] **Cache → Cache Deception Armor**: ON
- [ ] **Security → Bots → Bot Fight Mode**: ON
- [ ] **SSL/TLS**: Full (Strict), Min TLS 1.2

---

## E. Supply chain / Source control

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| E1 | Supply chain npm (worm Shai-Hulud, chalk/debug 2025) | ✅ | **Zero dipendenze** runtime e build |
| E2 | Google Fonts CDN compromesso | 🔧📋 | Documentato il self-hosting (rimuove l'ultima dipendenza esterna) |
| E3 | GitHub account takeover | ⚙️ | **2FA con passkey/security key** (non SMS), branch protection su `main` |
| E4 | Segreti committati (28M leak nel 2025) | ✅🔧 | Audit pulito + `.gitignore` esteso + **GitHub Push Protection** ON |
| E5 | CI/CD workflow injection | 📋 | Nessuna GitHub Action ora; se aggiunte → `permissions: read-all`, pin per SHA |
| E6 | Prompt injection AI → backdoor | ✅ | `SECURITY.md §4`: diff verificabili, zero deps, no build, CSP, validatori indipendenti |

### ⚙️ Checklist GitHub
- [ ] **2FA con passkey o security key** (non SMS) sull'account
- [ ] **Settings → Branch protection** su `main`: richiedi PR, no force-push
- [ ] **Settings → Code security → Secret scanning + Push protection**: ON
- [ ] Mai usare l'account personale come "sync" tra macchine (vettore del leak CISA 2025)

---

## F. Contenuti / Privacy (specifico per artista)

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| **F1** | **EXIF metadata** nell'arte caricata (GPS → indirizzo di casa, seriale fotocamera → de-anonimizzazione) | 🔧📋 | **Strip dei metadati prima di pubblicare** (pipeline immagini, sotto) |
| F2 | Hotlinking / furto di banda | ⚙️ | Cloudflare **Hotlink Protection** (controllo Referer) |
| F3 | Furto/scraping dell'arte | ⚙️📋 | Watermark, hotlink protection, (limite: disabilitare right-click è cosmetico), DMCA |
| F4 | `.git` / `.map` / dotfile esposti (5M server colpiti) | ✅🔧 | Audit pulito + Cloudflare Pages non serve dotfile + check nell'audit |
| F5 | Immagini polyglot / decompression bomb | 🔧 | Re-encoding raster (AVIF/WebP) distrugge payload nascosti e zip-bomb |

**F1 in dettaglio:** le immagini da Procreate/iPad/telefono contengono spesso
coordinate GPS e seriale del dispositivo. Pubblicarle as-is può rivelare il tuo
**indirizzo di casa**. La pipeline immagini (sotto) **deve** sempre fare strip.

### 📋 Pipeline immagini (offline, zero dipendenze nel sito)
Per ogni opera, prima di committare in `assets/img/`:
1. **Strip EXIF** + **re-encode** (rimuove metadati, payload, zip-bomb):
   - GUI: Squoosh.app (locale, offline) → export senza metadati
   - CLI (se hai ImageMagick): `magick in.jpg -strip -quality 82 out.webp`
2. **Formati**: esporta in **AVIF** (o WebP) + un fallback, più misure responsive
3. **Verifica**: `exiftool opera.webp` non deve mostrare GPS/seriale

---

## G. Disponibilità / Operatività

| # | Vettore | Stato | Contromisura |
|---|---|---|---|
| G1 | DDoS | ⚙️ | Cloudflare (vedi D7) |
| G2 | Defacement via account compromesso | ⚙️ | 2FA ovunque (registrar, Cloudflare, GitHub) + branch protection |
| G3 | Nessun canale di segnalazione vulnerabilità | 🔧 | `/.well-known/security.txt` (RFC 9116) |

---

## Riepilogo priorità (cosa approvare e fare, in ordine)

**Fatte ora nel repo (questo commit):**
1. 🔧 Catalogo SVG-XSS + audit che scansiona i nostri SVG (A10, F4)
2. 🔧 Header `Cache-Control` anti cache-poisoning (D6)
3. 🔧 `<link rel="canonical">` predisposto (D5)
4. 🔧 `/.well-known/security.txt` (G3)
5. 🔧 Record DNS pronti da incollare (C5, B3)
6. 🔧 Pipeline immagini documentata: strip EXIF + raster (F1, F5)

**Da fare su piattaforma quando attivi il dominio (10 min, guidato sopra):**
1. ⚙️ DNS: SPF + DMARC + CAA + DNSSEC
2. ⚙️ Registrar: Registry Lock + 2FA + WHOIS privacy
3. ⚙️ Cloudflare: checklist §D (Access policy preview, hotlink, cache armor, bot fight, TLS strict)
4. ⚙️ GitHub: 2FA passkey + branch protection + push protection

**Massimo hardening (quando puoi):**
1. 🔧 Self-hostare i font → `font-src 'self'` → superficie CSS-exfil = zero
2. 🔧 Rimuovere `style-src 'unsafe-inline'` (inline style → classi)
3. ⚙️ Dominio in HSTS preload list (hstspreload.org)

---

## Fonti della ricerca
SVG-XSS: GitHub Security Advisories GHSA-rcg8-g69v-x23j, CVE-2025-68461 (Roundcube) ·
EXIF: ConsumerReports, MetaClean ·
Email auth: EmailOnAcid, DMARCLY, Valimail ·
Subdomain takeover: OWASP Cheat Sheet, Microsoft Learn ·
Domain security: Markmonitor, DCHost ·
GitHub: GitGuardian State of Secrets 2026, GitHub Changelog ·
Cache: PortSwigger Research, Cloudflare Docs ·
.git exposure: GitGuardian, CVE-2025-66036 ·
Hotlink: Cloudflare WAF Docs ·
Preview URL: Cloudflare Pages Docs, israynotarray ·
Typosquatting: Unit42, OWASP ·
Request smuggling: Akamai CVE-2025-32094, PortSwigger ·
AI prompt injection: arXiv 2509.22040, OpenSSF
