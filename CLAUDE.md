# CLAUDE.md — istruzioni permanenti per qualsiasi sessione su questo repo

## Standard di sicurezza — NON negoziabile

Questo progetto applica una baseline di **massima sicurezza, identica per
qualsiasi cliente** (muratore o Amazon — vedi il Principio in `SECURITY.md`).
Prima di considerare conclusa QUALSIASI modifica, esegui ed esigi:

- `node security-audit.js`  -> **0 FAIL**
- `node integrity-scan.js`  -> **0 FAIL**

Regole vincolanti:

1. **Zero dipendenze runtime.** Non aggiungere pacchetti npm. Se una dipendenza
   sembra necessaria, **fermati e segnalalo** all'utente (rischio supply-chain,
   slopsquatting). `package.json` resta senza `dependencies`.
2. **Niente** `<script>` inline, `eval`, `new Function`, `innerHTML`,
   `document.write`, handler `on*`, `javascript:`/`data:` nei link.
3. **Nessuna risorsa esterna** non approvata (script/font/CSS da CDN terzi).
   L'unica esterna nota sono i Google Fonts; l'obiettivo e' self-hostarli.
4. **CSP severa** in `_headers` (`default-src 'none'`, niente wildcard). Se una
   modifica richiede di allentarla, **fermati e spiega** prima di farlo.
5. **Immagini**: solo raster (PNG/WebP/AVIF), MAI SVG da fonti esterne non
   sanitizzate; EXIF sempre strippato (privacy: GPS/seriale).
6. **Solo-ASCII** in nomi file, path, identificatori e URL. Nessun carattere
   Unicode confondibile o invisibile nei sorgenti (lo verifica integrity-scan).
7. Ogni modifica e' un **diff leggibile**; nessun codice offuscato.

## Riferimenti (leggere prima di lavorare sulla sicurezza)

- `SECURITY.md` — principio + "come verificare senza fidarti dell'AI"
- `THREAT-MODEL.md` — catalogo 40+ vettori (Tier 1 + Tier 2 rete/crypto/byte) +
  checklist piattaforma (DNS, registrar, Cloudflare, GitHub)

## Il progetto

Portfolio statico vanilla **HTML/CSS/JS**, **zero build step**, zero dipendenze.
Deploy su **Cloudflare Pages**. Nessun framework salvo decisione esplicita
dell'utente. `preview.html` e' generato (build-preview), non e' un sorgente.

## Come lavorare

- Sviluppo sul branch indicato dall'utente; commit chiari; push solo quando
  richiesto.
- Dopo ogni modifica rilevante: ri-genera `preview.html` se serve, poi esegui i
  due audit sopra.
- Se l'utente porta questo standard in un ALTRO progetto, copia in quel repo:
  `_headers`, `security-audit.js`, `integrity-scan.js`, `SECURITY.md`,
  `THREAT-MODEL.md` e questo `CLAUDE.md`.
