/*
 * The controls under a stepped figure: the two arrows, the beat rail and the
 * play button. It drives the lifted diagram runtime and depends on nothing
 * else - initDiagrams, dgStep and DG_LIST, all of which arrive from the
 * runtime spliced in above it.
 *
 * A file of its own for the reason editor.mjs and editor.css are: read from
 * disk and inlined, so a backtick or a backslash in it means what it says.
 * refresh-figures.mjs splices it into both pages that carry stepped figures -
 * docs/artifact/figures-you-write.html, which is the manual, and
 * docs/site/figures.html, which is the case for the language - so the two
 * cannot drift into two different sets of controls.
 */
// Drives the lifted runtime. dgStep(d, k) renders any beat in either
// direction - stepping back costs nothing, because each beat is recomputed
// from the counter rather than undone.
(function () {
  if (typeof initDiagrams !== 'function') return;
  initDiagrams();
  var slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One control bar, wherever it is: the two live demos and, once opened,
  // any of the fifteen gallery cards.
  function controls(scope, d) {
    var play = scope.querySelector('.play');
    var rail = [].slice.call(scope.querySelectorAll('.rail li'));
    var timer = 0;
    function stop() { clearInterval(timer); timer = 0; if (play) play.textContent = 'play'; }
    function paint() {
      rail.forEach(function (li, i) { li.setAttribute('aria-current', i === d.step ? 'true' : 'false'); });
      scope.querySelectorAll('[data-go]').forEach(function (b) {
        var k = d.step + Number(b.getAttribute('data-go'));
        b.disabled = k < 0 || k > d.data.n - 1;
      });
    }
    function go(k, instant) {
      dgStep(d, Math.max(0, Math.min(d.data.n - 1, k)), instant);
      paint();
    }
    scope.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { stop(); go(d.step + Number(b.getAttribute('data-go'))); });
    });
    rail.forEach(function (li, i) {
      li.querySelector('button').addEventListener('click', function () { stop(); go(i); });
    });
    if (play) play.addEventListener('click', function () {
      if (timer) return stop();
      play.textContent = 'stop';
      if (d.step >= d.data.n - 1) go(0, true);
      timer = setInterval(function () {
        if (d.step >= d.data.n - 1) { stop(); return; }
        go(d.step + 1);
      }, slow ? 1600 : 1150);
    });
    paint();
  }

  // A figure that plays itself: the one at the top of the site page. It has no
  // controls, because nobody asked it to start - so it has to be polite about
  // it. Three rules follow from that. It runs only while it is on screen, or a
  // tab left open animates forever behind whatever the reader moved on to. It
  // steps back to the opening beat instantly rather than tweening, because a
  // tween backwards through four beats reads as a rewind rather than a loop.
  // And under prefers-reduced-motion it does not run at all: it shows the last
  // beat, which is the finished picture, not the empty one.
  document.querySelectorAll('[data-autoplay]').forEach(function (host) {
    var svg = host.querySelector('svg.psi-diagram');
    var d = svg && svg.psiDiagram;
    if (!d || !d.data || d.data.n < 2) return;
    if (slow) { dgStep(d, d.data.n - 1, true); return; }
    var timer = 0, at = 0;
    function stop() { clearInterval(timer); timer = 0; }
    function start() {
      if (timer) return;
      timer = setInterval(function () {
        at = (at + 1) % d.data.n;
        dgStep(d, at, at === 0);
      }, 1900);
    }
    if (typeof IntersectionObserver !== 'function') { start(); return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { threshold: 0.35 }).observe(host);
  });

  document.querySelectorAll('.demo').forEach(function (demo) {
    var svg = demo.querySelector('svg.psi-diagram');
    if (svg && svg.psiDiagram) controls(demo, svg.psiDiagram);
  });

  // A gallery card shows its finished picture until someone opens the source,
  // and only then becomes steppable. Its beat data is marked with
  // a class initDiagrams() does not look for: registering these at load would
  // widen each figure to the frame that holds every beat and rewind it to the
  // first, so fifteen finished pictures would arrive half-drawn.
  function wireCard(card) {
    var svg = card.querySelector('svg.psi-diagram');
    var sc = card.querySelector('script.psi-card-frames');
    if (!svg || !sc || svg.psiDiagram) return;
    var data;
    try { data = JSON.parse(sc.textContent); } catch (e) { return; }
    // The same setup initDiagrams() does for one figure. Repeated rather than
    // called, because that function walks the whole document and would
    // register the two demos a second time.
    if (svg.dataset.liveViewbox) {
      svg.setAttribute('viewBox', svg.dataset.liveViewbox);
      var w = Number(svg.getAttribute('width'));
      var r = Number(svg.dataset.liveRatio);
      if (w && r) svg.setAttribute('height', String(Math.round(w * r)));
    }
    var d = { svg: svg, data: data, step: -1, raf: 0, cur: null, cache: {}, hint: null };
    svg.psiDiagram = d;
    if (typeof DG_LIST !== 'undefined') DG_LIST.push(d);
    // Open on the beat the closed card was showing, so nothing jumps.
    dgStep(d, data.n - 1, true);
    card.classList.add('steppable');
    controls(card, d);
  }

  document.querySelectorAll('figure.card details.src').forEach(function (det) {
    det.addEventListener('toggle', function () {
      if (det.open) wireCard(det.closest('figure.card'));
    });
  });
  /* ── the one screenshot ────────────────────────────────────────────────
   * The manual carries a picture of the editor's window, and a window shown
   * at the width of a column is a thumbnail of one. The case page gets this
   * behaviour from site.js; the manual loads no script of its own, so it
   * arrives here, where both pages already share their controls. Bound to
   * `.uishot img`, which only the manual has - on the case page this wires
   * nothing and site.js keeps its own shots.
   */
  var lit = null, litTrigger = null;
  function litOpen(img) {
    if (!lit) {
      lit = document.createElement('div');
      lit.className = 'uilight';
      lit.hidden = true;
      lit.tabIndex = -1;
      lit.setAttribute('role', 'dialog');
      lit.setAttribute('aria-modal', 'true');
      lit.setAttribute('aria-label', 'Expanded editor screenshot');
      lit.appendChild(document.createElement('img'));
      document.body.appendChild(lit);
      lit.addEventListener('click', litClose);
      // The overlay itself is the dialog's only control. Keep Tab from moving
      // into the page behind a modal whose body has been made non-scrollable.
      lit.addEventListener('keydown', function (ev) {
        if (ev.key === 'Tab') ev.preventDefault();
      });
    }
    litTrigger = img;
    lit.firstChild.src = img.currentSrc || img.src;
    lit.firstChild.alt = img.alt;
    lit.hidden = false;
    document.body.classList.add('uilight-open');
    lit.focus();
  }
  function litClose() {
    if (!lit || lit.hidden) return;
    lit.hidden = true;
    // Dropped rather than left in place: the source is a data: URI of a few
    // hundred kilobytes, and a hidden copy of it is a second decode held for
    // the rest of the page's life.
    lit.firstChild.removeAttribute('src');
    document.body.classList.remove('uilight-open');
    if (litTrigger && litTrigger.isConnected) litTrigger.focus();
    litTrigger = null;
  }
  document.querySelectorAll('.uishot img').forEach(function (img) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.addEventListener('click', function () { litOpen(img); });
    img.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); litOpen(img); }
    });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') litClose();
  });
})();
