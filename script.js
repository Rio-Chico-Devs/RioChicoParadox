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

/* ── Dev debug (localhost only) ─────────────────────────────────── */
(function () {
  var host = location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '') return;

  var toastOffset = 0;

  function toast(msg, bgColor) {
    var box = document.createElement('div');
    box.style.cssText =
      'position:fixed;bottom:' + (16 + toastOffset) + 'px;left:16px;' +
      'max-width:380px;background:' + (bgColor || '#1a1a1e') + ';color:#f4f1ea;' +
      'font:12px/1.45 "IBM Plex Mono",monospace;padding:10px 14px;' +
      'border-left:3px solid #e63424;border-radius:2px;z-index:99999;' +
      'pointer-events:none;white-space:pre-wrap;word-break:break-all;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.5);';
    box.textContent = msg;
    document.body.appendChild(box);
    toastOffset += box.offsetHeight + 8;
    setTimeout(function () {
      if (box.parentNode) {
        toastOffset = Math.max(0, toastOffset - box.offsetHeight - 8);
        box.parentNode.removeChild(box);
      }
    }, 7000);
  }

  /* Broken images */
  document.querySelectorAll('img').forEach(function (img) {
    function markBroken() {
      var src = img.getAttribute('src') || '(no src)';
      var badge = document.createElement('span');
      badge.style.cssText =
        'display:inline-block;background:#e63424;color:#fff;' +
        'font:10px/1 "IBM Plex Mono",monospace;padding:3px 5px;' +
        'position:absolute;top:4px;left:4px;z-index:100;pointer-events:none;';
      badge.textContent = 'IMG 404';
      var parent = img.parentNode;
      var pos = window.getComputedStyle(parent).position;
      if (pos === 'static') { parent.style.position = 'relative'; }
      parent.appendChild(badge);
      img.style.outline = '2px solid #e63424';
      toast('[img] 404 -> ' + src, '#280808');
      console.warn('[debug] Broken image:', src, img);
    }
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
      markBroken();
    } else {
      img.addEventListener('error', markBroken);
    }
  });

  /* Links with clean URLs (no .html) that break in Live Server */
  var cleanUrl = /^(\/|\.\.?\/)(gallery|characters|profile|contact|index)(\/|$|\?|#)/;
  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href && cleanUrl.test(href)) {
      console.warn('[debug] Clean URL without .html (fails in Live Server):', href, a);
      toast('[link] Missing .html -> ' + href + '\n  Add .html or use gallery.html', '#1a1200');
    }
  });

  /* Uncaught JS errors */
  window.addEventListener('error', function (e) {
    var file = e.filename ? e.filename.split('/').pop() : '';
    toast('[error] ' + e.message + (file ? '\n  ' + file + ':' + e.lineno : ''), '#280808');
    console.error('[debug] Uncaught error:', e);
  });

  /* Unhandled promise rejections */
  window.addEventListener('unhandledrejection', function (e) {
    toast('[promise] ' + String(e.reason), '#280808');
    console.error('[debug] Unhandled rejection:', e.reason);
  });

  console.info('[RCS debug] active on', location.pathname,
    '| imgs:', document.querySelectorAll('img').length,
    '| links:', document.querySelectorAll('a[href]').length);
})();
