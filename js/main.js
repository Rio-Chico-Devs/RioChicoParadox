/* =========================================================
   RIO CHICO STUDIO — main.js
   ========================================================= */

/* Rispetta la preferenza di sistema: meno animazioni per chi la chiede */
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── LOADING SCREEN — "NOW LOADING X%" ────────────────────
   Conta da 0 a 100% poi rivela il sito (stile Persona)
   ======================================================== */
const loader      = document.getElementById('loader');
const loaderFill  = document.getElementById('loader-fill');
const loaderCount = document.getElementById('loader-count');

if (loader) {
  const finish = () => {
    loader.classList.add('is-done');
    // trigger hero animations only after loader gone
    document.body.classList.add('loaded');
    setTimeout(() => loader.remove(), 700);
  };

  if (REDUCED_MOTION) {
    // niente conteggio teatrale: completa subito
    if (loaderFill)  loaderFill.style.width = '100%';
    if (loaderCount) loaderCount.textContent = '100';
    setTimeout(finish, 150);
  } else {
    let pct = 0;
    const tick = () => {
      // avanza a scatti irregolari per sembrare "vero" caricamento
      pct += Math.random() * 18 + 4;
      if (pct >= 100) pct = 100;
      if (loaderFill)  loaderFill.style.width = pct + '%';
      if (loaderCount) loaderCount.textContent = Math.floor(pct);
      if (pct < 100) {
        setTimeout(tick, 90 + Math.random() * 120);
      } else {
        setTimeout(finish, 350);
      }
    };
    // start after a tiny delay
    setTimeout(tick, 200);
  }
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

navToggle?.addEventListener('click', () => {
  const open = navToggle.classList.toggle('is-open');
  navLinks?.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', open);
});

navItems.forEach(link => {
  link.addEventListener('click', () => {
    navToggle?.classList.remove('is-open');
    navLinks?.classList.remove('is-open');
  });
});

// Active nav section
const sections = document.querySelectorAll('section[id]');
const navObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navItems.forEach(link => {
        link.classList.toggle('is-active', link.getAttribute('href') === `#${e.target.id}`);
      });
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => navObs.observe(s));

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

/* ── PARALLAX SCROLL ────────────────────────────────────── */
const heroBgGlow = document.querySelector('.hero__bg-glow');
const heroBgGrid = document.querySelector('.hero__bg-grid');

if (!REDUCED_MOTION) {
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (heroBgGlow) heroBgGlow.style.transform = `translateY(${y * 0.3}px)`;
    if (heroBgGrid) heroBgGrid.style.transform = `translateY(${y * 0.2}px)`;
  }, { passive: true });
}

/* ── ART WHEEL — 2D ferris wheel, counter-clockwise ────────
   Uses @property --slot-angle so each card animates on a
   circular arc while staying upright.
   Angles (CSS convention, Y-down): east=0, south=90, west=180, north=270
   CCW step = each card's angle decreases by 90° → next card arrives from north.
   ========================================================= */
const awStage = document.getElementById('artWheelStage');
const awCards = awStage ? [...awStage.querySelectorAll('.art-wheel__card')] : [];
const awDots  = [...document.querySelectorAll('.art-wheel__dot')];

if (awStage && awCards.length === 4) {
  // Initial angles matching --item-i order: 0=east, 1=south, 2=west(active), 3=north
  const angles = [0, 90, 180, 270];

  function applyAngles() {
    awCards.forEach((card, i) => {
      card.style.setProperty('--slot-angle', angles[i] + 'deg');
    });
  }

  function findActive() {
    return angles.findIndex(a => ((a % 360) + 360) % 360 === 180);
  }

  function updateActive() {
    const idx = findActive();
    awCards.forEach((card, i) => card.classList.toggle('is-active', i === idx));
    awDots.forEach((dot, i) => dot.classList.toggle('is-active', i === idx));
  }

  // Init without transition (set angles before paint)
  awCards.forEach(card => card.style.transition = 'none');
  applyAngles();
  updateActive();
  // Re-enable transitions on next frame
  requestAnimationFrame(() => {
    awCards.forEach(card => card.style.transition = '');
  });

  function wheelNext() {
    // CCW: decrease each angle by 90°
    angles.forEach((_, i) => { angles[i] -= 90; });
    applyAngles();
    updateActive();
    setTimeout(wheelNext, 3920);
  }

  // autoplay solo se l'utente non chiede meno animazioni
  if (!REDUCED_MOTION) setTimeout(wheelNext, 3000);
}

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

/* ── CHARACTER SELECTOR ─────────────────────────────────── */
const charBtns    = document.querySelectorAll('.chars__selector-btn');
const charPanels  = document.querySelectorAll('.chars__panel');
const indicator   = document.querySelector('.chars__selector-indicator');

function updateIndicator(btn) {
  if (!indicator) return;
  const { offsetLeft, offsetWidth } = btn;
  indicator.style.left  = offsetLeft + 'px';
  indicator.style.width = offsetWidth + 'px';
}

// Init indicator position
if (charBtns.length > 0) {
  const activeBtn = document.querySelector('.chars__selector-btn.is-active') || charBtns[0];
  setTimeout(() => updateIndicator(activeBtn), 100);
}

charBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.char;

    charBtns.forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');

    charPanels.forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.char === target);
    });

    updateIndicator(btn);
  });
});

/* ── STAT BARS ANIMATION ────────────────────────────────── */
// Trigger when character panel becomes active
const barObs = new MutationObserver(() => {
  document.querySelectorAll('.chars__panel.is-active .chars__stat-bar-fill').forEach(bar => {
    const w = bar.style.getPropertyValue('--bar-w') || bar.getAttribute('data-w');
    if (w) {
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => { bar.style.width = w; }, 50);
      });
    }
  });
});
document.querySelectorAll('.chars__panel').forEach(p => barObs.observe(p, { attributes: true, attributeFilter: ['class'] }));

// Also on initial load
setTimeout(() => {
  document.querySelectorAll('.chars__panel.is-active .chars__stat-bar-fill').forEach(bar => {
    const w = bar.dataset.w || '70%';
    bar.style.width = w;
  });
}, 600);

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
  if (e.key === 'Escape') {
    navToggle?.classList.remove('is-open');
    navLinks?.classList.remove('is-open');
  }
});

