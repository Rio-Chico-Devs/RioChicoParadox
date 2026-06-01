/* =========================================================
   RIO CHICO STUDIO — main.js
   ========================================================= */

// ---- NAV: scroll effect + mobile toggle + active link ----
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav__toggle');
const navLinks = document.querySelector('.nav__links');
const navLinkItems = document.querySelectorAll('.nav__link');

window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 40);
}, { passive: true });

navToggle?.addEventListener('click', () => {
  const isOpen = navToggle.classList.toggle('is-open');
  navLinks.classList.toggle('is-open', isOpen);
  navToggle.setAttribute('aria-expanded', isOpen);
});

// Close mobile nav on link click
navLinkItems.forEach(link => {
  link.addEventListener('click', () => {
    navToggle?.classList.remove('is-open');
    navLinks?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  });
});

// Active nav link on scroll (IntersectionObserver)
const sections = document.querySelectorAll('section[id]');

const navObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinkItems.forEach(link => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        link.classList.toggle('is-active', active);
      });
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });

sections.forEach(s => navObserver.observe(s));


// ---- REVEAL ANIMATIONS (scroll-triggered) ----
const revealEls = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

revealEls.forEach(el => revealObserver.observe(el));


// ---- GALLERY FILTERS ----
const filterBtns = document.querySelectorAll('.gallery__filter-btn');
const galleryCards = document.querySelectorAll('.gallery__card');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active button
    filterBtns.forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    const filter = btn.dataset.filter;

    galleryCards.forEach(card => {
      if (filter === 'all' || card.dataset.category === filter) {
        card.removeAttribute('data-hidden');
        card.style.animation = 'cardReveal 0.4s ease forwards';
      } else {
        card.setAttribute('data-hidden', 'true');
      }
    });
  });
});


// ---- CHARACTER SELECTOR ----
const charBtns = document.querySelectorAll('.chars__selector-btn');
const charPanels = document.querySelectorAll('.chars__panel');

charBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.char;

    charBtns.forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    charPanels.forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.char === target);
    });
  });
});


// ---- CURSOR GLOW (desktop) ----
const cursorGlow = document.createElement('div');
cursorGlow.className = 'cursor-glow';
document.body.appendChild(cursorGlow);

let mouseX = 0, mouseY = 0;
let glowX = 0, glowY = 0;

window.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, { passive: true });

// Smooth cursor follow
function animateCursor() {
  glowX += (mouseX - glowX) * 0.08;
  glowY += (mouseY - glowY) * 0.08;
  cursorGlow.style.transform = `translate(${glowX}px, ${glowY}px)`;
  requestAnimationFrame(animateCursor);
}
animateCursor();


// ---- COUNTER ANIMATION (profile stats) ----
const counters = document.querySelectorAll('[data-count]');

const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

counters.forEach(el => counterObserver.observe(el));

function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || '';
  const dur = 1500;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / dur, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}


// ---- KEYBOARD: close mobile nav on ESC ----
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    navToggle?.classList.remove('is-open');
    navLinks?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  }
});
