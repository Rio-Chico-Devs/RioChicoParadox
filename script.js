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

/* ── Gallery masonry: aspect-ratio reale dell'immagine ──────────── */
/* Prima del load vale il ratio "curato" inline; appena l'immagine
   carica, il box prende il suo ratio naturale (mai crop/letterbox). */
(function () {
  document.querySelectorAll('.gal__ratio').forEach(function (box) {
    var img = box.querySelector('img');
    if (!img) return;
    function apply() {
      if (img.naturalWidth && img.naturalHeight) {
        box.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
      }
    }
    img.addEventListener('load', apply);
    if (img.complete && img.naturalWidth) apply();
  });
})();

/* ── Lightbox (gallery) ─────────────────────────────────────────── */
(function () {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var stage    = lb.querySelector('.lb__stage');
  var img      = lb.querySelector('.lb__img');
  var titleEl  = lb.querySelector('.lb__title');
  var catEl    = lb.querySelector('.lb__cat');
  var closeBtn = lb.querySelector('.lb__close');

  var zoom = 1, panX = 0, panY = 0;
  var pointers = new Map();
  var dragStart = null, pinchStart = null, downPos = null;
  var dragMoved = false, suppressClick = false;
  var prevOverflow = '';

  function clampPan(z, x, y) {
    if (z <= 1) return { x: 0, y: 0 };
    var maxX = window.innerWidth  * (z - 1) / 2 + 60;
    var maxY = window.innerHeight * (z - 1) / 2 + 60;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y))
    };
  }

  function setZoomPan(z, x, y) {
    var c = clampPan(z, x, y);
    zoom = z; panX = c.x; panY = c.y;
    img.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
    stage.classList.toggle('is-zoomed', zoom > 1);
  }

  /* Niente src dinamico: si clona il nodo <img> gia' fidato della card
     e si sostituisce nello stage. Nessuna URL passa come stringa. */
  function openLightbox(sourceImg, title, cat) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pointers.clear();
    dragStart = pinchStart = downPos = null;
    dragMoved = false; suppressClick = false;
    var clone = sourceImg.cloneNode(false);
    clone.className = 'lb__img';
    clone.removeAttribute('loading');
    clone.setAttribute('draggable', 'false');
    if (!clone.getAttribute('alt')) clone.setAttribute('alt', title);
    stage.replaceChild(clone, img);
    img = clone;
    titleEl.textContent = title;
    catEl.textContent = cat;
    setZoomPan(1, 0, 0);
    lb.hidden = false;
  }

  function closeLightbox() {
    document.body.style.overflow = prevOverflow || '';
    lb.hidden = true;
  }

  document.querySelectorAll('.gal__ratio').forEach(function (box) {
    box.addEventListener('click', function () {
      var im = box.querySelector('img');
      if (!im || !im.getAttribute('src')) return;
      openLightbox(im, box.dataset.title || '', box.dataset.cat || '');
    });
  });

  closeBtn.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lb.hidden) closeLightbox();
  });

  /* Un drag che finisce col puntatore fuori dall'immagine NON deve
     essere letto come "click sul backdrop = chiudi": se il gesto ha
     superato ~5px viene soppresso il click immediatamente successivo. */
  stage.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target === stage) closeLightbox();
  });

  stage.addEventListener('dblclick', function () {
    if (zoom > 1) setZoomPan(1, 0, 0);
    else setZoomPan(2.4, 0, 0);
  });

  /* Zoom centrato sul cursore: il punto sotto il mouse resta fermo */
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = stage.getBoundingClientRect();
    var cx = e.clientX - rect.left - rect.width / 2;
    var cy = e.clientY - rect.top - rect.height / 2;
    var next = Math.max(1, Math.min(6, zoom * Math.pow(1.0016, -e.deltaY)));
    if (next === zoom) return;
    var k = next / zoom;
    setZoomPan(next, cx * (1 - k) + panX * k, cy * (1 - k) + panY * k);
  }, { passive: false });

  stage.addEventListener('pointerdown', function (e) {
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, panX: panX, panY: panY };
      downPos = { x: e.clientX, y: e.clientY };
      dragMoved = false;
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        zoom: zoom, panX: panX, panY: panY,
        rect: stage.getBoundingClientRect()
      };
      dragMoved = true;
    }
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (downPos && !dragMoved) {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) dragMoved = true;
    }
    if (pointers.size >= 2 && pinchStart) {
      var pts = Array.from(pointers.values()).slice(0, 2);
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      var st = pinchStart;
      var nz = Math.max(1, Math.min(6, st.zoom * (dist / st.dist)));
      var cx = st.mid.x - st.rect.left - st.rect.width / 2;
      var cy = st.mid.y - st.rect.top - st.rect.height / 2;
      var k = nz / st.zoom;
      setZoomPan(
        nz,
        cx * (1 - k) + st.panX * k + (mid.x - st.mid.x),
        cy * (1 - k) + st.panY * k + (mid.y - st.mid.y)
      );
    } else if (pointers.size === 1 && dragStart && zoom > 1) {
      setZoomPan(zoom, dragStart.panX + (e.clientX - dragStart.x), dragStart.panY + (e.clientY - dragStart.y));
    }
  });

  function pointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      var pt = Array.from(pointers.values())[0];
      dragStart = { x: pt.x, y: pt.y, panX: panX, panY: panY };
      pinchStart = null;
    }
    if (pointers.size === 0) {
      dragStart = null;
      pinchStart = null;
      if (dragMoved) suppressClick = true;
      downPos = null;
      dragMoved = false;
      stage.classList.remove('is-dragging');
    }
  }
  stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', pointerUp);
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
/* .sr-armed (opacity 0) la applica SOLO il JS: senza JS il contenuto
   resta visibile. bg entra da sinistra, char da destra, testo fade-up. */
(function () {
  var els = document.querySelectorAll('[data-sr]');
  if (!els.length || !window.IntersectionObserver) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      var kind = el.getAttribute('data-sr');
      var cls = kind === 'bg' ? 'sr-in-bg' : kind === 'char' ? 'sr-in-char' : 'sr-in-txt';
      el.classList.remove('sr-armed');
      el.classList.add(cls);
      el.addEventListener('animationend', function () {
        el.classList.remove(cls);
      }, { once: true });
      obs.unobserve(el);
    });
  }, { threshold: 0.2 });

  els.forEach(function (el) {
    el.classList.add('sr-armed');
    obs.observe(el);
  });
})();

/* ── My Journey: scrollytelling stepper (profile) ───────────────── */
/* La riga-anno piu' vicina al centro verticale della foto sticky
   diventa attiva. Throttle a timestamp (100ms) con coda trailing:
   la posizione finale di scroll viene sempre riflessa. */
(function () {
  var journey = document.querySelector('.journey');
  if (!journey) return;
  var rows = journey.querySelectorAll('.journey__row');
  if (!rows.length) return;

  journey.classList.add('journey--live');
  var badge = journey.querySelector('.journey__badge');
  var frame = journey.querySelector('.journey__frame');
  var imgs  = journey.querySelectorAll('.journey__img');
  var activeYear = null;

  function setActive(year) {
    activeYear = year;
    rows.forEach(function (row) {
      row.classList.toggle('is-active', row.dataset.year === year);
    });
    imgs.forEach(function (im) {
      im.classList.toggle('is-active', im.dataset.year === year);
    });
    if (badge) badge.textContent = year;
  }

  function update() {
    /* Centro reale della cornice sticky; fallback al centro viewport
       quando la colonna foto e' nascosta (mobile). */
    var line = window.innerHeight / 2;
    if (frame && frame.offsetParent !== null) {
      var fr = frame.getBoundingClientRect();
      line = fr.top + fr.height / 2;
    }
    var best = null, bestDist = Infinity;
    rows.forEach(function (row) {
      var r = row.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
      var dist = Math.abs((r.top + r.height / 2) - line);
      if (dist < bestDist) { bestDist = dist; best = row; }
    });
    if (best && best.dataset.year !== activeYear) setActive(best.dataset.year);
  }

  var lastRun = 0, trailing = null;
  function onScroll() {
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastRun < 100) {
      clearTimeout(trailing);
      trailing = setTimeout(function () { lastRun = Date.now(); update(); }, 110);
      return;
    }
    lastRun = now;
    update();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* Parte sempre dal primo anno, poi si allinea allo scroll corrente */
  setActive(rows[0].dataset.year);
  update();
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
  var cleanUrl = /^(\/|\.\.?\/)(gallery|characters|profile|contact|support|index)(\/|$|\?|#)/;
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
