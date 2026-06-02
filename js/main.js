/* =========================================================
   RIO CHICO STUDIO — main.js
   ========================================================= */

/* ── LOADING SCREEN — "NOW LOADING X%" ────────────────────
   Conta da 0 a 100% poi rivela il sito (stile Persona)
   ======================================================== */
const loader      = document.getElementById('loader');
const loaderFill  = document.getElementById('loader-fill');
const loaderCount = document.getElementById('loader-count');

if (loader) {
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
      setTimeout(() => {
        loader.classList.add('is-done');
        // trigger hero animations only after loader gone
        document.body.classList.add('loaded');
        setTimeout(() => loader.remove(), 700);
      }, 350);
    }
  };
  // start after a tiny delay
  setTimeout(tick, 200);
}

/* ── CUSTOM CURSOR ──────────────────────────────────────── */
const cursor    = document.querySelector('.cursor');
const cursorDot = document.querySelector('.cursor__dot');
const cursorRing= document.querySelector('.cursor__ring');
const glowEl    = document.querySelector('.cursor-glow');

let mx = -999, my = -999;
let gx = 0,    gy = 0;
let cx = 0,    cy = 0;
let rx = 0,    ry = 0;

window.addEventListener('mousemove', e => {
  mx = e.clientX;
  my = e.clientY;

  // Dot: segue immediatamente
  if (cursor) cursor.style.transform = `translate(${mx}px, ${my}px)`;
}, { passive: true });

// Glow e ring: seguono con inerzia
function animLoop() {
  // glow (molto lento)
  gx += (mx - gx) * 0.06;
  gy += (my - gy) * 0.06;
  if (glowEl) glowEl.style.transform = `translate(${gx}px, ${gy}px)`;

  // ring (medio)
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  if (cursorRing) cursorRing.style.transform = `translate(${rx - (parseFloat(getComputedStyle(cursorRing).width)/2) + 18}px, ${ry - (parseFloat(getComputedStyle(cursorRing).height)/2) + 18}px)`;

  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);

// Hover state su elementi interattivi
document.querySelectorAll('a, button, [role="tab"], .gallery__card, .social__card')
  .forEach(el => {
    el.addEventListener('mouseenter', () => cursor?.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursor?.classList.remove('is-hover'));
  });

/* ── NAV ────────────────────────────────────────────────── */
const nav       = document.querySelector('.nav');
const navToggle = document.querySelector('.nav__toggle');
const navLinks  = document.querySelector('.nav__links');
const navItems  = document.querySelectorAll('.nav__link');

window.addEventListener('scroll', () => {
  nav?.classList.toggle('is-scrolled', window.scrollY > 60);
}, { passive: true });

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
}, { threshold: 0.08 });

revealEls.forEach(el => revealObs.observe(el));

/* ── PARALLAX SCROLL ────────────────────────────────────── */
const heroChar   = document.querySelector('.hero__char-wrap');
const heroBgGlow = document.querySelector('.hero__bg-glow');
const heroBgGrid = document.querySelector('.hero__bg-grid');

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (heroChar)   heroChar.style.transform   = `translateY(${y * 0.12}px)`;
  if (heroBgGlow) heroBgGlow.style.transform = `translateY(${y * 0.3}px)`;
  if (heroBgGrid) heroBgGrid.style.transform = `translateY(${y * 0.2}px)`;
}, { passive: true });

/* ── MOUSE PARALLAX (hero only) ─────────────────────────── */
const heroSection = document.querySelector('.hero');
let isInHero = true;

const heroVisObs = new IntersectionObserver(entries => {
  isInHero = entries[0].isIntersecting;
}, { threshold: 0.1 });
if (heroSection) heroVisObs.observe(heroSection);

window.addEventListener('mousemove', e => {
  if (!isInHero || !heroChar) return;
  const { innerWidth: w, innerHeight: h } = window;
  const xPct = (e.clientX / w - 0.5);
  const yPct = (e.clientY / h - 0.5);
  heroChar.style.transform = `translate(${xPct * -16}px, ${yPct * -10}px)`;
}, { passive: true });

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

/* ── KEYBOARD ───────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    navToggle?.classList.remove('is-open');
    navLinks?.classList.remove('is-open');
  }
});

/* ── CARD ANIMATION KEYFRAME ────────────────────────────── */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes cardIn {
    from { opacity: 0; clip-path: inset(0 100% 0 0); }
    to   { opacity: 1; clip-path: inset(0 0% 0 0); }
  }
`;
document.head.appendChild(styleSheet);
