/* =========================================================
   RIO CHICO STUDIO — main.js
   ========================================================= */

/* Rispetta la preferenza di sistema: meno animazioni per chi la chiede */
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Lettura/scrittura storage che non rompe mai il loader anche se il
   browser blocca sessionStorage (modalita' privacy strette) */
const safeSession = {
  get(key)      { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { sessionStorage.setItem(key, val); } catch {} },
};

/* ── LOADING SCREEN — "NOW LOADING X%" ────────────────────
   Conta da 0 a 100% poi rivela il sito (stile Persona).
   Gira per intero solo alla prima visita della sessione: da un
   refresh o da un'altra pagina in poi salta subito al 100%.

   revealHero() e' l'UNICO segnale "l'hero puo' partire": lo emette
   sia il ramo con loader che quello senza (pagine future senza
   #loader), cosi' tutto cio' che deve comparire dopo (katakana,
   prima rotazione della ruota) dipende da un solo orologio condiviso
   invece che da un proprio timer indipendente slegato dal loader.
   ======================================================== */
const loader      = document.getElementById('loader');
const loaderFill  = document.getElementById('loader-fill');
const loaderCount = document.getElementById('loader-count');
const LOADER_SEEN_KEY = 'rcs-loader-seen';
const SKIP_COUNT_UP   = REDUCED_MOTION || safeSession.get(LOADER_SEEN_KEY) === '1';

function revealHero() {
  document.body.classList.add('loaded');
  document.dispatchEvent(new CustomEvent('rcs:hero-ready'));
}

if (loader) {
  const finish = () => {
    loader.classList.add('is-done');
    revealHero();
    safeSession.set(LOADER_SEEN_KEY, '1');
    setTimeout(() => loader.remove(), 450);
  };

  if (SKIP_COUNT_UP) {
    // niente conteggio teatrale: completa subito
    if (loaderFill)  loaderFill.style.width = '100%';
    if (loaderCount) loaderCount.textContent = '100';
    setTimeout(finish, 120);
  } else {
    let pct = 0;
    const tick = () => {
      // avanza a scatti irregolari per sembrare "vero" caricamento,
      // ma con un incremento minimo alto: mai troppo lungo
      pct += Math.random() * 30 + 22;
      if (pct >= 100) pct = 100;
      if (loaderFill)  loaderFill.style.width = pct + '%';
      if (loaderCount) loaderCount.textContent = Math.floor(pct);
      if (pct < 100) {
        setTimeout(tick, 60 + Math.random() * 90);
      } else {
        setTimeout(finish, 150);
      }
    };
    // start after a tiny delay
    setTimeout(tick, 100);
  }
} else {
  // pagina senza loader: l'hero e' pronto subito, nessuna attesa finta
  revealHero();
}


/* ── NAV + SCROLL PROGRESS ──────────────────────────────── */
const nav            = document.querySelector('.nav');
const navToggle      = document.querySelector('.nav__toggle');
const navLinks       = document.querySelector('.nav__links');
const navItems       = document.querySelectorAll('.nav__link');
const scrollProgress = document.querySelector('.scroll-progress');

function onScrollUpdate() {
  const y = window.scrollY;
  nav?.classList.toggle('is-scrolled', y > 60);
  if (scrollProgress) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
  }
}

window.addEventListener('scroll', onScrollUpdate, { passive: true });
window.addEventListener('resize', onScrollUpdate, { passive: true });
onScrollUpdate();

function closeMenu() {
  navToggle?.classList.remove('is-open');
  navLinks?.classList.remove('is-open');
  navToggle?.setAttribute('aria-expanded', 'false');
}

navToggle?.addEventListener('click', () => {
  const open = navToggle.classList.toggle('is-open');
  navLinks?.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', open);
});

navItems.forEach(link => {
  link.addEventListener('click', closeMenu);
});

// Link attivo = pagina corrente (ogni pagina ha una sola sezione,
// quindi non ha piu' senso dedurlo dallo scroll: ogni HTML gia'
// marca staticamente il link giusto con is-active, questo e' solo
// una rete di sicurezza nel caso il markup vada fuori sync)
const currentPage = document.body.dataset.page;
if (currentPage) {
  navItems.forEach(link => {
    link.classList.toggle('is-active', link.dataset.nav === currentPage);
  });
}

/* ── SCROLL REVEAL (clip-path system) ─────────────────────
   Tutti gli elementi con [data-r] vengono rivelati
   quando entrano nel viewport
   ======================================================== */
const revealEls = document.querySelectorAll('[data-r]');

const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0 });

revealEls.forEach(el => revealObs.observe(el));

/* ── HERO FEATURED — crossfade tra immagini nello stesso riquadro ──
   Un solo frame visibile alla volta (stessa cornice/posizione fissa),
   il contenuto ruota internamente con un dissolvenza incrociata.
   ================================================================= */
const heroFeaturedSlot = document.getElementById('heroFeaturedSlot');
const heroFeaturedImgs = heroFeaturedSlot ? [...heroFeaturedSlot.querySelectorAll('.hero__featured-img')] : [];
const heroFeaturedNum  = document.getElementById('heroFeaturedNum');

if (heroFeaturedImgs.length > 1) {
  let heroFeaturedIdx = 0;

  function heroFeaturedNext() {
    heroFeaturedImgs[heroFeaturedIdx].classList.remove('is-active');
    heroFeaturedIdx = (heroFeaturedIdx + 1) % heroFeaturedImgs.length;
    heroFeaturedImgs[heroFeaturedIdx].classList.add('is-active');
    if (heroFeaturedNum) heroFeaturedNum.textContent = String(heroFeaturedIdx + 1).padStart(2, '0');
    setTimeout(heroFeaturedNext, 3920);
  }

  // autoplay solo se l'utente non chiede meno animazioni. Parte dallo
  // stesso segnale del resto dell'hero (rcs:hero-ready) invece che da
  // un timer fisso slegato dal loader — cosi' il primo cambio non
  // capita mai per caso mentre l'hero sta ancora comparendo.
  if (!REDUCED_MOTION) {
    document.addEventListener('rcs:hero-ready', () => setTimeout(heroFeaturedNext, 1800), { once: true });
  }
}

/* ── MARQUEE TAP-TO-PAUSE ────────────────────────────────
   :hover non esiste sul touch: senza questo, su mobile il
   testo scorre per sempre e non si puo' mai fermare per leggerlo.
   ======================================================== */
document.querySelectorAll('.marquee-strip').forEach(strip => {
  strip.addEventListener('click', () => {
    strip.classList.toggle('is-paused');
  });
});

/* ── GALLERY FILTERS ────────────────────────────────────── */
const filterBtns = document.querySelectorAll('.gallery__filter-btn');
const gallCards  = document.querySelectorAll('.gallery__card');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    const filter = btn.dataset.filter;
    gallCards.forEach((card, i) => {
      const show = filter === 'all' || card.dataset.category === filter;
      card.toggleAttribute('data-hidden', !show);
      if (show) {
        card.style.animation = 'none';
        card.offsetHeight; // reflow
        card.style.animation = `cardIn 0.5s var(--ease-out-quart) ${i * 0.05}s both`;
      }
    });
  });
});

/* ── COUNTER ANIMATION ──────────────────────────────────── */
const counters = document.querySelectorAll('[data-count]');

const countObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCount(e.target);
      countObs.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });

counters.forEach(el => countObs.observe(el));

function animateCount(el) {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || '';
  if (REDUCED_MOTION) {
    el.textContent = target + suffix;
    return;
  }
  const dur = 1400;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── EMAIL OBFUSCATION ──────────────────────────────────── */
document.querySelectorAll('.js-mailto').forEach(el => {
  const addr = el.dataset.u + '@' + el.dataset.d;
  el.href = 'mailto:' + addr;
  if (el.classList.contains('social__email-address')) el.textContent = addr;
});

/* ── KEYBOARD ───────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenu();
});

