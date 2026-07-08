'use strict';

/* ── Mobile nav toggle ─────────────────────────────────────────── */
(function () {
  var toggle = document.querySelector('.nav__toggle');
  var right  = document.querySelector('.nav__right');
  if (!toggle || !right) return;

  toggle.addEventListener('click', function () {
    var open = right.classList.toggle('is-open');
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

/* ── Gallery filter ─────────────────────────────────────────────── */
(function () {
  var pills = document.querySelectorAll('.gal__pill');
  var cards = document.querySelectorAll('.gal__card');
  if (!pills.length) return;

  function filterGallery(cat) {
    pills.forEach(function (p) {
      p.classList.toggle('is-active', p.dataset.filter === cat);
    });

    var delay = 0;
    cards.forEach(function (card) {
      var show = cat === 'all' || card.dataset.category === cat;
      if (show) {
        card.removeAttribute('hidden');
        card.style.animation = 'none';
        void card.offsetHeight;
        card.style.animation = '';
        card.style.animationDelay = delay + 's';
        delay += 0.06;
      } else {
        card.setAttribute('hidden', '');
      }
    });

    if (cat === 'all') {
      history.replaceState(null, '', location.pathname);
    } else {
      history.replaceState(null, '', '#' + cat);
    }
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      filterGallery(pill.dataset.filter);
    });
  });

  var hash = location.hash.slice(1);
  var valid = ['oc', 'fanart', 'char-design', 'sketch'];
  if (hash && valid.indexOf(hash) !== -1) {
    filterGallery(hash);
  }
})();

/* ── Character stat bars ────────────────────────────────────────── */
(function () {
  var blocks = document.querySelectorAll('.char-stats');
  if (!blocks.length || !window.IntersectionObserver) return;

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var fills = entry.target.querySelectorAll('.char-stat__fill');
      fills.forEach(function (fill, i) {
        fill.style.width = (fill.dataset.value || '0') + '%';
        fill.style.animationDelay = (0.15 + i * 0.12) + 's';
        fill.classList.add('is-animated');
      });
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  blocks.forEach(function (el) { obs.observe(el); });
})();

/* ── My Style scroll reveals ────────────────────────────────────── */
(function () {
  var els = document.querySelectorAll('.sr-bg, .sr-char, .sr-txt');
  if (!els.length || !window.IntersectionObserver) return;

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('revealed');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.2 });

  els.forEach(function (el) { obs.observe(el); });
})();
